/* Line Ledger: renders every page from data.js (window.DATA, written by `python nfl.py publish`).
   Sport- and market-agnostic: tabs, pages and labels come from DATA.sports and DATA.markets, so another sport or
   market is a data change, not a code change. */
window.LL_BOOT = function () {
  const D = window.DATA;
  // sealed picks: open picks members see first.  They stay out of every list and record, and show as seals in This
  // week's Open section until kickoff, when the next publish reveals them (site.public_view)
  const ck = (n) => (String(document.cookie || "").match(new RegExp(`(?:^|; )${n}=([^;]*)`)) || [])[1];
  const PV = D.preview_as || "";                                        // local preview only: show the site as this account
  const SIGNED_IN = ck("ll_in") === "1" || !!PV, MEMBER = !!window.MEMBER || PV === "owner" || PV === "member";   // MEMBER: /api/members.js loaded the full picks
  const OWNER = ck("ll_o") === "1" || PV === "owner";                   // Whop's own team: full picks, no Discord role
  const WHO = PV ? "Preview" : (() => { try { return decodeURIComponent(ck("ll_n") || ""); } catch (e) { return ""; } })();
  const SEALED = [];
  Object.values(D.props || {}).forEach((P) => { P.picks = P.picks.filter((p) => !(p.sealed && SEALED.push(p))); });
  // the account button: Log in; once signed in, Member (or Upgrade) and Log out
  function account(cls) {
    if (!D.login_url) return "";
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    if (!SIGNED_IN) return `<a class="${cls}" href="${esc(D.login_url)}?next=${back}">Log in</a>`;
    const linkDc = MEMBER && !OWNER && D.discord_link && ck("ll_d") !== "1";
    const items = [
      WHO ? `<span class="acct-who">Signed in as <b>${esc(WHO)}</b>${OWNER ? " (owner)" : MEMBER ? "" : " &middot; no membership"}</span>` : "",
      linkDc ? `<a class="dc" href="/auth/discord" title="Get the members' Discord channel: phone alerts for every pick">${brand("discord", 16)} Connect Discord</a>` : "",
      MEMBER && !OWNER && D.discord_link && ck("ll_d") === "1" ? `<span class="acct-ok">${brand("discord", 16)} Discord connected &#10003;</span>` : "",
      canInstall() ? `<a href="#" data-install="1">Add to home screen</a>` : "",
      !MEMBER && D.join_url ? `<a class="up" href="${esc(D.join_url)}">Upgrade: every pick</a>` : "",
      MEMBER && !OWNER ? `<a href="https://whop.com/@me/settings/orders/" target="_blank" rel="noopener">Manage or cancel membership</a>` : "",
      !MEMBER ? `<a href="/auth/logout?then=switch">Switch Whop account</a>` : "",
      `<a href="/auth/logout">Log out</a>`].join("");
    if (cls !== "navlogin") return items;                                 // the phone's More sheet: plain rows
    // the top bar: one account button, its menu holds the rest (keeps the bar from crowding the tabs)
    return `<details class="acct"><summary class="navlogin ${MEMBER ? "badge-m" : ""}">${OWNER ? "&#10003; Owner" : MEMBER ? "&#10003; Member" : "Account"}${linkDc ? `<i class="acct-dot" title="Connect Discord"></i>` : ""}<i class="acct-car" aria-hidden="true"></i></summary>
      <div class="acct-pop">${items}</div></details>`;
  }
  { const q = new URLSearchParams(location.search).get("discord");
    if (q && q !== "cancelled" && q !== "not-member" && typeof alert === "function") setTimeout(() => alert(q === "owner"
      ? "You're signed in as the Whop owner. The Discord Member role is only for customers, so nothing was changed in Discord."
      : "Discord couldn't be connected. Please try again, or message us on X."), 300); }
  const sealedOpen = () => SEALED.filter((p) => !p.kick_utc || new Date(p.kick_utc) > Date.now());
  const LOCK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
  const page = document.body.dataset.page;
  const pageMarket = document.body.dataset.market;
  const $ = (id) => document.getElementById(id);
  const SPORTS = D.sports && D.sports.length ? D.sports
    : [{ key: "nfl", name: "NFL", period: "Week", event: "kickoff", markets: Object.keys(D.props), files: { home: "index.html", open: "open.html", results: "results.html" } }];
  const TOUR = !!(document.documentElement.classList && document.documentElement.classList.contains("tour")) || /[?&]tour=1/.test(location.search);
  // which phone this is, for the right "add to home screen" steps
  const UA = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/.test(UA);
  const INAPP = /FBAN|FBAV|Instagram|Twitter|Line\/|Discord|TikTok|musical_ly|Snapchat|LinkedInApp/i.test(UA);
  const PHONE = IOS || ANDROID;
  function canInstall() {            // a phone's browser (not the installed app, not the landing page's preview)
    const app = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches || (typeof navigator !== "undefined" && navigator.standalone);
    return PHONE && !app && !document.documentElement.classList.contains("tour") && !/[?&]tour=1/.test(location.search);
  }
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  if (TOUR) { const mem = {}; store.get = (k) => (k in mem ? mem[k] : null); store.set = (k, v) => { mem[k] = v; }; }
  // this page's sport; the shared pages (CLV, How it works) keep the sport you came from (?sport=, else the last one seen)
  const pageSport = document.body.dataset.sport;
  const SPORT = SPORTS.find((s) => s.key === (pageSport || new URLSearchParams(location.search).get("sport") || store.get("ll-sport"))) || SPORTS[0];
  if (pageSport) store.set("ll-sport", pageSport);
  const PERIOD = SPORT.period || "Week";
  const MK = (D.markets || Object.keys(D.props)).filter((k) => D.props[k] && (SPORT.markets || []).includes(k));
  const href = (file) => file === "index.html" ? "./" : file;
  const MKT = (k) => D.props[k];
  const bet = (p) => { const P = MKT(p.prop); return P && P.yes ? (p.side === "OVER" ? P.yes_word : "NO " + P.yes_word) : p.side + " " + p.line; };
  const nm = (p) => p.name || p.player;          // full name when known ("Ja'Marr Chase"), else the short one

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const odds = (p) => p == null ? "&ndash;" : (p > 0 ? "+" : "") + p;
  const sgn = (v) => (v > 0 ? "+" : "");
  const pct = (v, sign = true) => v == null ? "&ndash;" : (sign ? sgn(v) : "") + v.toFixed(1) + "%";
  const num = (v, d, sign) => v == null ? "&ndash;" : (sign ? sgn(v) : "") + v.toFixed(d);
  const tone = (v) => v == null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "up" : "down";
  const wl = (r) => (r && r.n ? `${r.W}-${r.L}${r.P ? "-" + r.P : ""}` : "0-0")
    + (r && r.box ? `<sup class="boxsrc" title="Includes ${r.box} result${r.box > 1 ? "s" : ""} from tonight's box scores - official at the next grade">*</sup>` : "");
  const SHARP = { agrees: "Sharp agrees", against: "Sharp against", neutral: "Sharp neutral", "no line": "No sharp line" };
  const SEAL = { W: "Win", L: "Loss", P: "Push", VOID: "Void" };
  const sharpChip = (s, atClose) => s ? `<span class="chip ${s === "no line" ? "noline" : s}" title="Where sharp money leans${atClose ? " at the close" : " right now"}">${SHARP[s] || esc(s)}${atClose ? " &middot; close" : ""}</span>` : "";
  const abbr = (b) => ({ DraftKings: "DK", FanDuel: "FD" }[b] || b || "");

  /* team colors: badges and ticket bands (colors only - no logos) */
  const TEAMS = D.teams || {};
  const light = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };
  const tm = (code) => { const [c1, c2] = TEAMS[code] || ["#5b6880", "#d6dce6"];
    return `<span class="tm" style="--c1:${c1};--c2:${c2};color:${light(c1) ? "#101820" : "#fff"}">${esc(code)}</span>`; };
  const gameLabel = (p) => p.home ? `${tm(p.opp)}<i class="at">@</i>${tm(p.team)}` : `${tm(p.team)}<i class="at">@</i>${tm(p.opp)}`;
  const band = (p) => { const [c1, c2] = TEAMS[p.team] || ["#5b6880", "#d6dce6"]; return `--c1:${c1};--c2:${c2}`; };

  /* ------------------------------------------------------------------ all picks, and where each one lives */
  const allPicks = MK.flatMap((k) => MKT(k).picks);
  // the page was built at the last publish: a pick still "open" whose game has kicked off since is live now
  function syncPhases() {
    let moved = false;
    for (const p of allPicks) {
      if (p.phase === "open" && p.kick_utc && new Date(p.kick_utc) <= Date.now()) { p.phase = "live"; p.game_state = "In progress"; moved = true; }
    }
    return moved;
  }
  syncPhases();
  const byId = Object.fromEntries(allPicks.map((p) => [p.serial, p]));
  // "I bet this": ticks a visitor makes on the Tools page, kept in this browser only (serial -> 1).  Serials carry the
  // season and week, so a new week starts empty; ticks for picks no longer on the site are dropped.
  const MYBETS = (() => { let m = {}; try { m = JSON.parse(store.get("ll-mybets") || "{}") || {}; } catch (e) {}
    const onSite = new Set(allPicks.map((p) => p.serial)); Object.keys(m).forEach((k) => { if (!onSite.has(k)) delete m[k]; }); return m; })();
  const iBet = (p) => !!MYBETS[p.serial];
  const setBet = (serial, on) => { if (on) MYBETS[serial] = 1; else delete MYBETS[serial]; store.set("ll-mybets", JSON.stringify(MYBETS)); };
  const betMark = (p) => iBet(p) ? `<span class="ibet" title="You marked this as bet on the Tools page">&#10003; Bet</span>` : "";
  const linkTo = (p) => new URL(pickUrl(p), location.href).href;           // every pick lives on Results (open to all)
  const byKick = (a, b) => (a.kick_utc || "").localeCompare(b.kick_utc || "") || MK.indexOf(a.prop) - MK.indexOf(b.prop);
  const openNow = allPicks.filter((p) => p.phase !== "final").sort(byKick);
  const seasons = [...new Set(allPicks.map((p) => p.season))].sort((a, b) => b - a);
  const periodsOf = (season, picks = allPicks) => [...new Set(picks.filter((p) => p.season === season).map((p) => p.week))].sort((a, b) => b - a);

  /* ------------------------------------------------------------------ navigation
     The places you go each week as tabs: This week, Results (the whole record: every prop, closing line value, every
     week), Parlays, Tools.  Phones: those as the bottom tab bar, How it works / account / follow under More; laptops:
     a menu down the left side with every tool listed.  Every prop is one switch away - never a page of its own. */
  const F = SPORT.files || {};
  const keep = SPORT === SPORTS[0] ? "" : `?sport=${SPORT.key}`;
  const ICON = {
    week: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    open: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    results: '<path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/>',
    parlays: '<path d="M8 7h11M8 12h11M8 17h11"/><circle cx="4.5" cy="7" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17" r="1"/>',
    tools: '<path d="M4 20l7-7M14.5 3.5a4.5 4.5 0 0 0-4 6.5L4 16.5V20h3.5l6.5-6.5a4.5 4.5 0 0 0 6.5-4l-3 1-2.5-2.5 1-3z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>' };
  const BRAND = { x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z", discord: "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" };
  const brand = (k, s = 18) => `<svg class="brand-${k}" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${BRAND[k]}"/></svg>`;
  const svg = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const places = (SPORT.markets || []).length
    ? [["home", href(F.home), `This ${PERIOD.toLowerCase()}`, "week"], ["results", F.results, "Results", "results"],
       ...(F.parlays ? [["parlays", F.parlays, "Parlays", "parlays"]] : []), ["tools", `tools.html${keep}`, "Tools", "tools"]]
    : [["soon", href(F.home), "Overview", "week"]];
  const how = ["method", `method.html${keep}`, "About & how it works"];
  const follow = [...(D.discord ? [[esc(D.discord), "Discord alerts", "discord"]] : []), ...(D.x ? [[`https://x.com/${esc(D.x)}`, `X &middot; @${esc(D.x)}`, "x"]] : [])];
  const fl = (cls) => follow.map(([link, label, k]) => `<a class="${cls}" href="${link}" target="_blank" rel="noopener" aria-label="${label.replace(/&middot;/, "-")}">${brand(k)}<span>${label}</span></a>`).join("");
  const here = page === "market" ? `m:${pageMarket}` : page;
  const cur = (id) => id === here ? ' aria-current="page"' : "";
  const openBadge = (id) => id === "home" ? `<span class="badge" data-open-count hidden></span>` : "";
  const sportSwitch = SPORTS.length < 2 ? "" : `<div class="sports" role="group" aria-label="Sport">${SPORTS.map((s) =>
    `<a href="${href(s.files.home)}"${s.key === SPORT.key ? ' aria-current="true"' : ""}>${esc(s.name)}${(s.markets || []).length ? "" : "<small>soon</small>"}</a>`).join("")}</div>`;
  const inMore = here === "method" || here === "clv";
  $("tabs").innerHTML = sportSwitch + places.map(([id, link, label]) => `<a href="${link}"${cur(id)}>${esc(label)}${openBadge(id)}</a>`).join("");
  document.querySelector(".navr").insertAdjacentHTML("afterbegin", `<span class="social">${fl("soc")}</span>${account("navlogin")}`);
  document.querySelector(".navr").insertAdjacentHTML("afterbegin", `<a class="navhow" href="${how[1]}"${cur(how[0])}>${how[2]}</a>`);
  // phones: the places as a bottom tab bar, the rest in the More sheet
  document.body.insertAdjacentHTML("beforeend", `<nav class="bbar" aria-label="Pages"><span class="bb-glass" aria-hidden="true"></span>${places.map(([id, link, label, ic]) =>
      `<a href="${link}"${cur(id)}>${svg(ic)}<span>${esc(id === "home" ? PERIOD : label)}</span>${openBadge(id)}</a>`).join("")}
      <button type="button" id="bmore" aria-expanded="false" aria-controls="msheet"${inMore ? ' aria-current="page"' : ""}>${svg("more")}<span>More</span></button></nav>
    <div class="msheet" id="msheet" hidden><div class="ms-in">${sportSwitch}
      <div class="eyebrow">Records</div><a href="clv.html${keep}"${cur("clv")}>Closing line value<i aria-hidden="true">&rsaquo;</i></a>
      ${D.login_url ? `<div class="eyebrow">Account</div>${account("")}` : ""}<div class="eyebrow">About</div><a href="${how[1]}"${cur(how[0])}>${how[2]}<i aria-hidden="true">&rsaquo;</i></a>${follow.length ? `<div class="eyebrow">Follow</div>${fl("fl-menu")}` : ""}</div></div>`);
  const openCount = openNow.length + sealedOpen().length;
  // desktop and laptop: a menu down the left side, always there (phones keep the top bar and the bottom tabs)
  if (page !== "landing") {
    const SI_ = { results: ICON.results, rec: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
      clv: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', size: '<path d="M4 7h16M4 12h10M4 17h6"/>',
      odds: '<circle cx="12" cy="12" r="8.5"/><path d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01"/>', calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2"/>',
      player: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-4 4-5.5 7-5.5s5.5 1.5 7 5.5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>' };
    const ico = (path) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    const toolNow = page === "tools" ? (location.hash.slice(1) || store.get("ll-tool") || "sizing") : "";
    const item = (link, label, icon, on, extra = "") => `<a href="${link}"${on ? ' aria-current="page"' : ""}>${ico(icon)}<span>${label}</span>${extra}</a>`;
    const groups = [
      ["Picks", places.filter(([id]) => id === "home" || id === "parlays").map(([id, link, label, ic]) => item(link, id === "home" ? `This ${PERIOD.toLowerCase()}` : label, ICON[ic], id === here,
        id === "home" ? `<span class="badge" data-open-count hidden></span>` : ""))],
      ["Record", places.filter(([id]) => id === "results").map(([id, link, label]) => item(link, label, SI_.results, id === here))
        .concat([item(`clv.html${keep}`, "Closing line value", SI_.clv, here === "clv")])],
      ["Tools", [["sizing", "Bet sizing", SI_.size], ["odds", "Odds", SI_.odds], ["parlay", "Parlay calculator", SI_.calc], ["player", "Player lookup", SI_.player], ["alerts", "Alerts", '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>']]
        .map(([k, label, icon]) => item(`tools.html${keep}#${k}`, label, icon, toolNow === k))],
      ["About", [item(how[1], how[2], SI_.info, here === how[0])]]];
    const acct = !D.login_url ? "" : `<div class="side-acct">${SIGNED_IN ? `<div class="side-who">${OWNER ? `<b class="m">&#10003; Owner</b>` : MEMBER ? `<b class="m">&#10003; Member</b>` : `<b>Free account</b>`}</div>` : ""}${account("side-login")}</div>`;
    document.body.insertAdjacentHTML("afterbegin", `<aside class="side" aria-label="Menu">
      <a class="side-mark" href="${SIGNED_IN ? href(F.home) : "./"}"><i>LL</i>Line Ledger</a>
      ${sportSwitch}
      <nav>${groups.map(([g, items]) => `<div class="side-g">${g ? `<div class="side-h">${g}</div>` : ""}${items.join("")}</div>`).join("")}</nav>
      <div class="side-foot">${acct}
        <div class="side-row">${follow.map(([link, label, k]) => `<a class="soc" href="${link}" target="_blank" rel="noopener" aria-label="${label.replace(/&middot;/, "-")}">${brand(k)}</a>`).join("")}
          <button type="button" class="soc side-theme" aria-label="Switch light or dark"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg></button></div></div></aside>`);
    document.body.dataset.side = "1";
    const st = document.querySelector(".side-theme"); if (st) st.addEventListener("click", () => $("theme").click());
  }
  if (openCount) document.querySelectorAll("[data-open-count]").forEach((b) => { b.textContent = openCount; b.hidden = false; });
  const navbar = $("navbar");
  const onScroll = () => navbar.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // phones: a glass bubble sits under the current tab, and slides to More while that menu is open (no animation
  // between pages: it stuttered on Safari, so tabs just open their page)
  const bbar = document.querySelector(".bbar"), glass = bbar.querySelector(".bb-glass");
  const bbHome = () => bbar.querySelector('a[aria-current="page"], #bmore[aria-current="page"]');
  const moveGlass = (el) => { if (!el) { glass.style.opacity = "0"; return; }
    glass.style.opacity = "1"; glass.style.setProperty("--x", `${el.offsetLeft}px`); glass.style.setProperty("--w", `${el.offsetWidth}px`); };
  moveGlass(bbHome());
  requestAnimationFrame(() => bbar.classList.add("ready"));        // no slide on first paint
  addEventListener("resize", () => moveGlass($("msheet").hidden ? bbHome() : $("bmore")));
  const setSheet = (open) => { const was = !$("msheet").hidden;
    $("msheet").hidden = !open; $("bmore").setAttribute("aria-expanded", String(open)); document.body.classList.toggle("sheet-open", open);
    if (was !== open) moveGlass(open ? $("bmore") : bbHome()); };
  $("bmore").addEventListener("click", (e) => { e.stopPropagation(); setSheet($("msheet").hidden); });
  if (SIGNED_IN && D.landing) { const m = document.querySelector(".navbar .mark"); if (m) m.setAttribute("href", href(F.home)); }
  const closeMenus = () => { setSheet(false); document.querySelectorAll(".navmenu[open], .acct[open]").forEach((d) => d.removeAttribute("open")); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".navmenu, .acct, .ms-in, #bmore")) closeMenus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
  $("updated").textContent = `Last updated ${D.updated} ET.`;
  $("theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark"; store.set("ll-theme", root.dataset.theme);
  });

  /* ------------------------------------------------------------------ install like an app */
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href))
    navigator.serviceWorker.register("sw.js").catch(() => {});
  let installEvt = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || (typeof navigator !== "undefined" && navigator.standalone);
  if (standalone()) document.documentElement.classList.add("app");   // opened from the home screen (style.css)
  const SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
  const DOTS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-label="menu"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
  // One slim bar above the tab bar, phones only, never in the installed app.  It shows once per visit at most, a
  // few seconds in, and "Not now" hides it for two weeks (the account menu can always bring it back).
  function installBar(force) {
    if (!canInstall() || $("ib")) return;
    if (!force) {
      const until = +(store.get("ll-ib-until") || 0);
      // one onboarding step at a time: wait while Connect Discord / "You're in" / "Confirming" is showing (the
      // no-membership note on free accounts doesn't count - it's always there for them)
      if (until > Date.now() || document.querySelector(".ll-note.dc, .ll-note.ok, .ll-note.wait") || page === "landing") return;
    }
    const how = INAPP
      ? `Open this page in <b>${IOS ? "Safari" : "Chrome"}</b> first (tap ${DOTS} or the share menu, then <b>Open in browser</b>), then add it from there.`
      : IOS ? `Tap ${SHARE} <b>Share</b>, then <b>Add to Home Screen</b>.`
      : installEvt ? `One tap: it opens like an app, full screen.` : `Tap ${DOTS} in the browser, then <b>Add to Home screen</b> (or <b>Install app</b>).`;
    const btn = !INAPP && !IOS && installEvt ? `<button class="ib-go" id="ib-go">Install</button>` : "";
    document.body.insertAdjacentHTML("beforeend", `<div class="ib" id="ib" role="dialog" aria-label="Add Line Ledger to your home screen">
      <img class="ib-ic" src="assets/icon-192.png" alt="" width="40" height="40">
      <div class="ib-t"><b>Add Line Ledger to your home screen</b><span>${how}</span></div>${btn}
      <button class="ib-x" id="ib-x" aria-label="Not now">&times;</button></div>`);
    requestAnimationFrame(() => $("ib").classList.add("on"));
    try { sessionStorage.setItem("ll-ib-seen", "1"); } catch (e) {}           // this visit has seen it
    const close = (snooze) => { const b = $("ib"); if (!b) return; b.classList.remove("on"); setTimeout(() => b.remove(), 250);
      if (snooze) store.set("ll-ib-until", String(Date.now() + 14 * 864e5)); };
    $("ib-x").onclick = () => close(true);
    if ($("ib-go")) $("ib-go").onclick = async () => { if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (err) {} installEvt = null; } close(false); };
  }
  addEventListener("appinstalled", () => { const b = $("ib"); if (b) b.remove(); store.set("ll-ib-until", String(Date.now() + 3650 * 864e5)); });
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; const w = $("install"); if (w) w.querySelector("span").textContent = "Tap here to install Line Ledger on this device."; });
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-install]")) { e.preventDefault(); const d = e.target.closest("details"); if (d) d.open = false; installBar(true); return; }
    if (!e.target.closest("#install")) return;
    e.preventDefault();
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (err) {} installEvt = null; }
  });

  /* ------------------------------------------------------------------ shared state: period, view, search, market */
  const qs = new URLSearchParams(location.search);
  const state = { season: Number(qs.get("season")) || D.season, week: qs.get("week") === "all" ? "all" : Number(qs.get("week")) || null,
                  view: store.get("ll-view3") || "list", q: "", market: "all" };
  let redraw = () => {};
  const VIEWS = [["list", "List"], ["tickets", "Tickets"], ["compact", "Compact"]];
  const viewBar = () => `<div class="seg" role="group" aria-label="View">${VIEWS.map(([v, l]) => `<button type="button" data-view="${v}" aria-pressed="${state.view === v}">${l}</button>`).join("")}</div>`;
  const searchBox = () => `<label class="search"><span class="sr">Search</span><input type="search" id="q" placeholder="Search" value="${esc(state.q)}" autocomplete="off"></label>`;
  const marketSeg = () => MK.length < 2 ? "" : `<div class="seg" role="group" aria-label="Market">${[["all", "All"], ...MK.map((k) => [k, MKT(k).short || MKT(k).label])]
    .map(([k, l]) => `<button type="button" data-market="${k}" aria-pressed="${state.market === k}">${esc(l)}</button>`).join("")}</div>`;
  // filter chips (This week, Open): any chip on narrows the list; chips in the same group widen it again (Overs + Unders)
  const FILTERS = [["over", "Overs", "side", (p) => p.side === "OVER"], ["under", "Unders", "side", (p) => p.side === "UNDER"],
    ["dk", "DraftKings", "book", (p) => p.book === "DraftKings"], ["fd", "FanDuel", "book", (p) => p.book === "FanDuel"],
    ["agrees", "Sharp agrees", "sharp", (p) => p.sharp === "agrees"]];
  state.f = new Set();
  const filterChips = () => `<div class="filters fchips" role="group" aria-label="Filter">${FILTERS.map(([k, l]) =>
    `<button type="button" data-f="${k}" aria-pressed="${state.f.has(k)}">${l}</button>`).join("")}${state.f.size ? `<button type="button" data-f="clear" class="fclear">Clear</button>` : ""}</div>`;
  const passesChips = (p) => [...new Set(FILTERS.filter(([k]) => state.f.has(k)).map(([, , g]) => g))]
    .every((g) => FILTERS.some(([k, , gg, f]) => gg === g && state.f.has(k) && f(p)));
  const matches = (p) => {
    if (!passesChips(p)) return false;
    if (state.market !== "all" && p.prop !== state.market) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return [p.player, p.name, p.team, p.opp, p.serial].some((x) => String(x || "").toLowerCase().includes(q));
  };
  // one picker for season + week ("Week 10 · 2026"), so the control bar stays one row on a phone
  function pickers(picks, allowAll) {
    if (!seasons.length) return "";
    const ps = periodsOf(state.season, picks);
    if (state.week !== "all" && !ps.includes(state.week)) state.week = allowAll ? "all" : ps[0] ?? null;
    const opts = seasons.flatMap((y) => [...(allowAll ? [[`${y}-all`, `All ${PERIOD.toLowerCase()}s &middot; ${y}`]] : []),
      ...periodsOf(y, picks).map((w) => [`${y}-${w}`, `${PERIOD} ${w} &middot; ${y}`])]);
    const now = `${state.season}-${state.week}`;
    return `<div class="pickers"><label><span class="sr">${PERIOD}</span><select id="pk-period">${opts.map(([k, l]) => `<option value="${k}"${k === now ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
  }
  const syncUrl = () => { const u = new URL(location.href); u.searchParams.set("season", state.season); u.searchParams.set("week", state.week); history.replaceState(null, "", u); };
  document.addEventListener("change", (e) => {
    if (e.target.id === "pk-period") { const [y, w] = e.target.value.split("-"); state.season = Number(y); state.week = w === "all" ? "all" : Number(w); syncUrl(); redraw(true); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "q") { state.q = e.target.value.trim(); redraw(false); } });
  document.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) { state.view = v.dataset.view; store.set("ll-view3", state.view); document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view))); redraw(false); return; }
    const fb = e.target.closest("button[data-f]");
    if (fb) { const k = fb.dataset.f; if (k === "clear") state.f.clear(); else state.f.has(k) ? state.f.delete(k) : state.f.add(k);
      document.querySelectorAll(".fchips").forEach((el) => { el.outerHTML = filterChips(); }); redraw(false); return; }
    const m = e.target.closest("button[data-market]");
    if (m) { state.market = m.dataset.market; document.querySelectorAll("button[data-market]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.market === state.market)));
      const bar = m.closest(".pbar"); if (bar && m.scrollIntoView) m.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      redraw(false); return; }
    const j = e.target.closest(".jump a");
    if (j) { const t = document.querySelector(j.getAttribute("href")); if (t) t.open = true; }
    const row = e.target.closest(".cs-row, .lrow");
    if (row && !e.target.closest("a, button.share")) toggleOpen(row.closest("[data-serial]"));
  });
  // expand a compact stub or a list row into the full ticket (and fold it back)
  function toggleOpen(holder) {
    if (!holder) return;
    const p = byId[holder.dataset.serial], open = !holder.classList.contains("open");
    holder.classList.toggle("open", open);
    const slot = holder.classList.contains("lrow") ? holder.nextElementSibling : holder.querySelector(".cs-full");
    if (open && !slot.dataset.filled) { (slot.querySelector("td") || slot).innerHTML = ticket(p); slot.dataset.filled = "1"; }
    slot.hidden = !open;
    const b = holder.querySelector(".cs-row") || holder; b.setAttribute("aria-expanded", String(open));
    afterDraw();
  }

  /* ------------------------------------------------------------------ motion + live bits */
  function reveal() {
    const items = document.querySelectorAll(".ticket:not(.in), .cstub:not(.in), .clvcard:not(.in), .chart:not(.in), .way:not(.in), .wkcard:not(.in)");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -6% 0px" });
    items.forEach((el, i) => { el.style.setProperty("--i", i % 6); el.classList.add("rv"); io.observe(el); });
  }
  function countUp() {
    document.querySelectorAll(".tote b, .clvgrid b").forEach((el) => {
      const m = el.textContent.match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
      if (!m || el.dataset.done || /^-\d/.test(m[3])) return;
      el.dataset.done = "1";
      const [, sign, n, rest] = m, target = parseFloat(n), dec = (n.split(".")[1] || "").length, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 900), q = 1 - Math.pow(1 - k, 3); el.textContent = `${sign}${(target * q).toFixed(dec)}${rest}`; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  function countdowns() {
    document.querySelectorAll("[data-kick]").forEach((el) => {
      const ms = new Date(el.dataset.kick) - Date.now();
      if (ms <= 0) { el.textContent = "started"; return; }
      const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
      el.textContent = `${el.dataset.short ? "in" : `${SPORT.event || "starts"} in`} ${d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : (m % 60) + "m"}`;
    });
  }
  setInterval(() => { if (syncPhases()) redraw(true); else countdowns(); }, 30000);    // kickoff while the page is open

  /* ------------------------------------------------------------------ live -> final, in the browser
     A game that has ended is graded right here from its official box score (ESPN's free public feed), the same
     numbers `nfl.py grade` uses - no laptop needed.  It changes only how this page shows the pick; the published
     record (totals, charts) updates at the next grade / update, which also re-checks every number. */
  const ESPN = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/";   // the host that allows browsers
  const ESPN_TEAM = { WSH: "WAS", LAR: "LA", JAC: "JAX" };
  const normName = (s) => String(s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
  const initLast = (s) => { const w = String(s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/\./g, ". ").split(/\s+/).map((x) => x.replace(/[^a-z]/g, "")).filter(Boolean); return w.length > 1 ? w[0][0] + "|" + w[w.length - 1] : ""; };
  const BOX_STAT = {
    passing_yards: (r) => r.pass ? r.pass_yds : null, pass_attempts: (r) => r.pass ? r.pass_att : null,
    completions: (r) => r.pass ? r.comp : null, pass_tds: (r) => r.pass ? r.pass_td : null, interceptions: (r) => r.pass ? r.ints : null,
    receptions: (r) => r.rec, receiving_yards: (r) => r.rec_yds, rushing_yards: (r) => r.rush_yds, rush_attempts: (r) => r.rush_att,
    rush_rec_yards: (r) => r.rush_yds + r.rec_yds, anytime_td: (r) => r.td, first_td: (r) => r.first_td };
  const boxCache = {};
  async function espnJSON(url, keep) {
    try { const c = sessionStorage.getItem(url); if (c) return JSON.parse(c); } catch (e) {}
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    if (keep) { try { sessionStorage.setItem(url, JSON.stringify(j)); } catch (e) {} }
    return j;
  }
  function parseBox(s) {                                  // summary -> players by team: {name: {...stats}}
    const n = (x) => { const v = parseFloat(String(x).replace(/,/g, "")); return isFinite(v) ? v : 0; };
    const out = {};
    for (const side of (s.boxscore || {}).players || []) {
      const team = ESPN_TEAM[side.team.abbreviation] || side.team.abbreviation;
      for (const st of side.statistics || []) for (const a of st.athletes || []) {
        const v = Object.fromEntries((st.labels || []).map((l, i) => [l, (a.stats || [])[i]]));
        const r = (out[team] = out[team] || {})[a.athlete.displayName] = (out[team] || {})[a.athlete.displayName] ||
          { pass: false, pass_yds: 0, pass_att: 0, comp: 0, pass_td: 0, ints: 0, rec: 0, rec_yds: 0, rush_att: 0, rush_yds: 0, td: 0, first_td: 0 };
        if (st.name === "passing") { const [c, t] = String(v["C/ATT"] || "0/0").split("/"); Object.assign(r, { pass: true, comp: n(c), pass_att: n(t), pass_yds: n(v.YDS), pass_td: n(v.TD), ints: n(v.INT) }); }
        if (st.name === "rushing") { r.rush_att = n(v.CAR); r.rush_yds = n(v.YDS); r.td += n(v.TD); }
        if (st.name === "receiving") { r.rec = n(v.REC); r.rec_yds = n(v.YDS); r.td += n(v.TD); }
      }
    }
    const td = (s.scoringPlays || []).find((p) => (p.scoringType || {}).name === "touchdown");   // the game's first TD
    if (td && /^(Rushing|Passing|Receiving) Touchdown$/.test((td.type || {}).text || "")) {
      const who = normName(String(td.text || "").split(/\s+\d+\s+(?:Yd|yd|Yard)/)[0]);
      const hits = Object.values(out).flatMap((t) => Object.entries(t)).filter(([nm]) => normName(nm) === who);
      if (hits.length === 1) hits[0][1].first_td = 1;
    }
    return out;
  }
  const findPlayer = (teams, p) => {
    const t = teams[p.team] || {};
    const full = Object.keys(t).filter((nm) => normName(nm) === normName(p.name || p.player));
    if (full.length === 1) return t[full[0]];
    const short = Object.keys(t).filter((nm) => initLast(nm) === initLast(p.name || p.player));
    return short.length === 1 ? t[short[0]] : null;
  };
  // a pick graded here also counts in its prop's record rows and week (as the next publish would count it)
  function bumpRecord(p) {
    const P = MKT(p.prop);
    if (!P || !P.record) return;
    const u = p.units || 0;
    const add = (r) => {
      if (!r) return;
      r.n = (r.n || 0) + 1; r[p.result] = (r[p.result] || 0) + 1; if (r.pending) r.pending -= 1;
      r.units = (r.units || 0) + p.pl; r.roi = 100 * r.units / r.n; r.win = r.W + r.L ? 100 * r.W / (r.W + r.L) : null;
      if (u) { r.sized = (r.sized || 0) + p.pl * u; r.sized_risked = (r.sized_risked || 0) + u; r.sized_roi = 100 * r.sized / r.sized_risked; }
      r.box = (r.box || 0) + 1;
    };
    const row = (label) => P.record.find((r) => r.label === label);
    add(row("All picks"));
    if (row("Live picks")) { if (p.paper) { add(row("Paper picks (tracked, not bet)")); add(P.weeks && P.weeks[`${p.season}-${p.week}`]); return; } add(row("Live picks")); }
    add(row(p.pre ? "Pre-launch" : "Posted before kickoff"));
    add(row(SHARP[p.sharp]));
    add(row(p.side === "OVER" ? "Overs" : "Unders"));
    add(P.weeks && P.weeks[`${p.season}-${p.week}`]);
  }
  let boxBusy = false, boxLast = 0;
  async function autoFinal() {
    const due = allPicks.filter((p) => p.phase === "live" && !p.result && p.kick_utc && Date.now() - new Date(p.kick_utc) > 2.5 * 3600e3);
    if (!due.length || boxBusy || Date.now() - boxLast < 120e3) return;
    boxBusy = true; boxLast = Date.now(); let moved = false;
    try {
      for (const [sw, picks] of Object.entries(due.reduce((m, p) => ((m[`${p.season}|${p.week}`] = m[`${p.season}|${p.week}`] || []).push(p), m), {}))) {
        const [season, week] = sw.split("|");
        const board = await espnJSON(`${ESPN}scoreboard?dates=${season}&seasontype=2&week=${week}`, false);
        for (const e of board.events || []) {
          if (!((e.status || {}).type || {}).completed) continue;
          const tms = e.competitions[0].competitors.map((c) => ESPN_TEAM[c.team.abbreviation] || c.team.abbreviation);
          const mine = picks.filter((p) => tms.includes(p.team) && tms.includes(p.opp));
          if (!mine.length) continue;
          const teams = boxCache[e.id] = boxCache[e.id] || parseBox(await espnJSON(`${ESPN}summary?event=${e.id}`, true));
          for (const p of mine) {
            const r = findPlayer(teams, p), a = r ? BOX_STAT[p.prop] && BOX_STAT[p.prop](r) : null;
            if (a == null) { if (p.game_state !== "Awaiting stats") { p.game_state = "Awaiting stats"; moved = true; } continue; }
            const res = a === p.line ? "P" : (p.side === "OVER") === (a > p.line) ? "W" : "L";
            Object.assign(p, { actual: a, result: res, phase: "final", game_state: "Final", box: true,
                               pl: res === "W" ? dec(p.price) - 1 : res === "L" ? -1 : 0 });
            p.pl_u = p.pl * (p.units || 0);
            bumpRecord(p);
            moved = true;
          }
        }
      }
    } catch (e) { /* feed down or offline: the next publish grades them */ }
    boxBusy = false;
    if (moved) redraw(true);
  }
  setTimeout(autoFinal, 1500);
  setInterval(autoFinal, 60000);
  const afterDraw = () => { reveal(); countdowns(); filterCount(); };
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button.share");
    if (!b) return;
    const p = byId[b.dataset.serial], url = new URL(`p/${p.serial}.html`, location.href).href, text = `${nm(p)} ${bet(p)} (${odds(p.price)}) - Line Ledger`;
    try { if (navigator.share) await navigator.share({ title: text, url }); else { await navigator.clipboard.writeText(url); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Share"), 1600); } } catch (err) {}
  });
  function revealHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    let el = id && document.getElementById(id);
    if (!el) return;
    if (el.dataset.serial && !el.classList.contains("ticket") && !el.classList.contains("open")) toggleOpen(el);
    el.scrollIntoView({ block: "center" }); el.classList.add("hit");
  }

  /* ------------------------------------------------------------------ times in the visitor's own timezone */
  let TZF = null;
  try { TZF = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); } catch (e) {}
  function when(utc, etText) {         // "Sun 10/25 1:00 PM EDT"; falls back to the ET text the site was built with
    const t = utc ? new Date(utc) : null;
    if (!TZF || !t || isNaN(t)) return etText ? `${esc(etText)} ET` : "";
    const v = Object.fromEntries(TZF.formatToParts(t).map((x) => [x.type, x.value]));
    return `${v.weekday} ${v.month}/${v.day} ${v.hour}:${v.minute}${v.dayPeriod ? " " + v.dayPeriod : ""} ${v.timeZoneName || ""}`.trim();
  }

  // every pick on one player: player.html?id=<player id>
  const playerHref = (pid) => `${(SPORT.files || {}).player || "player.html"}?id=${encodeURIComponent(pid)}`;
  // a receiver's name opens the Tools page's player lookup at that pick's line; a QB's opens his record page (the
  // lookup covers receptions only)
  const playerLink = (p) => !p.pid ? esc(nm(p)) : p.prop === "receptions"
    ? `<a class="plink" href="tools.html?player=${encodeURIComponent(p.pid)}&line=${p.line}#player" title="${esc(nm(p))}'s games this season">${esc(nm(p))}</a>`
    : `<a class="plink" href="${playerHref(p.pid)}" title="Every pick on ${esc(nm(p))}">${esc(nm(p))}</a>`;

  /* ------------------------------------------------------------------ status of a pick: open / live / grading / final */
  function status(p, short) {
    if (p.phase === "final" && p.void_reason) return `<span class="pill res-VOID" title="Voided: ${esc(p.void_reason)}">Voided</span>`;
    if (p.phase === "final") return `<span class="pill res-${p.result}"${p.box ? ` title="Graded from the official box score - the record updates at the next grade"` : ""}>${SEAL[p.result] || p.result}${p.box ? `<sup class="boxsrc">*</sup>` : ""}</span>`;
    if (p.phase === "live") return p.game_state === "Awaiting stats" ? `<span class="pill grading">Final &middot; grading</span>` : `<span class="pill live"><i></i>Live</span>`;
    return p.kick_utc ? `<span class="pill open"><span class="countdown" data-kick="${p.kick_utc}"${short ? ' data-short="1"' : ""}>${esc(p.kick)}</span></span>` : `<span class="pill open">Open</span>`;
  }

  /* ------------------------------------------------------------------ the full ticket (the design stays as it is) */
  function barcode(serial) {
    let x = 0, h = 7; const stops = [];
    for (const ch of serial + serial) { h = (h * 31 + ch.charCodeAt(0)) % 997; const b = 1 + (h % 3), g = 1 + ((h >> 2) % 2);
      stops.push(`var(--ink) ${x}px ${x + b}px`, `transparent ${x + b}px ${x + b + g}px`); x += b + g; }
    return `<span class="barcode" aria-hidden="true" style="width:${x}px;background:linear-gradient(90deg,${stops.join(",")})"></span>`;
  }
  const kickSpan = (p) => p.phase !== "open" ? `<span>close locked &middot; posts after the game</span>`
    : p.kick_utc ? `<span class="countdown" data-kick="${p.kick_utc}">closes at ${SPORT.event || "the start"}</span>` : "";
  const priceDir = (pick, other) => { const dec = (a) => a > 0 ? 1 + a / 100 : 1 + 100 / -a; const x = dec(other) - dec(pick); return Math.abs(x) < 1e-9 ? 0 : x > 0 ? 1 : -1; };
  const bar = (dir, w) => `<span class="bar" aria-hidden="true">${dir > 0 ? `<i class="up" style="left:50%;width:${w}%"></i>` : dir < 0 ? `<i class="down" style="left:${50 - w}%;width:${w}%"></i>` : ""}</span>`;
  const implied = (a) => a > 0 ? 100 / (a + 100) : -a / (-a + 100);
  // the newest check of each market: a pick whose own book wasn't quoted then has its line taken down ("not posted since")
  const lastCheck = {};
  allPicks.forEach((p) => { if (p.phase === "open" && p.now_utc && (!lastCheck[p.prop] || p.now_utc > lastCheck[p.prop])) lastCheck[p.prop] = p.now_utc; });
  const dec = (a) => a > 0 ? 1 + a / 100 : 1 + 100 / -a;
  function vsLine(p) {           // what the pick is compared with: the close after the start, else the SAME book's price now
    if (p.closed && p.now != null) return { label: "Close", line: p.now, price: p.close_price, book: p.close_book };
    if (p.phase === "open") {
      if (p.now == null || !p.now_same || p.close_price == null) return null;
      const stale = !!lastCheck[p.prop] && new Date(lastCheck[p.prop]) - new Date(p.now_utc) > 30 * 60000;
      const better = p.now === p.line && dec(p.close_price) > dec(p.price) + 1e-9;
      const ok = p.now !== p.line || p.playable_to == null ? null : dec(p.close_price) >= dec(p.playable_to) - 1e-9;
      return { label: "Now", line: p.now, price: p.close_price, book: p.close_book, stale, at: p.now_at, ok, better };
    }
    if (p.now != null) return { label: "Close", line: p.now, price: p.close_price, book: p.close_book };
    return null;
  }
  function moves(p, v) {
    const mv = (v.line - p.line) * (p.side === "OVER" ? 1 : -1);
    const same = v.line === p.line && v.price != null;
    const pts = same ? 100 * (implied(v.price) - implied(p.price)) : 0;
    return { mv, same, pts, pdir: Math.abs(pts) < 0.05 ? 0 : pts > 0 ? 1 : -1 };
  }
  function compare(p, P) {
    const v = vsLine(p);
    if (!v) return `<div class="mv"><span></span><small>Pick</small><span></span><small></small>
        <span class="lbl">Line</span><b>${p.line}</b>${bar(0, 0)}<b class="muted">&ndash;</b>
        <span class="lbl">Price</span><b>${odds(p.price)}</b>${bar(0, 0)}<b class="muted">&ndash;</b></div>
        <div class="clv-f"><span>${p.result ? "no closing line" : `no newer ${esc(p.book)} line yet`}</span>${p.result ? "" : kickSpan(p)}</div>`;
    const { mv, same, pdir, pts } = moves(p, v);
    const lineW = Math.min(50, Math.abs(mv) * (P.unit === "yds" ? 4 : 50)), priceW = Math.min(50, Math.abs(pts) * 6);
    const what = mv > 0 ? `line moved ${sgn(mv)}${mv.toFixed(1)} ${P.unit} your way` : mv < 0 ? `line moved ${Math.abs(mv).toFixed(1)} ${P.unit} against you`
      : pdir > 0 ? "price moved your way" : pdir < 0 ? "price moved against you" : "no movement";
    const books = `${abbr(p.book)}${abbr(v.book) && abbr(v.book) !== abbr(p.book) ? ` &rarr; ${abbr(v.book)}` : ""}`;
    const verdict = v.stale || v.ok == null ? "" : ` &middot; <b class="${v.ok ? "up" : "down"}">${v.better ? "better than the pick" : v.ok ? "still playable" : "past playable"}</b>`;
    const foot = p.closed ? `<span>Beat the close: <b class="${p.beat ? "up" : "down"}">${p.beat ? "yes" : "no"}</b> &middot; ${what}</span><span class="bk">${books}</span>`
      : `<span>${what}${verdict}</span>${kickSpan(p)}`;
    return `<div class="mv"><span></span><small>Pick</small><span></span><small>${v.label}</small>
        <span class="lbl">Line</span><b>${p.line}</b>${bar(mv > 0 ? 1 : mv < 0 ? -1 : 0, lineW)}<b class="${tone(mv)}">${v.line}</b>
        <span class="lbl">Price</span><b>${odds(p.price)}</b>${bar(pdir, priceW)}<b class="${same ? (pdir > 0 ? "up" : pdir < 0 ? "down" : "") : "muted"}">${v.price == null ? "&ndash;" : odds(v.price)}</b></div>
      <div class="clv-f">${foot}</div>${!p.closed ? `<div class="clv-b">${esc(p.book)} &middot; ${v.stale ? `<span class="stale">not posted since ${esc(v.at)}</span>` : `checked ${esc(v.at || "")}`}</div>` : ""}`;
  }
  function details(p, P) {
    const rows = [];
    if (p.quotes && p.quotes.length) rows.push(["Lines when stamped", p.quotes.map((q) => `${esc(q.book)} ${q.line} ${odds(q.over)}/${odds(q.under)}`).join("<br>")]);
    if (p.sharp_line != null) rows.push([`Sharp line${p.sharp_close ? " at close" : ""}`, `${p.sharp_line} ${odds(p.sharp_over)}/${odds(p.sharp_under)}`]);
    if (p.market != null) rows.push(["Market's number", `${num(p.market, P.dec)} <span class="muted">vs model ${num(p.model, P.dec)}</span>`]);
    if (p.playable_to != null) rows.push(["Playable to", `${odds(p.playable_to)} <span class="muted">at ${p.line}: the worst price that still clears the ${D.min_ev ?? 2}% value bar</span>`]);
    rows.push(["Start", when(p.kick_utc, p.kick)]);
    if (p.seal && p.salt) rows.push(["Sealed before kickoff", `<code class="sealcode">${esc(p.seal.slice(0, 16))}&hellip;</code><br><button type="button" class="sealchk" data-serial="${esc(p.serial)}">Check the seal</button>`]);
    if (p.verify) rows.push(["Posted publicly", `${when(p.posted_utc, p.posted_at)} <span class="muted">(${p.posted_before ? "before the start" : "after the start &middot; pre-launch"})</span><br><a href="${esc(p.verify)}" target="_blank" rel="noopener noreferrer">see the public record of this post &nearr;</a>`]);
    if (p.closed && p.clv != null) rows.push(["Closing line", `${p.now} ${p.close_price != null ? odds(p.close_price) : ""} ${esc(p.close_book || "")} <span class="muted">(${sgn(p.clv)}${p.clv.toFixed(1)} ${P.unit})</span>`]);
    return `<details class="drawer"><summary>Ticket details</summary><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></details>`;
  }
  function moveWord(p) {
    const v = vsLine(p);
    if (!v) return `<b class="muted">&ndash;</b>`;
    const { mv, pdir } = moves(p, v), d = mv !== 0 ? mv : pdir;
    return `<b class="${d > 0 ? "up" : d < 0 ? "down" : "muted"}">${d > 0 ? "Your way" : d < 0 ? "Against" : "No change"}</b>`;
  }
  // "Bet on <Book>": the pick's own book, open picks only (nothing is placed - the book opens and you confirm)
  // a dot in the book's color (not the books' logos: those are trademarks, used only under their own terms)
  const BOOKS_OK = { DraftKings: "dk", FanDuel: "fd" };
  // "featured" = the header card's text link; otherwise a tag styled like the ticket's Share button
  function betButton(p, featured) {
    if (p.phase !== "open" || !p.bet_link || !BOOKS_OK[p.book]) return "";
    const what = p.bet_kind === "slip" ? "opens the bet" : p.bet_kind === "event" ? "opens the game" : "opens the book";
    const tip = `${p.book} ${what}: ${nm(p)} ${MKT(p.prop).short || MKT(p.prop).label} ${bet(p)}. Nothing is placed for you.`;
    return `<a class="${featured ? "fc-bet" : "share betlink"}" href="${esc(p.bet_link)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}"
      aria-label="Bet on ${esc(p.book)}: ${esc(tip)}"><i class="bkdot ${BOOKS_OK[p.book]}" aria-hidden="true"></i>${featured ? `Bet at ${esc(p.book)}` : `Bet ${BOOKS_OK[p.book].toUpperCase()}`} &nearr;</a>`;
  }
  function ticket(p) {
    const P = MKT(p.prop);
    const head = p.closed ? `<small>Closing line value</small><b class="${tone(p.clv_ev)}">${pct(p.clv_ev)}</b>`
      : p.phase !== "open" ? `<small>Closing line value</small><b class="muted">pending</b>` : `<small>Since the pick</small>${moveWord(p)}`;
    const won = p.result === "W" ? "up" : p.result === "L" ? "down" : "";
    const final = p.result && p.result !== "VOID" && p.actual != null
      ? `<div class="final ${won}">Final <b>${p.actual} ${P.unit}</b> &middot; ${p.margin ? `${Math.abs(p.margin).toFixed(1)} ${p.margin > 0 ? "over" : "under"} the line` : "right on the line"}</div>`
      : p.result === "VOID" ? `<div class="final">${p.void_reason ? `Voided &middot; ${esc(p.void_reason)}` : "Didn't play &middot; bet refunded"}</div>` : "";
    return `<article class="ticket${p.result ? " graded" : ""}" id="${esc(p.serial)}" style="${band(p)}">
      <div class="t-top">
        <div class="t-meta"><span class="t-game">${gameLabel(p)}<span>${when(p.kick_utc, p.kick)}</span></span>${sharpChip(p.sharp, p.sharp_close)}${betMark(p)}</div>
        <div class="t-player">${playerLink(p)}</div>
        <div class="t-pick"><span><b>${bet(p)}</b><small>${odds(p.price)} ${esc(p.book)}</small></span>${p.result ? "" : status(p)}</div>
        ${p.phase === "open" && p.playable_to != null ? `<div class="final">Playable to <b>${odds(p.playable_to)}</b> &middot; <span class="muted">${esc(P.short || P.label)}</span></div>` : ""}        ${final}
        ${p.result ? `<div class="seal ${p.result}" aria-label="${SEAL[p.result]}">${SEAL[p.result]}</div>` : ""}
      </div>
      <div class="clv"><div class="clv-h">${head}</div>${compare(p, P)}</div>
      <div class="stats"><span>Model<b>${num(p.model, P.dec)}</b></span><span>Win<b>${pct(p.win, false)}</b></span><span>EV<b>${pct(p.ev)}</b></span><span>Size<b>${num(p.units, 1)}u${p.pl_u != null ? ` <i class="${tone(p.pl_u)}">&rarr; ${num(p.pl_u, 2, true)}u</i>` : ""}</b></span></div>
      ${details(p, P)}
      <div class="stub">
        <div><span class="serial">No. ${esc(p.serial)}</span><span class="when">Stamped ${when(p.stamped_utc, p.stamped)}${p.verify ? ` &middot; <a class="verify" href="${esc(p.verify)}" target="_blank" rel="noopener noreferrer" title="The public commit that first posted this pick: ${when(p.posted_utc, p.posted_at)}${p.posted_before ? ", before the start" : ""}">verify &nearr;</a>` : ""}</span></div>
        <div class="stub-r">${p.pre ? `<span class="chip pre">pre-launch</span>` : p.paper ? `<span class="chip paper">paper</span>` : ""}${betButton(p)}<button type="button" class="share" data-serial="${esc(p.serial)}" aria-label="Share this pick">Share</button>${barcode(p.serial)}</div>
      </div>
    </article>`;
  }

  /* ------------------------------------------------------------------ compact stub + list row (both open into the ticket) */
  function clvMini(p) {
    if (p.closed && p.clv_ev != null) return `<span class="cs-clv ${tone(p.clv_ev)}">CLV ${pct(p.clv_ev)}</span>`;
    if (p.phase === "open") { const w = moveWord(p).replace(/<\/?b[^>]*>/g, ""); return `<span class="cs-clv ${w === "Your way" ? "up" : w === "Against" ? "down" : "muted"}">${w === "&ndash;" ? "no move yet" : w.toLowerCase()}</span>`; }
    return `<span class="cs-clv muted">close pending</span>`;
  }
  // calm stubs: an open pick shows only its countdown on the right, a graded one its result and CLV; the line-move
  // and Sharp labels live in the full ticket (tap to open).  false = the busier stub as it was before Nov 2026
  const CALM_STUBS = false;
  function stubTicket(p) {
    const P = MKT(p.prop);
    return `<article class="cstub${p.result ? " graded r-" + p.result : ""}" id="${esc(p.serial)}" data-serial="${esc(p.serial)}" style="${band(p)}">
      <button type="button" class="cs-row" aria-expanded="false" aria-label="${esc(nm(p))} ${bet(p)}: show the full ticket">
        <span class="cs-l">
          <span class="cs-meta">${gameLabel(p)}<span class="cs-mk">${esc(P.short || P.label)}</span>${betMark(p)}</span>
          <span class="cs-player">${esc(nm(p))}</span>
          <span class="cs-pick"><b>${bet(p)}</b> ${odds(p.price)} <small>${esc(abbr(p.book))}</small></span>
        </span>
        <span class="cs-r">${status(p, true)}${CALM_STUBS ? (p.phase === "final" ? clvMini(p) : "") : clvMini(p) + (p.sharp ? `<span class="cs-sharp ${p.sharp === "no line" ? "noline" : p.sharp}" title="${SHARP[p.sharp] || ""}">${p.sharp === "no line" ? "&ndash;" : p.sharp === "agrees" ? "sharp &#10003;" : p.sharp === "against" ? "sharp &#10007;" : "sharp ~"}</span>` : "")}</span>
        <span class="cs-chev" aria-hidden="true"></span>
      </button>
      <div class="cs-full" hidden></div>
    </article>`;
  }
  function listView(list) {
    const rows = list.map((p) => { const P = MKT(p.prop), v = vsLine(p);
      return `<tr class="lrow${p.result ? " r-" + p.result : ""}" id="${esc(p.serial)}" data-serial="${esc(p.serial)}" tabindex="0" style="${band(p)}">
        <td class="l-game m-hide"><span class="gteams">${gameLabel(p)}</span></td>
        <td class="l-player">${playerLink(p)}<span class="m-only l-sub gteams">${gameLabel(p)}</span></td><td class="opt">${esc(P.short || P.label)}</td>
        <td class="mono l-pick">${bet(p)} <span class="l-px">${odds(p.price)} <span class="muted">${esc(abbr(p.book))}</span></span></td>
        <td class="num opt mono">${v ? `${v.line} ${odds(v.price)}` : "&ndash;"}</td><td class="num m-hide">${clvMini(p)}</td>
        <td class="opt">${p.sharp ? (SHARP[p.sharp] || "").replace("Sharp ", "") : ""}</td><td class="l-st">${status(p, true)}<span class="m-only">${clvMini(p)}</span></td></tr>
        <tr class="lexp" hidden><td colspan="8"></td></tr>`; }).join("");
    return `<div class="tablebox"><table class="ltable"><thead><tr><th class="m-hide">Game</th><th>Player</th><th class="opt">Market</th><th>Pick</th><th class="num opt">Now / close</th><th class="num m-hide">CLV</th><th class="opt">Sharp</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function gamesOf(list) {
    const out = [], seen = {};
    list.forEach((p) => { const id = p.game_id || `${p.week}-${[p.team, p.opp].sort().join("-")}`;
      if (!seen[id]) { seen[id] = { id, kick: p.kick, kick_utc: p.kick_utc, phase: p.phase, game_state: p.game_state, away: p.home ? p.opp : p.team, home: p.home ? p.team : p.opp, picks: [] }; out.push(seen[id]); }
      seen[id].picks.push(p); });
    return out;
  }
  // a list of picks, in the chosen view; grouped by game unless it's the list view
  function picksBlock(list, grouped = true) {
    if (!list.length) return "";
    if (state.view === "list") return listView(list);
    const one = state.view === "tickets" ? ticket : stubTicket;
    const wrap = (ps) => state.view === "tickets" ? `<div class="tickets">${ps.map(one).join("")}</div>` : `<div class="stubs">${ps.map(one).join("")}</div>`;
    if (!grouped) return wrap(list);
    return gamesOf(list).map((g) => `<div class="gamegroup" id="g-${esc(g.id)}"><div class="ghead"><span class="gteams">${tm(g.away)}<i class="at">@</i>${tm(g.home)}</span>
        <span class="mono muted">${when(g.kick_utc, g.kick)} &middot; ${g.picks.length} pick${g.picks.length === 1 ? "" : "s"}</span></div>${wrap(g.picks)}</div>`).join("");
  }

  /* ------------------------------------------------------------------ records, scoreboards, charts */
  const beatTone = (v) => v == null || v === 50 ? "" : v > 50 ? "up" : "down";     // beat the close: vs a coin flip
  function tote(rec, P, compact) {
    const r = rec[0] || { n: 0 };
    const n = r.n_clv || 0;
    // what a newcomer reads first (record, units), then the closing-line numbers, each with a plain-English tip
    const cells = [["", `<b>${wl(r)}</b>`, P.paper ? "paper record" : "record", ""],
      ["", `<b class="${tone(r.sized)}">${r.sized != null ? num(r.sized, 2, true) + "u" : "&ndash;"}</b>`,
        `units${r.sized_roi != null ? ` &middot; ${pct(r.sized_roi)} ROI` : ""}`, "Profit in units, each pick at the size on its ticket and the stamped price"],
      ["", `<b class="${beatTone(r.beat)}">${r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%"}</b>`, "beat the close", "How often the pick's price was better than the final price before kickoff"],
      ["", `<b class="${tone(r.clv_ev)}">${pct(r.clv_ev)}</b>`, `value vs close${n && n < EARLY ? ` <em class="n">early</em>` : ""}`,
        `How much better or worse the pick's price was than the closing market, on average (${n} picks). Positive means the price beat the market.`]];
    return `<div class="tote${compact ? " compact" : ""}">${cells.map(([c, b, s, t]) => `<div class="${c}"${t ? ` title="${esc(t)}"` : ""}>${b}<span>${s}</span></div>`).join("")}</div>`;
  }
  const scoreboard = () => `<div class="boards">${MK.map((k) => { const P = MKT(k);
    return `<a class="sb" href="${resultsUrl(k)}"><div class="sb-h"><span>${esc(P.label)}</span>${P.paper ? `<span class="chip paper">paper</span>` : `<span class="chip rec">the record</span>`}</div>${tote(P.record, P, true)}</a>`; }).join("")}</div>`;
  // under this many picks a number mostly reflects luck: say so next to it
  const EARLY = 50;
  const earlyNote = (n) => n && n < EARLY ? ` <span class="note" title="Fewer than ${EARLY} picks: too early to judge">n=${n}</span>` : "";
  const earlyLine = (n) => n < EARLY ? `<p class="note early">Fewer than ${EARLY} picks: too early to judge. Small samples swing a lot either way; these numbers settle as picks add up.</p>` : "";
  function recordTable(rows) {
    if (!rows.length) return `<div class="empty">No graded picks yet.</div>`;
    return recordTableBody(rows) + earlyLine(rows[0].n_clv || 0);
  }
  function recordTableBody(rows) {
    return `<div class="tablebox"><table><thead><tr><th>Picks</th><th class="num opt">Graded</th><th class="num">W-L-P</th><th class="num opt">Win %</th><th class="num" title="Each pick at the size on its ticket">Units</th><th class="num opt">ROI</th><th class="num opt" title="Every pick 1 unit">1u each</th><th class="num key">Value vs close</th><th class="num opt">Beat close</th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr class="${x.sub ? "sub" : i === 0 ? "top" : ""}"><td>${esc(x.label)}</td><td class="num opt">${x.n}${x.pending ? ` <span class="note">+${x.pending}</span>` : ""}</td>
        <td class="num">${wl(x)}</td><td class="num opt">${x.n ? pct(x.win, false) : "&ndash;"}</td><td class="num ${tone(x.sized)}">${x.sized != null ? num(x.sized, 2, true) : "&ndash;"}</td>
        <td class="num opt ${tone(x.sized_roi)}">${pct(x.sized_roi)}</td><td class="num opt ${tone(x.units)}">${x.n ? num(x.units, 2, true) : "&ndash;"}</td><td class="num key ${tone(x.clv_ev)}">${pct(x.clv_ev)}${earlyNote(x.n_clv)}</td><td class="${beatTone(x.beat)} num opt">${x.beat == null ? "&ndash;" : x.beat.toFixed(0) + "%"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function lineChart(vals, caption, last, fmt) {
    if (vals.length < 3) return "";
    const W = 640, H = 170, pad = 8, lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (W - 2 * pad), y = (v) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
    const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    return `<figure class="chart"><figcaption><span>${caption}</span><b class="${tone(last)}">${fmt(last)}</b></figcaption>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${caption.replace(/<[^>]+>/g, "")}: ${fmt(last)}">
        <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" class="zero"/><path d="${path}" class="${last >= 0 ? "upl" : "downl"}" vector-effect="non-scaling-stroke"/></svg></figure>`;
  }
  // the charts follow the headline record: live picks only once a market has any (paper picks have their own row)
  const recordPicks = (P) => P.picks.some((p) => !p.paper) ? P.picks.filter((p) => !p.paper) : P.picks;
  function unitsChart(P) {
    const g = recordPicks(P).filter((p) => p.pl_u != null).sort((a, b) => a.serial < b.serial ? -1 : 1);
    let run = 0; const pts = [0, ...g.map((p) => (run += p.pl_u))];
    return lineChart(pts, `${esc(P.label)} <span class="muted">units over time, ${g.length} graded</span>`, pts[pts.length - 1], (v) => `${num(v, 2, true)}u`);
  }
  const periodRec = (P, season, w) => P.weeks[`${season}-${w}`];
  const recLine = (r) => (r && r.n ? `<b>${wl(r)}</b> <b class="${tone(r.sized)}">${num(r.sized || 0, 2, true)}u</b> <span class="muted">vs close</span> <b class="${tone(r.clv_ev)}">${pct(r.clv_ev)}</b>` : r && r.pending ? `<span class="muted">${r.pending} not graded yet</span>` : `<span class="muted">no picks</span>`)
    + (r && r.paper ? ` <span class="chip paper" title="tracked, not bet">paper</span>` : "");

  function notify() {
    const feed = `${D.site_url || ""}feed.xml`;
    return `<section class="notify"><div><div class="eyebrow">Never miss a pick</div><h2>Get alerts</h2></div><div class="ways">
      ${MEMBER && D.discord_link ? `<a class="way" href="/auth/discord"><b>${brand("discord", 22)} Discord</b><span>${ck("ll_d") === "1" ? "Linked: every pick posts in #alerts. Tap to re-link if you lost access." : "Connect your Discord to join the members' #alerts channel: your phone buzzes the moment a pick is posted."}</span></a>`
        : D.discord ? `<a class="way" href="${esc(D.discord)}" target="_blank" rel="noopener"><b>${brand("discord", 22)} Discord</b><span>Free. Every pick posts in #alerts the moment it's made, so your phone buzzes before the line moves.</span></a>` : ""}
      ${D.x ? `<a class="way" href="https://x.com/${esc(D.x)}" target="_blank" rel="noopener"><b>${brand("x", 20)} X</b><span>Follow <span class="mono">@${esc(D.x)}</span> for the pick of the day and every week's results.</span></a>` : ""}
      <a class="way" href="feed.xml"><b>RSS feed</b><span>Add <span class="mono">${esc(feed)}</span> to any feed reader app and switch on alerts for new items.</span></a>
      ${standalone() ? "" : `<a class="way" href="#" id="install"><b>Add to home screen</b><span>iPhone: tap Share, then Add to Home Screen. Android: tap the menu, then Install app. It opens full screen, like an app.</span></a>`}</div></section>`;
  }
  function hero(eyebrow, title, text, extra = "", side = "") {
    const h = `<div class="hero"><div class="eyebrow" style="color:#aeb9cc">${eyebrow}</div><h1>${title}</h1><p>${text}</p></div>`;
    $("hero").innerHTML = side ? `<div class="hero-grid">${h}<div class="hg-side">${side}</div><div class="hg-extra">${extra}</div></div>` : h + extra;
  }
  // every way to narrow the list sits behind one Filter button (its count = filters switched on)
  state.fopen = false;
  const FUNNEL = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>`;
  // the control bar: period, search, and one Filters button; the view, market and filter chips live in its panel
  const propBar = () => MK.length < 3 ? "" : `<div class="pbar" role="group" aria-label="Prop">${[["all", "All props"], ...MK.map((k) => [k, MKT(k).short || MKT(k).label])]
    .map(([k, l]) => { const n = state.pcount ? (k === "all" ? Object.values(state.pcount).reduce((a, b) => a + b, 0) : state.pcount[k] || 0) : null;
      return `<button type="button" data-market="${k}" aria-pressed="${state.market === k}"${n === 0 ? ' class="empty"' : ""}>${esc(l)}${n != null ? `<b>${n}</b>` : ""}</button>`; }).join("")}</div>`;
  const toolbar = (pick, withMarket = true, panel = "") => `<div class="ctl"><div class="toolbar">${pick}${searchBox()}
      <button type="button" class="fbtn" id="fbtn" aria-expanded="${state.fopen}" aria-controls="fpanel">${FUNNEL}<span>Filters</span><b class="fcount" id="fcount" hidden></b></button></div>
    <div class="fpanel" id="fpanel"${state.fopen ? "" : " hidden"}>
      <div class="fp-row"><span class="fp-l">View</span>${viewBar()}</div>
      ${withMarket && MK.length > 1 && MK.length < 3 ? `<div class="fp-row"><span class="fp-l">Market</span>${marketSeg()}</div>` : ""}
      ${withMarket ? `<div class="fp-row"><span class="fp-l">Show</span>${filterChips()}</div>` : ""}
      ${panel ? `<div class="fp-row"><span class="fp-l">Show</span>${panel}</div>` : ""}</div>${withMarket ? propBar() : ""}<div id="phtabs-slot"></div></div>`;
  function filterCount() {
    const b = $("fcount"), panel = $("fpanel");
    if (!b || !panel || !panel.querySelectorAll) return;
    const n = [...panel.querySelectorAll('button[aria-pressed="true"]')].filter((x) => !x.dataset.view && x.dataset.market !== "all" && x.dataset.k !== "all").length;
    b.textContent = n || ""; b.hidden = !n;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#fbtn");
    if (!t) return;
    state.fopen = !state.fopen; t.setAttribute("aria-expanded", String(state.fopen));
    const panel = $("fpanel"); if (panel) panel.hidden = !state.fopen;
  });

  /* the moving strip of open picks (home) */
  function miniTicket(p) {
    const P = MKT(p.prop);
    return `<a class="mt" href="${linkTo(p)}" style="${band(p)}" aria-label="${esc(nm(p))} ${bet(p)}">
      <span class="m-top"><span class="gteams">${gameLabel(p)}</span>${status(p, true)}</span><span class="m-player">${esc(nm(p))}</span>
      <span class="m-pick"><b>${bet(p)}</b> ${odds(p.price)} <small>${esc(abbr(p.book))} &middot; ${esc(P.short || P.label)}</small></span>
      <span class="m-foot">${sharpChip(p.sharp)}${(() => { const v = vsLine(p); return v && !v.stale ? `<span class="m-now ${v.ok === false ? "pass" : "ok"}">now ${odds(v.price)}</span>` : ""; })()}</span></a>`;
  }
  function marquee(list) {
    const cards = list.map(miniTicket).join(""), secs = Math.max(24, list.length * 5);
    return `<div class="marquee" id="marquee" style="--dur:${secs}s" aria-label="Open picks, moving"><div class="mtrack">${cards}<span class="mgap"></span>${cards.replace(/<a class="mt"/g, '<a tabindex="-1" aria-hidden="true" class="mt"')}<span class="mgap"></span></div></div>`;
  }

  /* ------------------------------------------------------------------ featured pick: chosen automatically */
  // the biggest edge (EV at the stamp) among picks not started yet, preferring ones sharp money agrees with, and
  // skipping any whose own book is now past the playable price or has taken the line down
  function featuredPick() {
    const ok = openNow.filter((p) => p.phase === "open" && p.ev != null && !MKT(p.prop).paper && (() => { const v = vsLine(p); return !v || (!v.stale && v.ok !== false); })());
    const agrees = ok.filter((p) => p.sharp === "agrees"), pool = agrees.length ? agrees : ok;
    return pool.length ? pool.reduce((a, b) => (b.ev > a.ev ? b : a)) : null;
  }
  // a small ticket-style card that sits in the header beside the headline; "Full ticket" opens the real one
  function featured() {
    const p = featuredPick();
    if (!p) return "";
    const P = MKT(p.prop);
    const why = `Chosen automatically: the biggest edge on the board (EV ${pct(p.ev).replace("&ndash;", "-")})${p.sharp === "agrees" ? ", and sharp money agrees" : ""}.`;
    return `<aside class="feat-card" style="${band(p)}" aria-label="Featured pick" title="${esc(why)}">
      <div class="fc-h"><span>${p.free ? "Free pick &middot; today" : "Featured &middot; top edge"}</span>${status(p, true)}</div>
      <div class="fc-g">${gameLabel(p)}<span>${when(p.kick_utc, p.kick)}</span></div>
      <div class="fc-player">${esc(nm(p))}</div>
      <div class="fc-pick"><b>${bet(p)}</b> ${odds(p.price)} <small>${esc(p.book)} &middot; ${esc(P.short || P.label)}</small></div>
      <div class="fc-stats"><span>EV <b>${pct(p.ev)}</b></span><span>Win <b>${pct(p.win, false)}</b></span>${p.sharp === "agrees" ? `<span class="fc-sharp">Sharp &#10003;</span>` : ""}</div>
      <div class="fc-f">${betButton(p, true) || "<span>Picked by the numbers, not by hand</span>"}<a href="${linkTo(p).replace(/^.*\//, "")}">Full ticket &rarr;</a></div></aside>`;
  }

  /* ------------------------------------------------------------------ weekly recap: once every pick of a period is graded */
  const periodKeys = () => [...new Set(allPicks.map((p) => `${p.season}-${p.week}`))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const picksOf = (key) => allPicks.filter((p) => `${p.season}-${p.week}` === key);
  function latestRecap() {
    const key = periodKeys().find((k) => picksOf(k).every((p) => p.phase === "final"));
    if (!key) return null;
    const every = picksOf(key), [season, w] = key.split("-").map(Number);
    const ps = every.some((p) => !p.paper) ? every.filter((p) => !p.paper) : every;     // totals: live picks only
    const count = (r) => ps.filter((p) => p.result === r).length;
    const beats = ps.filter((p) => p.beat != null);
    // best hit: the win that paid the most units, then the one that cleared its line by the most (same as the image)
    const paid = (p) => Math.round((p.pl || 0) * 1000), clear = (p) => (p.side === "OVER" ? p.actual - p.line : p.line - p.actual) / Math.sqrt(Math.abs(p.line));
    const better = (a, b) => paid(b) > paid(a) || (paid(b) === paid(a) && clear(b) > clear(a));
    const wins = ps.filter((p) => p.result === "W" && p.actual != null && p.line);
    // each market on its own: record, units, ROI, beat the close, running line (markets are never added together)
    const stats = (g, k) => { const c = (r) => g.filter((p) => p.result === r).length, b = g.filter((p) => p.beat != null);
      return { k, key: `${key}-${k}`, n: g.length, W: c("W"), L: c("L"), P: c("P"),
        units: g.reduce((s, p) => s + (p.pl || 0), 0), sized: g.reduce((s, p) => s + (p.pl_u || 0), 0),
        risked: g.reduce((s, p) => s + (p.pl_u != null ? p.units || 0 : 0), 0),
        beat: b.length ? (100 * b.filter((p) => p.beat).length) / b.length : null,
        graded: [...g].filter((p) => p.pl_u != null).sort((a, b2) => (a.kick_utc || "").localeCompare(b2.kick_utc || "") || (a.serial < b2.serial ? -1 : 1)) }; };
    return { key, season, w, n: ps.length, markets: MK.filter((k) => ps.some((p) => p.prop === k)).map((k) => stats(ps.filter((p) => p.prop === k), k)),
      best: wins.length ? wins.reduce((a, b) => (better(a, b) ? b : a)) : null };
  }
  // the week's running units, pick by pick in kickoff order (each at its ticket size): one line, a soft fade under
  // it, a dashed zero; hover a point for the pick and the running total
  function recapCurve(r) {
    if (r.graded.length < 2) return "";
    let run = 0; const pts = [0, ...r.graded.map((p) => (run += p.pl_u))];
    const W = 600, H = 150, lo0 = Math.min(0, ...pts), hi0 = Math.max(0, ...pts), pad = (hi0 - lo0) * 0.08 || 1;
    const lo = lo0 - pad, hi = hi0 + pad, x = (i) => (i / (pts.length - 1)) * W, y = (v) => ((hi - v) / (hi - lo)) * H;
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const cls = run >= 0 ? "up" : "down", id = `rcg-${r.key}`, step = W / (pts.length - 1);
    const hits = r.graded.map((p, i) => `<rect x="${(x(i + 1) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"><title>${esc(nm(p))} ${bet(p)}: ${p.result} ${num(p.pl_u, 2, true)}u, running ${num(pts[i + 1], 2, true)}u</title></rect>`).join("");
    return `<figure class="rc-curve ${cls}"><figcaption>Running units &middot; ${r.graded.length} picks in kickoff order</figcaption>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Running units over the ${PERIOD.toLowerCase()}: finished ${num(run, 2, true)}u">
        <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></linearGradient></defs>
        <path d="${line}L${W},${y(0).toFixed(1)}L0,${y(0).toFixed(1)}Z" fill="url(#${id})"/>
        <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero" vector-effect="non-scaling-stroke"/>
        <path d="${line}" class="ln" vector-effect="non-scaling-stroke"/><g class="hit">${hits}</g></svg></figure>`;
  }
  // one market's week: the units it made (big), its own line, then three quiet numbers - never added to the others
  function recapMarket(m) {
    const P = MKT(m.k), rec = `${m.W}-${m.L}${m.P ? "-" + m.P : ""}`, dec = m.W + m.L;
    const roi = m.risked ? 100 * m.sized / m.risked : null, cls = m.sized > 0 ? "up" : m.sized < 0 ? "down" : "";
    const beatCls = m.beat == null || m.beat === 50 ? "" : m.beat > 50 ? "up" : "down";
    return `<section class="rcx-mkt ${cls}">
      <header><span class="rcx-name">${esc(P.label)}</span><span class="rcx-rec" title="Record (W-L)">${rec}</span></header>
      <div class="rcx-units"><b class="${cls}">${num(m.sized, 2, true)}<small>u</small></b>${roi != null ? `<span class="${cls}">${pct(roi)} ROI</span>` : ""}</div>
      ${recapCurve(m)}
      <dl class="rcx-stats">
        <div><dt>Win rate</dt><dd>${dec ? Math.round(100 * m.W / dec) + "%" : "&ndash;"}</dd></div>
        <div><dt>Beat close</dt><dd class="${beatCls}">${m.beat == null ? "&ndash;" : m.beat.toFixed(0) + "%"}</dd></div>
        <div><dt>1u each</dt><dd class="${tone(m.units)}">${num(m.units, 2, true)}u</dd></div>
      </dl></section>`;
  }
  function recapCard(r) {
    const text = `Line Ledger, ${PERIOD} ${r.w}: ` + r.markets.map((m) => `${MKT(m.k).short || MKT(m.k).label} ${m.W}-${m.L}${m.P ? "-" + m.P : ""}, ${num(m.sized, 2, true)}u`).join("; ");
    const mk = [...r.markets].sort((a, b) => b.n - a.n);                  // the busiest market first
    const b = r.best;
    return `<article class="rcx" id="recap-${r.key}">
      <header class="rcx-h">
        <div><span class="rcx-eyebrow">${PERIOD} in review &middot; ${r.season}</span><h2>${PERIOD} ${r.w}</h2>
          <span class="rcx-sub">All ${r.n} picks graded &middot; each market on its own</span></div>
        <div class="rcx-act"><a class="rcx-btn" href="recap/${r.key}.png" download="line-ledger-${r.key}.png">Image</a>
          <button type="button" class="rcx-btn rshare" data-key="${r.key}" data-text="${esc(text)}">Share</button></div>
      </header>
      <div class="rcx-grid${mk.length === 1 ? " one" : ""}">${mk.map(recapMarket).join("")}</div>
      <footer class="rcx-f">
        ${b ? `<a class="rcx-best" href="${linkTo(b).replace(/^.*\//, "")}"><span class="rcx-star" aria-hidden="true">&#9733;</span><span><em>Best hit</em> <b>${esc(nm(b))}</b> ${bet(b)} <span class="muted">(${b.price > 0 ? "+" : ""}${b.price})</span> &middot; had <b class="up">${b.actual}</b></span></a>` : "<span></span>"}
        <a class="rcx-all" href="./?season=${r.season}&week=${r.w}">See every pick &rarr;</a>
      </footer></article>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button.rshare");
    if (!b) return;
    // the recap's own link (its preview is the recap image); on phones that can, the image itself is shared too
    const url = new URL(`recap/${b.dataset.key}.html`, location.href).href, text = b.dataset.text;
    try {
      if (navigator.canShare) {
        const blob = await (await fetch(`recap/${b.dataset.key}.png`)).blob();
        const file = new File([blob], `line-ledger-${b.dataset.key}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${text} ${url}` }); return; }
      }
      if (navigator.share) await navigator.share({ title: text, text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Share"), 1600); }
    } catch (err) {}
  });
  // the home page shows the recap until the next period's first game starts
  function homeRecap() {
    const r = latestRecap();
    if (!r) return "";
    const later = allPicks.filter((p) => p.season > r.season || (p.season === r.season && p.week > r.w));
    return later.some((p) => p.phase !== "open") ? "" : `<section>${recapCard(r)}</section>`;
  }

  /* ------------------------------------------------------------------ pages */
  const PHASES = [["open", "Open", "Not started &middot; the line can still move"], ["live", "Live", "In progress, or finished and waiting for official stats"], ["final", "Final", "Graded"]];
  const jumpBar = (list, phases = PHASES) => `<nav class="jump" aria-label="Jump to">${phases.map(([ph, title]) => {
    const n = list.filter((p) => p.phase === ph).length;
    return `<a href="#ph-${ph}" class="jp-${ph}"${n ? "" : ' aria-disabled="true"'}>${title}<span>${n}</span></a>`; }).join("")}</nav>`;
  function phaseSections(list, season, week) {
    const parts = {};
    PHASES.forEach(([ph, title, sub]) => {
      const ps = list.filter((p) => p.phase === ph).sort(byKick);
      const sl = ph === "open" ? sealedOpen().filter((p) => p.season === season && p.week === week && (state.market === "all" || p.prop === state.market)) : [];
      const recKs = MK.filter((k) => (state.market === "all" || k === state.market) && periodRec(MKT(k), season, week));
      const rec = ph === "final" && recKs.length ? `<div class="phase-rec">${recKs.map((k) => `<span><em>${esc(MKT(k).short || MKT(k).label)}</em> ${recLine(periodRec(MKT(k), season, week))}</span>`).join("")}</div>` : "";
      parts[ph] = { n: ps.length + sl.length, title, sub,
        body: `${rec}${ps.length ? picksBlock(ps) : ""}${sl.length ? sealedBlock(sl) : ""}${ps.length || sl.length ? "" : `<div class="empty">Nothing ${title.toLowerCase()} ${ph === "final" ? "yet this " + PERIOD.toLowerCase() : "right now"}.</div>`}` };
    });
    // which tab: the one you picked; else an old #ph- link; else the first with picks in it
    const fromHash = (location.hash.match(/^#ph-(open|live|final)$/) || [])[1];
    let cur = state.phaseUser && parts[state.phase] ? state.phase : fromHash || PHASES.map(([ph]) => ph).find((ph) => parts[ph].n) || "open";
    state.phase = cur;
    const P = parts[cur];
    const none = state.market !== "all" && state.pcount && !state.pcount[state.market];    // this prop: no picks this week
    if (none) P.body = `<div class="empty nopicks"><b>No ${esc(MKT(state.market).label.toLowerCase())} picks this ${PERIOD.toLowerCase()} yet.</b>
      The model prices every ${esc(MKT(state.market).label.toLowerCase())} line the books post; none has cleared the bar so far. A pick shows up here the moment one does.</div>`;
    const tabs = `<div class="phtabs" role="tablist" aria-label="Open, live or final">${PHASES.map(([ph, title]) =>
        `<button type="button" role="tab" class="pht pht-${ph}" data-ph="${ph}" aria-selected="${ph === cur}"><span>${title}</span><b class="count">${parts[ph].n}</b></button>`).join("")}</div>`;
    const slot = typeof document !== "undefined" && document.getElementById && document.getElementById("phtabs-slot");
    if (slot) slot.innerHTML = tabs;                                   // in the sticky control bar, under the search
    return `${slot ? "" : tabs}<div class="phase ph-${cur}" id="ph-${cur}" role="tabpanel"><p class="ph-sub">${P.sub}</p>${P.body}</div>`;
  }

  // the seals of this week's open picks, by game: what anyone can see before kickoff
  function sealedBlock(list) {
    const games = {};
    list.slice().sort(byKick).forEach((p) => { (games[`${p.kick_utc}|${p.game}`] ||= []).push(p); });
    const teams = (g) => { const [a, b] = String(g || "").split(" @ "); return b ? `${tm(a)}<i class="at">@</i>${tm(b)}` : esc(g); };
    return `<div class="sealed"><div class="sl-h"><span class="sl-lock">${LOCK}</span><div><b>${list.length} sealed pick${list.length === 1 ? "" : "s"}</b>
        <span>Members see these now. Each one is revealed here at kickoff, and its seal proves it wasn't changed.</span></div>
        ${D.join_url ? `<a class="sl-join" href="${esc(D.join_url)}">Unlock picks</a>` : ""}</div>
      ${Object.values(games).map((g) => `<div class="sl-g"><div class="sl-gh"><span class="sl-teams">${teams(g[0].game)}</span><span class="muted">${when(g[0].kick_utc, g[0].kick)}</span><em>${g.length} sealed</em></div>
        <div class="sl-list">${g.map((p) => `<span class="sl-t" title="Seal ${esc(p.seal || "")}"><b>No. ${esc(p.serial)}</b><small>${esc(MKT(p.prop) ? (MKT(p.prop).short || MKT(p.prop).label) : "")}</small><code>${esc((p.seal || "").slice(0, 8))}&hellip;</code></span>`).join("")}</div></div>`).join("")}</div>`;
  }
  // a revealed pick's seal, checked in the browser: the same text the site sealed (site.seal_text), SHA-256
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button.sealchk");
    if (!b) return;
    const p = byId[b.dataset.serial];
    if (!p || !(window.crypto && crypto.subtle)) { b.textContent = "Can't check in this browser"; return; }
    const text = `${p.serial}|${p.pid}|${p.prop}|${p.side}|${p.line}|${p.price > 0 ? "+" : ""}${p.price}|${p.book}|${p.salt}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hex = [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
    b.outerHTML = hex === p.seal ? `<span class="sealok">&#10003; Matches: unchanged since it was sealed</span>` : `<span class="sealbad">&#10007; Doesn't match</span>`;
  });

  function home() {
    const wk = allPicks.filter((p) => p.season === D.season && p.week === D.week), sl = sealedOpen().filter((p) => p.season === D.season && p.week === D.week);
    const nOf = (ph) => wk.filter((p) => p.phase === ph).length;
    const chips = MK.filter((k) => ((MKT(k).record || [])[0] || {}).n).map((k) => { const P = MKT(k), r = (P.record || [])[0] || {};
      return `<a class="rchip" href="${resultsUrl(k)}"><em>${esc(P.short || P.label)}</em><b>${wl(r)}</b><b class="${tone(r.sized)}">${r.sized != null ? num(r.sized, 1, true) + "u" : ""}</b></a>`; }).join("");
    if (state.week == null || state.week === "all") state.week = D.week;
    const past = state.season !== D.season || state.week !== D.week;          // opened from Results: an earlier week
    if (past) {
      const pw = allPicks.filter((p) => p.season === state.season && p.week === state.week);
      const done = pw.length && pw.every((p) => p.phase === "final");
      hero(`<a class="back" href="${href(F.home)}">&larr; Back to this ${PERIOD.toLowerCase()}</a>`, `${PERIOD} <em>${state.week}</em> &middot; ${state.season}`,
        `${done ? "Final" : "In progress"} &middot; ${pw.length} pick${pw.length === 1 ? "" : "s"} &middot; <a href="${F.results}">every ${PERIOD.toLowerCase()}</a>`,
        `<div class="rchips">${MK.map((k) => { const r = periodRec(MKT(k), state.season, state.week); return r && r.n ? `<span class="rchip"><em>${esc(MKT(k).short || MKT(k).label)}</em><b>${wl(r)}</b><b class="${tone(r.sized)}">${num(r.sized || 0, 1, true)}u</b></span>` : ""; }).join("")}</div>`);
    } else
    hero(`${esc(SPORT.name)} player props &middot; ${D.season}`, `${PERIOD} <em>${D.week}</em>`,
      `${nOf("open") + sl.length} open${sl.length ? ` (${sl.length} sealed)` : ""} &middot; ${nOf("live")} live &middot; ${nOf("final")} graded`,
      `<div class="rchips">${chips}<a class="rchip more" href="${F.results}">Full record &rarr;</a></div>`, featured());
    // one story: the record (hero), last week's recap, then this week's picks (the moving strip was a third copy of
    // the open picks; marquee() stays for any page that wants it)
    $("app").innerHTML = `

      <section><h2 id="wk-title" class="sr"></h2>
        <div id="tb"></div><div id="phases" class="phases"></div></section>`;
    redraw = (full) => {
      // how many picks each prop has this week (open, sealed, live, graded) - the counts on the prop bar
      const wk = allPicks.filter((p) => p.season === state.season && p.week === state.week)
        .concat(sealedOpen().filter((p) => p.season === state.season && p.week === state.week));
      state.pcount = Object.fromEntries(MK.map((k) => [k, wk.filter((p) => p.prop === k).length]));
      if (full !== false || !$("tb").firstChild) $("tb").innerHTML = toolbar("");     // no week picker: past weeks open from Results
      $("wk-title").textContent = `${PERIOD} ${state.week ?? "-"}, ${state.season}`;
      const list = allPicks.filter((p) => p.season === state.season && p.week === state.week && matches(p));
      $("phases").innerHTML = phaseSections(list, state.season, state.week);
      afterDraw();
    };
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-ph]"); if (!b) return;
      state.phase = b.dataset.ph; state.phaseUser = true; redraw(false); });
    redraw(true);
  }

  // the Open page became part of This week: old links land on its Open section
  const openPage = () => location.replace(`${href(F.home)}${location.hash || "#ph-open"}`);

  /* Results: the whole public record in one place.  One prop switch at the top ("All props" first); for a prop: its
     record, units over time, closing line value, a breakdown, and every week - each week opens to its picks.  The
     old per-prop pages and the closing-line page send their links here. */
  const resultsUrl = (k, extra = "") => `${F.results}?prop=${encodeURIComponent(k)}${extra}`;
  const pickUrl = (p) => resultsUrl(p.prop, `&season=${p.season}&week=${p.week}#${p.serial}`);
  function resultsPage() {
    const linked = byId[decodeURIComponent(location.hash.slice(1))];
    const want = qs.get("prop") || (linked && linked.prop) || store.get("ll-rk");
    state.market = MK.includes(want) ? want : "all";
    const withRec = MK.filter((k) => (MKT(k).picks || []).length);
    hero("Results", `Every pick, <em>graded</em>`, `Stamped before the start, graded at the stamped price, compared with the closing line. Nothing edited, nothing removed.`);
    const sw = () => `<div class="pbar rbar" role="group" aria-label="Prop">${[["all", "All props"], ...withRec.map((k) => [k, MKT(k).short || MKT(k).label])]
      .map(([k, l]) => `<button type="button" data-market="${k}" aria-pressed="${state.market === k}">${esc(l)}</button>`).join("")}</div>`;
    $("app").innerHTML = `<div class="ctl rctl">${sw()}</div><div id="rbody"></div>`;
    const short = (k) => esc(MKT(k).short || MKT(k).label);
    const keysOf = (ks) => [...new Set(ks.flatMap((k) => Object.keys(MKT(k).weeks)))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const cell = (r) => !r || !(r.W + r.L + (r.P || 0)) ? `<span class="muted">${r && (r.n || r.pending) ? "in progress" : "&ndash;"}</span>`
      : `<b>${wl(r)}</b><b class="${tone(r.sized)}">${num(r.sized || 0, 1, true)}u</b>`;
    const SHOW = 4;
    const more = (rows, render, label) => rows.length ? `<div class="wkrows">${rows.slice(0, SHOW).map(render).join("")}</div>
      ${rows.length > SHOW ? `<details class="wk-more"><summary>Show all ${rows.length} ${label}</summary><div class="wkrows">${rows.slice(SHOW).map(render).join("")}</div></details>` : ""}`
      : `<div class="empty">No graded ${PERIOD.toLowerCase()}s yet.</div>`;

    function overview() {
      const prw = {};
      (PR.model || []).filter((x) => x.result).forEach((x) => { (prw[`${x.season}-${x.week}`] ||= []).push(x); });
      const byProp = withRec.map((k) => { const P = MKT(k), r = (P.record || [])[0] || {};
        return `<button type="button" class="rp-row" data-market="${k}"><span class="rp-n">${esc(P.label)}${P.paper ? ` <span class="chip paper">paper</span>` : ""}</span>
          <span class="rp-c"><b>${wl(r)}</b><small>record</small></span><span class="rp-c"><b class="${tone(r.sized)}">${r.sized != null ? num(r.sized, 1, true) + "u" : "&ndash;"}</b><small>units</small></span>
          <span class="rp-c opt"><b class="${tone(r.clv_ev)}">${pct(r.clv_ev)}</b><small>vs close</small></span><span class="wr-go" aria-hidden="true">&rsaquo;</span></button>`; }).join("");
      const row = (key) => { const [season, w] = key.split("-"), px = prw[key] || [];
        const ks = withRec.filter((k) => { const r = MKT(k).weeks[key]; return r && (r.n || r.pending); });
        const pr = px.length ? `<span class="wr-m"><em>Parlays</em><b>${px.filter((x) => x.result === "W").length}-${px.filter((x) => x.result === "L").length}</b></span>` : "";
        return `<div class="wkrow"><span class="wr-w"><b>${PERIOD} ${w}</b><small>${season}</small></span>
          <span class="wr-ms">${ks.map((k) => `<button type="button" class="wr-m" data-market="${k}"><em>${short(k)}</em>${cell(MKT(k).weeks[key])}</button>`).join("")}${pr}</span></div>`; };
      const r = latestRecap();
      return `${r ? `<section>${recapCard(r)}</section>` : ""}
        <section><div class="head"><div><h2>By prop</h2></div></div><div class="rprops">${byProp || `<div class="empty">No picks yet.</div>`}</div></section>
        <section><div class="head"><div><h2>Every ${PERIOD.toLowerCase()}</h2></div></div>${more(keysOf(withRec), row, PERIOD.toLowerCase() + "s")}</section>`;
    }

    function one(k) {
      const P = MKT(k);
      const g = recordPicks(P).filter((p) => p.clv_ev != null).sort((a, b) => (a.serial < b.serial ? -1 : 1));
      let s = 0; const run = g.map((p, i) => (s += p.clv_ev) / (i + 1));
      const clvChart = lineChart(run, `Value vs close <span class="muted">running average, ${g.length} picks</span>`, run[run.length - 1], (v) => pct(v));
      const best = g.slice().sort((a, b) => b.clv_ev - a.clv_ev);
      const mini = (p) => `<a class="mini" href="#${p.serial}" data-goto="${p.serial}"><span><b>${esc(nm(p))}</b> ${bet(p)} <span class="muted">${odds(p.price)} &middot; ${PERIOD.toLowerCase()} ${p.week}</span></span><span class="mono ${tone(p.clv_ev)}">${pct(p.clv_ev)}</span></a>`;
      const wk = (key) => { const [season, w] = key.split("-").map(Number);
        const ps = P.picks.filter((p) => p.season === season && p.week === w).sort(byKick);
        return `<details class="rweek" data-key="${key}"><summary class="wkrow"><span class="wr-w"><b>${PERIOD} ${w}</b><small>${season}</small></span>
          <span class="wr-ms"><span class="wr-m"><em>${ps.length} pick${ps.length === 1 ? "" : "s"}</em>${cell(P.weeks[key])}</span>${P.weeks[key] && P.weeks[key].clv_ev != null ? `<span class="wr-m opt"><em>vs close</em><b class="${tone(P.weeks[key].clv_ev)}">${pct(P.weeks[key].clv_ev)}</b></span>` : ""}</span>
          <span class="wr-go" aria-hidden="true">&rsaquo;</span></summary><div class="rw-picks" data-fill="${key}"></div></details>`; };
      const keys = keysOf([k]);
      return `<section class="rhead"><div class="head"><div><div class="eyebrow">${P.paper ? "Paper picks &middot; tracked, not bet" : `The record &middot; since ${esc(P.since || D.since)}`}</div><h2>${esc(P.label)}</h2></div></div>
          ${tote(P.record, P, true)}${unitsChart(P)}</section>
        <section id="clv"><div class="head"><div><h2>Closing line value</h2></div></div>
          <p class="lede">Did the pick get a better number than the market's final price? Over time this is the best sign an edge is real. <a href="method.html">What this means</a></p>
          ${clvChart || `<div class="empty">Shows up once enough picks have closed.</div>`}</section>
        <section><div class="head"><div><h2>Every ${PERIOD.toLowerCase()}</h2></div></div><p class="lede">Tap a ${PERIOD.toLowerCase()} to see its picks.</p>
          ${keys.length ? `<div class="wkrows">${keys.map(wk).join("")}</div>` : `<div class="empty">No picks yet.</div>`}</section>
        <section><details class="rmore"><summary>Breakdown <span class="muted">splits, Sharp label, best and worst closes</span></summary>
          ${recordTable(P.record)}
          ${P.record.some((r) => r.label === "Pre-launch") ? `<p class="note"><span class="chip pre">pre-launch</span> picks were made by the same model and time-stamped in our private ledger, but not posted publicly before the start. From ${esc(D.launch)} on, every pick is posted before the start.</p>` : ""}
          ${best.length >= 6 ? `<div class="minis"><div><h3>Best closes</h3>${best.slice(0, 5).map(mini).join("")}</div><div><h3>Worst closes</h3>${best.slice(-5).reverse().map(mini).join("")}</div></div>` : ""}
</details></section>`;
    }

    const fill = (det) => { const slot = det.querySelector(".rw-picks");
      if (slot.dataset.done) return; const [season, w] = det.dataset.key.split("-").map(Number);
      const ps = MKT(state.market).picks.filter((p) => p.season === season && p.week === w).sort(byKick);
      slot.innerHTML = picksBlock(ps); slot.dataset.done = "1"; afterDraw(); };
    const open = (serial) => { const p = byId[serial]; if (!p) return;
      const det = document.querySelector(`.rweek[data-key="${p.season}-${p.week}"]`); if (!det) return;
      det.open = true; fill(det); revealHash(); };
    redraw = () => {
      store.set("ll-rk", state.market);
      document.querySelectorAll(".rbar button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.market === state.market)));
      const u = new URL(location.href); u.searchParams.delete("season"); u.searchParams.delete("week");
      if (state.market === "all") u.searchParams.delete("prop"); else u.searchParams.set("prop", state.market);
      if (linked && linked.prop !== state.market) u.hash = "";
      history.replaceState(null, "", u);
      $("rbody").innerHTML = state.market === "all" ? overview() : one(state.market);
      afterDraw(); countUp();
      if (linked && linked.prop === state.market) open(linked.serial);
      else if (location.hash === "#clv") { const c = $("clv"); if (c) c.scrollIntoView(); }
    };
    document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList && d.classList.contains("rweek") && d.open) fill(d); }, true);
    document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto]"); if (!a) return;
      e.preventDefault(); history.replaceState(null, "", `#${a.dataset.goto}`); open(a.dataset.goto); });
    redraw();
  }
  // the old pages: one per prop, closing line value - their links (shared tickets, bookmarks) land on Results
  function marketPage(key) {
    const q = new URLSearchParams(location.search), extra = ["season", "week"].filter((x) => q.get(x)).map((x) => `&${x}=${q.get(x)}`).join("");
    location.replace(resultsUrl(key, extra + location.hash));
  }
  function clvPage() {             // the scoreboard: every prop's closing line value on one page
    hero("The scoreboard", "Closing line <em>value</em>", "Did we get a better number than the market's final price? <a href=\"method.html\">What this means</a>");
    if (!MK.length) { $("app").innerHTML = `<div class="empty">No ${esc(SPORT.name)} picks have closed yet. Closing line value shows up here once they do.</div>`; return; }
    const cards = MK.map((k) => { const P = MKT(k), r = P.record[0] || {};
      const cells = [["Value vs close", pct(r.clv_ev), tone(r.clv_ev), `what each pick was worth against the closing price, vig removed (n=${r.n_clv || 0}${(r.n_clv || 0) < 50 ? ", too early to judge" : ""})`],
        ["Beat the close", r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%", beatTone(r.beat), "better line, or same line at a better price"],
        ["Avg line move", r.clv == null ? "&ndash;" : `${sgn(r.clv)}${r.clv.toFixed(1)} ${P.unit}`, tone(r.clv), "from the pick to the close"],
        ["Moved our way", r.toward == null ? "&ndash;" : r.toward.toFixed(0) + "%", "", `of the ${r.n_moved || 0} lines that moved`]];
      return `<article class="clvcard"><div class="sb-h2"><span>${esc(P.label)}</span>${P.paper ? `<span class="chip paper">paper</span>` : `<span class="chip pre">the record</span>`}</div>
        <div class="clvgrid">${cells.map(([h, v, c, s]) => `<div><small>${h}</small><b class="${c}">${v}</b><span>${s}</span></div>`).join("")}</div></article>`; }).join("");
    const charts = MK.map((k) => { const P = MKT(k), g = recordPicks(P).filter((p) => p.clv_ev != null).sort((a, b) => (a.serial < b.serial ? -1 : 1));
      let s = 0; const run = g.map((p, i) => (s += p.clv_ev) / (i + 1));
      return lineChart(run, `${esc(P.label)} <span class="muted">running value vs close, ${g.length} picks</span>`, run[run.length - 1], (v) => pct(v)); }).join("");
    const short = (k) => esc(MKT(k).short || MKT(k).label);
    const byWeek = MK.flatMap((k) => Object.entries(MKT(k).weeks).map(([key, r]) => ({ k, key, r }))).sort((a, b) => b.key.localeCompare(a.key, undefined, { numeric: true }) || MK.indexOf(a.k) - MK.indexOf(b.k));
    const bySharp = MK.flatMap((k) => MKT(k).record.filter((r) => /^Sharp|^No sharp/.test(r.label)).map((r) => ({ k, r })));
    const row = (label, r, P) => `<tr><td>${label}</td><td class="num opt">${r.n_clv || 0}</td><td class="num key ${tone(r.clv_ev)}">${pct(r.clv_ev)}</td><td class="num ${beatTone(r.beat)}">${r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%"}</td><td class="num opt ${tone(r.clv)}">${r.clv == null ? "&ndash;" : sgn(r.clv) + r.clv.toFixed(1) + " " + P.unit}</td></tr>`;
    const table = (rows) => `<div class="tablebox"><table><thead><tr><th>Picks</th><th class="num opt">Closes</th><th class="num key">Value vs close</th><th class="num">Beat close</th><th class="num opt">Avg move</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    const graded = allPicks.filter((p) => p.clv_ev != null).sort((a, b) => b.clv_ev - a.clv_ev);
    const mini = (p) => `<a class="mini" href="${pickUrl(p)}"><span><b>${esc(nm(p))}</b> ${p.side} ${p.line} <span class="muted">${odds(p.price)} &middot; ${short(p.prop)} &middot; ${PERIOD.toLowerCase()} ${p.week}</span></span><span class="mono ${tone(p.clv_ev)}">${pct(p.clv_ev)}</span></a>`;
    $("app").innerHTML = `<section><div class="clvcards">${cards}</div></section>
      ${charts ? `<section><div><div class="eyebrow">Is the edge holding?</div><h2>Over time</h2></div><p class="lede">The running average of value vs close, pick by pick. Early on it swings; what matters is where it settles.</p><div class="charts">${charts}</div></section>` : ""}
      <section><div><div class="eyebrow">${PERIOD} by ${PERIOD.toLowerCase()}</div><h2>By ${PERIOD.toLowerCase()}</h2></div>${table(byWeek.map(({ k, key, r }) => row(`${PERIOD} ${key.split("-")[1]} <span class="muted">${key.split("-")[0]} &middot; ${short(k)}</span>`, r, MKT(k))).join(""))}</section>
      ${bySharp.length ? `<section><div><div class="eyebrow">Model + sharp money</div><h2>By Sharp label</h2></div><p class="lede">Did the picks the sharp money finished on do better at the close?</p>${table(bySharp.map(({ k, r }) => row(`${esc(r.label)} <span class="muted">${short(k)}</span>`, r, MKT(k))).join(""))}</section>` : ""}
      ${graded.length ? `<section><div><div class="eyebrow">Tap one to see its ticket</div><h2>Best and worst closes</h2></div><div class="minis"><div><h3>Best</h3>${graded.slice(0, 5).map(mini).join("")}</div><div><h3>Worst</h3>${graded.slice(-5).reverse().map(mini).join("")}</div></div></section>` : ""}`;
  }


  function playerPage() {
    const id = new URLSearchParams(location.search).get("id");
    const ps = allPicks.filter((p) => p.pid === id).sort((a, b) => (b.kick_utc || "").localeCompare(a.kick_utc || ""));
    if (!ps.length) {
      hero("Player", "Not found", "No picks on this player yet.");
      $("app").innerHTML = `<div class="empty">Nothing here. <a href="${href(F.home)}">Back to this ${PERIOD.toLowerCase()}</a></div>`;
      return;
    }
    const p0 = ps[0], graded = ps.filter((p) => p.result && p.result !== "VOID"), clvs = ps.filter((p) => p.clv_ev != null);
    const count = (r) => graded.filter((p) => p.result === r).length;
    const units = graded.reduce((s, p) => s + (p.pl_u || 0), 0);           // at each ticket's size, like the record
    const clv = clvs.length ? clvs.reduce((s, p) => s + p.clv_ev, 0) / clvs.length : null;
    const markets = [...new Set(ps.map((p) => MKT(p.prop).short || MKT(p.prop).label))].join(" &middot; ");
    const cells = [["Record", graded.length ? `${count("W")}-${count("L")}${count("P") ? "-" + count("P") : ""}` : "&ndash;", ""],
      ["Units", graded.length ? `${num(units, 2, true)}u` : "&ndash;", tone(units)], [`Value vs close${earlyNote(clvs.length)}`, pct(clv), tone(clv)],
      ["Picks", String(ps.length), ""]];
    hero(`${esc(p0.team)} &middot; ${markets}`, esc(nm(p0)),
      `Every pick the model made on ${esc(nm(p0))}, newest first, graded at the size on its ticket and the stamped price.${ps.some((p) => p.paper) ? " Paper picks (tracked, not bet) are marked." : ""}`,
      `<div class="rc-grid hero-stats">${cells.map(([h, v, c]) => `<div><small>${h}</small><b class="${c}">${v}</b></div>`).join("")}</div>`);
    $("app").innerHTML = `<section><div class="toolbar"><span class="tb-r">${viewBar()}</span></div><div id="picks" class="weekgroups"></div></section>`;
    redraw = () => {
      $("picks").innerHTML = [...new Set(ps.map((p) => `${p.season}-${p.week}`))].map((k) => {
        const [s, w] = k.split("-"), g = ps.filter((p) => `${p.season}-${p.week}` === k);
        return `<div class="weekgroup"><div class="weekhead"><h3>${PERIOD} ${w} <span class="muted">${s}</span></h3></div>${picksBlock(g, false)}</div>`; }).join("");
      afterDraw();
    };
    redraw(); revealHash();
  }

  function soonPage() {
    hero(`${esc(SPORT.name)} &middot; coming soon`, `${esc(SPORT.name)} <em>props</em>`,
      `The ${esc(SPORT.name)} model is in the works. When it's ready, its picks get the same treatment as every other sport here: stamped when made, posted before ${esc(SPORT.event || "the start")}, graded against the closing line, and never edited.`);
    $("app").innerHTML = `
      <section><div class="head"><div><h2>Today's board</h2></div></div>
        <div class="phases">${phaseSections([], null, null)}</div></section>
      <section><div><div class="eyebrow">What to expect</div><h2>Same ledger, new sport</h2></div><div class="steps">
        <div><h3>One slate a ${PERIOD.toLowerCase()}</h3><p>Picks are grouped by ${PERIOD.toLowerCase()}, with the same Open, Live and Final sections, views and search.</p></div>
        <div><h3>Its own record</h3><p>Each market gets its own page and record, graded at the stamped price and size, kept apart from the other sports.</p></div>
        <div><h3>Same scoreboard</h3><p>Closing line value, the Sharp label and the weekly recap all work the same way.</p></div></div></section>`;
  }

  function method() {
    hero("About", "About &amp; <em>how it works</em>", "What Line Ledger is, how every pick is made, sealed and graded, and what every number means.");
    $("app").innerHTML = `
      <section><div><div class="eyebrow">What this is</div><h2>Line Ledger</h2></div>
        <p class="lede">A model that prices NFL player props (mostly receptions) at DraftKings and FanDuel. When a line looks wrong by enough, it's a pick. Every pick is stamped the moment it's made, sealed before kickoff, then revealed and graded against the closing line in public. Nothing is ever edited or removed, wins or losses. Members get every pick the moment it's made; everyone gets a free pick each game day and the full record.</p></section>
      <section><div class="steps">
        <div><h3>Stamp</h3><p>The model prices every player the books post. When it finds value, the pick, line and price are stamped and frozen, with a serial number. Later runs never change them, and nothing is ever removed.</p></div>
        <div><h3>Post</h3><p>Picks go up before the start. Every update to this site is a public commit, so anyone can check when a pick was posted in the site's history.</p></div>
        <div><h3>Grade</h3><p>After the game the result comes from official stats, and the pick's line and price are compared with the closing market, win or lose.</p></div></div></section>
      <section><div><div class="eyebrow">Reading a ticket</div><h2>The views</h2></div><dl class="defs">
        <dt>Tickets</dt><dd>The full ticket: the line and price bars (pick on the left, close or now on the right), model numbers, and the details drawer.</dd>
        <dt>Compact</dt><dd>One slim stub per pick: status, CLV and the sharp lean at a glance. Tap it to open the full ticket.</dd>
        <dt>List</dt><dd>A dense table. Tap a row to open its ticket.</dd>
        <dt>Open / Live / Final</dt><dd>Open: not started yet. Live: in progress, or finished and waiting for official stats ("Final &middot; grading"). Final: graded.</dd></dl></section>
      <section><div><div class="eyebrow">The scoreboard</div><h2>Closing line value</h2></div><dl class="defs">
        <dt>Value vs close</dt><dd>What the pick was worth against the closing market, with the bookmaker's cut removed. A pick at exactly the closing line at -110 scores about -4.5%; above 0% means beating the close by more than the cut. "n" is how many picks it's based on: under 50 is too early to judge.</dd>
        <dt>Beat the close</dt><dd>The pick got a better line than the close, or the same line at a better price.</dd>
        <dt>Line and price bars</dt><dd>How far the line, and the price at the same line, moved from the pick to the close (or to now). Green means toward the pick: the market came to us.</dd>
        <dt>Playable to</dt><dd>The worst price at the stamped line where the pick still clears our value bar (expected value of at least ${D.min_ev ?? 2}%).</dd>
        <dt>Units</dt><dd>Every ticket shows the model's size for that pick, in units: a quarter of the Kelly stake at the stamped price, at most 2u, so a bigger edge gets a bigger size. The rule is the same every week and the size never changes after the pick is posted. The record grades each pick at that size (Units, ROI on the units risked), and also flat at 1 unit per pick (1u each), so you can judge the picks alone. What a unit is worth is up to you: the model posts dozens of picks a week, so most people use a small slice of their bankroll per unit.</dd></dl></section>
      <section><div><div class="eyebrow">Model + sharp money</div><h2>The Sharp label</h2></div>
        <p class="lede">Besides the model, every pick is checked against where the sharpest money in the market leans on the same player, at our line. The label stays current until the start, then locks at the close (marked "close").</p>
        <dl class="defs"><dt>Sharp agrees</dt><dd>Sharp money prices our side as the likelier winner.</dd><dt>Sharp neutral</dt><dd>A coin flip at our line.</dd><dt>Sharp against</dt><dd>Sharp money prices the other side as the likelier winner.</dd><dt>No sharp line</dt><dd>No sharp price for that player.</dd></dl></section>
      <section><div><div class="eyebrow">A tool, not a lock</div><h2>Parlays</h2></div>
        <p class="lede">The <a href="${F.parlays || "parlays.html"}">Parlays</a> page has the model's own parlay for each sportsbook. A parlay pays only if every leg wins, so its chance is much lower than any single pick's.</p>
        <dl class="defs">
        <dt>The model's parlay</dt><dd>One per book each ${PERIOD.toLowerCase()}: three legs from different Sunday games, taken from the open picks with the highest model chance, at that book's own lines and prices. Each update rebuilds it from the latest prices until the first Sunday kickoff; then it locks and never changes.</dd>
        <dt>Its record</dt><dd>Only the locked parlay counts, at 1 unit each, in its own record on the Parlays page. It is never added to any market's record.</dd>
        <dt>Pays</dt><dd>The legs' prices multiplied together. A book's own parlay price can differ a little.</dd>
        <dt>Book's chance</dt><dd>The chance the parlay's price implies, bookmaker's cut included.</dd>
        <dt>Model's chance</dt><dd>The legs' model chances multiplied. That holds for legs from different games, which is why each leg comes from a different game.</dd></dl></section>
      <section><div><div class="eyebrow">Honesty notes</div><h2>What's on the record</h2></div><dl class="defs">
        ${MK.map((k) => `<dt>${esc(MKT(k).label)}</dt><dd>${esc(MKT(k).blurb)}</dd>`).join("")}
        <dt>Pre-launch</dt><dd>Picks made before this site went public (${esc(D.launch)}) are shown and counted, tagged pre-launch, because their time stamps come from our private ledger.</dd>
        <dt>New address (Nov 3, 2026)</dt><dd>Until Nov 3, 2026 this site was published from an earlier GitHub repository. Its full history was carried over here with every original commit time, so the "verify" links on picks posted before then point to that carried-over history. The original repository is kept, privately, as the record of when those picks first went public. Picks posted from Nov 3 on are verified here directly.</dd></dl></section>
      <section class="lp-faq" id="faq"><div><div class="eyebrow">FAQ</div><h2>Questions</h2></div>${faqHtml()}</section>`;
  }

  /* ------------------------------------------------------------------ parlays: the model's own, one per book
     Three legs from different Sunday games at one book's lines and prices (a parlay can't be split across books).
     They rebuild with every update until the first Sunday kickoff, then lock; only the locked one is graded. */
  const PR = D.parlays || { model: [], record: {}, legs: 3 };
  const PBOOKS = ["DraftKings", "FanDuel"];
  const short = (k) => esc(MKT(k) ? MKT(k).short || MKT(k).label : k);
  const stat = (k, v, cls = "", sub = "") => `<div><dt>${k}</dt><dd class="${cls}">${v}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  const RES = { W: "&#10003;", L: "&#10007;", P: "P", VOID: "void" };
  const BOOKDOT = { DraftKings: "dk", FanDuel: "fd" };
  // one model parlay as a slip: the book, what it pays, the legs joined like a ticket, and both chances as meters
  function modelCard(x, big, on) {
    const bk = BOOKDOT[x.book] || "";
    const status = x.result ? `<span class="pc-res ${x.result}">${x.result === "W" ? `Won ${num(x.units, 2, true)}u` : x.result === "L" ? "Lost &minus;1u" : "Push"}</span>`
      : `<span class="pc-lock${x.locked ? " on" : ""}">${LOCK}${x.locked ? "Locked" : "Locks"} ${when(x.lock_utc, x.lock)}</span>`;
    const head = `<header class="pc-h"><span class="pc-book"><i class="pc-dot ${bk}"></i>${esc(x.book)}</span>${status}</header>`;
    if (!x.legs.length) return `<article class="pc ${bk}${big ? " big" : ""}${on ? " on" : ""}" data-bk="${bk}">${head}
      <p class="pc-note">${x.locked ? `Fewer than ${PR.legs} Sunday games had a pick at ${esc(x.book)} at the lock, so there was no parlay this ${PERIOD.toLowerCase()}.` : `Not enough Sunday picks at ${esc(x.book)} yet. It fills in as lines are posted.`}</p></article>`;
    const dec = x.american > 0 ? 1 + x.american / 100 : 1 + 100 / -x.american;
    const legs = x.legs.map((l, i) => {
      if (l.sealed) return `<li class="pc-leg sealed"><span class="pc-n">${i + 1}</span><span class="pc-who"><b class="pc-blur">Sealed leg</b><small>${LOCK} revealed at kickoff</small></span><span class="pc-px"></span></li>`;
      const p = byId[l.serial];
      return `<li class="pc-leg ${l.result || ""}"><span class="pc-n">${l.result ? RES[l.result] : i + 1}</span>
        <a class="pc-who" href="${p ? pickUrl(p) : "#"}"><b>${esc(p ? nm(p) : l.player)}</b><small>${bet(l)} ${short(l.prop)}</small></a>
        <span class="pc-px">${odds(l.price)}${l.actual != null ? `<small>had ${l.actual}</small>` : ""}</span></li>`; }).join("");
    const m = x.model_chance || 0, bkc = x.book_chance || 0, edge = m - bkc;
    return `<article class="pc ${bk}${big ? " big" : ""}${on ? " on" : ""}${x.result ? " done res-" + x.result : ""}" data-bk="${bk}">${head}
      <div class="pc-pay"><b>${odds(x.american)}</b><span>$10 &rarr; <em>$${(10 * dec).toFixed(2)}</em></span></div>
      <ol class="pc-legs">${legs}</ol>
      <div class="pc-vs"><div class="pc-vs-t"><span>Model <b>${pct(m, false)}</b></span><span class="pc-edge ${edge >= 0 ? "up" : "down"}">${edge >= 0 ? "+" : ""}${edge.toFixed(1)} pts</span><span>Book <b>${pct(bkc, false)}</b></span></div>
        <div class="pc-bar"><i class="m" style="--v:${Math.max(2, Math.min(100, m))}%"></i><i class="b" style="--v:${Math.max(2, Math.min(100, bkc))}%"></i></div></div>
      <footer class="pc-f">${x.locked ? `Stamped at the lock &middot; ${when(x.lock_utc, x.lock)}` : `Updated ${esc(x.built || "")} ET &middot; place it at ${esc(x.book)}`}</footer></article>`;
  }

  function parlaysPage() {
    const weeks = [...new Set(PR.model.map((x) => `${x.season}-${x.week}`))];
    const cur = weeks.length ? weeks[weeks.length - 1] : null;
    const now = cur ? PR.model.filter((x) => `${x.season}-${x.week}` === cur && !(x.locked && x.result)) : [];
    const past = PR.model.filter((x) => x.locked && x.legs.length && !now.includes(x));
    hero(`Model parlays${cur ? ` &middot; ${PERIOD} ${cur.split("-")[1]}` : ""}`, "This week's <em>parlays</em>",
      `${PR.legs || 3} legs from different Sunday games, one book each. They lock at the first Sunday kickoff.`,
      now.length ? `${now.length > 1 ? `<div class="pc-tabs" role="tablist" aria-label="Book">${now.map((x, i) => `<button type="button" role="tab" data-bk="${BOOKDOT[x.book] || ""}" aria-selected="${i === 0}"><i class="pc-dot ${BOOKDOT[x.book] || ""}"></i>${esc(x.book)}<b>${x.legs.length ? odds(x.american) : "&ndash;"}</b></button>`).join("")}</div>` : ""}
        <div class="pc-grid hero-pc">${now.map((x, i) => modelCard(x, true, i === 0)).join("")}</div>` : `<div class="empty">No parlay this ${PERIOD.toLowerCase()} yet. They fill in as Sunday lines are posted.</div>`);
    const rec = PR.record || {}, all = rec.all || {};
    const chip = (label, r) => `<span class="pr-chip"><em>${esc(label)}</em><b>${r.W}-${r.L}${r.P ? "-" + r.P : ""}</b><b class="${tone(r.units)}">${num(r.units, 2, true)}u</b></span>`;
    const strip = all.n ? `<div class="pr-strip">
        <div class="pr-main"><span class="pr-k">Parlay record</span><b class="pr-wl">${all.W}-${all.L}${all.P ? "-" + all.P : ""}</b>
          <b class="pr-u ${tone(all.units)}">${num(all.units, 2, true)}u</b><span class="pr-roi ${tone(all.roi)}">${pct(all.roi)} ROI</span></div>
        <div class="pr-books">${PBOOKS.filter((b) => rec[b] && rec[b].n).map((b) => chip(b, rec[b])).join("")}</div></div>`
      : `<div class="empty">No model parlay has been graded yet. The first ones lock at this week's first Sunday kickoff.</div>`;
    // past weeks: one tidy row each, newest first; tap to see that week's parlays
    const byWeek = {};
    past.forEach((x) => { (byWeek[`${x.season}-${x.week}`] ||= []).push(x); });
    const rows = Object.keys(byWeek).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((key) => {
      const xs = byWeek[key], [season, w] = key.split("-");
      const u = xs.reduce((s, x) => s + (x.units || 0), 0);
      const marks = xs.map((x) => `<span class="pw-b ${x.result ? "res-" + x.result : ""}" title="${esc(x.book)}"><i class="bkdot ${BOOKDOT[x.book] || ""}"></i>${x.result === "W" ? "&#10003;" : x.result === "L" ? "&#10007;" : x.result === "P" ? "P" : "&middot;"}</span>`).join("");
      return `<details class="pw"><summary><span class="pw-w"><b>${PERIOD} ${w}</b><small>${season}</small></span><span class="pw-bs">${marks}</span>
          <b class="pw-u ${tone(u)}">${num(u, 2, true)}u</b><span class="pw-car" aria-hidden="true">&rsaquo;</span></summary>
        <div class="pc-grid">${xs.map((x) => modelCard(x)).join("")}</div></details>`; }).join("");
    document.addEventListener("click", (e) => {                        // the book switch (phones)
      const b = e.target.closest(".pc-tabs button[data-bk]");
      if (!b) return;
      document.querySelectorAll(".pc-tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      document.querySelectorAll(".hero-pc > .pc").forEach((c) => c.classList.toggle("on", c.dataset.bk === b.dataset.bk));
    });
    $("app").innerHTML = `
      <section>${strip}</section>
      ${rows ? `<section><div class="head"><div><h2>Past ${PERIOD.toLowerCase()}s</h2></div></div><div class="pws">${rows}</div></section>` : ""}`;
  }

  /* ------------------------------------------------------------------ Tools: bet sizing, odds, parlays, player lookup.
     Everything is worked out in the browser; the only thing kept is the bankroll you typed (this browser only). */
  const toDec = (a) => a >= 100 ? 1 + a / 100 : a <= -100 ? 1 + 100 / -a : null;
  const toAm = (d) => d >= 2 ? Math.round((d - 1) * 100) : d > 1 ? Math.round(-100 / (d - 1)) : null;
  const money = (v) => v == null || !isFinite(v) ? "&ndash;" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseOdds = (t) => { const v = parseFloat(String(t).replace(/[^\d.+-]/g, "")); return isFinite(v) && Math.abs(v) >= 100 ? v : null; };
  const field = (id, label, value, extra = "") => `<label class="tf"><span>${label}</span><input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(value)}"${extra}></label>`;

  // a typical week: what the model's picks of the last 3 finished weeks added up to, in units (the same rule the
  // model uses for its own unit)
  // keep: which picks count (all, or only the ones a visitor bets, e.g. Sharp agrees)
  function typicalWeek(keep = () => true) {
    const wk = {};
    allPicks.forEach((p) => { const k = `${p.season}-${String(p.week).padStart(2, "0")}`; (wk[k] = wk[k] || []).push(p); });
    const done = Object.keys(wk).sort().filter((k) => wk[k].every((p) => p.phase === "final")).slice(-3);
    if (!done.length) return null;
    const ps = done.map((k) => wk[k].filter(keep));
    return { units: ps.reduce((t, g) => t + g.reduce((u, p) => u + (p.units || 0), 0), 0) / done.length,
             picks: Math.round(ps.reduce((t, g) => t + g.length, 0) / done.length), weeks: done.length };
  }

  // the stake you'd actually type at the book: to the nearest 50 cents, never under $1 (how Line Ledger rounds its own)
  const roundStake = (v) => Math.max(1, Math.round(v * 2) / 2);
  const TOOLS = [["sizing", "Bet sizing", "What a pick's units mean in dollars, for your bankroll."],
                 ["odds", "Odds", "What any price means: win chance, payout, and the fair price without the book's cut."],
                 ["parlay", "Parlay", "What a parlay pays and how often one like it hits."],
                 ["player", "Player lookup", "How often any player went over a line this season, game by game, for any prop."],
                 ["alerts", "Alerts", "Get every pick the moment it's made, on your phone."]];

  // Tools > Alerts: how to follow, shaped by who's looking (member / free account / visitor)
  function alertsPanel() {
    const linked = ck("ll_d") === "1";
    const card = (cls, head, body, cta = "") => `<article class="al-card ${cls}"><h3>${head}</h3><div>${body}</div>${cta}</article>`;
    const btn = (href, text, cls = "gold") => `<a class="lp-btn ${cls}" href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
    const steps = `<ol class="al-steps"><li>Open Discord and long-press (or right-click) <b>#alerts</b>.</li><li>Tap <b>Notification Settings</b>, then <b>All Messages</b>.</li><li>Make sure Discord's notifications are on in your phone's settings.</li></ol>`;
    const alerts = MEMBER
      ? card("main", `${brand("discord", 22)} Every pick, in #alerts`, linked
          ? `<p><b class="up">&#10003; Your Discord is linked.</b> Every pick posts in <b>#alerts</b> the moment it's made, one card per drop, grouped by game.</p>${steps}`
          : `<p>Link your Discord once: our bot adds you to the members' <b>#alerts</b> channel, where every pick posts the moment it's made.</p>${steps}`,
          btn("/auth/discord", linked ? "Re-link Discord" : "Connect Discord", linked ? "ghost dark" : "gold"))
      : card("main", `${brand("discord", 22)} #alerts is for members`, `<p>Members get every pick the moment it's made, in Discord's <b>#alerts</b> channel, with a phone notification, sized for their bankroll on the site.</p>`,
          D.join_url ? btn(D.join_url, `Start your ${esc((D.offer || {}).trial || "membership")}`) : "");
    const free = D.discord ? card("", `${brand("discord", 20)} A free pick every game day`, `<p>Everyone can join the Line Ledger Discord: the day's free pick posts in <b>#free-pick</b>.</p>`, btn(D.discord, "Join the Discord", "ghost dark")) : "";
    const x = D.x ? card("", `${brand("x", 18)} Results and the free pick`, `<p>Follow <b>@${esc(D.x)}</b> for the free pick and every week's results.</p>`, btn(`https://x.com/${D.x}`, `Follow @${esc(D.x)}`, "ghost dark")) : "";
    const home = standalone() ? "" : card("", "Add Line Ledger to your home screen", `<p><b>iPhone:</b> in Safari, tap Share, then <b>Add to Home Screen</b>. <b>Android:</b> tap the menu, then <b>Install app</b>. It opens full screen, straight to the picks.</p>`);
    return `<div class="al-grid">${alerts}${free}${x}${home}</div>`;
  }

  function toolsPage() {
    hero("Free tools", "Bettor's <em>toolkit</em>", "Nothing you type here leaves your browser.");
    // betting Sharp agrees only means fewer picks a week, so each unit can be bigger for the same weekly risk
    // the props you bet (remembered in this browser; default: every prop on the site)
    const sizable = MK.filter((k) => MKT(k).picks.length);
    const myProps = () => { let m = null; try { m = JSON.parse(store.get("ll-myprops") || "null"); } catch (e) {}
      const s = Array.isArray(m) ? m.filter((k) => sizable.includes(k)) : []; return s.length ? s : sizable; };
    const mine = (p) => myProps().includes(p.prop);
    const typAllOf = () => typicalWeek(mine), typSharpOf = () => typicalWeek((p) => mine(p) && p.sharp === "agrees");
    let typAll = typAllOf(), typSharp = typSharpOf();
    const typNow = () => { typAll = typAllOf(); typSharp = typSharpOf(); return sharpOnly() && typSharp && typSharp.units > 0 ? typSharp : typAll; };
    const propChips = () => sizable.length < 2 ? "" : `<div class="tprops-row"><div class="tp-h"><span class="lk-l">Props you bet</span><small class="tnote">Your unit and this week's list count only these.</small></div>
      <div class="lk-chips" id="s-props" role="group" aria-label="Props you bet">${sizable.map((k) =>
      `<button type="button" data-myprop="${k}" aria-pressed="${myProps().includes(k)}"><i aria-hidden="true"></i>${esc(MKT(k).short || MKT(k).label)}</button>`).join("")}</div></div>`;
    const bank0 = parseFloat(store.get("ll-bank")) || 1000, share0 = parseFloat(store.get("ll-share")) || 25;
    const q0 = new URLSearchParams(location.search), h0 = location.hash.slice(1);
    const first = q0.get("player") ? "player" : TOOLS.some(([k]) => k === h0) ? h0 : TOOLS.some(([k]) => k === store.get("ll-tool")) ? store.get("ll-tool") : "sizing";
    $("app").innerHTML = `<section class="tbox">
      <div class="tswitch" role="tablist" aria-label="Tools">${TOOLS.map(([k, l]) => `<button type="button" role="tab" data-tool="${k}" aria-controls="t-${k}">${l}</button>`).join("")}</div>
      <div id="t-sizing" class="tpanel" role="tabpanel" hidden><p class="tsub">${TOOLS[0][2]}</p>
        <div class="tool tgrid">
          <div class="tin">${field("s-bank", "Your bankroll ($)", bank0)}
            <div class="tf"><span>A typical week risks</span><div class="tseg" id="s-share" role="group" aria-label="A typical week risks">${[10, 15, 25, 35].map((v) => `<button type="button" data-share="${v}" aria-pressed="${v === share0}">${v}%</button>`).join("")}</div><small class="tnote">25% is what we use</small></div></div>
          <div class="tout" id="s-out"></div>${propChips()}</div>
        <div id="s-picks"></div>
        <details class="thow"><summary>How is this worked out?</summary><p id="s-how"></p></details></div>
      <div id="t-odds" class="tpanel" role="tabpanel" hidden><p class="tsub">${TOOLS[1][2]}</p>
        <div class="tool tgrid">
          <div class="tin">${field("o-odds", "Odds", "-130", ' placeholder="-130 or +115"')}${field("o-stake", "Stake ($)", "10")}
            ${field("o-other", "Other side's odds (optional)", "", ' placeholder="for the fair price"')}</div>
          <div class="tout" id="o-out"></div></div></div>
      <div id="t-parlay" class="tpanel" role="tabpanel" hidden><p class="tsub">${TOOLS[2][2]} Want ours? <a href="${F.parlays || "parlays.html"}">The model's parlays</a></p>
        <div class="tool tgrid">
          <div class="tin"><div id="p-legs" class="tlegs"></div>
            <div class="tleft"><button type="button" class="ps-clear" id="p-add">+ Add a leg</button></div>
            ${field("p-stake", "Stake ($)", "10")}</div>
          <div class="tout" id="p-out"></div></div>
        <p class="ps-fine">Assumes the legs are independent. Legs from the same game move together, and books price those differently.</p></div>
      <div id="t-player" class="tpanel" role="tabpanel" hidden><p class="tsub">${TOOLS[3][2]} <span class="muted" id="l-eyebrow"></span></p>
        <div class="tool"><div class="trow">
          <div class="tf grow tcombo"><span id="l-ql">Player</span><input id="l-q" role="combobox" aria-labelledby="l-ql" aria-expanded="false" aria-controls="l-list" aria-autocomplete="list" placeholder="Search a receiver, e.g. Chase" autocomplete="off" spellcheck="false"><ul id="l-list" class="tlist" role="listbox" hidden></ul></div>
          <div class="tf tline"><span>Line</span><div class="tstep"><button type="button" data-ls="-1" aria-label="Lower line">&minus;</button><input id="l-line" inputmode="decimal" value="4.5" aria-label="Line"><button type="button" data-ls="1" aria-label="Raise line">+</button></div></div></div>
          <div class="lk-stats" id="l-stats" hidden></div><div id="l-ours"></div><div id="l-out"><div class="empty">Loading players&hellip;</div></div></div></div>
      <div id="t-alerts" class="tpanel" role="tabpanel" hidden><p class="tsub">${TOOLS[4][2]}</p>${alertsPanel()}</div></section>`;
    const show = (k, push) => {
      document.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tool === k)));
      document.querySelectorAll(".tpanel").forEach((s) => { s.hidden = s.id !== `t-${k}`; });
      store.set("ll-tool", k);
      if (push) history.replaceState(null, "", `${location.pathname}${k === "player" ? location.search : ""}#${k}`);
    };
    document.querySelector(".tswitch").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (b) show(b.dataset.tool, true); });
    show(first, false);

    /* bet sizing */
    const sizeOut = () => {
      const bank = parseFloat($("s-bank").value.replace(/[^\d.]/g, "")), share = parseFloat(($("s-share").querySelector('[aria-pressed="true"]') || {}).dataset?.share) || 25;
      if (!(bank > 0)) { $("s-out").innerHTML = `<div class="empty">Enter your bankroll.</div>`; $("s-picks").innerHTML = ""; return; }
      store.set("ll-bank", String(bank)); store.set("ll-share", String(share));
      const typ = typNow(), sharp = typ === typSharp && sharpOnly();
      const unit = typ && typ.units > 0 ? bank * share / 100 / typ.units : bank / 100;
      $("s-out").innerHTML = `<div class="tbig"><small>Your 1 unit${sharp ? " &middot; Sharp agrees only" : ""}</small><b>${money(unit)}</b><span>${(100 * unit / bank).toFixed(2)}% of your bankroll${myProps().length < sizable.length ? ` &middot; ${myProps().map((k) => esc(MKT(k).short || MKT(k).label)).join(", ")}` : ""}${sharp ? ` &middot; bigger because you're betting about ${typ.picks} picks a week instead of ${typAll.picks}` : ""}</span></div>
        <dl class="ps-nums tsizes">${[0.5, 1, 1.5, 2].map((u) => `<div><dt>${u}u bet</dt><dd>${money(roundStake(u * unit))}</dd></div>`).join("")}</dl>`;
      $("s-how").innerHTML = typ ? `A typical week of ${sharp ? "our Sharp-agrees picks" : "our picks"}${myProps().length < sizable.length ? " in the props you bet" : ""} adds up to about <b>${typ.units.toFixed(0)}u</b> over about ${typ.picks} picks (the last ${typ.weeks} finished weeks). So 1u = your bankroll &times; the % you chose &divide; ${typ.units.toFixed(0)}, and a typical week of the picks you bet comes to that %.${sharp ? " The same weekly risk spread over fewer bets swings more from week to week." : ""} Each bet is rounded to the nearest 50 cents, at least $1. Line Ledger sizes its own bets this way (on all its picks).`
        : "1u = 1% of your bankroll until there's a finished week to measure. Each bet is rounded to the nearest 50 cents, at least $1.";
      unitNow = unit; drawPicks();
    };
    // this week's open picks at the visitor's size: a to-do list with the book's bet button, a Sharp-agrees filter and
    // their own "I bet this" ticks (see MYBETS)
    let unitNow = 0;
    const sharpOnly = () => store.get("ll-sharponly") === "1", hideBet = () => store.get("ll-hidebet") === "1";
    const drawPicks = () => {
      const all = openNow.filter((p) => p.phase === "open" && p.units && mine(p));
      const nSealed = sealedOpen().length;
      const sealedNote = nSealed ? `<p class="sl-note">${LOCK} ${nSealed} more pick${nSealed === 1 ? " is" : "s are"} sealed for members${D.join_url ? ` &middot; <a href="${esc(D.join_url)}">unlock them</a>` : ""}.</p>` : "";
      if (!all.length || !(unitNow > 0)) { $("s-picks").innerHTML = unitNow > 0 ? sealedNote : ""; return; }
      const pool = sharpOnly() ? all.filter((p) => p.sharp === "agrees") : all;
      const stake = (p) => roundStake(p.units * unitNow), sum = (ps) => ps.reduce((t, p) => t + stake(p), 0);
      const done = pool.filter(iBet), left = pool.filter((p) => !iBet(p)), rows = hideBet() ? left : pool;
      $("s-picks").innerHTML = `<div class="tpk-h"><h3>This ${PERIOD.toLowerCase()}'s picks at your size</h3>
        <div class="tpk-ctl"><div class="tseg tseg-s" role="group" aria-label="Which picks"><button type="button" data-sh="0" aria-pressed="${!sharpOnly()}">All picks</button><button type="button" data-sh="1" aria-pressed="${sharpOnly()}">Sharp agrees</button></div>
          <label class="tchk"><input type="checkbox" id="s-hide"${hideBet() ? " checked" : ""}> Hide ones I've bet</label></div></div>
        <p class="tpk-sum"><b>${done.length} of ${pool.length}</b> bet &middot; ${money(sum(done))} placed &middot; <b>${money(sum(left))}</b> left to bet</p>
        ${rows.length ? `<div class="tablebox"><table class="tpk"><thead><tr><th class="tck" title="Tick it after you place it">Bet</th><th>Pick</th><th class="num opt">Size</th><th class="num">Your bet</th><th class="num opt">To win</th><th></th></tr></thead><tbody>
          ${rows.map((p) => { const st = stake(p), on = iBet(p);
            return `<tr class="${on ? "isbet" : ""}"><td class="tck"><input type="checkbox" data-mybet="${esc(p.serial)}"${on ? " checked" : ""} aria-label="I bet ${esc(nm(p))} ${bet(p)}"></td>
              <td><b>${esc(nm(p))}</b>${p.sharp === "agrees" ? ` <span class="tsh" title="Sharp agrees">sharp &#10003;</span>` : ""}<small>${bet(p)} ${esc(MKT(p.prop).short || MKT(p.prop).label)} &middot; ${odds(p.price)} ${esc(abbr(p.book))} &middot; ${when(p.kick_utc, p.kick)}</small></td>
              <td class="num opt">${p.units.toFixed(1)}u</td><td class="num"><b>${money(st)}</b></td><td class="num opt">${money(st * (toDec(p.price) - 1))}</td><td class="tbtn">${betButton(p)}</td></tr>`; }).join("")}
          </tbody></table></div>` : `<div class="empty">${pool.length ? "Every pick here is marked as bet." : "No open Sharp-agrees picks right now."}</div>`}
        ${sealedNote}<p class="ps-fine">Tick a pick after you place it. Ticks stay in this browser on this device only (nothing is sent anywhere), and each ${PERIOD.toLowerCase()} starts fresh. Bet buttons open the book; nothing is placed for you.</p>`;
    };
    $("s-picks").addEventListener("click", (e) => { const b = e.target.closest("[data-sh]"); if (b) { store.set("ll-sharponly", b.dataset.sh); sizeOut(); } });
    $("s-picks").addEventListener("change", (e) => {
      if (e.target.id === "s-hide") { store.set("ll-hidebet", e.target.checked ? "1" : "0"); drawPicks(); return; }
      const s = e.target.dataset.mybet; if (s) { setBet(s, e.target.checked); drawPicks(); } });
    const sp = $("s-props");
    if (sp) sp.addEventListener("click", (e) => { const b = e.target.closest("[data-myprop]"); if (!b) return;
      const cur = new Set(myProps()); cur.has(b.dataset.myprop) ? cur.delete(b.dataset.myprop) : cur.add(b.dataset.myprop);
      if (!cur.size) return;                                               // at least one prop
      store.set("ll-myprops", JSON.stringify([...cur]));
      sp.querySelectorAll("[data-myprop]").forEach((x) => x.setAttribute("aria-pressed", String(cur.has(x.dataset.myprop)))); sizeOut(); });
    $("s-bank").addEventListener("input", sizeOut); $("s-share").addEventListener("click", (e) => { const b = e.target.closest("[data-share]"); if (!b) return;
      $("s-share").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); sizeOut(); });
    sizeOut();

    /* odds converter */
    const oddsOut = () => {
      const a = parseOdds($("o-odds").value), st = parseFloat($("o-stake").value) || 0, b = parseOdds($("o-other").value);
      if (a == null) { $("o-out").innerHTML = `<div class="empty">Enter odds like -130 or +115.</div>`; return; }
      const d = toDec(a), imp = 100 / d;
      let fair = "";
      if (b != null) {
        const ib = 100 / toDec(b), hold = imp + ib - 100, fp = 100 * imp / (imp + ib);
        fair = `<dl class="ps-nums tfair"><div><dt>Fair chance</dt><dd>${fp.toFixed(1)}%</dd></div><div><dt>Fair price</dt><dd>${odds(toAm(100 / fp))}</dd></div>
          <div><dt>Book's cut</dt><dd>${hold.toFixed(1)}%<small>${hold > 6 ? "high" : hold > 3.5 ? "normal for props" : "low"}</small></dd></div></dl>`;
      }
      $("o-out").innerHTML = `<div class="tbig"><small>Win chance it implies</small><b>${imp.toFixed(1)}%</b><span>win this often to break even &middot; decimal ${d.toFixed(2)}</span></div>
        <dl class="ps-nums"><div><dt>To win</dt><dd>${money(st * (d - 1))}</dd></div><div><dt>Total back</dt><dd>${money(st * d)}</dd></div></dl>${fair}`;
    };
    ["o-odds", "o-stake", "o-other"].forEach((id) => $(id).addEventListener("input", oddsOut));
    oddsOut();

    /* parlay calculator */
    const pl = ["-110", "-110"];
    const legRows = () => { $("p-legs").innerHTML = pl.map((v, i) => `<div class="tleg"><label class="tf grow"><span>Leg ${i + 1} odds</span><input data-pl="${i}" inputmode="decimal" value="${esc(v)}" autocomplete="off"></label>
        ${pl.length > 2 ? `<button type="button" class="ps-x" data-pdel="${i}" aria-label="Remove leg ${i + 1}">&times;</button>` : ""}</div>`).join("");
      $("p-add").disabled = pl.length >= 10; };
    const parOut = () => {
      const ds = pl.map(parseOdds), st = parseFloat($("p-stake").value) || 0;
      if (ds.some((x) => x == null)) { $("p-out").innerHTML = `<div class="empty">Enter odds for every leg (like -110 or +150).</div>`; return; }
      const d = ds.reduce((t, a) => t * toDec(a), 1);
      $("p-out").innerHTML = `<div class="tbig"><small>${pl.length}-leg parlay</small><b>${odds(toAm(d))}</b><span>decimal ${d.toFixed(2)}</span></div>
        <dl class="ps-nums"><div><dt>To win</dt><dd>${money(st * (d - 1))}</dd></div><div><dt>Total back</dt><dd>${money(st * d)}</dd></div>
        <div><dt>Hits about</dt><dd>${(100 / d).toFixed(1)}%<small>1 in ${d.toFixed(1)}, at the books' prices</small></dd></div></dl>`;
    };
    $("p-legs").addEventListener("input", (e) => { const i = e.target.dataset.pl; if (i != null) { pl[+i] = e.target.value; parOut(); } });
    $("p-legs").addEventListener("click", (e) => { const b = e.target.closest("[data-pdel]"); if (b) { pl.splice(+b.dataset.pdel, 1); legRows(); parOut(); } });
    $("p-add").addEventListener("click", () => { if (pl.length < 10) { pl.push("-110"); legRows(); parOut(); $("p-legs").querySelector(`[data-pl="${pl.length - 1}"]`).focus(); } });
    $("p-stake").addEventListener("input", parOut);
    legRows(); parOut();

    /* player lookup (players.js is loaded only here, once per visit) */
    if (window.PLAYERS) { lookup(window.PLAYERS); return; }
    const sc = document.createElement("script");
    sc.src = "players.js?v=" + (((document.querySelector('script[src^="data.js"]') || {}).src || "").split("v=")[1] || "");
    sc.onload = () => lookup(window.PLAYERS);
    sc.onerror = () => { $("l-out").innerHTML = `<div class="empty">The player list isn't available right now.</div>`; };
    document.body.appendChild(sc);
  }

  // Tools > Player lookup: any QB, RB, WR or TE, any stat a prop is graded on, game by game against a line you set
  const LK = {
    receptions: ["Receptions", "receptions", "catches", "targets", "targets", 1],
    receiving_yards: ["Rec yds", "rec_yds", "rec yds", "receptions", "catches", 5],
    rush_rec_yards: ["Rush + rec yds", "rush_rec_yds", "yds", "rush_att", "carries", 5],
    rushing_yards: ["Rush yds", "rush_yds", "rush yds", "rush_att", "carries", 5],
    rush_attempts: ["Rush att", "rush_att", "carries", "rush_yds", "rush yds", 1],
    passing_yards: ["Pass yds", "pass_yds", "pass yds", "pass_att", "attempts", 5],
    pass_attempts: ["Pass att", "pass_att", "attempts", "completions", "completions", 1],
    completions: ["Completions", "completions", "completions", "pass_att", "attempts", 1],
    pass_tds: ["Pass TDs", "pass_td", "TD passes", "pass_att", "attempts", 1],
    interceptions: ["INTs", "ints", "INTs", "pass_att", "attempts", 1],
    anytime_td: ["TDs scored", "td", "TDs", null, null, 1] };
  const LK_POS = { QB: ["passing_yards", "pass_attempts", "completions", "pass_tds", "interceptions", "rushing_yards", "anytime_td"],
    RB: ["rushing_yards", "rush_attempts", "rush_rec_yards", "receptions", "receiving_yards", "anytime_td"],
    WR: ["receptions", "receiving_yards", "rush_rec_yards", "anytime_td"], TE: ["receptions", "receiving_yards", "anytime_td"] };
  function lookup(PL) {
    if (!PL || !PL.players.length) { $("l-out").innerHTML = `<div class="empty">No player games yet this season.</div>`; return; }
    const COLS = PL.cols || ["receptions", "targets"];
    const at = (row, c) => { const i = COLS.indexOf(c); return i < 0 ? null : row[(PL.cols ? 4 : 3) + i]; };
    const snap = (row) => PL.cols ? row[3] : row[5];
    $("l-eyebrow").innerHTML = `${PL.season} &middot; through ${PERIOD} ${PL.through}`;
    const label = (x) => `${x.full} (${x.team} ${x.pos})`;
    const byPid = Object.fromEntries(PL.players.map((x) => [x.id, x]));
    const statsFor = (x) => (PL.cols ? LK_POS[x.pos] || LK_POS.WR : ["receptions"]);
    const ours = (x, k) => openNow.filter((p) => p.pid === x.id && p.phase !== "final" && (!k || p.prop === k));
    let who = null, stat = null;
    const lineVal = () => { const v = parseFloat($("l-line").value); return isFinite(v) ? v : null; };
    const defLine = (x, k) => { const mine = ours(x, k); if (mine.length) return mine[0].line;
      const [, col] = LK[k], vals = x.g.map((g) => at(g, col)), avg = vals.reduce((t, v) => t + v, 0) / Math.max(vals.length, 1);
      return k === "anytime_td" ? 0.5 : Math.max(0.5, LK[k][5] === 5 ? Math.round(avg / 5) * 5 - 0.5 : Math.round(avg) - 0.5); };
    const draw = () => {
      if (!who) { $("l-stats").hidden = true; $("l-ours").innerHTML = ""; $("l-out").innerHTML = `<div class="empty">Type a player's name and pick him from the list.</div>`; return; }
      const L = lineVal(), gs = who.g, [sl, col, noun, cc, cn] = LK[stat];
      if (L == null) { $("l-out").innerHTML = `<div class="empty">Enter a line, like 4.5.</div>`; return; }
      const v = (g) => at(g, col);
      const rate = (g) => { const o = g.filter((x) => v(x) > L).length, u = g.filter((x) => v(x) < L).length; return { o, u, n: g.length }; };
      const cell = (t, g) => { const r = rate(g); return `<div><small>${t}</small><b>${r.n ? Math.round(100 * r.o / r.n) + "%" : "&ndash;"}</b><span class="muted">over in ${r.o} of ${r.n}${r.n - r.o - r.u ? ` &middot; ${r.n - r.o - r.u} push` : ""}</span></div>`; };
      const avg = (c) => gs.reduce((t, x) => t + at(x, c), 0) / gs.length;
      const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
      $("l-ours").innerHTML = ours(who).map((p) => `<a class="tours" href="${linkTo(p)}"><span class="eyebrow">Our pick this ${PERIOD.toLowerCase()}</span><b>${bet(p)} ${esc((MKT(p.prop) || {}).short || "")}</b><span class="mono">${odds(p.price)} ${esc(abbr(p.book))}${p.units ? ` &middot; ${p.units.toFixed(1)}u` : ""}</span><i aria-hidden="true">&rsaquo;</i></a>`).join("");
      const W = 640, H = 210, pad = 24, top = Math.max(L + 1, ...gs.map(v)) * 1.15;
      const step = (W - 2 * pad) / gs.length, bw = Math.min(44, step - 8);
      const X = (i) => pad + (i + 0.5) * step, Y = (y) => H - 28 - (H - 28 - 16) * y / top;
      const bars = gs.map((x, i) => { const cls = v(x) > L ? "tb-o" : v(x) < L ? "tb-u" : "tb-p", h = Math.max(2, Y(0) - Y(v(x)));
        return `<g class="${cls}"><title>${PERIOD} ${x[0]} ${x[2] ? "vs" : "@"} ${x[1]}: ${fmt(v(x))} ${noun}${cc ? ` (${fmt(at(x, cc))} ${cn})` : ""}</title>
          <rect x="${X(i) - step / 2}" y="0" width="${step}" height="${H}" fill="transparent"/>
          <rect x="${X(i) - bw / 2}" y="${Y(0) - h}" width="${bw}" height="${h}" rx="4"/><text class="tb-v" x="${X(i)}" y="${Y(0) - h - 6}">${Math.round(v(x))}</text>
          <text class="tb-x" x="${X(i)}" y="${H - 8}">${x[2] ? "" : "@"}${esc(x[1])}</text></g>`; }).join("");
      const ourPicks = allPicks.filter((p) => p.pid === who.id).length;
      const chips = statsFor(who).map((k) => `<button type="button" data-lk="${k}" aria-pressed="${k === stat}">${esc(LK[k][0])}</button>`).join("");
      const sb = $("l-stats"); sb.hidden = statsFor(who).length < 2;
      sb.innerHTML = `<span class="lk-l">Stat</span><div class="lk-chips" role="group" aria-label="Stat">${chips}</div>`;
      $("l-out").innerHTML = `<div class="tplayer"><h3>${esc(who.full)}</h3><span class="muted">${esc(who.team)} ${esc(who.pos)} &middot; ${fmt(+avg(col).toFixed(1))} ${noun}${cc ? `, ${fmt(+avg(cc).toFixed(1))} ${cn}` : ""} a game</span>
          ${ourPicks ? `<a class="tpl-all" href="${playerHref(who.id)}">Every pick we've made on him (${ourPicks}) &rarr;</a>` : ""}</div>
        <div class="rc-grid">${cell("Last 5", gs.slice(-5))}${cell("Last 10", gs.slice(-10))}${cell("Season", gs)}<div><small>Average</small><b>${(+avg(col).toFixed(1))}</b><span class="muted">vs line ${L}</span></div></div>
        <figure class="tchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sl)} per game against the line ${L}">
          <line class="tb-base" x1="${pad / 2}" x2="${W - pad / 2}" y1="${Y(0)}" y2="${Y(0)}"/>${bars}
          <line class="tb-line" x1="${pad / 2}" x2="${W - pad / 2}" y1="${Y(L)}" y2="${Y(L)}"/></svg>
          <figcaption><span class="kk"><span class="key l"></span>Line ${L}</span><span class="kk"><span class="key o"></span>Over the line</span><span class="kk"><span class="key u"></span>Under the line</span><span class="kk muted">Tap a bar for the game</span></figcaption></figure>
        <div class="tablebox"><table><thead><tr><th>${PERIOD}</th><th>Opponent</th><th class="num">${esc(sl)}</th>${cc ? `<th class="num opt">${esc(cn[0].toUpperCase() + cn.slice(1))}</th>` : ""}<th class="num opt">Snaps</th><th>vs ${L}</th></tr></thead><tbody>
          ${gs.slice().reverse().map((x) => `<tr><td>${x[0]}</td><td>${x[2] ? "vs" : "@"} ${esc(x[1])}</td><td class="num"><b>${fmt(v(x))}</b></td>${cc ? `<td class="num opt">${fmt(at(x, cc))}</td>` : ""}<td class="num opt">${snap(x) == null ? "&ndash;" : snap(x) + "%"}</td>
            <td>${v(x) > L ? '<b class="up">Over</b>' : v(x) < L ? '<span class="muted">Under</span>' : '<span class="muted">Push</span>'}</td></tr>`).join("")}</tbody></table></div>
        <p class="ps-fine">Past games, not a prediction: injuries, trades and a new quarterback change what a player does. Stats: nflverse play-by-play.</p>`;
    };
    const setUrl = () => { if (who) history.replaceState(null, "", `?player=${who.id}&stat=${stat}&line=${encodeURIComponent($("l-line").value)}#player`); };
    const choose = (x, keepLine, k) => {
      who = x;
      if (x) { const mine = ours(x); stat = k && statsFor(x).includes(k) ? k : mine.length && LK[mine[0].prop] && statsFor(x).includes(mine[0].prop) ? mine[0].prop : statsFor(x)[0];
        if (!keepLine) $("l-line").value = defLine(x, stat); }
      setUrl(); draw();
    };
    $("l-stats").addEventListener("click", (e) => { const b = e.target.closest("[data-lk]"); if (!b || !who) return;
      stat = b.dataset.lk; $("l-line").value = defLine(who, stat); setUrl(); draw(); });
    // the search box: every word you type must start a word of the name (or match the team); picks this week first
    const fold = (t) => t.toLowerCase().normalize("NFD").replace(/\p{M}|['.]/gu, "");
    const words = PL.players.map((x) => ({ x, w: fold(`${x.full} ${x.name}`).split(/[\s-]+/), team: x.team.toLowerCase(), pos: x.pos.toLowerCase() }));
    const picked = new Set(openNow.map((p) => p.pid));
    let hits = [], hi = 0;
    const list = $("l-list"), box = $("l-q");
    box.placeholder = PL.cols ? "Search any player, e.g. Chase" : box.placeholder;
    const close = () => { list.hidden = true; box.setAttribute("aria-expanded", "false"); box.removeAttribute("aria-activedescendant"); };
    const paint = () => {
      list.innerHTML = hits.length ? hits.map(({ x }, i) => `<li role="option" id="lo-${i}" data-i="${i}" aria-selected="${i === hi}">${tm(x.team)}<b>${esc(x.full)}</b><span class="muted">${esc(x.pos)}</span>
          ${picked.has(x.id) ? `<em class="tpk">our pick</em>` : ""}<span class="mono muted tct">${x.g.length} games</span></li>`).join("")
        : `<li class="tnone">No player matches. Try a last name.</li>`;
      list.hidden = false; box.setAttribute("aria-expanded", "true");
      if (hits.length) box.setAttribute("aria-activedescendant", `lo-${hi}`);
    };
    const search = () => {
      const q = fold(box.value).split(/[\s-]+/).filter(Boolean);
      if (!q.length) { close(); return; }
      hits = words.filter(({ w, team, pos }) => q.every((t) => team === t || pos === t || w.some((y) => y.startsWith(t))))
        .sort((a, b) => picked.has(b.x.id) - picked.has(a.x.id) || (b.x.vol || b.x.rec || 0) - (a.x.vol || a.x.rec || 0)).slice(0, 8);
      hi = 0; paint();
    };
    const pick = (i) => { const h = hits[i]; if (!h) return; box.value = label(h.x); close(); choose(h.x); box.blur(); };
    box.addEventListener("input", search);
    box.addEventListener("focus", () => { if (box.value && who && box.value === label(who)) box.select(); else if (box.value) search(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (list.hidden) search(); else if (hits.length) { hi = (hi + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length; paint(); } e.preventDefault(); }
      else if (e.key === "Enter") { pick(hi); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("mousedown", (e) => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
    box.addEventListener("blur", () => setTimeout(close, 120));
    $("l-line").addEventListener("input", () => { setUrl(); draw(); });
    document.querySelector(".tstep").addEventListener("click", (e) => { const b = e.target.closest("[data-ls]"); if (!b) return;
      const st = stat && LK[stat][5] === 5 ? 5 : 1;
      $("l-line").value = Math.max(0.5, (lineVal() ?? 4.5) + st * +b.dataset.ls); setUrl(); draw(); });
    const q = new URLSearchParams(location.search), start = byPid[q.get("player")];
    if (start) { $("l-q").value = label(start); if (q.get("line")) $("l-line").value = q.get("line"); choose(start, !!q.get("line"), q.get("stat")); }
    else { draw(); if (q.get("player")) $("l-out").innerHTML = `<div class="empty">No games for that player this season yet. Search another name above.</div>`; }
  }

  setTimeout(() => { reveal(); countUp(); }, 0);
  /* ------------------------------------------------------------------ landing page (lineledgerpicks.com/)
     What a new visitor sees first: what it is, the live record, what members get (shown with the site's real
     components, filled with the last fully graded week - public picks only), how to check us, pricing, FAQ.
     Old links to the picks (#ph-..., ?week=) and the home-screen app go straight to This week instead. */
  // the FAQ (landing page and About): the trial wording follows the offer
  function faqHtml() {
    const trial = (D.offer || {}).trial || "";
    return [["What exactly do I get?", `Every receptions pick the model makes, the moment it's made: in the members' Discord channel (with a phone notification) and on the site, with the size in dollars for your bankroll and a button to its sportsbook. Plus the bet tracker.${trial ? ` It starts with a ${esc(trial)}.` : ""}`],
           ["What's the free account?", "A free login that shows the free pick of each game day, this week's sealed picks (revealed at kickoff), and the tools. No card needed."],
           ["What's a unit?", `A fixed slice of your bankroll, so every bet is sized the same way. Enter your bankroll once and the site turns units into dollars for you. The free <a href="tools.html">bet sizing tool</a> shows how.`],
           ["Which sportsbooks?", "DraftKings and FanDuel. Each pick is priced at whichever of the two has the better price when it's made."],
           ["Is this a guarantee?", "No. These are a model's opinions, not certainties, and even good picks lose often. Every result is kept public so you can judge the record yourself. Bet only what you can afford to lose."],
           ["Can I check the record before I pay?", `Yes, it's public with no login: <a href="receptions.html">every receptions pick</a> since launch, graded, with the time it was posted.`],
           ["How do I cancel?", `Anytime, in two taps: on the site, open your account menu and tap <b>Manage or cancel membership</b> (or go to <a href="https://whop.com/@me/settings/orders/" target="_blank" rel="noopener">whop.com &rarr; Profile &rarr; Orders</a>), pick Line Ledger, then <b>Cancel</b>. Nothing renews after that, and you keep access until the end of the period you already paid for.`],
           ["Who can join?", "Adults 21 and over, where sports betting is legal. If gambling stops being fun, call or text 1-800-GAMBLER (free, 24/7)."]]
      .map(([q, a]) => `<details class="drawer"><summary>${q}</summary><p>${a}</p></details>`).join("");
  }

  function landing() {
    if (/^#ph-/.test(location.hash) || /[?&](week|season)=/.test(location.search) || SIGNED_IN) {
      location.replace(href(F.home) + location.search + location.hash); return;
    }
    const R = (MKT("receptions") || {}).record || [], r = R[0] || {};
    const offer = D.offer || {}, price = offer.price || "$15", per = offer.per || "month", trial = offer.trial || "";
    const join = D.join_url, login = D.login_url, signup = D.signup_url;
    const ctaText = trial ? `Start your ${esc(trial)}` : "Join Line Ledger";
    const cta = (cls, text = ctaText) => MEMBER ? `<a class="lp-btn ${cls}" href="${href(F.home)}">See this week's picks</a>` : join ? `<a class="lp-btn ${cls}" href="${esc(join)}">${text}</a>` : `<span class="lp-btn ${cls} off">Memberships open soon</span>`;
    // the showcase week: the latest week whose receptions picks are all graded (public, so nothing sealed shows)
    const rec = allPicks.filter((p) => p.prop === "receptions" && !p.paper);
    const wkKeys = [...new Set(rec.map((p) => `${p.season}-${String(p.week).padStart(2, "0")}`))].sort().reverse();
    const showKey = wkKeys.find((k) => rec.filter((p) => `${p.season}-${String(p.week).padStart(2, "0")}` === k).every((p) => p.phase === "final"));
    const show = showKey ? rec.filter((p) => `${p.season}-${String(p.week).padStart(2, "0")}` === showKey).sort(byKick) : [];
    const showWeek = show.length ? show[0].week : D.week;
    const sample = (n) => show.slice(0, n);                                   // first by kickoff: not cherry-picked
    const typ = typicalWeek(), unit = typ && typ.units ? 1000 * 0.25 / typ.units : null;
    const stake = (p) => unit ? roundStake(p.units * unit) : null;
    const matchup = (p) => p.home ? `${p.opp} @ ${p.team}` : `${p.team} @ ${p.opp}`;
    const win = (title, body, cls = "") => `<div class="win ${cls}"><div class="win-bar"><i></i><i></i><i></i><span>${title}</span></div><div class="win-body">${body}</div></div>`;
    const alertLine = (p) => `<div class="lpa-l"><b>${esc(nm(p))}</b> ${p.side[0]} ${p.line} rec &middot; <code>${odds(p.price)}</code> ${esc(abbr(p.book))} &middot; <b>${(p.units || 0).toFixed(1)}u</b> &middot; ${p.win ? p.win.toFixed(0) : ""}%${p.sharp === "agrees" ? " &#9989;" : ""}</div>`;
    const alertCard = (all, cap = 9) => { const ps = all.filter((p) => [...new Set(all.map(matchup))].slice(0, 3).includes(matchup(p))).slice(0, cap), games = [...new Set(ps.map(matchup))], n = ps.length;
      return `<div class="lp-alert"><div class="lpa-top"><span class="lpa-av">LL</span><b>Line Ledger</b><span class="lpa-app">APP</span><span class="lpa-t">${esc(PERIOD)} ${showWeek}</span></div>
      <div class="lpa-head">&#128276; ${esc(PERIOD)} ${showWeek} &middot; ${n} new picks</div>
      <div class="lpa-card">${games.map((g) => `<div class="lpa-g">${esc(g)}</div>${ps.filter((p) => matchup(p) === g).map(alertLine).join("")}`).join("")}</div></div>`; };
    const sizeRows = (ps, ticks) => ps.map((p, i) => `<tr${ticks && ticks[i] ? ' class="isbet"' : ""}>${ticks ? `<td class="tck"><input type="checkbox" tabindex="-1"${ticks[i] ? " checked" : ""} aria-hidden="true"></td>` : ""}
        <td><b>${esc(nm(p))}</b>${p.sharp === "agrees" ? ` <span class="tsh">sharp &#10003;</span>` : ""}<small>${bet(p)} rec &middot; ${odds(p.price)} ${esc(abbr(p.book))}</small></td>
        <td class="num">${(p.units || 0).toFixed(1)}u</td><td class="num"><b>${stake(p) != null ? money(stake(p)) : "&ndash;"}</b></td></tr>`).join("");
    const ticks = [1, 1, 0, 1, 0], trk = sample(5), done = trk.filter((p, i) => ticks[i]), left = trk.filter((p, i) => !ticks[i]);
    const sum = (ps) => ps.reduce((t, p) => t + (stake(p) || 0), 0);
    const stat = (big, small, cls = "") => `<div><b class="${cls}">${big}</b><small>${small}</small></div>`;

    $("hero").innerHTML = `<div class="lp-hero">
      <div class="lp-copy lp-rv"><div class="eyebrow" style="color:#aeb9cc">NFL receptions props &middot; ${D.season} season</div>
        <h1>Every pick stamped. <em>Every result kept.</em></h1>
        <p>A model that prices every NFL receptions line at DraftKings and FanDuel. Members get each pick the moment it's made, sized for their bankroll, one tap from the bet slip. Every result stays public, wins and losses.</p>
        <div class="lp-ctas">${cta("gold")}</div>
        ${MEMBER ? "" : `<div class="lp-free"><span class="lp-free-l">Or start free: <b>today's free pick, every game day</b></span>
          <div class="lp-free-b">${login && !SIGNED_IN ? `<a class="lp-btn ghost" href="${esc(login)}?next=%2Fweek">Create free account</a>` : ""}${D.discord ? `<a class="lp-btn ghost dc" href="${esc(D.discord)}" target="_blank" rel="noopener">${brand("discord", 18)} Join the free Discord</a>` : ""}</div></div>`}
        <p class="lp-fine"><a href="receptions.html">See the full record</a> &middot; ${trial ? `${esc(trial)}, then ${esc(price)}/${esc(per)}. Cancel anytime. ` : ""}21+.${login ? ` <span class="nowrap">Members: <a href="${esc(login)}">log in</a>.</span>` : ""}</p></div>
      <div class="lp-shot lp-rv" aria-hidden="true">
        ${win("lineledgerpicks.com/week", `<div class="lp-tix">${sample(3).map(stubTicket).join("")}</div>`, "lp-back")}
        ${show.length ? `<div class="lp-front">${alertCard(show, 6)}</div>` : ""}</div></div>
      ${ledgerStrip(rec)}
      <div class="lp-stats lp-rv" data-fx="count" aria-label="The receptions record">
        ${stat(wl(r), "receptions record")}${stat(r.n ? pct(r.win, false) : "&ndash;", "win rate")}
        ${stat(r.sized != null ? num(r.sized, 1, true) + "u" : "&ndash;", "units won", tone(r.sized))}${stat(pct(r.sized_roi), "return on units risked", tone(r.sized_roi))}
        ${stat("100%", "of picks time-stamped")}</div>
      <p class="lp-stats-note">Every receptions pick since ${esc(D.since)}, at its posted size, updated with every result. <a href="receptions.html">See every pick &rarr;</a></p>`;

    const rows = [
      ["Instant alerts", "Every pick, the moment it's made",
        "Picks post to the members' Discord the second the model makes them, so your phone buzzes before the line moves. One tidy card per drop, grouped by game, biggest bets first.",
        show.length ? alertCard(show) : ""],
      ["This week's picks", "Every open pick, ready to bet",
        "Player, line, price, book and how sure the model is, on one page. Sharp-agrees picks are marked, and every ticket opens to the full detail: the lines at each book, the market's number, the closing line.",
        win("lineledgerpicks.com/week", `<div class="lp-list">${listView(sample(8))}</div>`, "wide")],
      ["Bet sizing", "Sized for your bankroll, in dollars",
        `Enter your bankroll once. Every pick shows the exact bet, rounded the way you'd actually type it, plus a button straight to DraftKings or FanDuel.${unit ? ` On a $1,000 bankroll, 1 unit is about ${money(unit)}.` : ""}`,
        win("lineledgerpicks.com/tools", `<div class="lp-size"><div class="lp-unit"><span>Your bankroll <b>$1,000</b></span><span>1 unit <b>${unit ? money(unit) : "&ndash;"}</b></span></div>
          <table class="tpk"><thead><tr><th>Pick</th><th class="num">Size</th><th class="num">Your bet</th></tr></thead><tbody>${sizeRows(sample(5))}</tbody></table></div>`)],
      ["Bet tracker", "Know what's left to bet",
        "Tick picks as you place them. The page keeps count of what you've bet, what's left, and how much, so you never double up or miss one.",
        win("lineledgerpicks.com/tools", `<div class="lp-size"><p class="tpk-sum"><b>${done.length} of ${trk.length}</b> bet &middot; ${money(sum(done))} placed &middot; <b>${money(sum(left))}</b> left to bet</p>
          <table class="tpk"><tbody>${sizeRows(trk, ticks)}</tbody></table></div>`)],
      ["The record", "A record you can check, not just trust",
        "Every pick since launch, graded at the close, with the time it was posted. Wins and losses stay up for good, so you can judge it before you pay a cent.",
        MKT("receptions") ? win("lineledgerpicks.com/receptions", `<div class="lp-chart" data-fx="draw">${unitsChart(MKT("receptions"))}</div>`) : ""]];
    $("app").innerHTML = `
      <section class="lp-live lp-rv" id="tour"><div class="lp-live-t"><div class="eyebrow">The real thing</div><h2>Take a look inside</h2>
          <p>This is the live site, right now: this ${esc(PERIOD.toLowerCase())}'s free pick, the sealed picks members already see, and every graded result. Members get it all unsealed.</p></div>
        <div class="lp-live-win"><div class="win-bar"><i></i><i></i><i></i><span>lineledgerpicks.com/week</span><b class="lp-live-tag">Live</b></div>
          <div class="lp-live-view" data-src="${href(F.home)}?tour=1"><div class="lp-cursor" aria-hidden="true"></div></div></div></section>
      <section class="lp-how lp-rv"><div class="eyebrow">How it works</div><h2>From the model to your bet slip</h2>
        <ol class="lp-steps">
          <li><b>The model prices every line</b><span>It projects each receiver's catches from his recent role and the matchup, then compares that to the lines at DraftKings and FanDuel.</span></li>
          <li><b>Members get the pick instantly</b><span>When a line looks wrong by enough, it's a pick: posted to members right away, sized, with a bet button.</span></li>
          <li><b>Every result goes on the record</b><span>Picks are stamped when made, sealed until kickoff, then revealed and graded in public. Nothing is edited or removed.</span></li></ol></section>
      <section class="lp-feats" id="features"><div class="eyebrow">What members get</div><h2>Everything you need to bet the picks</h2>
        ${show.length ? `<p class="lp-sub">Shown with real picks from ${esc(PERIOD)} ${showWeek}, the last fully graded ${esc(PERIOD.toLowerCase())}.</p>` : ""}
        ${rows.filter((x) => x[3]).map(([eb, t, d, vis], i) => `<div class="lp-row${i % 2 ? " flip" : ""}${vis.includes("lp-list") ? " wide-v" : ""}">
          <div class="lp-row-t lp-rv"><div class="eyebrow">${eb}</div><h3>${t}</h3><p>${d}</p></div>
          <div class="lp-row-v lp-rv" aria-hidden="true"><div class="lp-pan">${vis}</div></div></div>`).join("")}</section>
      <section class="lp-proof lp-rv"><div class="lp-proof-in"><div><div class="eyebrow" style="color:#aeb9cc">Don't trust us. Check us.</div><h2>A record nobody can edit, including us</h2>
          <p>Before kickoff, every pick is posted publicly as a <b>seal</b>: a code made from the pick that's impossible to fake or change later. At kickoff the pick is revealed, and anyone can check it against the seal.${sealedOpen().length ? ` Right now ${sealedOpen().length} pick${sealedOpen().length === 1 ? " is" : "s are"} sealed on the site.` : ""}</p>
          <div class="lp-ctas"><a class="lp-btn ghost" href="${href(F.home)}">See this week's seals</a><a class="lp-btn ghost" href="method.html">How it works</a></div></div>
        <ol class="lp-seal" data-fx="seal"><li><b>Sealed</b><code>7f3a9c41e2&hellip;</code><span>posted before kickoff</span></li><li><b>Revealed</b><code>UNDER 2.5 &middot; -130</code><span>at kickoff</span></li><li><b>Checked</b><code>&#10003; matches</code><span>by anyone</span></li></ol></div></section>
      <section class="lp-price" id="pricing"><div class="eyebrow">Pricing</div><h2>Simple pricing</h2>
        <div class="lp-plans">
          <article class="lp-plan lp-rv"><h3>Free account</h3><div class="lp-amt"><b>$0</b></div><ul>
            <li>A free pick every game day</li><li>This week's sealed picks, revealed at kickoff</li><li>Bet sizing, odds and player lookup tools</li><li>The full public record</li></ul>
            <a class="lp-btn ghost dark" href="${esc(signup || href(F.home))}">${signup ? "Create a free account" : "See this week"}</a></article>
          <article class="lp-plan pro lp-rv"><span class="lp-tag">Members</span><h3>Line Ledger</h3><div class="lp-amt"><b>${esc(price)}</b><span>/${esc(per)}</span></div>
            ${trial ? `<p class="lp-trial">${esc(trial)}</p>` : ""}<ul>
            <li>Every pick, the moment it's made</li><li>Phone alerts in the members' Discord</li><li>Sized in dollars for your bankroll</li><li>One-tap DraftKings / FanDuel buttons</li><li>Your bet tracker</li><li>Cancel anytime</li></ul>
            ${cta("gold")}${login && !SIGNED_IN ? `<a class="lp-login" href="${esc(login)}?next=%2Fweek">Already a member? Log in</a>` : ""}</article></div></section>
      <section class="lp-faq lp-rv"><div class="eyebrow">FAQ</div><h2>Questions</h2>
        ${faqHtml()}</section>
      <section class="lp-end lp-rv"><h2>Get the next pick the moment it's made.</h2><div class="lp-ctas">${cta("gold")}</div>
        <p class="lp-fine">21+ only. For information and entertainment; no pick is a guarantee and past results don't predict future ones. Gambling problem? Call or text 1-800-GAMBLER.</p></section>`;
    document.querySelectorAll(".win .cstub, .win .ticket").forEach((e) => e.classList.add("in"));
    liveTour();   // a picture: no per-ticket fade
    revealOnScroll();
  }
  // the live preview: the real This week page (tour mode: no sign-in wall, nothing clickable), drawn at desktop
  // width and scaled to fit, loaded only when it scrolls into view, and drifting slowly down the page and back
  function liveTour() {
    const box = document.querySelector(".lp-live-view");
    if (!box || typeof IntersectionObserver === "undefined") return;
    const W = 1440, H = 900;
    const fit = () => { const k = box.clientWidth / W; box.style.height = `${Math.round(H * k)}px`; const f = box.querySelector("iframe"); if (f) f.style.transform = `scale(${k})`; };
    let made = false;
    const make = () => {
      if (made) return;
      made = true; io.disconnect();
      const f = document.createElement("iframe");
      Object.assign(f, { src: box.dataset.src, title: "Line Ledger, live", loading: "lazy", tabIndex: -1 });
      f.setAttribute("aria-hidden", "true");
      Object.assign(f.style, { width: `${W}px`, height: `${H}px` });
      const stage = document.createElement("div"); stage.className = "lp-stage"; stage.appendChild(f);   // (no zoom)
      box.insertBefore(stage, box.firstChild); fit();
      f.addEventListener("load", () => demo(f), { once: true });
    };
    // load it when it comes near the screen (and, as a backup, check on scroll: some browsers skip the observer)
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) make(); }, { rootMargin: "200px" });
    io.observe(box);
    const near = () => { const r = box.getBoundingClientRect(); if (r.top < innerHeight + 200 && r.bottom > -200) make(); };
    addEventListener("scroll", near, { passive: true }); setTimeout(near, 400);
    addEventListener("resize", fit); fit();
  }
  // the live window's guided demo: the real site, clicked around by a visible cursor, on a loop (paused while the
  // window is off screen).  Each step finds its control on the live page, so it follows whatever the site looks like.
  function demo(f) {
    // someone using the real site: smooth scrolling, the three views (the full ticket opened in Tickets), the Open /
    // Live / Final tabs, search, the record and the player lookup.  A soft gold outline marks what's being shown.
    // Loops; pauses while the window is off screen.
    const box = f.closest(".lp-live-view"), cur = box.querySelector(".lp-cursor");
    const ring = document.createElement("div"); ring.className = "lp-ring"; box.appendChild(ring);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let on = true;
    new IntersectionObserver((xs) => { on = xs.some((x) => x.isIntersecting); }).observe(box);
    const k = () => box.clientWidth / 1440;
    const W = () => f.contentWindow, Dd = () => f.contentDocument, $$ = (sel) => Dd() && Dd().querySelector(sel);
    const point = (el) => { const r = el.getBoundingClientRect(); cur.style.left = `${(r.left + Math.min(r.width / 2, 70)) * k()}px`; cur.style.top = `${(r.top + r.height / 2) * k()}px`; };
    const mark = (el) => { const r = el.getBoundingClientRect(), kk = k(), pad = 6;
      Object.assign(ring.style, { left: `${(r.left - pad) * kk}px`, top: `${(r.top - pad) * kk}px`, width: `${(r.width + 2 * pad) * kk}px`, height: `${Math.min(r.height + 2 * pad, 880) * kk}px` });
      ring.classList.add("on"); };
    const unmark = () => ring.classList.remove("on");
    const glide = (to, ms = 1400) => new Promise((done) => {                 // eased scroll inside the live page
      const w = W(), from = w.scrollY, max = Dd().documentElement.scrollHeight - 900, end = Math.max(0, Math.min(max, to)), t0 = performance.now();
      const step = (t) => { const q = Math.min(1, (t - t0) / ms), e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        w.scrollTo(0, from + (end - from) * e); if (q < 1) setTimeout(() => step(performance.now()), 16); else done(); };
      step(performance.now()); });
    const into = async (el, top = 300) => { const r = el.getBoundingClientRect(); if (r.top < 140 || r.bottom > 820) await glide(W().scrollY + r.top - top, 900); };
    const tap = () => { cur.classList.add("tap"); setTimeout(() => cur.classList.remove("tap"), 350); };
    const click = async (sel, wait = 900, el0) => { const el = el0 || $$(sel); if (!el) return null; await into(el); point(el); await sleep(700); tap(); el.click(); await sleep(wait); return el; };
    const type = async (sel, text) => { const el = $$(sel); if (!el) return; await into(el); point(el); await sleep(650); el.focus(); el.value = "";
      for (const ch of text) { el.value += ch; el.dispatchEvent(new (W().Event)("input", { bubbles: true })); await sleep(115); } };
    const clear = (sel) => { const el = $$(sel); if (el) { el.value = ""; el.dispatchEvent(new (W().Event)("input", { bubbles: true })); } };
    const view = async (v) => { await click("#fbtn", 350); await click(`[data-view="${v}"]`, 450); await click("#fbtn", 450); };
    const show = async (el, hold = 2600, top = 150) => { if (!el) return; const r = el.getBoundingClientRect(); await glide(W().scrollY + r.top - top, 900); await sleep(250); mark(el); await sleep(hold); unmark(); await sleep(400); };
    const wait = async () => { while (!on) await sleep(400); };
    const shortName = () => { const n = $$(".ticket .t-player, .cstub .cs-player, .ltable .l-player"); return n ? n.textContent.trim().split(/\s+/).pop().slice(0, 5) : "Smith"; };
    (async () => {
      await sleep(800); cur.classList.add("on");
      for (;;) {
        await wait(); await glide(0, 500);
        await view("tickets");                                                                   // 1. Tickets view
        await glide(520, 1300); await sleep(250);
        { const tk = $$(".ticket"), sm = tk && tk.querySelector("details.drawer > summary");    //    ...the full ticket
          if (sm) { await click(null, 400, sm); await show(tk, 2600); await click(null, 400, sm); } }
        await glide(0, 1000);
        await wait(); await view("compact");                                                     // 2. Compact view
        { const row = $$(".cstub .cs-row"); if (row) { await click(null, 500, row); await show(row.closest(".cstub"), 1900); await click(null, 400, row); } }
        await wait(); await view("list");                                                        // 3. List view
        await glide(420, 1100); await sleep(250); await glide(0, 800);
        await wait(); for (const ph of ["final", "live", "open"]) await click(`[data-ph="${ph}"]`, 1300);   // the tabs
        await wait(); await click('.side a[href^="results"]', 1200);                                         // the record
        await glide(650, 1800); await sleep(500);
        await wait(); await click('.side a[href^="receptions"]', 1200);                                      // the receptions record
        await glide(380, 1500); await sleep(900); { const ch = $$(".charts .chart, .chart"); if (ch) await show(ch, 2400, 160); }
        await wait(); await click('.side a[href*="#player"]', 1400);                                         // player lookup
        await type("#l-q", shortName()); await sleep(700);
        { const li = $$("#l-list li"); if (li) { point(li); await sleep(600); tap(); li.dispatchEvent(new (W().MouseEvent)("mousedown", { bubbles: true })); await sleep(1300); }
          await show($$("#l-out"), 2800, 120); }
        await wait(); await click('.side a[href^="week"]', 1300);                                            // and back
      }
    })();
  }
  // sections slide up and fade in as they come into view; the hero's product shot drifts a little slower than the
  // page.  Off for anyone whose device asks for reduced motion (and where the browser can't tell when things show)
  function revealOnScroll() {
    const els = [...document.querySelectorAll(".lp-rv, [data-fx]")];
    if (typeof IntersectionObserver === "undefined" || /[?&]still/.test(location.search)) { els.forEach((e) => e.classList.add("in")); return; }   // ?still: no motion (screenshots)
    document.documentElement.classList.add("lp-rv-on");
    const io = new IntersectionObserver((xs) => xs.forEach((x) => { if (!x.isIntersecting) return;
      x.target.classList.add("in"); io.unobserve(x.target); const f = FX[x.target.dataset.fx]; if (f) f(x.target); }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach((e) => io.observe(e));
    const strip = document.querySelector(".lp-ledger svg");
    const back = document.querySelector(".lp-back"), front = document.querySelector(".lp-front");
    const pans = [...document.querySelectorAll(".lp-pan")];
    let ticking = false;
    const frame = () => {
      const y = Math.min(scrollY, 900), wide = innerWidth >= 900, h = innerHeight;
      if (back && wide) back.style.transform = `translateY(${y * -0.06}px)`;
      if (front && wide) front.style.transform = `translateY(${y * -0.16}px) rotate(1.2deg)`;
      if (strip) strip.style.transform = `translateX(${y * -0.12}px)`;
      pans.forEach((el) => {                    // 0 when the picture is centred on screen, up to +-1 at the edges
        const r = el.parentElement.getBoundingClientRect(), k = Math.max(-1, Math.min(1, (r.top + r.height / 2 - h / 2) / h));
        el.style.transform = `translateY(${k * (wide ? 70 : 36)}px)`;
      });
      ticking = false;
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    frame();
  }

  // the record as a barcode (the brand's line): the last graded picks in order, a bar up for each win and down for
  // each loss, as tall as what it won or lost; a gold dot where today is
  function ledgerStrip(ps) {
    const g = ps.filter((p) => p.phase === "final" && p.pl_u != null).sort(byKick).slice(-140);
    if (g.length < 10) return "";
    const W = g.length * 9 + 30, mid = 50, top = Math.max(...g.map((p) => Math.abs(p.pl_u))) || 1;
    const bars = g.map((p, i) => { const h = 6 + 38 * Math.min(1, Math.abs(p.pl_u) / top), up = p.pl_u > 0;
      return `<rect x="${i * 9}" y="${up ? mid - h : mid}" width="3" height="${h.toFixed(1)}" rx="1.5" class="${up ? "w" : p.pl_u < 0 ? "l" : "p"}" style="--d:${i * 9}ms"/>`; }).join("");
    return `<div class="lp-ledger-wrap"><div class="lp-ledger lp-rv" aria-hidden="true"><svg viewBox="0 0 ${W} 100" preserveAspectRatio="xMinYMid meet" style="width:${W}px">
      <line x1="0" x2="${W + 2000}" y1="${mid}" y2="${mid}" class="base"/>${bars}<circle cx="${g.length * 9 + 12}" cy="${mid}" r="6" class="now"/></svg></div>
      <span class="lp-ledger-k">The record, pick by pick (last ${g.length}): <i class="w"></i> win <i class="l"></i> loss</span></div>`;
  }
  // landing effects, run once as each piece comes into view
  const FX = {
    count(el) {                                   // the record's numbers count up
      el.querySelectorAll("b").forEach((b) => { const m = b.textContent.match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
        if (!m || /^-\d/.test(m[3])) return;
        const [, sign, n, rest] = m, to = parseFloat(n), dec = (n.split(".")[1] || "").length, t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / 1100), q = 1 - Math.pow(1 - k, 3); b.textContent = `${sign}${(to * q).toFixed(dec)}${rest}`; if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step); });
    },
    draw() {},                                    // the chart draws itself: CSS, on .in
    seal(el) {                                    // the seal scrambles, the pick is revealed, then it checks out
      const codes = el.querySelectorAll("code"), finals = [...codes].map((c) => c.innerHTML), hex = "0123456789abcdef";
      codes.forEach((c, i) => { if (i) c.style.opacity = "0"; });
      let n = 0;
      const t = setInterval(() => { codes[0].textContent = Array.from({ length: 10 }, () => hex[Math.floor(Math.random() * 16)]).join("") + "\u2026";
        if (++n > 14) { clearInterval(t); codes[0].innerHTML = finals[0];
          setTimeout(() => { codes[1].style.opacity = "1"; codes[1].classList.add("pop"); }, 350);
          setTimeout(() => { codes[2].style.opacity = "1"; codes[2].classList.add("pop"); }, 1100); } }, 60);
    },
  };

  const PAGES = { landing, home, tools: toolsPage, open: openPage, results: resultsPage, clv: clvPage, method, soon: soonPage, player: playerPage, parlays: parlaysPage, market: () => marketPage(pageMarket) };
  // the free-account gate: This week, Tools and Parlays ask visitors to sign in (free) first; the landing page, the
  // record, results, player pages and How it works stay open to everyone
  function gatePage() {
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    const what = { home: `This ${PERIOD.toLowerCase()}'s picks`, tools: "The betting tools", parlays: "The model's parlays" }[page] || "This page";
    const nSealed = sealedOpen().length;
    hero("Free account", `${esc(what)}, <em>free with an account</em>`, "Sign in with Whop in a few seconds. No card needed.");
    $("app").innerHTML = `<section class="gate"><div class="gate-card">
        <div class="gate-lock">${LOCK}</div>
        <h2>Sign in to keep going</h2>
        <ul><li>Today's free pick, every game day</li><li>${nSealed ? `${nSealed} sealed pick${nSealed === 1 ? "" : "s"} this ${PERIOD.toLowerCase()}, revealed at kickoff` : `This ${PERIOD.toLowerCase()}'s sealed picks, revealed at kickoff`}</li>
          <li>Bet sizing, odds and player lookup tools</li></ul>
        <div class="lp-ctas"><a class="lp-btn gold" href="${esc(D.login_url)}?next=${back}">Create a free account</a><a class="lp-btn ghost dark" href="${esc(D.login_url)}?next=${back}">Sign in</a></div>
        <p class="muted">Already paying? Sign in and every pick shows up here. Want them all now? ${D.join_url ? `<a href="${esc(D.join_url)}">Start your ${esc((D.offer || {}).trial || "membership")}</a>.` : ""}</p>
        <p class="muted">The full record stays open to everyone: <a href="${F.results}">every pick and every result</a>.</p>
      </div></section>`;
  }
  // one clear line above the page for the moments people get stuck: just joined (connect Discord), Whop still
  // recording the purchase (keeps checking), or signed in to a Whop account that has no membership (switch / join)
  function notice() {
    const qs = new URLSearchParams(location.search), w = qs.get("welcome"), app = $("app");
    if (!app || TOUR || page === "landing" || !D.login_url) return;
    const trial = esc((D.offer || {}).trial || "membership");
    const box = (cls, html) => app.insertAdjacentHTML("beforebegin", `<div class="wrap ll-note-wrap"><div class="ll-note ${cls}" role="status">${html}</div></div>`);
    const dcBtn = D.discord_link ? `<a class="lp-btn gold" href="/auth/discord">${brand("discord", 18)} Connect Discord</a>` : "";
    if (!SIGNED_IN && qs.get("switch") === "1") {      // Whop keeps its own sign-in: only the person can end it
      box("warn", `<div><b>You're logged out of Line Ledger.</b> Whop still remembers the last account on this browser, so to use a different one:
          <span class="ll-note-sub"><b>1.</b> Open whop.com, tap your profile picture, then <b>Log out</b>. <b>2.</b> Come back here and tap <b>Log in</b>, using the email from your Whop receipt.</span></div>
          <div class="ll-note-acts"><a class="lp-btn ghost" href="https://whop.com/" target="_blank" rel="noopener">Open whop.com</a><a class="lp-btn gold" href="${esc(D.login_url)}?next=%2Fweek">Log in</a></div>`);
      return;
    }
    if (MEMBER && w === "1") {
      const linked = ck("ll_d") === "1";
      box("ok", `<div><b>You're in &#10003;</b> Every pick is unlocked on this site${OWNER ? "." : linked
        ? ", and your Discord is connected: picks post in #alerts." : `. <b>Last step:</b> connect Discord to get a phone alert for every pick in #alerts.`}</div>
        ${OWNER || linked ? "" : dcBtn}`);
      return;
    }
    if (MEMBER && !OWNER && D.discord_link && ck("ll_d") !== "1" && ["home", "open"].includes(page)
        && +(store.get("ll-dc-until") || 0) < Date.now()) {
      box("dc", `<div class="dc-l">${brand("discord", 22)}<div><b>Get every pick on your phone.</b>
          <span class="ll-note-sub">Connect Discord once: picks ping you in #alerts the moment they're made.</span></div></div>
        <div class="ll-note-acts">${dcBtn}<button class="lp-btn ghost" id="dc-later">Later</button></div>`);
      const later = $("dc-later");
      if (later) later.onclick = () => { store.set("ll-dc-until", String(Date.now() + 3 * 864e5)); document.querySelectorAll(".ll-note-wrap").forEach((x) => x.remove()); };
      return;
    }
    if (MEMBER || !SIGNED_IN) return;
    const who = WHO ? `<b>${esc(WHO)}</b>` : "this account";
    const stuck = () => box("warn", `<div><b>No membership on this Whop account.</b> You're signed in as ${who}.
        <span class="ll-note-sub">Just paid? You may have checked out under a different email: log out at whop.com, then sign in again here with the email from your Whop receipt.</span></div>
        <div class="ll-note-acts">${D.join_url ? `<a class="lp-btn gold" href="${esc(D.join_url)}">Start your ${trial}</a>` : ""}<a class="lp-btn ghost" href="/auth/logout?then=switch">Switch account</a></div>`);
    if (w !== "pending" || typeof fetch !== "function") { stuck(); return; }
    box("wait", `<div><b>Confirming your membership with Whop&hellip;</b> This takes a few seconds after checkout.</div>`);
    let n = 0;
    const tick = () => fetch("/api/me?recheck=1", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}))
      .then((me) => {
        if (me.member) { location.replace("/week?welcome=1"); return; }
        if (++n < 10) { setTimeout(tick, 3000); return; }
        document.querySelectorAll(".ll-note-wrap").forEach((x) => x.remove()); stuck();
      });
    setTimeout(tick, 2000);
  }
  if (TOUR) document.documentElement.classList.add("tour");                  // the landing page's live preview (an iframe)
  // the home-screen app opens This week (older installs saved week.html as their start page); signed out, it shows
  // the front page instead - features, pricing and the free trial - like the website does
  // (only as the app opens: a tap on Week later still shows the free-account page).  A browser tab gets the same rule:
  // signed out and arriving at /week from outside the site (typed, autofilled, bookmarked) shows the front page first
  const opening = (() => { try { if (sessionStorage.getItem("ll-open")) return false; sessionStorage.setItem("ll-open", "1"); return true; } catch (e) { return false; } })();
  const fromOutside = (() => { try { return !document.referrer || new URL(document.referrer).origin !== location.origin; } catch (e) { return true; } })();
  if (D.landing && D.gate && D.login_url && !SIGNED_IN && !TOUR && page === "home" && (standalone() || fromOutside) && !location.search && opening) { location.replace("./"); return; }
  if (D.gate && D.login_url && !SIGNED_IN && !TOUR && ["home", "tools", "parlays"].includes(page) && !(page === "tools" && location.hash === "#alerts")) gatePage();
  else (PAGES[page] || home)();
  notice();
  if (canInstall() && !window.__llIbTimer) {
    let seen = false;
    try { seen = !!sessionStorage.getItem("ll-ib-seen"); } catch (e) {}
    if (!seen) window.__llIbTimer = setTimeout(() => { window.__llIbTimer = null; installBar(false); }, 6000);
  }
};

/* ------------------------------------------------------------------ instant page switching
   The site loads once; following a link to another page of the site redraws it in place (no reload of the page
   or of the picks data), and the back button works as usual.  Each redraw starts from the original page shell;
   listeners and timers the previous page added to the document/window are dropped first. */
(function () {
  const RAW = window.DATA;
  const ROUTES = (RAW && RAW.routes) || {};
  const ET = typeof EventTarget !== "undefined" && EventTarget.prototype.addEventListener;
  const routerOk = !!(ET && typeof document !== "undefined" && document instanceof EventTarget && window.history && window.history.pushState
    && typeof structuredClone === "function" && Object.keys(ROUTES).length);
  if (!routerOk) { window.LL_BOOT(); return; }
  const SHELL = document.body.innerHTML;
  let ac = null, timers = [];
  const withSig = (o) => (o === undefined ? { signal: ac.signal } : typeof o === "boolean" ? { capture: o, signal: ac.signal } : { ...o, signal: ac.signal });
  document.addEventListener = function (t, f, o) { return ET.call(document, t, f, withSig(o)); };
  window.addEventListener = function (t, f, o) { return ET.call(window, t, f, withSig(o)); };
  const SI = window.setInterval.bind(window);
  window.setInterval = function (f, ms, ...a) { const id = SI(f, ms, ...a); timers.push(id); return id; };
  const boot = () => { ac = new AbortController(); window.DATA = structuredClone(RAW); window.LL_BOOT(); };
  const route = (path) => { let p = path.replace(/^\/+/, ""); if (p === "" || p.endsWith("/")) p += "index.html"; if (!/\.html$/.test(p)) p += ".html"; return ROUTES[p] ? [p, ROUTES[p]] : null; };
  function go(href, push) {
    const u = new URL(href, location.href), r = route(u.pathname);
    if (!r) return false;
    const [, [page, market, sport, title]] = r;
    const g = document.querySelector(".bbar .bb-glass"), was = g ? [g.style.getPropertyValue("--x"), g.style.getPropertyValue("--w")] : null;
    ac.abort(); timers.forEach(clearInterval); timers = [];
    if (push) history.pushState({}, "", u.href);
    document.body.innerHTML = SHELL;
    document.body.className = ""; delete document.body.dataset.side;
    Object.assign(document.body.dataset, { page, market, sport });
    document.title = title;
    boot();
    if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView();
    else window.scrollTo(0, 0);
    // the phone bar's bubble slides from the old tab to the new one
    const g2 = document.querySelector(".bbar .bb-glass"), bar = document.querySelector(".bbar");
    if (g2 && was && was[0]) {
      const to = [g2.style.getPropertyValue("--x"), g2.style.getPropertyValue("--w")];
      bar.classList.remove("ready"); g2.style.setProperty("--x", was[0]); g2.style.setProperty("--w", was[1]);
      void g2.offsetWidth; bar.classList.add("ready");
      requestAnimationFrame(() => { g2.style.setProperty("--x", to[0]); g2.style.setProperty("--w", to[1]); });
    }
    if (window.goatcounter && window.goatcounter.count) try { window.goatcounter.count({ path: u.pathname + u.search }); } catch (e) {}
    return true;
  }
  // after the page's own click handlers (window hears a click after the document), so they can still cancel it
  ET.call(window, "click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.getAttribute("href").startsWith("#")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || /^\/(auth|api)\//.test(u.pathname)) return;
    const same = u.pathname === location.pathname && u.search === location.search;
    if (same && document.body.dataset.page !== "tools") return;              // an anchor on this page: the browser scrolls
    if (go(u.href, true)) e.preventDefault();
  });
  ET.call(window, "popstate", () => { if (!go(location.href, false)) location.reload(); });
  boot();
})();
