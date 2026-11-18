/* Line Ledger site worker (Cloudflare).  Serves the static site, plus:
     /auth/login, /auth/callback, /auth/logout  - "Sign in with Whop" (OAuth 2.1 + PKCE)
     /auth/join                                 - "Start free trial": sign in with Whop first, then Whop's checkout
                                                  (JOIN_URL), so the purchase lands on the account the site knows
     /auth/welcome                              - where Whop sends buyers after checkout (Whop: Settings > Checkout >
                                                  Redirect link): re-checks access now, then the picks + Connect Discord
     /api/me                                    - who is signed in, and are they a member
     /api/members.js                            - the full picks (members only; replaces the sealed public data)
   Membership = access to the Whop product WHOP_PRODUCT_ID, checked at sign-in with the member's own token and
   re-checked every 15 minutes with the app's API key.  The members' picks are published encrypted (members.enc,
   AES-GCM); only this worker holds the key.  Secrets (Cloudflare dashboard): SESSION_KEY, MEMBERS_KEY,
   WHOP_API_KEY, optional WHOP_CLIENT_SECRET.  Vars (wrangler.jsonc): WHOP_CLIENT_ID, WHOP_PRODUCT_ID, SITE, JOIN_URL.
   Whop says "admin" for the business's own team (the owner): they see the full picks, but the Discord Member role
   is for customers only (a paying or trial membership). */

const enc = new TextEncoder();
const dec = new TextDecoder();
const RECHECK_S = 15 * 60;              // re-ask Whop whether a member still has access
const GRACE_S = 24 * 3600;              // if Whop can't be reached, trust the last answer this long
const SESSION_S = 30 * 24 * 3600;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Math.floor(Date.now() / 1000);
const oauthBase = (env) => env.WHOP_OAUTH_BASE || "https://api.whop.com/oauth";
const apiBase = (env) => env.WHOP_API_BASE || "https://api.whop.com/api/v1";

