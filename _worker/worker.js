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
  if (!res.ok) throw new Error(`${url.split("?")[0]} -> ${res.status}`);
  return res.json();
}
async function hasAccess(env, userId, token) {
  const r = await whopJSON(`${apiBase(env)}/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(env.WHOP_PRODUCT_ID)}`, token);
  return !!r.has_access && r.access_level !== "no_access";
}
async function checkWithFallback(env, userId, userToken) {       // the member's token first, then the app's key
  try { if (userToken) return await hasAccess(env, userId, userToken); } catch (e) { if (!env.WHOP_API_KEY) throw e; }
  return hasAccess(env, userId, env.WHOP_API_KEY);
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

async function callback(req, env) {
  const url = new URL(req.url), c = cookies(req);
  const st = await unseal(env, c.ll_oauth);
  if (url.searchParams.get("error") || !st || st.s !== url.searchParams.get("state")) return redirect("/?signin=failed", [cookie(env, "ll_oauth", "", 0)]);
  try {
    const tokens = await whopJSON(`${oauthBase(env)}/token`, null, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: `${env.SITE}/auth/callback`,
        client_id: env.WHOP_CLIENT_ID, code_verifier: st.v, ...(env.WHOP_CLIENT_SECRET ? { client_secret: env.WHOP_CLIENT_SECRET } : {}) }) });
    const me = await whopJSON(`${oauthBase(env)}/userinfo`, tokens.access_token);
    const member = await checkWithFallback(env, me.sub, tokens.access_token);
    const s = await seal(env, { u: me.sub, name: me.preferred_username || me.name || "", m: member, c: now(), exp: now() + SESSION_S });
    return redirect(member ? st.n : "/#pricing", [cookie(env, "ll_oauth", "", 0), cookie(env, "ll_s", s, SESSION_S),
      cookie(env, "ll_in", "1", SESSION_S, false), cookie(env, "ll_m", member ? "1" : "0", SESSION_S, false)]);
  } catch (e) {
    return redirect("/?signin=failed", [cookie(env, "ll_oauth", "", 0)]);
  }
}

function logout(env) {
  return redirect("/", ["ll_s", "ll_in", "ll_m", "ll_oauth"].map((n) => cookie(env, n, "", 0, n === "ll_s" || n === "ll_oauth")));
}

// the session, re-checked with Whop when it's older than RECHECK_S; returns [session or null, Set-Cookie headers]
async function session(req, env) {
  const s = await unseal(env, cookies(req).ll_s);
  if (!s) return [null, []];
  if (now() - s.c < RECHECK_S) return [s, []];
  try {
    s.m = await hasAccess(env, s.u, env.WHOP_API_KEY);
    s.c = now();
  } catch (e) {
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
        const [s, set] = await session(req, env);
        return send(JSON.stringify(s ? { in: true, member: !!s.m, name: s.name } : { in: false, member: false }), "application/json", set);
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
