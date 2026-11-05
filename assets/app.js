/* Line Ledger: renders every page from data.js (window.DATA, written by `python nfl.py publish`).
   Sport- and market-agnostic: tabs, pages and labels come from DATA.sports and DATA.markets, so another sport or
   market is a data change, not a code change. */
(function () {
  const D = window.DATA;
  const page = document.body.dataset.page;
  const pageMarket = document.body.dataset.market;
  const $ = (id) => document.getElementById(id);
  const SPORTS = D.sports && D.sports.length ? D.sports
    : [{ key: "nfl", name: "NFL", period: "Week", event: "kickoff", markets: Object.keys(D.props), files: { home: "index.html", open: "open.html", results: "results.html" } }];
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  // this page's sport; the shared pages (CLV, How it works) keep the sport you came from (?sport=, else the last one seen)
  const pageSport = document.body.dataset.sport;
  const SPORT = SPORTS.find((s) => s.key === (pageSport || new URLSearchParams(location.search).get("sport") || store.get("ll-sport"))) || SPORTS[0];
  if (pageSport) store.set("ll-sport", pageSport);
  const PERIOD = SPORT.period || "Week";
  const MK = (D.markets || Object.keys(D.props)).filter((k) => D.props[k] && (SPORT.markets || []).includes(k));
  const href = (file) => file === "index.html" ? "./" : file;
  const MKT = (k) => D.props[k];

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const odds = (p) => p == null ? "&ndash;" : (p > 0 ? "+" : "") + p;
  const sgn = (v) => (v > 0 ? "+" : "");
  const pct = (v, sign = true) => v == null ? "&ndash;" : (sign ? sgn(v) : "") + v.toFixed(1) + "%";
  const num = (v, d, sign) => v == null ? "&ndash;" : (sign ? sgn(v) : "") + v.toFixed(d);
  const tone = (v) => v == null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "up" : "down";
  const wl = (r) => r && r.n ? `${r.W}-${r.L}${r.P ? "-" + r.P : ""}` : "0-0";
  const SHARP = { agrees: "Sharp agrees", against: "Sharp against", neutral: "Sharp neutral", "no line": "No sharp line" };
  const SEAL = { W: "Win", L: "Loss", P: "Push", VOID: "Void" };
  const sharpChip = (s, atClose) => s ? `<span class="chip ${s === "no line" ? "noline" : s}" title="Pinnacle's ${atClose ? "closing" : "latest"} line">${SHARP[s] || esc(s)}${atClose ? " &middot; close" : ""}</span>` : "";
  const abbr = (b) => ({ DraftKings: "DK", FanDuel: "FD", Pinnacle: "PIN" }[b] || b || "");

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
  const pageOf = (p) => `${MKT(p.prop).slug}.html`;
  const linkTo = (p) => new URL(`${pageOf(p)}?season=${p.season}&week=${p.week}#${p.serial}`, location.href).href;
  const byKick = (a, b) => (a.kick_utc || "").localeCompare(b.kick_utc || "") || MK.indexOf(a.prop) - MK.indexOf(b.prop);
  const openNow = allPicks.filter((p) => p.phase !== "final").sort(byKick);
  const seasons = [...new Set(allPicks.map((p) => p.season))].sort((a, b) => b - a);
  const periodsOf = (season, picks = allPicks) => [...new Set(picks.filter((p) => p.season === season).map((p) => p.week))].sort((a, b) => b - a);

  /* ------------------------------------------------------------------ navigation (built from the markets)
     Three kinds of page, kept apart: the places you go each week (This week, Open, Results, Parlays) as tabs; the
     records (one per market, plus closing line value) under one Records menu; How it works on the right.  Phones
     get the places as a bottom tab bar, the rest under More. */
  const F = SPORT.files || {};
  const keep = SPORT === SPORTS[0] ? "" : `?sport=${SPORT.key}`;
  const ICON = {
    week: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    open: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    results: '<path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/>',
    parlays: '<path d="M8 7h11M8 12h11M8 17h11"/><circle cx="4.5" cy="7" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17" r="1"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>' };
  const svg = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const places = (SPORT.markets || []).length
    ? [["home", href(F.home), `This ${PERIOD.toLowerCase()}`, "week"], ["open", F.open, "Open", "open"], ["results", F.results, "Results", "results"],
       ...(F.parlays ? [["parlays", F.parlays, "Parlays", "parlays"]] : [])]
    : [["soon", href(F.home), "Overview", "week"]];
  const records = [...MK.map((k) => [`m:${k}`, `${MKT(k).slug}.html`, MKT(k).label]), ["clv", `clv.html${keep}`, "Closing line value"]];
  const how = ["method", `method.html${keep}`, "How it works"];
  const here = page === "market" ? `m:${pageMarket}` : page;
  const cur = (id) => id === here ? ' aria-current="page"' : "";
  const openBadge = (id) => id === "open" ? `<span class="badge" data-open-count hidden></span>` : "";
  const sportSwitch = SPORTS.length < 2 ? "" : `<div class="sports" role="group" aria-label="Sport">${SPORTS.map((s) =>
    `<a href="${href(s.files.home)}"${s.key === SPORT.key ? ' aria-current="true"' : ""}>${esc(s.name)}${(s.markets || []).length ? "" : "<small>soon</small>"}</a>`).join("")}</div>`;
  const inRecords = records.some(([id]) => id === here);
  $("tabs").innerHTML = sportSwitch + places.map(([id, link, label]) => `<a href="${link}"${cur(id)}>${esc(label)}${openBadge(id)}</a>`).join("")
    + `<details class="navmenu"><summary${inRecords ? ' aria-current="page"' : ""}>Records<i aria-hidden="true"></i></summary><div class="navpop">
        ${records.map(([id, link, label]) => `<a href="${link}"${cur(id)}>${esc(label)}</a>`).join("")}
        <a class="how-in-menu" href="${how[1]}"${cur(how[0])}>${how[2]}</a></div></details>`;
  document.querySelector(".navr").insertAdjacentHTML("afterbegin", `<a class="navhow" href="${how[1]}"${cur(how[0])}>${how[2]}</a>`);
  // phones: the places as a bottom tab bar, everything else in the More sheet
  document.body.insertAdjacentHTML("beforeend", `<nav class="bbar" aria-label="Pages">${places.map(([id, link, label, ic]) =>
      `<a href="${link}"${cur(id)}>${svg(ic)}<span>${esc(id === "home" ? PERIOD : label)}</span>${openBadge(id)}</a>`).join("")}
      <button type="button" id="bmore" aria-expanded="false" aria-controls="msheet"${inRecords || here === "method" ? ' aria-current="page"' : ""}>${svg("more")}<span>More</span></button></nav>
    <div class="msheet" id="msheet" hidden><div class="ms-in">${sportSwitch}<div class="eyebrow">Records</div>
      ${records.map(([id, link, label]) => `<a href="${link}"${cur(id)}>${esc(label)}<i aria-hidden="true">&rsaquo;</i></a>`).join("")}
      <div class="eyebrow">About</div><a href="${how[1]}"${cur(how[0])}>${how[2]}<i aria-hidden="true">&rsaquo;</i></a></div></div>`);
  if (openNow.length) document.querySelectorAll("[data-open-count]").forEach((b) => { b.textContent = openNow.length; b.hidden = false; });
  const navbar = $("navbar");
  const onScroll = () => navbar.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const setSheet = (open) => { $("msheet").hidden = !open; $("bmore").setAttribute("aria-expanded", String(open)); document.body.classList.toggle("sheet-open", open); };
  $("bmore").addEventListener("click", (e) => { e.stopPropagation(); setSheet($("msheet").hidden); });
  const closeMenus = () => { setSheet(false); document.querySelectorAll(".navmenu[open]").forEach((d) => d.removeAttribute("open")); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".navmenu, .ms-in, #bmore")) closeMenus(); });
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
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; const w = $("install"); if (w) w.querySelector("span").textContent = "Tap here to install Line Ledger on this device."; });
  document.addEventListener("click", async (e) => {
    if (!e.target.closest("#install")) return;
    e.preventDefault();
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (err) {} installEvt = null; }
  });

  /* ------------------------------------------------------------------ shared state: period, view, search, market */
  const qs = new URLSearchParams(location.search);
  const state = { season: Number(qs.get("season")) || D.season, week: qs.get("week") === "all" ? "all" : Number(qs.get("week")) || null,
                  view: store.get("ll-view") || "compact", q: "", market: "all" };
  let redraw = () => {};
  const VIEWS = [["tickets", "Tickets"], ["compact", "Compact"], ["list", "List"]];
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
    return [p.player, p.team, p.opp, p.serial].some((x) => String(x || "").toLowerCase().includes(q));
  };
  function pickers(picks, allowAll) {
    if (!seasons.length) return "";
    const ps = periodsOf(state.season, picks);
    if (state.week !== "all" && !ps.includes(state.week)) state.week = allowAll ? "all" : ps[0] ?? null;
    return `<div class="pickers">
      <label><span>Season</span><select id="pk-season">${seasons.map((s) => `<option value="${s}"${s === state.season ? " selected" : ""}>${s}</option>`).join("")}</select></label>
      <label><span>${PERIOD}</span><select id="pk-week">${allowAll ? `<option value="all"${state.week === "all" ? " selected" : ""}>All</option>` : ""}${ps.map((w) => `<option value="${w}"${w === state.week ? " selected" : ""}>${PERIOD} ${w}</option>`).join("")}</select></label>
    </div>`;
  }
  const syncUrl = () => { const u = new URL(location.href); u.searchParams.set("season", state.season); u.searchParams.set("week", state.week); history.replaceState(null, "", u); };
  document.addEventListener("change", (e) => {
    if (e.target.id === "pk-season") { state.season = Number(e.target.value); state.week = null; syncUrl(); redraw(true); }
    if (e.target.id === "pk-week") { state.week = e.target.value === "all" ? "all" : Number(e.target.value); syncUrl(); redraw(true); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "q") { state.q = e.target.value.trim(); redraw(false); } });
  document.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) { state.view = v.dataset.view; store.set("ll-view", state.view); document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view))); redraw(false); return; }
    const fb = e.target.closest("button[data-f]");
    if (fb) { const k = fb.dataset.f; if (k === "clear") state.f.clear(); else state.f.has(k) ? state.f.delete(k) : state.f.add(k);
      document.querySelectorAll(".fchips").forEach((el) => { el.outerHTML = filterChips(); }); redraw(false); return; }
    const m = e.target.closest("button[data-market]");
    if (m) { state.market = m.dataset.market; document.querySelectorAll("button[data-market]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.market === state.market))); redraw(false); return; }
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
  const afterDraw = () => { reveal(); countdowns(); filterCount(); };
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button.share");
    if (!b) return;
    const p = byId[b.dataset.serial], url = new URL(`p/${p.serial}.html`, location.href).href, text = `${p.player} ${p.side} ${p.line} (${odds(p.price)}) - Line Ledger`;
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
  const playerLink = (p) => p.pid ? `<a class="plink" href="${playerHref(p.pid)}" title="Every pick on ${esc(p.player)}">${esc(p.player)}</a>` : esc(p.player);

  /* ------------------------------------------------------------------ status of a pick: open / live / grading / final */
  function status(p, short) {
    if (p.phase === "final" && p.void_reason) return `<span class="pill res-VOID" title="Voided: ${esc(p.void_reason)}">Voided</span>`;
    if (p.phase === "final") return `<span class="pill res-${p.result}">${SEAL[p.result] || p.result}</span>`;
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
    if (p.sharp_line != null) rows.push([`Pinnacle${p.sharp_close ? " at close" : ""}`, `${p.sharp_line} ${odds(p.sharp_over)}/${odds(p.sharp_under)}`]);
    if (p.market != null) rows.push(["Market's number", `${num(p.market, P.dec)} <span class="muted">vs model ${num(p.model, P.dec)}</span>`]);
    if (p.playable_to != null) rows.push(["Playable to", `${odds(p.playable_to)} <span class="muted">at ${p.line}: the worst price that still clears the ${D.min_ev ?? 2}% value bar</span>`]);
    rows.push(["Start", when(p.kick_utc, p.kick)]);
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
    const tip = `${p.book} ${what}: ${p.player} ${MKT(p.prop).short || MKT(p.prop).label} ${p.side} ${p.line}. Nothing is placed for you.`;
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
        <div class="t-meta"><span class="t-game">${gameLabel(p)}<span>${when(p.kick_utc, p.kick)}</span></span>${sharpChip(p.sharp, p.sharp_close)}</div>
        <div class="t-player">${playerLink(p)}</div>
        <div class="t-pick"><span><b>${p.side} ${p.line}</b><small>${odds(p.price)} ${esc(p.book)}</small></span>${p.result ? "" : status(p)}</div>
        ${p.phase === "open" && p.playable_to != null ? `<div class="final">Playable to <b>${odds(p.playable_to)}</b> &middot; <span class="muted">${esc(P.short || P.label)}</span></div>` : ""}        ${final}
        ${p.result ? `<div class="seal ${p.result}" aria-label="${SEAL[p.result]}">${SEAL[p.result]}</div>` : ""}
      </div>
      <div class="clv"><div class="clv-h">${head}</div>${compare(p, P)}</div>
      <div class="stats"><span>Model<b>${num(p.model, P.dec)}</b></span><span>Win<b>${pct(p.win, false)}</b></span><span>EV<b>${pct(p.ev)}</b></span><span>Size<b>${num(p.units, 1)}u${p.pl_u != null ? ` <i class="${tone(p.pl_u)}">&rarr; ${num(p.pl_u, 2, true)}u</i>` : ""}</b></span></div>
      ${details(p, P)}
      <div class="stub">
        <div><span class="serial">No. ${esc(p.serial)}</span><span class="when">Stamped ${when(p.stamped_utc, p.stamped)}${p.verify ? ` &middot; <a class="verify" href="${esc(p.verify)}" target="_blank" rel="noopener noreferrer" title="The public commit that first posted this pick: ${when(p.posted_utc, p.posted_at)}${p.posted_before ? ", before the start" : ""}">verify &nearr;</a>` : ""}</span></div>
        <div class="stub-r">${p.pre ? `<span class="chip pre">pre-launch</span>` : p.paper ? `<span class="chip paper">paper</span>` : ""}${betButton(p)}${parlayButton(p)}<button type="button" class="share" data-serial="${esc(p.serial)}" aria-label="Share this pick">Share</button>${barcode(p.serial)}</div>
      </div>
    </article>`;
  }

  /* ------------------------------------------------------------------ compact stub + list row (both open into the ticket) */
  function clvMini(p) {
    if (p.closed && p.clv_ev != null) return `<span class="cs-clv ${tone(p.clv_ev)}">CLV ${pct(p.clv_ev)}</span>`;
    if (p.phase === "open") { const w = moveWord(p).replace(/<\/?b[^>]*>/g, ""); return `<span class="cs-clv ${w === "Your way" ? "up" : w === "Against" ? "down" : "muted"}">${w === "&ndash;" ? "no move yet" : w.toLowerCase()}</span>`; }
    return `<span class="cs-clv muted">close pending</span>`;
  }
  function stubTicket(p) {
    const P = MKT(p.prop);
    return `<article class="cstub${p.result ? " graded r-" + p.result : ""}" id="${esc(p.serial)}" data-serial="${esc(p.serial)}" style="${band(p)}">
      <button type="button" class="cs-row" aria-expanded="false" aria-label="${esc(p.player)} ${p.side} ${p.line}: show the full ticket">
        <span class="cs-l">
          <span class="cs-meta">${gameLabel(p)}<span class="cs-mk">${esc(P.short || P.label)}</span></span>
          <span class="cs-player">${esc(p.player)}</span>
          <span class="cs-pick"><b>${p.side} ${p.line}</b> ${odds(p.price)} <small>${esc(abbr(p.book))}</small></span>
        </span>
        <span class="cs-r">${status(p, true)}${clvMini(p)}${p.sharp ? `<span class="cs-sharp ${p.sharp === "no line" ? "noline" : p.sharp}" title="${SHARP[p.sharp] || ""}">${p.sharp === "no line" ? "&ndash;" : p.sharp === "agrees" ? "sharp &#10003;" : p.sharp === "against" ? "sharp &#10007;" : "sharp ~"}</span>` : ""}</span>
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
        <td class="mono l-pick">${p.side} ${p.line} <span class="l-px">${odds(p.price)} <span class="muted">${esc(abbr(p.book))}</span></span></td>
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
  function tote(rec, P, compact) {
    const r = rec[0] || { n: 0 };
    const n = r.n_clv || 0;
    const cells = [["key", `<b class="${tone(r.clv_ev)}">${pct(r.clv_ev)}</b>`, `value vs close <em class="n">n=${n}${n < 50 ? ", early" : ""}</em>`],
      ["", `<b>${r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%"}</b>`, "beat the close"],
      ["", `<b>${wl(r)}</b>`, P.paper ? "paper record" : "record"],
      ["", `<b class="${tone(r.sized)}">${r.sized != null ? num(r.sized, 2, true) + "u" : "&ndash;"}</b>`,
        `units${r.sized_roi != null ? ` &middot; ROI ${pct(r.sized_roi)}` : ""} <em class="n">1u each: ${r.n ? num(r.units, 2, true) + "u" : "&ndash;"}</em>`]];
    return `<div class="tote${compact ? " compact" : ""}">${cells.map(([c, b, s]) => `<div class="${c}">${b}<span>${s}</span></div>`).join("")}</div>`;
  }
  const scoreboard = () => `<div class="boards">${MK.map((k) => { const P = MKT(k);
    return `<a class="sb" href="${P.slug}.html"><div class="sb-h"><span>${esc(P.label)}</span>${P.paper ? `<span class="chip paper">paper</span>` : `<span class="chip rec">the record</span>`}</div>${tote(P.record, P, true)}</a>`; }).join("")}</div>`;
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
        <td class="num opt ${tone(x.sized_roi)}">${pct(x.sized_roi)}</td><td class="num opt ${tone(x.units)}">${x.n ? num(x.units, 2, true) : "&ndash;"}</td><td class="num key ${tone(x.clv_ev)}">${pct(x.clv_ev)}${earlyNote(x.n_clv)}</td><td class="num opt">${x.beat == null ? "&ndash;" : x.beat.toFixed(0) + "%"}</td></tr>`).join("")}</tbody></table></div>`;
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
      ${D.discord ? `<a class="way" href="${esc(D.discord)}"><b>Discord</b><span>Join the picks channel and turn on notifications: your phone buzzes the moment a pick is posted.</span></a>` : ""}
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
  const toolbar = (pick, withMarket = true, panel = "") => `<div class="ctl"><div class="toolbar"><div class="tb-l">${pick}<span class="tb-jump" id="tb-jump"></span></div>
      <span class="tb-r">${searchBox()}<button type="button" class="fbtn" id="fbtn" aria-expanded="${state.fopen}" aria-controls="fpanel">${FUNNEL}<span>Filter</span><b class="fcount" id="fcount" hidden></b></button>${viewBar()}</span></div>
    <div class="fpanel" id="fpanel"${state.fopen ? "" : " hidden"}>${withMarket ? `${marketSeg()}${filterChips()}` : ""}${panel}</div></div>`;
  function filterCount() {
    const b = $("fcount"), panel = $("fpanel");
    if (!b || !panel || !panel.querySelectorAll) return;
    const n = [...panel.querySelectorAll('button[aria-pressed="true"]')].filter((x) => x.dataset.market !== "all" && x.dataset.k !== "all").length;
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
    return `<a class="mt" href="${linkTo(p)}" style="${band(p)}" aria-label="${esc(p.player)} ${p.side} ${p.line}">
      <span class="m-top"><span class="gteams">${gameLabel(p)}</span>${status(p, true)}</span><span class="m-player">${esc(p.player)}</span>
      <span class="m-pick"><b>${p.side} ${p.line}</b> ${odds(p.price)} <small>${esc(abbr(p.book))} &middot; ${esc(P.short || P.label)}</small></span>
      <span class="m-foot">${sharpChip(p.sharp)}${(() => { const v = vsLine(p); return v && !v.stale ? `<span class="m-now ${v.ok === false ? "pass" : "ok"}">now ${odds(v.price)}</span>` : ""; })()}</span></a>`;
  }
  function marquee(list) {
    const cards = list.map(miniTicket).join(""), secs = Math.max(24, list.length * 5);
    return `<div class="marquee" id="marquee" style="--dur:${secs}s" aria-label="Open picks, moving"><div class="mtrack">${cards}<span class="mgap"></span>${cards.replace(/<a class="mt"/g, '<a tabindex="-1" aria-hidden="true" class="mt"')}<span class="mgap"></span></div></div>`;
  }

  /* ------------------------------------------------------------------ featured pick: chosen automatically */
  // the biggest edge (EV at the stamp) among picks not started yet, preferring ones Pinnacle agrees with, and
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
    const why = `Chosen automatically: the biggest edge on the board (EV ${pct(p.ev).replace("&ndash;", "-")})${p.sharp === "agrees" ? ", and Pinnacle agrees" : ""}.`;
    return `<aside class="feat-card" style="${band(p)}" aria-label="Featured pick" title="${esc(why)}">
      <div class="fc-h"><span>Featured &middot; top edge</span>${status(p, true)}</div>
      <div class="fc-g">${gameLabel(p)}<span>${when(p.kick_utc, p.kick)}</span></div>
      <div class="fc-player">${esc(p.player)}</div>
      <div class="fc-pick"><b>${p.side} ${p.line}</b> ${odds(p.price)} <small>${esc(p.book)} &middot; ${esc(P.short || P.label)}</small></div>
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
    const hits = r.graded.map((p, i) => `<rect x="${(x(i + 1) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"><title>${esc(p.player)} ${p.side} ${p.line}: ${p.result} ${num(p.pl_u, 2, true)}u, running ${num(pts[i + 1], 2, true)}u</title></rect>`).join("");
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
        ${b ? `<a class="rcx-best" href="${linkTo(b).replace(/^.*\//, "")}"><span class="rcx-star" aria-hidden="true">&#9733;</span><span><em>Best hit</em> <b>${esc(b.player)}</b> ${b.side} ${b.line} <span class="muted">(${b.price > 0 ? "+" : ""}${b.price})</span> &middot; had <b class="up">${b.actual}</b></span></a>` : "<span></span>"}
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
    const tj = $("tb-jump"); if (tj) tj.innerHTML = jumpBar(list);             // Open / Live / Final sit in the control bar
    return PHASES.map(([ph, title, sub]) => {
      const ps = list.filter((p) => p.phase === ph).sort(byKick);
      const rec = ph === "final" ? `<div class="phase-rec">${MK.map((k) => `<span><em>${esc(MKT(k).short || MKT(k).label)}</em> ${recLine(periodRec(MKT(k), season, week))}</span>`).join("")}</div>` : "";
      return `<details class="phase ph-${ph}" id="ph-${ph}"${ps.length ? " open" : ""}><summary><span class="ph-t">${title}<span class="count">${ps.length}</span></span><span class="ph-s">${sub}</span></summary>
        ${rec}${ps.length ? picksBlock(ps) : `<div class="empty">Nothing ${title.toLowerCase()} ${ph === "final" ? "yet this " + PERIOD.toLowerCase() : "right now"}.</div>`}</details>`;
    }).join("");
  }

  function home() {
    hero(`${esc(SPORT.name)} player props &middot; ${D.season}`, "Every pick stamped. <em>Every result kept.</em>",
      "Player props priced against DraftKings and FanDuel, posted before the start and graded against the closing line. Nothing is edited or removed.", scoreboard(), featured());
    if (state.week == null || state.week === "all") state.week = D.week;
    const strip = openNow.filter((p) => p.phase === "open");
    $("app").innerHTML = `
      ${homeRecap()}
      ${strip.length >= 3 ? `<section class="openstrip"><div class="head"><div><div class="eyebrow">Up next</div><h2>Open now <span class="count">${strip.length}</span></h2></div>
        <span class="headbtns"><button type="button" class="mtoggle" id="mtoggle" aria-pressed="false">Pause</button><a class="more" href="${F.open}">All open &rarr;</a></span></div>${marquee(strip)}</section>` : ""}
      <section><div class="head"><div><div class="eyebrow">${PERIOD} at a glance</div><h2 id="wk-title"></h2></div></div>
        <div id="tb"></div><div id="phases" class="phases"></div></section>
      ${notify()}`;
    const m = $("marquee"), b = $("mtoggle");
    if (m && b) b.onclick = () => { const on = m.classList.toggle("paused"); b.textContent = on ? "Play" : "Pause"; };
    redraw = (full) => {
      if (full !== false || !$("pk-season")) $("tb").innerHTML = toolbar(pickers(allPicks, false));
      $("wk-title").textContent = `${PERIOD} ${state.week ?? "-"}, ${state.season}`;
      const list = allPicks.filter((p) => p.season === state.season && p.week === state.week && matches(p));
      $("phases").innerHTML = phaseSections(list, state.season, state.week);
      afterDraw();
    };
    redraw(true);
  }

  function openPage() {
    hero("Not graded yet", `Open <em>${openNow.length}</em>`, openNow.length
      ? "Every pick still to be settled, soonest first. Before the start, each ticket shows where the line and price have gone since the pick; once it starts, the close is locked in."
      : "Nothing open right now. New picks go up once the books post lines and the model finds value.");
    $("app").innerHTML = `<section><div id="tb"></div><div id="phases" class="phases"></div></section>`;
    redraw = (full) => {
      if (full !== false || !$("q")) $("tb").innerHTML = toolbar("");
      const list = openNow.filter(matches);
      $("tb-jump").innerHTML = jumpBar(list, PHASES.slice(0, 2));
      $("phases").innerHTML = PHASES.slice(0, 2).map(([ph, title, sub]) => { const ps = list.filter((p) => p.phase === ph);
        return `<details class="phase ph-${ph}" id="ph-${ph}"${ps.length ? " open" : ""}><summary><span class="ph-t">${title}<span class="count">${ps.length}</span></span><span class="ph-s">${sub}</span></summary>${ps.length ? picksBlock(ps) : `<div class="empty">Nothing ${title.toLowerCase()} right now.</div>`}</details>`; }).join("");
      afterDraw();
    };
    redraw(true); revealHash();
  }

  function resultsPage() {
    hero("Results", `${PERIOD} by <em>${PERIOD.toLowerCase()}</em>`, "Every graded pick, every market, at the size on its ticket and the stamped price. Tap a row to open that " + PERIOD.toLowerCase() + ".");
    const keys = [...new Set(MK.flatMap((k) => Object.keys(MKT(k).weeks)))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const cards = keys.map((key) => { const [season, w] = key.split("-");
      return `<a class="wkcard" href="${href(F.home)}?season=${season}&week=${w}"><div class="wk-h"><b>${PERIOD} ${w}</b><span class="muted">${season}</span></div>
        <div class="wk-m">${MK.map((k) => `<div><em>${esc(MKT(k).short || MKT(k).label)}</em><span>${recLine(MKT(k).weeks[key])}</span></div>`).join("")}</div><span class="wk-go">Open &rarr;</span></a>`; }).join("");
    const r = latestRecap();
    $("app").innerHTML = `${r ? `<section>${recapCard(r)}</section>` : ""}
      <section><div><div class="eyebrow">Season to date</div><h2>Totals</h2></div><div class="boards light">${MK.map((k) => { const P = MKT(k);
        return `<a class="sb" href="${P.slug}.html"><div class="sb-h"><span>${esc(P.label)}</span>${P.paper ? `<span class="chip paper">paper</span>` : `<span class="chip rec">the record</span>`}</div>${tote(P.record, P, true)}</a>`; }).join("")}</div>
        <div class="charts">${MK.map((k) => unitsChart(MKT(k))).join("")}</div></section>
      <section><div><div class="eyebrow">Newest first</div><h2>Every ${PERIOD.toLowerCase()}</h2></div><div class="wkcards">${cards || `<div class="empty">No graded ${PERIOD.toLowerCase()}s yet.</div>`}</div></section>`;
  }

  function marketPage(key) {
    const P = MKT(key);
    if (!P) { $("app").innerHTML = `<div class="empty">Nothing here yet.</div>`; return; }
    hero(`${P.paper ? "Research desk &middot; paper picks" : "The record"} &middot; since ${D.since}`, esc(P.label), esc(P.blurb), tote(P.record, P));
    const linked = byId[decodeURIComponent(location.hash.slice(1))];
    if (linked && linked.prop === key) { state.season = linked.season; state.week = linked.week; }
    if (state.week == null) state.week = "all";
    state.market = key;
    const filters = [["all", "All", () => true], ["open", "Open", (p) => p.phase === "open"], ["live", "Live", (p) => p.phase === "live"], ["W", "Won", (p) => p.result === "W"], ["L", "Lost", (p) => p.result === "L"],
      ["agrees", "Sharp agrees", (p) => p.sharp === "agrees"], ["against", "Sharp against", (p) => p.sharp === "against"]];
    let active = "all";
    $("app").innerHTML = `
      <section><div class="head"><div><div class="eyebrow">Each pick at its ticket size &middot; 1u each alongside</div><h2>Record</h2></div></div>${recordTable(P.record)}${unitsChart(P)}
        ${P.record.some((r) => r.label === "Pre-launch") ? `<p class="note"><span class="chip pre">pre-launch</span> picks were made by the same model and time-stamped in our private ledger, but not posted publicly before the start. From ${esc(D.launch)} on, every pick is posted before the start.</p>` : ""}</section>
      <section><div class="head"><div><div class="eyebrow">Newest first</div><h2>Every pick</h2></div></div><div id="tb"></div><div id="picks" class="weekgroups"></div></section>`;
    document.addEventListener("click", (e) => { const b = e.target.closest("#chips button[data-k]"); if (b) { active = b.dataset.k; redraw(false); } });
    redraw = (full) => {
      if (full !== false || !$("pk-season")) $("tb").innerHTML = toolbar(pickers(P.picks, true), false, `<div class="filters" id="chips" role="group" aria-label="Show"></div>`);
      const scope = P.picks.filter((p) => p.season === state.season && (state.week === "all" || p.week === state.week) && matches(p));
      const f = filters.find((x) => x[0] === active)[2], shown = scope.filter(f);
      $("chips").innerHTML = filters.filter(([k, , g]) => k === "all" || scope.some(g)).map(([k, l, g]) => `<button type="button" data-k="${k}" aria-pressed="${k === active}">${l}<span>${scope.filter(g).length}</span></button>`).join("");
      const ws = [...new Set(shown.map((p) => p.week))].sort((a, b) => b - a);
      $("picks").innerHTML = ws.length ? ws.map((w) => `<div class="weekgroup"><div class="weekhead"><h3>${PERIOD} ${w} <span class="muted">${state.season}</span></h3><span class="mono">${recLine(periodRec(P, state.season, w))}</span></div>${picksBlock(shown.filter((p) => p.week === w).sort(byKick), false)}</div>`).join("")
        : `<div class="empty">No picks match.</div>`;
      afterDraw();
    };
    redraw(true); revealHash();
  }

  function clvPage() {
    hero("The scoreboard", "Closing line <em>value</em>", "Did we get a better number than the market's final price? Over hundreds of picks, that is the clearest sign of a real edge, far more than win-loss.");
    if (!MK.length) { $("app").innerHTML = `<div class="empty">No ${esc(SPORT.name)} picks have closed yet. Closing line value shows up here once they do.</div>`; return; }
    const cards = MK.map((k) => { const P = MKT(k), r = P.record[0] || {};
      const cells = [["Value vs close", pct(r.clv_ev), tone(r.clv_ev), `what each pick was worth against the closing price, vig removed (n=${r.n_clv || 0}${(r.n_clv || 0) < 50 ? ", too early to judge" : ""})`],
        ["Beat the close", r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%", "", "better line, or same line at a better price"],
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
    const row = (label, r, P) => `<tr><td>${label}</td><td class="num opt">${r.n_clv || 0}</td><td class="num key ${tone(r.clv_ev)}">${pct(r.clv_ev)}</td><td class="num">${r.beat == null ? "&ndash;" : r.beat.toFixed(0) + "%"}</td><td class="num opt ${tone(r.clv)}">${r.clv == null ? "&ndash;" : sgn(r.clv) + r.clv.toFixed(1) + " " + P.unit}</td></tr>`;
    const table = (rows) => `<div class="tablebox"><table><thead><tr><th>Picks</th><th class="num opt">Closes</th><th class="num key">Value vs close</th><th class="num">Beat close</th><th class="num opt">Avg move</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    const graded = allPicks.filter((p) => p.clv_ev != null).sort((a, b) => b.clv_ev - a.clv_ev);
    const mini = (p) => `<a class="mini" href="${pageOf(p)}?season=${p.season}&week=${p.week}#${p.serial}"><span><b>${esc(p.player)}</b> ${p.side} ${p.line} <span class="muted">${odds(p.price)} &middot; ${short(p.prop)} &middot; ${PERIOD.toLowerCase()} ${p.week}</span></span><span class="mono ${tone(p.clv_ev)}">${pct(p.clv_ev)}</span></a>`;
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
    hero(`${esc(p0.team)} &middot; ${markets}`, esc(p0.player),
      `Every pick the model made on ${esc(p0.player)}, newest first, graded at the size on its ticket and the stamped price.${ps.some((p) => p.paper) ? " Paper picks (tracked, not bet) are marked." : ""}`,
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
      <section><div class="head"><div><div class="eyebrow">${PERIOD} at a glance</div><h2>Today's board</h2></div></div>
        <div class="phases">${phaseSections([], null, null)}</div></section>
      <section><div><div class="eyebrow">What to expect</div><h2>Same ledger, new sport</h2></div><div class="steps">
        <div><h3>One slate a ${PERIOD.toLowerCase()}</h3><p>Picks are grouped by ${PERIOD.toLowerCase()}, with the same Open, Live and Final sections, views and search.</p></div>
        <div><h3>Its own record</h3><p>Each market gets its own page and record, graded at the stamped price and size, kept apart from the other sports.</p></div>
        <div><h3>Same scoreboard</h3><p>Closing line value, the Sharp label and the weekly recap all work the same way.</p></div></div></section>
      ${notify()}`;
  }

  function method() {
    hero("How it works", "Stamped, posted, <em>graded at the close.</em>", "What every number on this site means, and why the closing line is the scoreboard.");
    $("app").innerHTML = `
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
        <p class="lede">Pinnacle is the sharpest sportsbook. For every pick we read Pinnacle's line for the same player and ask which side its prices favour at our line. The label stays current until the start, then locks on Pinnacle's closing line (marked "close").</p>
        <dl class="defs"><dt>Sharp agrees</dt><dd>Pinnacle priced our side as the likelier winner.</dd><dt>Sharp neutral</dt><dd>A coin flip at our line.</dd><dt>Sharp against</dt><dd>Pinnacle priced the other side as the likelier winner.</dd><dt>No sharp line</dt><dd>Pinnacle didn't list the player.</dd></dl></section>
      <section><div><div class="eyebrow">A tool, not a lock</div><h2>Parlays</h2></div>
        <p class="lede">The <a href="${F.parlays || "parlays.html"}">Parlays</a> page combines open picks from different games at one sportsbook. A parlay pays only if every leg wins, so its chance is much lower than any single pick's.</p>
        <dl class="defs">
        <dt>The model's parlay</dt><dd>One per book each ${PERIOD.toLowerCase()}: three legs from different Sunday games, taken from the open picks with the highest model chance, at that book's own lines and prices. Each update rebuilds it from the latest prices until the first Sunday kickoff; then it locks and never changes.</dd>
        <dt>Its record</dt><dd>Only the locked parlay counts, at 1 unit each, in its own record on the Parlays page. It is never added to any market's record.</dd>
        <dt>Pays</dt><dd>The legs' prices multiplied together. A book's own parlay price can differ a little.</dd>
        <dt>Book's chance</dt><dd>The chance the parlay's price implies, bookmaker's cut included.</dd>
        <dt>Model's chance</dt><dd>The legs' model chances multiplied. That holds for legs from different games; legs from the same game move together, so the builder allows one leg per game.</dd>
        <dt>Builder prices</dt><dd>Every leg uses the chosen book's line and price from the last update, since a parlay is placed at one book. A leg that book doesn't list is left out.</dd></dl></section>
      ${notify()}
      <section><div><div class="eyebrow">Honesty notes</div><h2>What's on the record</h2></div><dl class="defs">
        ${MK.map((k) => `<dt>${esc(MKT(k).label)}</dt><dd>${esc(MKT(k).blurb)}</dd>`).join("")}
        <dt>Pre-launch</dt><dd>Picks made before this site went public (${esc(D.launch)}) are shown and counted, tagged pre-launch, because their time stamps come from our private ledger.</dd>
        <dt>New address (Nov 3, 2026)</dt><dd>Until Nov 3, 2026 this site was published from an earlier GitHub repository. Its full history was carried over here with every original commit time, so the "verify" links on picks posted before then point to that carried-over history. The original repository is kept, privately, as the record of when those picks first went public. Picks posted from Nov 3 on are verified here directly.</dd></dl></section>`;
  }

  /* ------------------------------------------------------------------ parlays: one book, different games
     A tool, not a pick: what a parlay pays, the chance the book's price implies, and the model's chance (the legs'
     own chances multiplied - fair for legs from different games; same-game legs move together, so one leg per game).
     Every leg is priced at ONE book's line and price as of the last update (D.parlays.board), because a parlay can't
     be split across books.  The slip lives only in this browser. */
  const PR = D.parlays || { model: [], record: {}, board: {}, legs: 3 };
  const BOARD = PR.board || {}, PBOOKS = ["DraftKings", "FanDuel"], PMAX = 8;
  const PKEY = "ll-parlay", BKEY = "ll-parlay-book";
  const decOf = (a) => a > 0 ? 1 + a / 100 : 1 + 100 / -a;
  const amOf = (d) => d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
  const at = (p, book) => { const q = p && BOARD[p.serial] && BOARD[p.serial][book]; return q ? { line: q[0], price: q[1], win: q[2] } : null; };
  const canParlay = (p) => p && p.phase === "open" && BOARD[p.serial] && Object.keys(BOARD[p.serial]).length > 0;
  let legs = []; try { legs = JSON.parse(store.get(PKEY) || "[]"); } catch (e) { legs = []; }
  let pbook = PBOOKS.includes(store.get(BKEY)) ? store.get(BKEY) : PBOOKS[0], pNote = "";
  const tidy = () => { legs = legs.filter((s) => canParlay(byId[s])); store.set(PKEY, JSON.stringify(legs)); store.set(BKEY, pbook); };
  const short = (k) => esc(MKT(k) ? MKT(k).short || MKT(k).label : k);
  function parlayButton(p) {
    if (!canParlay(p)) return "";
    const on = legs.includes(p.serial);
    return `<button type="button" class="padd${on ? " on" : ""}" data-padd="${esc(p.serial)}" aria-pressed="${on}">${on ? "&#10003; In parlay" : "+ Parlay"}</button>`;
  }
  // the legs at one book: [{p, q}] (q = null when that book doesn't list the player)
  const slipAt = (book) => legs.map((s) => ({ p: byId[s], q: at(byId[s], book) }));
  function parlayMath(qs) {
    const D2 = qs.reduce((x, q) => x * decOf(q.price), 1), m = qs.reduce((x, q) => x * q.win / 100, 1);
    return { D: D2, am: amOf(D2), book: 100 / D2, model: 100 * m };
  }
  const stat = (k, v, cls = "", sub = "") => `<div><dt>${k}</dt><dd class="${cls}">${v}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  function nums(qs) {
    if (qs.length < 2) return `<p class="ps-note">Add a leg from another game to build a parlay.</p>`;
    const m = parlayMath(qs);
    return `<dl class="ps-nums">${stat("Pays", odds(m.am), "", `$10 returns $${(10 * m.D).toFixed(2)}`)}${stat("Book's chance", pct(m.book, false))}${stat("Model's chance", pct(m.model, false))}</dl>`;
  }
  const bookSwitch = (cur, attr) => `<div class="seg pbook" role="group" aria-label="Sportsbook">${PBOOKS.map((b) =>
    `<button type="button" ${attr}="${b}" aria-pressed="${b === cur}">${b}</button>`).join("")}</div>`;

  // other pages: a small chip (center, clear of the phone's corners and home bar) that opens the Parlays page
  function drawChip() {
    tidy();
    document.querySelectorAll("[data-padd]").forEach((b) => { const on = legs.includes(b.dataset.padd);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.innerHTML = on ? "&#10003; In parlay" : "+ Parlay"; });
    if (page === "parlays") drawBuilder();
    let el = $("pchip");
    if (!legs.length && !pNote) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement("a"); el.id = "pchip"; document.body.appendChild(el); }
    el.hidden = false; el.href = page === "parlays" ? "#pbuild-s" : F.parlays || "parlays.html";   // on the page itself: back up to the slip
    const qs = slipAt(pbook).map((x) => x.q).filter(Boolean);
    el.innerHTML = pNote ? `<span class="pc-note">${pNote}</span>`
      : `<b>Parlay</b><span>${legs.length} leg${legs.length === 1 ? "" : "s"} &middot; ${esc(abbr(pbook))}</span>${qs.length > 1 ? `<span class="mono">${odds(parlayMath(qs).am)}</span>` : ""}<i aria-hidden="true">&rarr;</i>`;
    if (pNote) setTimeout(() => { pNote = ""; drawChip(); }, 3800);
  }

  // the Parlays page: the slip at the chosen book, then every open pick that book lists, by game
  function drawBuilder() {
    const box = $("pbuild");
    if (!box) return;
    const items = slipAt(pbook), ok = items.filter((x) => x.q), missing = items.filter((x) => !x.q);
    const leg = ({ p, q }) => `<li class="${q ? "" : "off"}"><div><b>${esc(p.player)}</b> ${p.side} ${q ? q.line : p.line} <span class="muted">${short(p.prop)}</span>
        <small>${q ? `${odds(q.price)} &middot; model ${pct(q.win, false)}` : `not listed at ${esc(pbook)} - not counted`}</small></div>
        <button type="button" class="ps-x" data-premove="${esc(p.serial)}" aria-label="Remove ${esc(p.player)}">&times;</button></li>`;
    const open = openNow.filter((p) => p.phase === "open" && canParlay(p));
    const inGames = new Set(legs.map((s) => byId[s] && byId[s].game_id));
    const games = gamesOf(open);
    box.innerHTML = `<div class="pb-grid">
      <div class="pb-slip"><div class="pb-h"><h3>Your parlay</h3>${bookSwitch(pbook, "data-pbook")}</div>
        ${items.length ? `<ul class="ps-legs">${items.map(leg).join("")}</ul>` : `<p class="ps-note">Tap a pick to add it. One leg per game.</p>`}
        ${missing.length ? `<p class="ps-note warn">${missing.length === 1 ? "One leg isn't" : missing.length + " legs aren't"} listed at ${esc(pbook)}. A parlay is placed at one book, so ${missing.length === 1 ? "it's" : "they're"} left out of the numbers.</p>` : ""}
        ${pNote ? `<p class="ps-note warn">${pNote}</p>` : ""}
        ${nums(ok.map((x) => x.q))}
        ${items.length ? `<div class="ps-act"><button type="button" class="ps-clear" data-pclear>Clear</button></div>` : ""}</div>
      <div class="pb-pool">${games.length ? games.map((g) => `<div class="pb-game"><div class="pb-gh"><span class="gteams">${tm(g.away)}<i class="at">@</i>${tm(g.home)}</span><span class="mono muted">${when(g.kick_utc, g.kick)}</span></div>
        ${g.picks.map((p) => { const q = at(p, pbook), on = legs.includes(p.serial), blocked = !on && inGames.has(p.game_id);
          return `<button type="button" class="pb-pick${on ? " on" : ""}" data-padd="${esc(p.serial)}" aria-pressed="${on}"${q ? "" : " disabled"}${blocked ? ' data-blocked="1"' : ""}>
            <span><b>${esc(p.player)}</b> ${p.side} ${q ? q.line : p.line} <span class="muted">${short(p.prop)}</span></span>
            <span class="mono">${q ? `${odds(q.price)}<small>model ${pct(q.win, false)}</small>` : `<small>not at ${esc(abbr(pbook))}</small>`}</span></button>`; }).join("")}</div>`).join("")
        : `<div class="empty">No open picks to build with right now. New ones appear as the books post lines.</div>`}</div></div>`;
  }

  function addLeg(s) {
    const p = byId[s];
    pNote = "";
    if (legs.includes(s)) legs = legs.filter((x) => x !== s);
    else if (legs.some((x) => byId[x] && byId[x].game_id === p.game_id)) pNote = `One leg per game: ${esc(p.player)}'s game is already in your parlay.`;
    else if (legs.length >= PMAX) pNote = `Up to ${PMAX} legs.`;
    else legs.push(s);
  }
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-padd]");
    if (add) { addLeg(add.dataset.padd); drawChip(); return; }
    const bk = e.target.closest("[data-pbook]");
    if (bk) { pbook = bk.dataset.pbook; pNote = ""; drawChip(); return; }
    const rm = e.target.closest("[data-premove]");
    if (rm) { legs = legs.filter((x) => x !== rm.dataset.premove); pNote = ""; drawChip(); return; }
    if (e.target.closest("[data-pclear]")) { legs = []; pNote = ""; drawChip(); return; }
    const ld = e.target.closest("[data-pload]");
    if (ld) { const x = PR.model[Number(ld.dataset.pload)]; pbook = x.book; legs = x.legs.map((l) => l.serial).filter((s) => canParlay(byId[s])); pNote = ""; drawChip();
      const box = $("pbuild"); if (box) box.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });

  // one model parlay: its legs, the numbers, and where it stands (building, locked, settled)
  const RES = { W: "&#10003;", L: "&#10007;", P: "P", VOID: "void" };
  function modelCard(x) {
    const i = PR.model.indexOf(x);
    const state = x.result ? `<span class="pill res-${x.result}">${x.result === "W" ? `Won ${num(x.units, 2, true)}u` : x.result === "L" ? "Lost -1u" : "Push"}</span>`
      : x.locked ? `<span class="pill">Locked ${when(x.lock_utc, x.lock)}</span>`
      : `<span class="pill building">Building &middot; locks ${when(x.lock_utc, x.lock)}</span>`;
    if (!x.legs.length) return `<article class="pm-card"><header><span class="pm-book">${esc(x.book)}</span>${x.locked ? `<span class="pill">No parlay</span>` : state}</header>
      <p class="ps-note">${x.locked ? `Fewer than ${PR.legs} Sunday games had a pick at ${esc(x.book)} at the lock, so there was no parlay this ${PERIOD.toLowerCase()}.` : `Not enough Sunday picks at ${esc(x.book)} yet. It fills in as lines are posted.`}</p></article>`;
    const canLoad = !x.locked && x.legs.every((l) => canParlay(byId[l.serial]));
    return `<article class="pm-card${x.result ? " res-" + x.result : ""}"><header><span class="pm-book">${esc(x.book)}</span>${state}</header>
      <ol class="pm-legs">${x.legs.map((l) => `<li><span class="pm-r ${l.result || ""}">${l.result ? RES[l.result] : ""}</span><a href="${byId[l.serial] ? pageOf(byId[l.serial]) + "?season=" + x.season + "&week=" + x.week + "#" + l.serial : "#"}"><b>${esc(l.player)}</b> ${l.side} ${l.line}</a>
        <span class="muted">${short(l.prop)}</span><span class="mono">${odds(l.price)}${l.actual != null ? `<small>had ${l.actual}</small>` : `<small>model ${pct(l.win, false)}</small>`}</span></li>`).join("")}</ol>
      <dl class="ps-nums">${stat("Pays", odds(x.american))}${stat("Book's chance", pct(x.book_chance, false))}${stat("Model's chance", pct(x.model_chance, false))}</dl>
      <footer><span class="muted">${x.locked ? `Stamped at the lock, ${when(x.lock_utc, x.lock)}` : `Last rebuilt ${esc(x.built || "")} ET`}</span>${canLoad ? `<button type="button" class="ps-clear" data-pload="${i}">Open in builder</button>` : ""}</footer></article>`;
  }

  function parlaysPage() {
    hero(`Parlay tools &middot; ${D.season}`, "Parlays", "Build a parlay from open picks in different games, at one sportsbook, and see what it pays, the chance the book's price implies, and the model's chance. Or start from the model's own parlay for each book.");
    const weeks = [...new Set(PR.model.map((x) => `${x.season}-${x.week}`))];
    const cur = weeks.length ? weeks[weeks.length - 1] : null;
    const now = cur ? PR.model.filter((x) => `${x.season}-${x.week}` === cur && !(x.locked && x.result)) : [];
    const past = PR.model.filter((x) => x.locked && x.legs.length && !now.includes(x)).slice().reverse();
    const rec = PR.record || {};
    const recRow = (label, r) => `<tr><td>${esc(label)}</td><td class="num">${r.n || 0}</td><td class="num">${r.n ? `${r.W}-${r.L}${r.P ? "-" + r.P : ""}` : "&ndash;"}</td><td class="num ${tone(r.units)}">${r.n ? num(r.units, 2, true) + "u" : "&ndash;"}</td><td class="num opt ${tone(r.roi)}">${pct(r.roi)}</td></tr>`;
    $("app").innerHTML = `
      ${now.length ? `<section><div class="head"><div><div class="eyebrow">The model's parlays &middot; ${PERIOD} ${cur.split("-")[1]}</div><h2>One per book</h2></div></div>
        <p class="lede">Three legs from different Sunday games, picked from the open picks by the model's chance, at one book's lines and prices. They update as prices move, then lock at the first Sunday kickoff. Only the locked parlay counts in the record.</p>
        <div class="pm-grid">${now.map(modelCard).join("")}</div></section>` : ""}
      <section id="pbuild-s"><div class="head"><div><div class="eyebrow">Build your own${PR.board_at ? ` &middot; prices as of ${esc(PR.board_at)} ET` : ""}</div><h2>Parlay builder</h2></div></div>
        <div id="pbuild"></div>
        <p class="ps-fine">Each leg uses the chosen book's own line and price from the last update; the book's price may have moved since, and a book's parlay price can differ a little from the legs multiplied. Book's chance = what the parlay's price implies. Model's chance = the legs' chances multiplied, which holds for legs from different games. One leg per game: legs from the same game move together.</p></section>
      <section><div class="head"><div><div class="eyebrow">Graded at 1u each, kept apart from every other record</div><h2>Model parlay record</h2></div></div>
        ${rec.all && rec.all.n ? `<div class="tablebox"><table><thead><tr><th>Book</th><th class="num">Parlays</th><th class="num">W-L-P</th><th class="num">Units</th><th class="num opt">ROI</th></tr></thead><tbody>
          ${recRow("All", rec.all)}${PBOOKS.filter((b) => rec[b]).map((b) => recRow(b, rec[b])).join("")}</tbody></table></div>`
          : `<div class="empty">No model parlay has been graded yet. The first ones lock at this week's first Sunday kickoff.</div>`}
        ${past.length ? `<div class="pm-grid">${past.map(modelCard).join("")}</div>` : ""}</section>`;
    redraw = () => { drawBuilder(); afterDraw(); };
    drawChip();
  }

  setTimeout(() => { reveal(); countUp(); }, 0);
  const PAGES = { home, open: openPage, results: resultsPage, clv: clvPage, method, soon: soonPage, player: playerPage, parlays: parlaysPage, market: () => marketPage(pageMarket) };
  (PAGES[page] || home)();
  setInterval(() => { if (legs.length && syncPhases()) drawChip(); }, 30000);   // a leg whose game started drops out
  drawChip();
})();