async function hmacKey(env) {
  if (!env.SESSION_KEY) throw new Error("SESSION_KEY is not set");
  return crypto.subtle.importKey("raw", enc.encode(env.SESSION_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function seal(env, obj) {                         // signed (not secret) cookie value
  const body = b64u(enc.encode(JSON.stringify(obj)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}
async function unseal(env, value) {
  if (!value || !value.includes(".")) return null;
  const [body, sig] = value.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const obj = JSON.parse(dec.decode(unb64u(body)));
    return obj.exp && obj.exp < now() ? null : obj;
  } catch (e) { return null; }
}

// the member's Whop refresh token rides in their session cookie, encrypted (AES-GCM, key derived from SESSION_KEY)
async function rtKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`refresh-token:${env.SESSION_KEY}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function hide(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await rtKey(env), enc.encode(text));
  return b64u(new Uint8Array([...iv, ...new Uint8Array(ct)]));
}
async function reveal(env, blob) {
  const raw = unb64u(blob);
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await rtKey(env), raw.slice(12)));
}

function cookies(req) {
  const out = {};
  (req.headers.get("Cookie") || "").split(/;\s*/).forEach((kv) => { const i = kv.indexOf("="); if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  return out;
}
function cookie(env, name, value, maxAge, httpOnly = true) {
  const secure = (env.SITE || "").startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}${httpOnly ? "; HttpOnly" : ""}`;
}
function redirect(to, setCookies = []) {
  const h = new Headers({ Location: to, "Cache-Control": "no-store" });
  setCookies.forEach((c) => h.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers: h });
}
const safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/week");

// ---------------------------------------------------------------------------------------------- Whop
async function whopJSON(url, token, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {                                   // "token-400-invalid_grant": the step, the status, Whop's error code
    const err = await res.json().catch(() => ({}));
    const code = String(typeof err.error === "string" ? err.error : (err.error && (err.error.type || err.error.code)) || err.code || "").replace(/[^a-z_]/gi, "").slice(0, 40);
    const step = url.includes("/token") ? "token" : url.includes("/userinfo") ? "userinfo" : url.includes("/access/") ? "access" : "whop";
    const desc = String(err.error_description || "").toLowerCase().replace(/[^a-z_ ]/g, "").trim().replace(/ +/g, "_").slice(0, 40);
    throw new Error(`${step}-${res.status}${code ? "-" + code : ""}${desc ? "-" + desc : ""}`);
  }
  return res.json();
}
// the app's API key: just the apik_... token, even if a "WHOP_API_KEY=..." line (or two) was pasted around it
const apiKey = (env) => { const v = String(env.WHOP_API_KEY || ""); const m = v.match(/apik_[A-Za-z0-9_.-]+/); return m ? m[0] : v.trim(); };
const why = (e) => String((e && e.message) || e).replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
// Whop's answer: "customer" (a paying or trial membership), "admin" (the business's own team), or null (no access)
// Whop answers 403 when the caller can't reach the product - for a person's own login, that means they have no
// membership (seen live 2026-11-17: a new account got access-403-forbidden), so that's a "no", not an error.
async function hasAccess(env, userId, token) {
  const r = await whopJSON(`${apiBase(env)}/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(env.WHOP_PRODUCT_ID)}`, token);
  return r.has_access && r.access_level !== "no_access" ? (r.access_level === "admin" ? "admin" : "customer") : null;
}
// Who has access, three ways, most reliable first:
//   1. the business's API key (WHOP_API_KEY, an Account key): can check anyone;
//   2. the person's own Whop login: works for the owner, but Whop answers 403 to a customer asking about themselves
//      (seen live 2026-11-17, before and after a trial started), so a 403 there proves nothing;
//   3. Whop's membership webhooks, saved in KV (m:{user}): the last status Whop sent for this person.
// Returns [level or null, errors]; throws only when nothing could answer.
async function checkWithFallback(env, userId, userToken) {
  const errs = [];
  if (env.WHOP_API_KEY) { try { return [await hasAccess(env, userId, apiKey(env)), errs]; } catch (e) { errs.push(`key:${why(e)}`); } }
  let userSaidNo = false;
  if (userToken) {
    try { const lv = await hasAccess(env, userId, userToken); if (lv) return [lv, errs]; userSaidNo = true; }
    catch (e) { errs.push(`login:${why(e)}`); if (/^access-403/.test(String(e.message))) userSaidNo = true; }
  }
  const w = env.LINKS ? await env.LINKS.get(`m:${userId}`, "json").catch(() => null) : null;
  if (w && w.s) return [KEEPS_ACCESS.has(w.s) ? "customer" : null, errs];
  if (userSaidNo) return [null, errs];                       // nothing better to go on: not a member (yet)
  throw new Error(errs.join(",") || "no-way-to-check");
}

async function login(req, env) {
  const url = new URL(req.url);
  const verifier = rand(32), state = rand(16);
  const challenge = b64u(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  const p = new URLSearchParams({ response_type: "code", client_id: env.WHOP_CLIENT_ID, redirect_uri: `${env.SITE}/auth/callback`,
    scope: "openid profile email", state, nonce: rand(16), code_challenge: challenge, code_challenge_method: "S256" });
  const tmp = await seal(env, { v: verifier, s: state, n: safeNext(url.searchParams.get("next")), exp: now() + 600 });
  return redirect(`${oauthBase(env)}/authorize?${p}`, [cookie(env, "ll_oauth", tmp, 600)]);
}

// code -> tokens.  Whop's guide uses PKCE alone (no secret), so that goes first; if Whop wants the app to identify
// itself, the secret is sent in the body, then as HTTP Basic.  A rejected client doesn't use up the code.
async function exchange(env, code, verifier) {
  return tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: `${env.SITE}/auth/callback`, code_verifier: verifier });
}
// a member's refresh token -> fresh tokens (to re-check access with their own login, which Whop allows)
async function refresh(env, refreshToken) {
  return tokenRequest(env, { grant_type: "refresh_token", refresh_token: refreshToken });
}
async function tokenRequest(env, grant) {
  const clean = (v) => String(v || "").trim().replace(/^[A-Za-z_ ]+[=:]\s*/, "").replace(/^["']|["']$/g, "").trim();   // a pasted "NAME=value" or quotes
  const secret = clean(env.WHOP_CLIENT_SECRET), id = clean(env.WHOP_CLIENT_ID);
  const base = { ...grant, client_id: id };
  const tries = secret ? [[{ ...base, client_secret: secret }, {}], [base, { Authorization: `Basic ${btoa(`${id}:${secret}`)}` }], [base, {}]] : [[base, {}]];
  let last;
  for (const [body, extra] of tries) {
    try {
      return await whopJSON(`${oauthBase(env)}/token`, null, { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
    } catch (e) {
      last = e;
      if (!/invalid_client|unauthorized_client|-401/.test(String(e.message))) throw e;   // only retry "who are you" errors
    }
  }
  throw last;
}

async function callback(req, env) {
  const url = new URL(req.url), c = cookies(req);
  const st = await unseal(env, c.ll_oauth);
  const fail = (reason) => { console.error("sign-in failed:", reason); return redirect(`/?signin=failed&why=${reason}`, [cookie(env, "ll_oauth", "", 0)]); };
  if (url.searchParams.get("error")) return fail(`denied-${why(url.searchParams.get("error"))}`);
  if (!st) return fail("no-state-cookie");
  if (st.s !== url.searchParams.get("state")) return fail("state-mismatch");
  let tokens, me;
  try {
    tokens = await exchange(env, url.searchParams.get("code"), st.v);
    me = await whopJSON(`${oauthBase(env)}/userinfo`, tokens.access_token);
  } catch (e) { return fail(why(e)); }
  let lv = null, note = "", errs = [];
  try { [lv, errs] = await checkWithFallback(env, me.sub, tokens.access_token); }
  catch (e) { note = why(e); console.error("access check failed:", note); }   // signed in anyway, as a free account
  if (errs.length) console.error("access check:", errs.join(","));
  const name = me.preferred_username || me.name || me.email || "";
  const s = { u: me.sub, name, m: !!lv, lv, c: note ? 0 : now(), exp: now() + SESSION_S, ...(errs.length ? { err: errs.join(",") } : {}),
    ...(tokens.refresh_token ? { rt: await hide(env, tokens.refresh_token) } : {}) };
  const to = note && !/^\/auth\/(join|welcome)/.test(st.n) ? `/week?signin=nocheck&why=${note}` : st.n;
  return redirect(to, [cookie(env, "ll_oauth", "", 0), ...(await sessionCookies(env, s))]);
}

// the session cookie plus the small ones the page reads: signed in, member, owner, Discord linked, name
async function sessionCookies(env, s) {
  const link = env.LINKS && !s.d ? await env.LINKS.get(`w:${s.u}`, "json").catch(() => null) : null;
  if (link && link.d && s.lv === "customer") s.d = link.d;              // linked before, on another device
  else if (link && link.d && s.c) {                                     // no membership (or the owner): no Member role
    await discordRole(env, link.d, false).catch((e) => console.error("role removal failed:", why(e)));
    await env.LINKS.delete(`w:${s.u}`).catch(() => {});
  }
  return [cookie(env, "ll_s", await seal(env, s), SESSION_S), cookie(env, "ll_in", "1", SESSION_S, false),
    cookie(env, "ll_m", s.m ? "1" : "0", SESSION_S, false), cookie(env, "ll_o", s.lv === "admin" ? "1" : "0", SESSION_S, false),
    cookie(env, "ll_d", s.d && s.lv === "customer" ? "1" : "0", SESSION_S, false), cookie(env, "ll_n", String(s.name || "").slice(0, 40), SESSION_S, false)];
}

function logout(env, to = "/") {
  return redirect(to, ["ll_s", "ll_in", "ll_m", "ll_o", "ll_d", "ll_n", "ll_oauth"].map((n) => cookie(env, n, "", 0, n === "ll_s" || n === "ll_oauth")));
}

// "Start free trial": signed in first (Whop's sign-in page also makes new accounts), then Whop's checkout - signed in
// there too, so the trial is on this account.  A member is sent to the picks instead.
async function join(req, env) {
  const [s, set] = await session(req, env, true);
  if (!s) return redirect(`/auth/login?next=${encodeURIComponent("/auth/join")}`);
  if (s.m) return redirect("/auth/welcome", set);
  return redirect(env.JOIN_URL || "/", set);
}

// after checkout (Whop's redirect link): ask Whop now.  Whop can take a few seconds to record a new membership, so
// a not-yet answer goes to a page that keeps checking (?welcome=pending) instead of a dead end.
async function welcome(req, env) {
  const [s, set] = await session(req, env, true);
  if (!s) return redirect(`/auth/login?next=${encodeURIComponent("/auth/welcome")}`);
  return redirect(s.m ? "/week?welcome=1" : "/week?welcome=pending", await sessionCookies(env, s));
}

// the session, re-checked with Whop when it's older than RECHECK_S; returns [session or null, Set-Cookie headers]
async function session(req, env, force = false) {
  const s = await unseal(env, cookies(req).ll_s);
  if (!s) return [null, []];
  if (!force && now() - s.c < RECHECK_S) return [s, []];
  const errs = [];
  let done = false, token = null;
  if (s.rt) {
    try {
      const t = await refresh(env, await reveal(env, s.rt));
      if (t.refresh_token) s.rt = await hide(env, t.refresh_token);   // Whop may rotate it
      token = t.access_token;
    } catch (e) { errs.push(`refresh:${why(e)}`); }
  }
  try { const [lv, e2] = await checkWithFallback(env, s.u, token); s.lv = lv; s.m = !!lv; done = true; errs.push(...e2); }
  catch (e) { errs.push(why(e)); }
  if (done) { s.c = now(); if (errs.length) s.err = errs.join(","); else delete s.err; } else {
    s.err = errs.join(",") || "no-way-to-check";             // shown by /api/me, so a broken re-check is visible
    console.error("access re-check failed:", s.err);
    if (now() - s.c > GRACE_S) s.m = false;                  // can't confirm for a day: treat as not a member
    else return [s, []];
  }
  if (s.lv !== "customer" && s.d) { await discordRole(env, s.d, false).catch(() => {}); delete s.d; }   // lapsed: the channel goes too
  return [s, await sessionCookies(env, s)];
}

// ---------------------------------------------------------------------------------------------- Discord
// A member links Discord once (/auth/discord): our bot adds them to the server with the Member role.  The link
// (Whop user -> Discord user) is kept in KV, so when Whop says a membership ended (/api/whop-webhook) the bot
// takes the role away, and gives it back if they rejoin.  Vars: DISCORD_CLIENT_ID, DISCORD_GUILD_ID,
// DISCORD_ROLE_ID; secrets: DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, WHOP_WEBHOOK_SECRET; KV binding: LINKS.
const DISCORD = "https://discord.com/api/v10";
const KEEPS_ACCESS = new Set(["trialing", "active", "past_due", "completed", "canceling"]);

async function discordRole(env, discordId, give) {
  const res = await fetch(`${env.DISCORD_API || DISCORD}/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}/roles/${env.DISCORD_ROLE_ID}`,
    { method: give ? "PUT" : "DELETE", headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN || "").trim()}`, "X-Audit-Log-Reason": give ? "Line Ledger member" : "Membership ended" } });
  if (!res.ok && res.status !== 404) throw new Error(`discord-role-${res.status}`);   // 404: they left the server
}

async function discordStart(req, env) {
  const [s, set] = await session(req, env, true);                      // ask Whop now: who is this, really
  if (!s) return redirect(`/auth/login?next=${encodeURIComponent("/auth/discord")}`);
  if (s.lv === "admin") return redirect("/week?discord=owner", set);
  if (!s.m) return redirect("/week?discord=not-member", set);
  const state = rand(16);
  const p = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: `${env.SITE}/auth/discord/callback`,
    scope: "identify guilds.join", state });
  return redirect(`${env.DISCORD_AUTH || "https://discord.com/oauth2/authorize"}?${p}`, [cookie(env, "ll_dstate", await seal(env, { s: state, exp: now() + 600 }), 600)]);
}

async function discordCallback(req, env) {
  const url = new URL(req.url), c = cookies(req);
  const st = await unseal(env, c.ll_dstate);
  const done = (q, set = []) => redirect(`/week?discord=${q}`, [cookie(env, "ll_dstate", "", 0), ...set]);
  if (url.searchParams.get("error")) return done("cancelled");
  if (!st || st.s !== url.searchParams.get("state")) return done("failed-state");
  const [s] = await session(req, env);
  if (s && s.lv === "admin") return done("owner");
  if (!s || s.lv !== "customer") return done("not-member");
  try {
    const form = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: String(env.DISCORD_CLIENT_SECRET || "").trim(),
      grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: `${env.SITE}/auth/discord/callback` });
    const tok = await fetch(`${env.DISCORD_API || DISCORD}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    if (!tok.ok) throw new Error(`discord-token-${tok.status}`);
    const { access_token } = await tok.json();
    const meRes = await fetch(`${env.DISCORD_API || DISCORD}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) throw new Error(`discord-me-${meRes.status}`);
    const me = await meRes.json();
    // join the server with the role (201), or - already in it (204) - just give the role
    const join = await fetch(`${env.DISCORD_API || DISCORD}/guilds/${env.DISCORD_GUILD_ID}/members/${me.id}`, { method: "PUT",
      headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN || "").trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, roles: [env.DISCORD_ROLE_ID] }) });
    if (join.status === 204) await discordRole(env, me.id, true);
    else if (!join.ok) throw new Error(`discord-join-${join.status}`);
    // one Discord account per membership: linking a new one takes the role off the old one
    const old = env.LINKS ? await env.LINKS.get(`w:${s.u}`, "json").catch(() => null) : null;
    const prev = (old && old.d) || s.d;
    if (prev && prev !== me.id) await discordRole(env, prev, false).catch((e) => console.error("old link role removal failed:", why(e)));
    if (env.LINKS) await env.LINKS.put(`w:${s.u}`, JSON.stringify({ d: me.id, at: now() }));
    s.d = me.id;
    return redirect(`https://discord.com/channels/${env.DISCORD_GUILD_ID}`, [cookie(env, "ll_dstate", "", 0), ...(await sessionCookies(env, s))]);
  } catch (e) {
    console.error("discord link failed:", why(e));
    return done(`failed-${why(e)}`);
  }
}

// Whop -> us when a membership changes (Standard Webhooks signature, HMAC-SHA256 over "id.timestamp.body")
async function whopWebhook(req, env) {
  const body = await req.text(), id = req.headers.get("webhook-id") || "", ts = req.headers.get("webhook-timestamp") || "";
  const sigs = (req.headers.get("webhook-signature") || "").split(" ").map((x) => x.split(",")[1]).filter(Boolean);
  if (!env.WHOP_WEBHOOK_SECRET || !id || !sigs.length || Math.abs(now() - Number(ts)) > 300) return new Response("bad request", { status: 400 });
  const secret = String(env.WHOP_WEBHOOK_SECRET).trim(), msg = enc.encode(`${id}.${ts}.${body}`);
  // Whop says the key is the ws_ secret itself; Standard Webhooks libraries base64-decode it - accept either
  const keys = [enc.encode(secret)];
  try { keys.push(unb64u(secret.replace(/^(ws|whsec)_/, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))); } catch (e) {}
  let ok = false;
  for (const k of keys) {
    const key = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const sg of sigs) { try { if (await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sg), (ch) => ch.charCodeAt(0)), msg)) ok = true; } catch (e) {} }
  }
  if (!ok) return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(body), m = ev.data || {};
  const productId = m.product_id || (m.product && m.product.id) || (m.access_pass && m.access_pass.id);
  const userId = m.user_id || (m.user && (m.user.id || m.user)) || "";          // flat (older) or nested (v1) payloads
  if (typeof userId !== "string") return new Response("ok");
  m.user_id = userId;
  if (!/^membership[._]/.test(ev.type || ev.action || "") || productId !== env.WHOP_PRODUCT_ID || !m.user_id || !env.LINKS) return new Response("ok");
  const kind = ev.type || ev.action || "";
  const st = m.status || (/went_invalid|deactivated/.test(kind) ? "expired" : /went_valid|activated/.test(kind) ? "active" : "");
  if (st) await env.LINKS.put(`m:${m.user_id}`, JSON.stringify({ s: st, at: now() }));
  const link = await env.LINKS.get(`w:${m.user_id}`, "json");
  if (link && link.d) {
    if (st) try { await discordRole(env, link.d, KEEPS_ACCESS.has(st)); }
    catch (e) { console.error("webhook role change failed:", why(e)); return new Response("retry", { status: 500 }); }   // Whop retries
  }
  return new Response("ok");
}

async function membersData(env, origin) {
  const res = await env.ASSETS.fetch(new Request(`${origin}/members.enc`));
  if (!res.ok) throw new Error("no members data published");
  const raw = unb64u((await res.text()).trim());
  const key = await crypto.subtle.importKey("raw", unb64u(env.MEMBERS_KEY), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return dec.decode(plain);
}

function send(body, type, setCookies = [], status = 200) {
  const h = new Headers({ "Content-Type": type, "Cache-Control": "private, no-store" });
  setCookies.forEach((c) => h.append("Set-Cookie", c));
  return new Response(body, { status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/auth/login") return await login(req, env);
      if (url.pathname === "/auth/callback") return await callback(req, env);
      if (url.pathname === "/auth/logout") return logout(env, url.searchParams.get("then") === "switch" ? "/week?switch=1" : "/");
      if (url.pathname === "/auth/join") return await join(req, env);
      if (url.pathname === "/auth/welcome") return await welcome(req, env);
      if (url.pathname === "/auth/discord") return await discordStart(req, env);
      if (url.pathname === "/auth/discord/callback") return await discordCallback(req, env);
      if (url.pathname === "/api/whop-webhook" && req.method === "POST") return await whopWebhook(req, env);
      if (url.pathname === "/api/me") {
        const [s, set] = await session(req, env, url.searchParams.get("recheck") === "1");   // ?recheck=1: ask Whop now
        return send(JSON.stringify(s ? { in: true, member: !!s.m, level: s.lv || null, discord: !!s.d, name: s.name, checked_min_ago: Math.round((now() - s.c) / 60), ...(s.err ? { recheck_error: s.err } : {}) } : { in: false, member: false }), "application/json", set);
      }
      if (url.pathname === "/api/members.js") {
        const [s, set] = await session(req, env);
        if (!s || !s.m) return send("/* not a member: public picks only */", "application/javascript", set);
        return send(`window.DATA = ${await membersData(env, url.origin)};\nwindow.MEMBER = true;\n`, "application/javascript", set);
      }
      if (url.pathname === "/members.enc") return new Response("Not found", { status: 404 });   // only via /api/members.js
    } catch (e) {
      return send(`/* ${String(e.message || e).replace(/\*\//g, "")} */`, "application/javascript", [], 500);
    }
    return env.ASSETS.fetch(req);
  },
};
