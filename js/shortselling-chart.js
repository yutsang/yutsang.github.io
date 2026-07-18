/**
 * HK market short-selling ratio dashboard.
 * Data: /data/shortselling-latest.json, rebuilt each trading evening by
 * .github/workflows/shortselling-data.yml, parsed from HKEX's public
 * Daily Quotation Sheet ("SHORT SELLING TURNOVER - DAILY REPORT" section).
 */
(function () {
  "use strict";

  var ACCENT = "#c14a2b";
  var INK = "#1a1815";
  var MUTED = "#706a5e";
  var GRID = "rgba(26, 24, 21, 0.07)";
  var MONO = "11px 'IBM Plex Mono', monospace";

  var DATA = null;
  var panels = {};
  var zh = function () { return (document.documentElement.lang || "en") === "zh"; };
  var $ = function (id) { return document.getElementById(id); };

  function fmtHKD(x) {
    var a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (x / 1e6).toFixed(0) + "M";
    return Math.round(x).toLocaleString();
  }
  function pct(x) { return (x * 100).toFixed(1) + "%"; }

  function load(bust) {
    return fetch("/data/shortselling-latest.json" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  load(false).then(function (d) {
    DATA = d;
    ["ss-trend", "ss-top"].forEach(initPanel);
    freshness();
    renderAll();
    window.addEventListener("resize", renderAll);
    new MutationObserver(renderAll).observe(document.documentElement,
      { attributes: true, attributeFilter: ["lang"] });
    var rb = $("ss-refresh");
    if (rb) rb.addEventListener("click", function () {
      rb.disabled = true;
      load(true).then(function (d2) { DATA = d2; freshness(); renderAll(); rb.disabled = false; })
        .catch(function () { rb.disabled = false; });
    });
  }).catch(function () {
    document.querySelectorAll(".graph-panel").forEach(function (p) { p.classList.add("graph-failed"); });
  });

  function initPanel(name) {
    var el = $(name);
    if (!el) return;
    var canvas = el.querySelector("canvas");
    panels[name] = { el: el, canvas: canvas, ctx: canvas.getContext("2d"),
      tip: el.querySelector(".graph-tooltip"), view: [] };
  }

  function sizeCanvas(p, h) {
    var dpr = window.devicePixelRatio || 1;
    var w = p.el.clientWidth;
    p.canvas.style.height = h + "px";
    p.canvas.width = w * dpr; p.canvas.height = h * dpr;
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function tipAt(p, ev, title, meta) {
    var rect = p.canvas.getBoundingClientRect();
    p.tip.querySelector(".graph-tooltip__title").textContent = title;
    p.tip.querySelector(".graph-tooltip__meta").textContent = meta;
    p.tip.hidden = false;
    var x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    p.tip.style.left = Math.min(x + 14, p.el.clientWidth - p.tip.offsetWidth - 8) + "px";
    p.tip.style.top = (y + 14) + "px";
  }

  function hktNow() {
    var n = new Date();
    return new Date(n.getTime() + (480 + n.getTimezoneOffset()) * 60000);
  }

  function freshness() {
    document.querySelectorAll(".ss-asof").forEach(function (el) { el.textContent = DATA.date || "—"; });
    var now = hktNow();
    var day = now.getDay(), hm = now.getHours() * 100 + now.getMinutes();
    var trading = day >= 1 && day <= 5 && hm >= 930 && hm <= 1610;
    var sameDay = DATA.date === now.toISOString().slice(0, 10);
    var stateName = trading ? "live" : (sameDay ? "fresh" : "stale");
    ["live", "fresh", "stale"].forEach(function (s) {
      var el = $("ss-state-" + s);
      if (el) el.hidden = s !== stateName;
    });
  }

  function renderAll() {
    tiles();
    drawTrend();
    drawTop();
  }

  function tiles() {
    var m = DATA.market;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set("tile-ssratio", pct(m.ratio));
    set("tile-ssturnover", fmtHKD(m.ss_turnover));
    set("tile-sstotal", fmtHKD(m.total_turnover));
    set("tile-ssn", m.n);
    var g = $("tile-ssgauge");
    if (g) g.style.width = Math.min(m.ratio * 100 * 2, 100) + "%";   // scaled: 50% ratio = full bar
  }

  function drawTrend() {
    var p = panels["ss-trend"];
    if (!p) return;
    var t = DATA.trend || [];
    var dim = sizeCanvas(p, 260);
    var ctx = p.ctx;
    if (t.length < 2) return;
    var padL = 54, padR = 16, padT = 14, padB = 26;
    var plotW = dim.w - padL - padR, plotH = dim.h - padT - padB;
    var vals = t.map(function (r) { return r[1]; });
    var minV = Math.min.apply(null, vals) * 0.9, maxV = Math.max.apply(null, vals) * 1.1;
    var x = function (i) { return padL + i / (t.length - 1) * plotW; };
    var y = function (v) { return padT + (1 - (v - minV) / (maxV - minV)) * plotH; };

    ctx.font = MONO;
    for (var g = 0; g <= 2; g++) {
      var gv = minV + (maxV - minV) * g / 2, gy = padT + (1 - g / 2) * plotH;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(pct(gv), padL - 6, gy);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, Math.floor((t.length - 1) / 2), t.length - 1].forEach(function (i) {
      ctx.fillStyle = MUTED;
      ctx.fillText(t[i][0], x(i), dim.h - padB + 8);
    });

    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
    ctx.beginPath();
    t.forEach(function (r, i) { i ? ctx.lineTo(x(i), y(r[1])) : ctx.moveTo(x(i), y(r[1])); });
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    t.forEach(function (r, i) {
      ctx.beginPath(); ctx.arc(x(i), y(r[1]), 2.5, 0, Math.PI * 2); ctx.fill();
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var i = Math.round((px - padL) / plotW * (t.length - 1));
      if (i < 0 || i >= t.length) { p.tip.hidden = true; return; }
      tipAt(p, ev, "2026-" + t[i][0],
        (zh() ? "沽空比率 " : "Short-selling ratio ") + pct(t[i][1]));
    };
    p.canvas.onpointerleave = function () { p.tip.hidden = true; };
  }

  function drawTop() {
    var p = panels["ss-top"];
    if (!p) return;
    var rows = DATA.top_stocks || [];
    var rowH = 26;
    var dim = sizeCanvas(p, Math.max(120, rows.length * rowH + 24));
    var ctx = p.ctx;
    var padL = 130, padR = 60, padT = 12;
    var plotW = dim.w - padL - padR;
    var maxV = 1;
    rows.forEach(function (r) { maxV = Math.max(maxV, r[2]); });

    ctx.font = MONO; ctx.textBaseline = "middle";
    p.view = [];
    rows.forEach(function (r, idx) {
      var y = padT + idx * rowH + 4;
      var barH = rowH - 10;
      ctx.textAlign = "right"; ctx.fillStyle = MUTED;
      ctx.fillText(r[1] + " " + r[0], padL - 8, y + barH / 2);
      var w = r[2] / maxV * plotW;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(padL, y, Math.max(w, 2), barH);
      ctx.textAlign = "left"; ctx.fillStyle = INK;
      ctx.fillText(pct(r[2]), padL + w + 6, y + barH / 2);
      p.view.push({ y0: padT + idx * rowH, y1: padT + (idx + 1) * rowH, r: r });
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var py = ev.clientY - rect.top;
      var hit = null;
      p.view.forEach(function (it) { if (py >= it.y0 && py < it.y1) hit = it; });
      if (!hit) { p.tip.hidden = true; return; }
      var r = hit.r;
      tipAt(p, ev, r[1] + " (" + r[0] + ")",
        (zh() ? "沽空成交 " : "SS turnover ") + fmtHKD(r[3]) +
        (zh() ? " · 總成交 " : " · total turnover ") + fmtHKD(r[4]));
    };
    p.canvas.onpointerleave = function () { p.tip.hidden = true; };
  }
})();
