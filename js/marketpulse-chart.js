/**
 * Market Pulse: breadth (advancers/decliners), gainers/losers, and most
 * active by turnover/volume. Data: /data/marketpulse-latest.json, rebuilt
 * each trading evening by the shared HKEX pipeline, parsed from the same
 * Daily Quotation Sheet used for short-selling (QUOTATIONS section).
 * Structured products (warrants/CBBCs) are excluded at the data layer --
 * see scripts/build_market_pulse_data.py.
 */
(function () {
  "use strict";

  var UP = "#2e7d51";
  var DOWN = "#c14a2b";
  var MUTED = "#706a5e";
  var GRID = "rgba(26, 24, 21, 0.07)";
  var MONO = "11px 'IBM Plex Mono', monospace";

  var DATA = null;
  var panel = null;
  var zh = function () { return (document.documentElement.lang || "en") === "zh"; };
  var $ = function (id) { return document.getElementById(id); };

  function fmt(x) {
    var a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (x / 1e6).toFixed(0) + "M";
    if (a >= 1e3) return (x / 1e3).toFixed(0) + "K";
    return String(Math.round(x));
  }

  function load(bust) {
    return fetch("/data/marketpulse-latest.json" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  load(false).then(function (d) {
    DATA = d;
    var el = $("mp-trend");
    if (el) panel = { el: el, canvas: el.querySelector("canvas"), ctx: el.querySelector("canvas").getContext("2d"),
      tip: el.querySelector(".graph-tooltip") };
    renderAll();
    window.addEventListener("resize", renderAll);
    new MutationObserver(renderAll).observe(document.documentElement,
      { attributes: true, attributeFilter: ["lang"] });
    var doRefresh = function () {
      return load(true).then(function (d2) { DATA = d2; renderAll(); });
    };
    var rb = $("mp-refresh");
    if (rb) rb.addEventListener("click", function () {
      rb.disabled = true;
      doRefresh().catch(function () {}).then(function () { rb.disabled = false; });
    });
    window.addEventListener("hkex:refresh-all", doRefresh);
  }).catch(function () {
    document.querySelectorAll("#tab-market-pulse .graph-panel, #tab-market-pulse .mp-table-wrap")
      .forEach(function (p) { p.classList.add("graph-failed"); });
  });

  function renderAll() {
    tiles();
    drawTrend();
    table("mp-gainers-body", DATA.gainers, true);
    table("mp-losers-body", DATA.losers, true);
    table("mp-turnover-body", DATA.turnover, false, "turnover");
    table("mp-volume-body", DATA.volume, false, "volume");
  }

  function tiles() {
    var m = DATA.market;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set("tile-mpadv", m.advancers);
    set("tile-mpdec", m.decliners);
    set("tile-mpflat", m.unchanged);
    set("tile-mpratio", m.decliners ? (m.advancers / m.decliners).toFixed(2) : "—");
    var g = $("tile-mpgauge");
    if (g && (m.advancers + m.decliners)) {
      g.style.setProperty("--pct", (m.advancers / (m.advancers + m.decliners) * 100).toFixed(1) + "%");
    }
  }

  function drawTrend() {
    if (!panel) return;
    var t = DATA.trend || [];
    var dpr = window.devicePixelRatio || 1;
    var w = panel.el.clientWidth, h = 240;
    panel.canvas.style.height = h + "px";
    panel.canvas.width = w * dpr; panel.canvas.height = h * dpr;
    panel.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var ctx = panel.ctx;
    ctx.clearRect(0, 0, w, h);
    if (t.length < 2) return;

    var padL = 46, padR = 16, padT = 14, padB = 26;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var maxV = 1;
    t.forEach(function (r) { maxV = Math.max(maxV, r[1], r[2]); });
    var x = function (i) { return padL + i / (t.length - 1) * plotW; };
    var y = function (v) { return padT + (1 - v / maxV) * plotH; };

    ctx.font = MONO;
    for (var g = 0; g <= 2; g++) {
      var gv = maxV * g / 2, gy = padT + (1 - g / 2) * plotH;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(fmt(gv), padL - 6, gy);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, Math.floor((t.length - 1) / 2), t.length - 1].forEach(function (i) {
      ctx.fillStyle = MUTED;
      ctx.fillText(t[i][0], x(i), h - padB + 8);
    });

    [1, 2].forEach(function (si) {
      ctx.strokeStyle = si === 1 ? UP : DOWN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      t.forEach(function (r, i) { i ? ctx.lineTo(x(i), y(r[si])) : ctx.moveTo(x(i), y(r[si])); });
      ctx.stroke();
      ctx.fillStyle = si === 1 ? UP : DOWN;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(si === 1 ? (zh() ? "上升" : "Advancers") : (zh() ? "下跌" : "Decliners"),
        x(t.length - 1) + 8, y(t[t.length - 1][si]));
    });

    panel.canvas.onpointermove = function (ev) {
      var rect = panel.canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var i = Math.round((px - padL) / plotW * (t.length - 1));
      if (i < 0 || i >= t.length || !panel.tip) return;
      panel.tip.querySelector(".graph-tooltip__title").textContent = "2026-" + t[i][0];
      panel.tip.querySelector(".graph-tooltip__meta").textContent =
        (zh() ? "上升 " : "Advancers ") + t[i][1] + (zh() ? " · 下跌 " : " · Decliners ") + t[i][2];
      panel.tip.hidden = false;
      var x2 = ev.clientX - rect.left, y2 = ev.clientY - rect.top;
      panel.tip.style.left = Math.min(x2 + 14, panel.el.clientWidth - panel.tip.offsetWidth - 8) + "px";
      panel.tip.style.top = (y2 + 14) + "px";
    };
    panel.canvas.onpointerleave = function () { if (panel.tip) panel.tip.hidden = true; };
  }

  function table(bodyId, rows, isChangeRanked, valueKey) {
    var body = $(bodyId);
    if (!body || !rows) return;
    body.innerHTML = rows.map(function (r) {
      var code = r[0], name = r[1], last = r[2], chg = r[3], val = r[4];
      var chgColor = chg >= 0 ? UP : DOWN;
      var arrow = chg >= 0 ? "▲" : "▼";
      return "<tr><td>" + name + " <span class='mp-code'>(" + code + ")</span></td>" +
        "<td class='mp-num'>" + last.toFixed(2) + "</td>" +
        "<td class='mp-num' style='color:" + chgColor + "'>" + arrow + " " + Math.abs(chg).toFixed(2) + "%</td>" +
        "<td class='mp-num'>" + fmt(val) + "</td></tr>";
    }).join("");
  }
})();
