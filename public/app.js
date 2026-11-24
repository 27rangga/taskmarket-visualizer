/* TaskMarket Visualizer — no frameworks, no analytics, no wallet.
   Data comes ONLY from same-origin /api/data (served by the Worker).
   The browser never calls the TaskMarket API host directly. */

(function () {
  "use strict";

  var API_URL = "/api/data";
  var CHAINS = { "4217": { label: "Tempo", currency: "OUSD" }, "8453": { label: "Base", currency: "USDC" } };
  var MODES = ["bounty", "claim", "pitch", "benchmark", "auction"];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var state = { chain: "all", metric: "tasksPosted", range: 30 };
  var data = null;

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var intFmt = new Intl.NumberFormat("en-US");
  function fmtInt(n) {
    n = Number(n);
    return Number.isFinite(n) ? intFmt.format(Math.round(n)) : "—";
  }
  function fmtMoney(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtMoneyCur(n, chain) {
    var m = fmtMoney(n);
    if (m === "—") return m;
    return chain && CHAINS[chain] ? m + " " + CHAINS[chain].currency : m;
  }
  function fmtCompact(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
    if (Number.isInteger(n)) return "$" + intFmt.format(n);
    return "$" + n.toFixed(2);
  }
  function shortAddr(a) {
    a = String(a || "");
    return a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
  }

  var dtWib = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  var dtUtc = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  function fmtAsOf(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return dtWib.format(d) + " WIB (" + dtUtc.format(d) + " UTC)";
  }
  function fmtDateShort(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" }).format(d);
  }
  function timeAgo(iso, refIso) {
    var t = new Date(iso).getTime();
    var ref = refIso ? new Date(refIso).getTime() : Date.now();
    if (!isFinite(t)) return "";
    var s = Math.max(0, Math.floor((ref - t) / 1000));
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    if (d < 30) return d + "d ago";
    return fmtDateShort(iso);
  }

  /* ---------- data access ---------- */

  function chainScope() { return state.chain; }

  function dailyRows() {
    if (!data || !Array.isArray(data.daily)) return [];
    var scope = chainScope();
    var rows = data.daily.filter(function (r) { return r.chain === scope; });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (state.range !== "all") {
      rows = rows.slice(-state.range);
    }
    return rows;
  }

  function scopeTotals() {
    if (!data) return null;
    if (state.chain === "all") return data.totals || null;
    return (data.totalsByChain && data.totalsByChain[state.chain]) || null;
  }

  /* ---------- renderers ---------- */

  function renderAsOf() {
    var txt = data && data.dataAsOf ? fmtAsOf(data.dataAsOf) : "—";
    document.querySelectorAll("[data-asof]").forEach(function (el) { el.textContent = txt; });
  }

  function renderHeadline() {
    var h = data.headline || {};
    var c = state.chain === "all" ? null : (data.chains && data.chains[state.chain]) || {};
    var src = state.chain === "all" ? h : c;
    $("st-registered").textContent = fmtInt(src.registeredWorkers);
    $("st-active").textContent = fmtInt(src.activeAgents7d != null ? src.activeAgents7d : src.activeWorkers7d);
    $("st-open").textContent = fmtInt(src.openTasks);
    $("st-paid-workers").textContent = fmtInt(src.paidWorkers);
    var t = scopeTotals();
    $("st-putup").textContent = t ? fmtMoneyCur(t.rewardsPutUpTotal, state.chain === "all" ? null : state.chain) : "—";
    $("st-paid").textContent = t ? fmtMoneyCur(t.rewardsPaidTotal, state.chain === "all" ? null : state.chain) : "—";
    $("st-putup-sub").textContent = state.chain === "all" ? "all time · nominal $ (OUSD + USDC)" : "all time · " + CHAINS[state.chain].currency;
    $("st-paid-sub").textContent = state.chain === "all" ? "all time · nominal $ (OUSD + USDC)" : "all time · " + CHAINS[state.chain].currency;
    $("st-registered-sub").textContent = state.chain === "all" ? "all chains" : CHAINS[state.chain].label + " · " + state.chain;
  }

  function renderFlow() {
    var scope = chainScope();
    var weeks = (data.postersWeekly || []).filter(function (w) { return w.chain === scope; });
    weeks.sort(function (a, b) { return a.weekStart < b.weekStart ? -1 : 1; });
    var latest = weeks[weeks.length - 1];
    var topPoster = latest && latest.topPosters && latest.topPosters[0];
    $("flow-poster-name").textContent = topPoster ? topPoster.name : "—";
    $("flow-poster-tasks").textContent = topPoster ? fmtInt(topPoster.tasks) + " tasks" : "—";
    $("flow-poster-rewards").textContent = topPoster
      ? fmtMoneyCur(topPoster.rewards, scope === "all" ? null : scope) + " put up"
      : "—";
    var t = scopeTotals();
    $("flow-escrow").textContent = t ? fmtMoneyCur(t.rewardsPutUpTotal, scope === "all" ? null : scope) : "—";
    var w = (data.topWinners || [])[0];
    $("flow-winner-addr").textContent = w ? shortAddr(w.workerAddress) : "—";
    $("flow-winner-wins").textContent = w ? fmtInt(w.wins) + (w.wins === 1 ? " win" : " wins") : "—";
    $("flow-winner-won").textContent = w ? fmtMoney(w.totalWon) + " won in total" : "—";
    // Tugas completed terbaru: dari data.latestCompleted (daftar tugas); kalau
    // belum ada, cari di feed (item feed membawa status tugasnya).
    var done = data.latestCompleted || (data.feed || []).find(function (f) { return f.status === "completed"; });
    $("flow-latest").innerHTML = done
      ? "Latest completed task: <span class=\"mono\">" + esc(done.referenceCode || "") + "</span> — " +
        esc(done.title || "Untitled task") + " · " + fmtMoney(done.reward) +
        (done.requesterDisplayName ? " · posted by " + esc(done.requesterDisplayName) : "")
      : "Latest completed task: —";
  }

  function renderDaily() {
    var rows = dailyRows();
    var metric = state.metric;
    var svg = $("daily-chart");
    var wrap = svg.parentElement;
    var W = Math.max(300, Math.min(720, wrap.clientWidth || 720));
    var H = W < 480 ? 230 : 260;
    var padL = 52, padR = 10, padT = 12, padB = 28;
    var iw = W - padL - padR, ih = H - padT - padB;
    var isMoney = metric === "rewardsPutUp" || metric === "rewardsPaid";
    var vals = rows.map(function (r) { return Number(r[metric]) || 0; });
    var max = Math.max.apply(null, vals.concat([0]));
    if (max === 0) max = 1;
    var top = max * 1.08;

    function x(i) { return padL + (rows.length <= 1 ? iw / 2 : (i / (rows.length - 1)) * iw); }
    function y(v) { return padT + ih - (v / top) * ih; }

    var out = [];
    out.push('<svg id="daily-chart" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Daily series chart">');
    // gridlines + y labels
    for (var g = 0; g <= 4; g++) {
      var gv = (top / 4) * g, gy = y(gv);
      out.push('<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) +
        '" stroke="#453e37" stroke-width="1" opacity="0.7"/>');
      out.push('<text x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '" fill="#b0a79d" font-size="11" font-family="Departure Mono, monospace" text-anchor="end">' +
        esc(isMoney ? fmtCompact(gv) : fmtInt(gv)) + "</text>");
    }
    if (rows.length) {
      var line = rows.map(function (r, i) { return (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(Number(r[metric]) || 0).toFixed(1); }).join(" ");
      var area = line + " L" + x(rows.length - 1).toFixed(1) + "," + (padT + ih) + " L" + x(0).toFixed(1) + "," + (padT + ih) + " Z";
      out.push('<path d="' + area + '" fill="#d9a097" opacity="0.14"/>');
      out.push('<path d="' + line + '" fill="none" stroke="#e74079" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      rows.forEach(function (r, i) {
        var v = Number(r[metric]) || 0;
        var label = isMoney ? fmtMoney(v) : fmtInt(v);
        out.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="#221e1a" stroke="#e74079" stroke-width="1.5">' +
          "<title>" + esc(r.date + ": " + label) + "</title></circle>");
      });
      // x labels: evenly spaced, count adapts to chart width so labels
      // never overlap or clip. Each "MM-DD" label is ~33px at 11px mono;
      // keep ~15px gap. First label starts at the axis, last label ends
      // at it — a centered last label would run past the right edge and
      // get clipped (seen live: "11-2" instead of "11-24"), and fixed
      // 6 labels collide at 360px (5-day spacing ≈ 41px < label width).
      var maxLabels = Math.max(2, Math.min(6, Math.floor(iw / 48)));
      var labelIdx = [];
      for (var li = 0; li < maxLabels; li++) {
        var idx = Math.round(li * (rows.length - 1) / (maxLabels - 1));
        if (labelIdx.indexOf(idx) === -1) labelIdx.push(idx);
      }
      rows.forEach(function (r, i) {
        if (labelIdx.indexOf(i) !== -1) {
          var anchor = "middle";
          if (rows.length > 1 && i === 0) anchor = "start";
          else if (rows.length > 1 && i === rows.length - 1) anchor = "end";
          out.push('<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" fill="#b0a79d" font-size="11" font-family="Departure Mono, monospace" text-anchor="' + anchor + '">' +
            esc(r.date.slice(5)) + "</text>");
        }
      });
    } else {
      out.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" fill="#b0a79d" font-size="13" font-family="Inter Tight, sans-serif" text-anchor="middle">No data for this range yet.</text>');
    }
    out.push("</svg>");
    svg.outerHTML = out.join("");
    // re-grab after outerHTML replacement
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var totalTxt = isMoney ? fmtMoney(total) : fmtInt(total);
    var metricName = { tasksPosted: "tasks posted", rewardsPutUp: "rewards put up", rewardsPaid: "rewards paid", activeAgents: "daily active agents (summed)" }[metric];
    $("daily-total").innerHTML = "Total in range: <b>" + esc(totalTxt) + "</b> " + esc(metricName) + " · " + esc(rows.length + " days");
    $("daily-range-label").textContent =
      state.range === "all" ? "All time" : "Last " + state.range + " days";
  }

  function renderBars(elId, obj, order) {
    var el = $(elId);
    if (!obj) { el.innerHTML = '<p class="bar-empty">No data.</p>'; return; }
    var entries = Object.keys(obj).map(function (k) { return { name: k, value: Number(obj[k]) || 0 }; });
    if (order) {
      entries.sort(function (a, b) {
        var ia = order.indexOf(a.name), ib = order.indexOf(b.name);
        if (ia === -1) ia = 99; if (ib === -1) ib = 99;
        return ia - ib || b.value - a.value;
      });
    } else {
      entries.sort(function (a, b) { return b.value - a.value; });
    }
    var max = Math.max.apply(null, entries.map(function (e) { return e.value; }).concat([0]));
    var topVal = entries.length ? entries[0].value : 0;
    el.innerHTML = entries.map(function (e) {
      var pct = max > 0 ? (e.value / max) * 100 : 0;
      var cls = e.value === topVal && e.value > 0 ? "bar-fill top" : "bar-fill";
      return '<div class="bar-row"><div class="bar-top"><span class="bar-name">' + esc(e.name) +
        '</span><span class="bar-val">' + fmtInt(e.value) + "</span></div>" +
        '<div class="bar-track"><div class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div></div>';
    }).join("") || '<p class="bar-empty">No data.</p>';
  }

  function renderHeatmap() {
    var scope = chainScope();
    var hm = (data.heatmap && data.heatmap[scope]) || null;
    var grid = $("heatmap-grid");
    // Satuan heatmap berbeda per scope (lihat catatan metode): "all" = event
    // aktivitas dari endpoint resmi (tanpa split per chain); per-chain =
    // tugas dibuat, dari daftar tugas.
    var unit = scope === "all" ? "events" : "tasks";
    var sub = document.querySelector("#heatmap .section-sub");
    if (sub) {
      sub.textContent = scope === "all"
        ? "Activity events per hour, UTC. Rows run Monday to Sunday."
        : "Tasks created per hour, UTC. Rows run Monday to Sunday.";
    }
    if (!hm) { grid.innerHTML = '<p class="bar-empty">No data.</p>'; return; }
    var max = 0;
    hm.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });
    var peak = { d: -1, h: -1 };
    hm.forEach(function (row, d) { row.forEach(function (v, h) { if (v === max && max > 0 && peak.d === -1) peak = { d: d, h: h }; }); });
    var html = ['<div class="hm-corner"></div>'];
    // Hour labels: every 3h on desktop, every 6h on narrow screens so the
    // 2-digit labels fit their ~9px columns at 360px instead of clipping.
    var hourStep = window.innerWidth < 480 ? 6 : 3;
    for (var h = 0; h < 24; h++) {
      html.push('<div class="hm-hour">' + (h % hourStep === 0 ? String(h).padStart(2, "0") : "") + "</div>");
    }
    hm.forEach(function (row, d) {
      html.push('<div class="hm-day">' + DAYS[d] + "</div>");
      row.forEach(function (v, hr) {
        var alpha = v > 0 && max > 0 ? 0.08 + 0.82 * (v / max) : 0;
        var isPeak = d === peak.d && hr === peak.h;
        html.push('<div class="hm-cell' + (isPeak ? " peak" : "") + '" style="background:rgba(239,233,226,' + alpha.toFixed(2) + ')"' +
          ' title="' + DAYS[d] + " " + String(hr).padStart(2, "0") + ":00 UTC — " + fmtInt(v) + " " + unit + '"></div>');
      });
    });
    grid.innerHTML = html.join("");
  }

  function renderFeed() {
    var list = $("feed-list");
    var items = (data.feed || []).slice(0, 20);
    if (!items.length) { list.innerHTML = "<li><p class=\"bar-empty\">No recent tasks.</p></li>"; return; }
    list.innerHTML = items.map(function (f) {
      var chain = String(f.chain || "");
      var chainLabel = CHAINS[chain] ? CHAINS[chain].label + " · " + chain + " · " + CHAINS[chain].currency : "chain " + chain;
      return "<li>" +
        '<div class="feed-top"><span class="feed-code">' + esc(f.referenceCode || "—") + "</span>" +
        '<span class="feed-time">' + esc(timeAgo(f.createdAt, data.dataAsOf)) + "</span></div>" +
        '<p class="feed-title">' + esc(f.title || "Untitled task") + "</p>" +
        '<div class="feed-meta">' +
        (f.event ? '<span class="chip">' + esc(f.event) + "</span>" : "") +
        '<span class="chip">' + esc(f.mode || "—") + "</span>" +
        '<span class="chip status-' + esc(f.status || "") + '">' + esc(f.status || "—") + "</span>" +
        '<span class="chip chain-' + esc(chain) + '">' + esc(chainLabel) + "</span>" +
        '<span class="reward">' + fmtMoney(f.reward) + "</span>" +
        (f.requesterDisplayName ? "<span>by " + esc(f.requesterDisplayName) + "</span>" : "") +
        "<span>" + fmtInt(f.submissionCount) + " submissions · " + fmtInt(f.awardCount) + " awards</span>" +
        "</div></li>";
    }).join("");
  }

  function renderInsights() {
    var scope = chainScope();
    var t = scopeTotals();
    var el = $("insights-list");
    $("insights-sub").textContent = scope === "all"
      ? "All chains, all time."
      : CHAINS[scope].label + " · " + scope + ", all time.";
    if (!data || !t || !t.tasksTotal) { el.innerHTML = "<li>No data.</li>"; return; }
    function pct(a, b) {
      if (!b) return "—";
      return (100 * a / b).toFixed(1) + "%";
    }
    var byMode = (data.byMode && data.byMode[scope]) || {};
    var byStatus = (data.byStatus && data.byStatus[scope]) || {};
    var rows = (data.daily || []).filter(function (r) { return r.chain === scope; });
    var busiest = null;
    rows.forEach(function (r) {
      if (!busiest || (Number(r.tasksPosted) || 0) > (Number(busiest.tasksPosted) || 0)) busiest = r;
    });
    var items = [
      { v: pct(byStatus.completed || 0, t.tasksTotal), l: "of tasks are completed (" + fmtInt(byStatus.completed || 0) + " of " + fmtInt(t.tasksTotal) + ")" },
      { v: pct(t.rewardsPaidTotal || 0, t.rewardsPutUpTotal || 0), l: "of money put up has been paid out (" + fmtMoney(t.rewardsPaidTotal || 0) + " of " + fmtMoney(t.rewardsPutUpTotal || 0) + ")" },
      { v: pct(byMode.bounty || 0, t.tasksTotal), l: "of tasks are bounties (" + fmtInt(byMode.bounty || 0) + " of " + fmtInt(t.tasksTotal) + ")" },
      { v: busiest ? fmtInt(busiest.tasksPosted) + " tasks" : "—", l: busiest ? "posted on " + fmtDateShort(busiest.date) + " — the busiest day" : "busiest day: no data" }
    ];
    el.innerHTML = items.map(function (it) {
      return '<li><span class="in-val">' + esc(it.v) + '</span><span class="in-label">' + esc(it.l) + "</span></li>";
    }).join("");
  }

  function renderWinners() {
    var el = $("top-winners");
    var top = (data.topWinners || []).slice(0, 5);
    if (!top.length) { el.innerHTML = "<li>No winners yet.</li>"; return; }
    el.innerHTML = top.map(function (w, i) {
      return '<li><span class="tp-name">#' + (i + 1) + " " + esc(shortAddr(w.workerAddress)) + "</span>" +
        '<span class="tp-val">' + fmtInt(w.wins) + (w.wins === 1 ? " win" : " wins") + " · " + fmtMoney(w.totalWon) + "</span></li>";
    }).join("");
  }

  function renderPosters() {
    var scope = chainScope();
    var weeks = (data.postersWeekly || []).filter(function (w) { return w.chain === scope; });
    weeks.sort(function (a, b) { return a.weekStart < b.weekStart ? -1 : 1; });
    var barsEl = $("poster-bars");
    var topEl = $("top-posters");
    if (!weeks.length) {
      barsEl.innerHTML = '<p class="bar-empty">No data.</p>';
      topEl.innerHTML = "<li>No data.</li>";
      return;
    }
    var max = Math.max.apply(null, weeks.map(function (w) { return w.distinctPosters; }).concat([0]));
    var topWeek = weeks[weeks.length - 1];
    barsEl.innerHTML = weeks.map(function (w) {
      var pct = max > 0 ? (w.distinctPosters / max) * 100 : 0;
      var isTop = w === topWeek;
      return '<div class="poster-bar"><span class="pb-val">' + fmtInt(w.distinctPosters) + "</span>" +
        '<div class="pb-track"><div class="pb-fill' + (isTop ? " top" : "") + '" style="height:' + Math.max(2, pct).toFixed(1) + '%"></div></div>' +
        '<span class="pb-week">' + esc(String(w.weekStart).slice(5)) + "</span></div>";
    }).join("");
    var top = topWeek.topPosters || [];
    topEl.innerHTML = top.length ? top.map(function (p) {
      return "<li><span class=\"tp-name\">" + esc(p.name) + "</span>" +
        '<span class="tp-val">' + fmtInt(p.tasks) + " tasks · " + fmtMoneyCur(p.rewards, scope === "all" ? null : scope) + "</span></li>";
    }).join("") : "<li>No posters that week.</li>";
  }

  function renderAll() {
    renderAsOf();
    renderHeadline();
    renderInsights();
    renderFlow();
    renderDaily();
    renderBars("mode-bars", data.byMode && data.byMode[chainScope()], MODES);
    renderBars("status-bars", data.byStatus && data.byStatus[chainScope()], null);
    renderHeatmap();
    renderFeed();
    renderPosters();
    renderWinners();
  }

  function showUnavailable() {
    var el = $("unavailable");
    if (el) el.hidden = false;
    renderAsOf();
  }

  /* ---------- controls ---------- */

  function bindSeg(id, attr, fn) {
    var seg = $(id);
    seg.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      seg.querySelectorAll("button").forEach(function (b) {
        b.classList.remove("on");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("on");
      btn.setAttribute("aria-pressed", "true");
      fn(btn.getAttribute(attr));
    });
  }

  bindSeg("chain-seg", "data-chain", function (v) {
    state.chain = v;
    if (data) renderAll();
  });
  bindSeg("metric-seg", "data-metric", function (v) {
    state.metric = v;
    if (data) renderDaily();
  });
  bindSeg("range-seg", "data-range", function (v) {
    state.range = v === "all" ? "all" : parseInt(v, 10);
    if (data) renderDaily();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (!data) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderDaily, 150);
  });

  /* ---------- boot ---------- */

  fetch(API_URL, { headers: { Accept: "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (json) {
      if (!json || typeof json !== "object" || !json.headline) throw new Error("bad payload");
      data = json;
      renderAll();
    })
    .catch(function () {
      data = null;
      showUnavailable();
    });
})();
