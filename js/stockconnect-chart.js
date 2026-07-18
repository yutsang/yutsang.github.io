/**
 * Stock Connect southbound (北水) / northbound flow dashboard.
 * Data: /data/stockconnect-latest.json, rebuilt each trading evening by
 * .github/workflows/stockconnect-data.yml from HKEX's public daily
 * statistics widget (same-day data, published ~17:30 HKT).
 */
(function () {
  "use strict";

  var BUY = "#2e7d51";
  var SELL = "#c14a2b";
  var INK = "#1a1815";
  var MUTED = "#706a5e";
  var GRID = "rgba(26, 24, 21, 0.07)";
  var MONO = "11px 'IBM Plex Mono', monospace";

  var DATA = null;
  var panels = {};
  var zh = function () { return (document.documentElement.lang || "en") === "zh"; };
  var $ = function (id) { return document.getElementById(id); };

  function fmt(x) {
    var a = Math.abs(x);
    if (a >= 1e3) return (x / 1e3).toFixed(1) + "B";
    return Math.round(x) + "M";
  }
  function sign(x) { return (x >= 0 ? "+" : "") + fmt(x); }

  function load(bust) {
    return fetch("/data/stockconnect-latest.json" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  load(false).then(function (d) {
    DATA = d;
    ["sc-trend", "sc-exchange", "sc-top", "sc-nbtrend"].forEach(initPanel);
    freshness();
    renderAll();
    window.addEventListener("resize", renderAll);
    new MutationObserver(renderAll).observe(document.documentElement,
      { attributes: true, attributeFilter: ["lang"] });
    var rb = $("sc-refresh");
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

  /* ---------- freshness ---------- */

  function hktNow() {
    var n = new Date();
    return new Date(n.getTime() + (480 + n.getTimezoneOffset()) * 60000);
  }

  function freshness() {
    var sb = DATA.southbound.latest;
    document.querySelectorAll(".sc-asof").forEach(function (el) { el.textContent = sb.date || "—"; });

    var now = hktNow();
    var day = now.getDay(), hm = now.getHours() * 100 + now.getMinutes();
    var trading = day >= 1 && day <= 5 && hm >= 930 && hm <= 1610;
    var afterPublish = day >= 1 && day <= 5 && hm > 1730;
    var sameDay = sb.date === now.toISOString().slice(0, 10);

    var stateName = trading ? "live" : (sameDay || afterPublish ? "fresh" : "stale");
    ["live", "fresh", "stale"].forEach(function (s) {
      var el = $("sc-state-" + s);
      if (el) el.hidden = s !== stateName;
    });

    var pubEl = $("sc-published");
    if (pubEl) {
      pubEl.textContent = DATA.published_at
        ? new Date(DATA.published_at).toLocaleString(zh() ? "zh-HK" : "en-HK",
            { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false })
          + " HKT"
        : "~17:30 HKT";
    }
  }

  function renderAll() {
    tiles();
    drawTrend();
    drawExchange();
    drawTop();
    drawNbTrend();
  }

  function tiles() {
    var sb = DATA.southbound.latest;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set("tile-scnet", sign(sb.net));
    set("tile-scbuy", fmt(sb.buy));
    set("tile-scsell", fmt(sb.sell));
    set("tile-scdate", sb.date || "—");
    var el = $("tile-scnet");
    if (el) el.style.color = sb.net >= 0 ? BUY : SELL;
  }

  /* ---------- southbound net-flow trend ---------- */

  function drawTrend() {
    var p = panels["sc-trend"];
    if (!p) return;
    var t = DATA.southbound.trend || [];
    var dim = sizeCanvas(p, 260);
    var ctx = p.ctx;
    if (t.length < 2) return;
    var padL = 58, padR = 16, padT = 14, padB = 26;
    var plotW = dim.w - padL - padR, plotH = dim.h - padT - padB;
    var maxV = 1;
    t.forEach(function (r) { maxV = Math.max(maxV, Math.abs(r[1])); });
    var x = function (i) { return padL + i / (t.length - 1) * plotW; };
    var zeroY = padT + plotH / 2;
    var y = function (v) { return zeroY - (v / maxV) * (plotH / 2); };

    ctx.font = MONO; ctx.textBaseline = "middle";
    ctx.strokeStyle = GRID;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + plotW, zeroY); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.textAlign = "right";
    ctx.fillText("0", padL - 6, zeroY);
    ctx.fillText(fmt(maxV), padL - 6, padT);
    ctx.fillText(fmt(-maxV), padL - 6, padT + plotH);

    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, Math.floor((t.length - 1) / 2), t.length - 1].forEach(function (i) {
      ctx.fillStyle = MUTED;
      ctx.fillText(t[i][0], x(i), dim.h - padB + 8);
    });

    var barW = Math.max(2, plotW / t.length * 0.6);
    p.view = [];
    t.forEach(function (r, i) {
      var v = r[1];
      ctx.fillStyle = v >= 0 ? BUY : SELL;
      var yTop = v >= 0 ? y(v) : zeroY;
      var h = Math.abs(y(v) - zeroY);
      ctx.fillRect(x(i) - barW / 2, yTop, barW, Math.max(h, 1));
      p.view.push({ x0: x(i) - barW, x1: x(i) + barW, r: r });
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var hit = null;
      p.view.forEach(function (it) { if (px >= it.x0 && px < it.x1) hit = it; });
      if (!hit) { p.tip.hidden = true; return; }
      tipAt(p, ev, "2026-" + hit.r[0],
        (zh() ? "淨買入 " : "Net buy ") + sign(hit.r[1]) + " HKD · " +
        (zh() ? "買 " : "buy ") + fmt(hit.r[2]) + (zh() ? " · 賣 " : " · sell ") + fmt(hit.r[3]));
    };
    p.canvas.onpointerleave = function () { p.tip.hidden = true; };
  }

  /* ---------- exchange split (latest day) ---------- */

  function drawExchange() {
    var p = panels["sc-exchange"];
    if (!p) return;
    var rows = DATA.southbound.by_exchange || [];
    var dim = sizeCanvas(p, 140);
    var ctx = p.ctx;
    var padL = 64, padR = 60, padT = 16, rowH = 42;
    var plotW = dim.w - padL - padR;
    var maxV = 1;
    rows.forEach(function (r) { maxV = Math.max(maxV, r[1], r[2]); });

    ctx.font = MONO; ctx.textBaseline = "middle";
    p.view = [];
    rows.forEach(function (r, idx) {
      var y = padT + idx * rowH;
      var barH = 14;
      ctx.textAlign = "right"; ctx.fillStyle = MUTED;
      ctx.fillText(r[0], padL - 8, y + barH / 2);
      var wB = r[1] / maxV * plotW, wS = r[2] / maxV * plotW;
      ctx.fillStyle = BUY; ctx.fillRect(padL, y, wB, barH);
      ctx.fillStyle = SELL; ctx.fillRect(padL, y + barH + 4, wS, barH);
      ctx.textAlign = "left"; ctx.fillStyle = INK;
      ctx.fillText(fmt(r[1]), padL + wB + 6, y + barH / 2);
      ctx.fillText(fmt(r[2]), padL + wS + 6, y + barH + 4 + barH / 2);
      p.view.push({ y0: y, y1: y + barH * 2 + 4, r: r });
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var py = ev.clientY - rect.top;
      var hit = null;
      p.view.forEach(function (it) { if (py >= it.y0 && py < it.y1) hit = it; });
      if (!hit) { p.tip.hidden = true; return; }
      tipAt(p, ev, hit.r[0] + " Southbound",
        (zh() ? "買 " : "buy ") + fmt(hit.r[1]) + (zh() ? " · 賣 " : " · sell ") + fmt(hit.r[2]));
    };
  }

  /* ---------- top net-buy / net-sell stocks ---------- */

  function drawTop() {
    var p = panels["sc-top"];
    if (!p) return;
    var rows = (DATA.southbound.top_stocks || []).slice(0, 14);
    var rowH = 26;
    var dim = sizeCanvas(p, Math.max(120, rows.length * rowH + 24));
    var ctx = p.ctx;
    var padL = 100, padR = 60, padT = 12;
    var plotW = dim.w - padL - padR;
    var maxV = 1;
    rows.forEach(function (r) { maxV = Math.max(maxV, Math.abs(r[2])); });
    var zeroX = padL + plotW / 2;

    ctx.font = MONO; ctx.textBaseline = "middle";
    ctx.strokeStyle = GRID;
    ctx.beginPath(); ctx.moveTo(zeroX, padT); ctx.lineTo(zeroX, padT + rows.length * rowH); ctx.stroke();

    p.view = [];
    rows.forEach(function (r, idx) {
      var y = padT + idx * rowH + 4;
      var barH = rowH - 10;
      ctx.textAlign = "right"; ctx.fillStyle = MUTED;
      ctx.fillText(r[1] + " " + r[0], zeroX - Math.max(plotW / 2, 1) - 8 + Math.max(plotW / 2, 1), y + barH / 2);
      var half = plotW / 2 * Math.abs(r[2]) / maxV;
      ctx.fillStyle = r[2] >= 0 ? BUY : SELL;
      if (r[2] >= 0) ctx.fillRect(zeroX, y, half, barH);
      else ctx.fillRect(zeroX - half, y, half, barH);
      ctx.textAlign = r[2] >= 0 ? "left" : "right";
      ctx.fillStyle = INK;
      ctx.fillText(sign(r[2]), r[2] >= 0 ? zeroX + half + 6 : zeroX - half - 6, y + barH / 2);
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
        (zh() ? "買 " : "buy ") + fmt(r[3]) + (zh() ? " · 賣 " : " · sell ") + fmt(r[4]) +
        (zh() ? " · 上榜 " : " · in top10 on ") + r[5] + (zh() ? " 日" : " days"));
    };
  }

  /* ---------- northbound turnover (comparison) ---------- */

  function drawNbTrend() {
    var p = panels["sc-nbtrend"];
    if (!p) return;
    var t = DATA.northbound.trend || [];
    var dim = sizeCanvas(p, 200);
    var ctx = p.ctx;
    if (t.length < 2) return;
    var padL = 58, padR = 16, padT = 14, padB = 26;
    var plotW = dim.w - padL - padR, plotH = dim.h - padT - padB;
    var maxV = 1;
    t.forEach(function (r) { maxV = Math.max(maxV, r[1]); });
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
      ctx.fillText(t[i][0], x(i), dim.h - padB + 8);
    });

    ctx.strokeStyle = "#5158b8"; ctx.lineWidth = 2;
    ctx.beginPath();
    t.forEach(function (r, i) { i ? ctx.lineTo(x(i), y(r[1])) : ctx.moveTo(x(i), y(r[1])); });
    ctx.stroke();

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var i = Math.round((px - padL) / plotW * (t.length - 1));
      if (i < 0 || i >= t.length) { p.tip.hidden = true; return; }
      tipAt(p, ev, "2026-" + t[i][0],
        (zh() ? "北向總成交 " : "Northbound turnover ") + fmt(t[i][1]) + " RMB");
    };
    p.canvas.onpointerleave = function () { p.tip.hidden = true; };
  }
})();
