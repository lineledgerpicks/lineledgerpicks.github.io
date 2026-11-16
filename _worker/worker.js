/* Line Ledger site worker (Cloudflare).  Serves the static site, plus:
     /auth/login, /auth/callback, /auth/logout  - "Sign in with Whop" (OAuth 2.1 + PKCE)
     /api/me                                    - who is signed in, and are they a member
     /api/members.js                            - the full picks (members only; replaces the sealed public data)
   Membership = access to the Whop product WHOP_PRODUCT_ID, checked at sign-in with the member's own token and
   re-checked every 15 minutes with the app's API key.  The members' picks are published encrypted (members.enc,
   AES-GCM); only this worker holds the key.  Secrets (Cloudflare dashboard): SESSION_KEY, MEMBERS_KEY,
   WHOP_API_KEY, optional WHOP_CLIENT_SECRET.  Vars (wrangler.jsonc): WHOP_CLIENT_ID, WHOP_PRODUCT_ID, SITE. */

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
async function hasAccess(env, userId, token) {
  const r = await whopJSON(`${apiBase(env)}/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(env.WHOP_PRODUCT_ID)}`, token);
  return !!r.has_access && r.access_level !== "no_access";
}
async function checkWithFallback(env, userId, userToken) {       // the member's token first, then the app's key
  try { if (userToken) return await hasAccess(env, userId, userToken); } catch (e) { if (!env.WHOP_API_KEY) throw e; }
  return hasAccess(env, userId, apiKey(env));
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
  let member = false, note = "";
  try { member = await checkWithFallback(env, me.sub, tokens.access_token); }
  catch (e) { note = why(e); console.error("access check failed:", note); }   // signed in anyway, as a free account
  const s = await seal(env, { u: me.sub, name: me.preferred_username || me.name || "", m: member, c: note ? 0 : now(), exp: now() + SESSION_S,
    ...(tokens.refresh_token ? { rt: await hide(env, tokens.refresh_token) } : {}) });
  const to = note ? `/?signin=nocheck&why=${note}` : member ? st.n : "/#pricing";
  return redirect(to, [cookie(env, "ll_oauth", "", 0), cookie(env, "ll_s", s, SESSION_S),
    cookie(env, "ll_in", "1", SESSION_S, false), cookie(env, "ll_m", member ? "1" : "0", SESSION_S, false)]);
}

function logout(env) {
  return redirect("/", ["ll_s", "ll_in", "ll_m", "ll_oauth"].map((n) => cookie(env, n, "", 0, n === "ll_s" || n === "ll_oauth")));
}

// the session, re-checked with Whop when it's older than RECHECK_S; returns [session or null, Set-Cookie headers]
async function session(req, env, force = false) {
  const s = await unseal(env, cookies(req).ll_s);
  if (!s) return [null, []];
  if (!force && now() - s.c < RECHECK_S) return [s, []];
  // with the member's own login first (the way the sign-in check works), then the app's key
  const errs = [];
  let done = false;
  if (s.rt) {
    try {
      const t = await refresh(env, await reveal(env, s.rt));
      if (t.refresh_token) s.rt = await hide(env, t.refresh_token);   // Whop may rotate it
      s.m = await hasAccess(env, s.u, t.access_token);
      done = true;
    } catch (e) { errs.push(`login:${why(e)}`); }
  }
  if (!done && env.WHOP_API_KEY) {
    try { s.m = await hasAccess(env, s.u, apiKey(env)); done = true; } catch (e) { errs.push(`key:${why(e)}`); }
  }
  if (done) { s.c = now(); delete s.err; } else {
    s.err = errs.join(",") || "no-way-to-check";             // shown by /api/me, so a broken re-check is visible
    console.error("access re-check failed:", s.err);
    if (now() - s.c > GRACE_S) s.m = false;                  // can't confirm for a day: treat as not a member
    else return [s, []];
  }
  return [s, [cookie(env, "ll_s", await seal(env, s), SESSION_S), cookie(env, "ll_m", s.m ? "1" : "0", SESSION_S, false)]];
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
      if (url.pathname === "/auth/logout") return logout(env);
      if (url.pathname === "/api/me") {
        const [s, set] = await session(req, env, url.searchParams.get("recheck") === "1");   // ?recheck=1: ask Whop now
        return send(JSON.stringify(s ? { in: true, member: !!s.m, name: s.name, checked_min_ago: Math.round((now() - s.c) / 60), ...(s.err ? { recheck_error: s.err } : {}) } : { in: false, member: false }), "application/json", set);
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
