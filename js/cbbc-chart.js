/**
 * CBBC street dashboard: distribution ladder (with prior-day ghosts),
 * 30-day bull/bear trend, issuer breakdown, new listings, MCE log,
 * and a data-freshness panel.
 * Data: /data/cbbc-latest.json, rebuilt twice each trading day by
 * .github/workflows/cbbc-data.yml from HKEX public files.
 */
(function () {
  "use strict";

  var BULL = "#2e7d51";
  var BEAR = "#c14a2b";
  var INK = "#1a1815";
  var MUTED = "#706a5e";
  var GRID = "rgba(26, 24, 21, 0.07)";
  var GHOST = "rgba(26, 24, 21, 0.35)";
  var SURFACE = "#f5f1e8";
  var MONO = "11px 'IBM Plex Mono', monospace";

  var DATA = null;
  var state = { ul: "HSI", mult: 2 };
  var panels = {};   // name -> {el, canvas, ctx, tip, view}

  var zh = function () { return (document.documentElement.lang || "en") === "zh"; };
  var $ = function (id) { return document.getElementById(id); };

  function fmt(x) {
    if (x >= 1e6) return (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(0) + "K";
    return String(Math.round(x));
  }
  function fmtLevel(lv, step) {
    return step >= 1 ? lv.toLocaleString("en-US") : lv.toFixed(2);
  }

  /* ---------- boot ---------- */

  function load(bust) {
    return fetch("/data/cbbc-latest.json" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  load(false).then(function (d) {
    DATA = d;
    ["chart", "trend", "issuers", "newlist"].forEach(initPanel);
    buildFilters();
    freshness();
    renderAll();
    window.addEventListener("resize", renderAll);
    // canvas text follows the language toggle
    new MutationObserver(renderAll).observe(document.documentElement,
      { attributes: true, attributeFilter: ["lang"] });
    var doRefresh = function () {
      return load(true).then(function (d2) { DATA = d2; freshness(); renderAll(); });
    };
    var rb = $("cbbc-refresh");
    if (rb) rb.addEventListener("click", function () {
      rb.disabled = true;
      doRefresh().catch(function () {}).then(function () { rb.disabled = false; });
    });
    // Shared "Refresh all" control on the combined HKEX data page
    window.addEventListener("hkex:refresh-all", doRefresh);
  }).catch(function () {
    document.querySelectorAll(".graph-panel").forEach(function (p) {
      p.classList.add("graph-failed");
    });
  });

  function initPanel(name) {
    var el = $("cbbc-" + name);
    if (!el) return;
    var canvas = el.querySelector("canvas");
    panels[name] = {
      el: el, canvas: canvas, ctx: canvas.getContext("2d"),
      tip: el.querySelector(".graph-tooltip"), view: []
    };
    canvas.addEventListener("pointerleave", function () { panels[name].tip.hidden = true; });
  }

  function sizeCanvas(p, h) {
    var dpr = window.devicePixelRatio || 1;
    var w = p.el.clientWidth;
    p.canvas.style.height = h + "px";
    p.canvas.width = w * dpr;
    p.canvas.height = h * dpr;
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

  /* ---------- filters ---------- */

  function buildFilters() {
    var row = $("cbbc-ul-filters");
    Object.keys(DATA.underlyings).forEach(function (ul) {
      var d = DATA.underlyings[ul];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cbbc-chip" + (ul === state.ul ? " is-active" : "");
      b.innerHTML = '<span data-lang="en">' + d.en + '</span><span data-lang="zh">' + d.zh + "</span>";
      b.addEventListener("click", function () {
        state.ul = ul;
        row.querySelectorAll(".cbbc-chip").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        bucketLabels();
        renderAll();
      });
      row.appendChild(b);
    });
    document.querySelectorAll("[data-mult]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mult = parseInt(b.getAttribute("data-mult"), 10);
        document.querySelectorAll("[data-mult]").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        drawLadder();
      });
    });
    bucketLabels();
  }

  function bucketLabels() {
    var step = DATA.underlyings[state.ul].step;
    document.querySelectorAll("[data-mult]").forEach(function (b) {
      var v = step * parseInt(b.getAttribute("data-mult"), 10);
      b.textContent = v >= 1 ? String(Math.round(v)) : String(v);
    });
  }

  /* ---------- freshness ---------- */

  function hktNow() {
    var n = new Date();
    return new Date(n.getTime() + (480 + n.getTimezoneOffset()) * 60000);
  }

  function freshness() {
    document.querySelectorAll(".cbbc-asof").forEach(function (el) {
      el.textContent = DATA.os_asof + " HKT";
    });
    ["cbbc-mce-asof", "cbbc-mce-asof2"].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = DATA.mce_asof || "—";
    });

    var m = /(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/.exec(DATA.os_asof || "");
    var now = hktNow();
    var ageH = null;
    if (m) {
      var asof = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
      ageH = Math.round((now - asof) / 36e5);
    }
    var day = now.getDay(), hm = now.getHours() * 100 + now.getMinutes();
    var trading = day >= 1 && day <= 5 && hm >= 915 && hm <= 1615;
    var stateName = trading ? "live" : (ageH !== null && ageH <= 80 ? "fresh" : "stale");
    ["live", "fresh", "stale"].forEach(function (s) {
      var el = $("cbbc-state-" + s);
      if (el) el.hidden = s !== stateName;
    });
    ["cbbc-age", "cbbc-age2"].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = ageH === null ? "—" : String(ageH);
    });
  }

  /* ---------- render all ---------- */

  function renderAll() {
    tiles();
    drawLadder();
    drawTrend();
    drawIssuers();
    drawNewlist();
    mceTable();
  }

  function tiles() {
    var d = DATA.underlyings[state.ul];
    var total = d.bull + d.bear;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set("tile-bullpct", total ? (d.bull / total * 100).toFixed(1) + "%" : "—");
    set("tile-total", fmt(total));
    var hb = null, he = null;
    d.buckets.forEach(function (b) {
      if (b[0] < d.spot && (!hb || b[1] > hb[1])) hb = [b[0], b[1]];
      if (b[0] > d.spot && (!he || b[2] > he[1])) he = [b[0], b[2]];
    });
    set("tile-bullzone", hb ? fmtLevel(hb[0], d.step) : "—");
    set("tile-bearzone", he ? fmtLevel(he[0], d.step) : "—");
    set("tile-mce", String(DATA.mce.count));
    var g = $("tile-gauge");
    if (g && total) g.style.setProperty("--pct", (d.bull / total * 100).toFixed(1) + "%");
  }

  /* ---------- ladder ---------- */

  function mergedBuckets() {
    var d = DATA.underlyings[state.ul];
    var step = d.step * state.mult;
    var map = {};
    d.buckets.forEach(function (b) {
      var lv = Math.floor(b[0] / step + 1e-9) * step;
      var k = lv.toFixed(4);
      if (!map[k]) map[k] = { level: lv, bull: 0, bear: 0, pbull: 0, pbear: 0 };
      map[k].bull += b[1]; map[k].bear += b[2];
      map[k].pbull += b[3] || 0; map[k].pbear += b[4] || 0;
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return b.level - a.level; });
    var si = rows.findIndex(function (r) { return r.level <= d.spot; });
    if (si < 0) si = Math.floor(rows.length / 2);
    return { d: d, step: step, rows: rows.slice(Math.max(0, si - 16), si + 16) };
  }

  function drawLadder() {
    var p = panels.chart;
    if (!p) return;
    var m = mergedBuckets();
    var dim = sizeCanvas(p, 560);
    var ctx = p.ctx;
    var padL = 76, padR = 64, padT = 32;
    var plotW = dim.w - padL - padR;
    var rowH = Math.min(24, (dim.h - padT - 10) / Math.max(m.rows.length, 1));
    var barH = Math.max(6, rowH - 4);
    var maxV = 1;
    m.rows.forEach(function (r) {
      maxV = Math.max(maxV, r.bull, r.bear, r.pbull, r.pbear);
    });

    // Spot value lives in the toolbar badge (not on-canvas) so it never
    // collides with the heaviest-bar label drawn at the same right edge.
    var spotBadge = document.getElementById("cbbc-spot-badge");
    if (spotBadge) {
      spotBadge.textContent = (zh() ? "現價估算 " : "Est. spot ") + fmtLevel(m.d.spot, m.step);
    }

    ctx.font = MONO;
    ctx.textBaseline = "middle";
    p.view = [];

    // Vertical scale gridlines (magnitude reference for bar length),
    // labelled along the top edge of the plot.
    ctx.textAlign = "center";
    for (var gv = 0; gv <= 3; gv++) {
      var gx = padL + (gv / 3) * plotW;
      if (gv > 0) {
        ctx.strokeStyle = GRID;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + m.rows.length * rowH); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = MUTED;
      ctx.fillText(fmt(maxV * gv / 3), gx, padT - 12);
    }

    var spotY = null;
    for (var k = 0; k < m.rows.length; k++) {
      if (m.rows[k].level <= m.d.spot) { spotY = padT + k * rowH; break; }
    }
    if (spotY !== null) {
      ctx.strokeStyle = INK;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(padL - 62, spotY); ctx.lineTo(dim.w - 6, spotY); ctx.stroke();
      ctx.setLineDash([]);
    }

    m.rows.forEach(function (r, idx) {
      var y = padT + idx * rowH + (rowH - barH) / 2;
      var isBear = r.level > m.d.spot;
      var v = isBear ? r.bear : r.bull;
      var pv = isBear ? r.pbear : r.pbull;

      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.fillText(fmtLevel(r.level, m.step), padL - 8, y + barH / 2);
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, y + barH / 2); ctx.lineTo(padL + plotW, y + barH / 2); ctx.stroke();

      if (pv > 0) {                       // prior-day ghost outline
        ctx.strokeStyle = GHOST;
        ctx.lineWidth = 1;
        ctx.strokeRect(padL + 0.5, y + 0.5, Math.max(pv / maxV * plotW, 2), barH - 1);
      }
      if (v > 0) {
        ctx.fillStyle = isBear ? BEAR : BULL;
        ctx.fillRect(padL, y, Math.max(v / maxV * plotW, 2), barH);
        ctx.lineWidth = 2;
        ctx.strokeStyle = SURFACE;
        ctx.strokeRect(padL, y, Math.max(v / maxV * plotW, 2), barH);
      }
      p.view.push({ y0: padT + idx * rowH, y1: padT + (idx + 1) * rowH, r: r, isBear: isBear, v: v, pv: pv });
    });

    ["bull", "bear"].forEach(function (side) {
      var best = null;
      p.view.forEach(function (it) {
        var val = (side === "bear") === it.isBear ? it.v : 0;
        if (val > 0 && (!best || val > best.v)) best = { it: it, v: val };
      });
      if (best) {
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        ctx.fillText(fmt(best.v), padL + best.v / maxV * plotW + 6, (best.it.y0 + best.it.y1) / 2);
      }
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var y = ev.clientY - rect.top;
      var hit = null;
      p.view.forEach(function (it) { if (y >= it.y0 && y < it.y1) hit = it; });
      if (!hit || hit.v <= 0) { p.tip.hidden = true; return; }
      var delta = hit.v - hit.pv;
      var sign = delta >= 0 ? "+" : "−";
      tipAt(p, ev,
        fmtLevel(hit.r.level, m.step) + " – " + fmtLevel(hit.r.level + m.step, m.step),
        (hit.isBear ? (zh() ? "熊證 " : "Bear ") : (zh() ? "牛證 " : "Bull ")) +
        Math.round(hit.v).toLocaleString() +
        (zh() ? " 單位 · 較上日 " : " units · vs prev day ") + sign + fmt(Math.abs(delta)));
    };
  }

  /* ---------- trend ---------- */

  function drawTrend() {
    var p = panels.trend;
    if (!p) return;
    var t = DATA.underlyings[state.ul].trend || [];
    var dim = sizeCanvas(p, 260);
    var ctx = p.ctx;
    if (t.length < 2) return;
    var padL = 52, padR = 56, padT = 14, padB = 26;
    var plotW = dim.w - padL - padR, plotH = dim.h - padT - padB;
    var maxV = 1;
    t.forEach(function (r) { maxV = Math.max(maxV, r[1], r[2]); });
    var x = function (i) { return padL + i / (t.length - 1) * plotW; };
    var y = function (v) { return padT + (1 - v / maxV) * plotH; };

    ctx.font = MONO;
    for (var g = 0; g <= 3; g++) {
      var gv = maxV * g / 3;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(padL + plotW, y(gv)); ctx.stroke();
      ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(fmt(gv), padL - 6, y(gv));
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, Math.floor((t.length - 1) / 2), t.length - 1].forEach(function (i) {
      ctx.fillText(t[i][0], x(i), dim.h - padB + 8);
    });

    [1, 2].forEach(function (si) {
      ctx.strokeStyle = si === 1 ? BULL : BEAR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      t.forEach(function (r, i) { i ? ctx.lineTo(x(i), y(r[si])) : ctx.moveTo(x(i), y(r[si])); });
      ctx.stroke();
      ctx.fillStyle = si === 1 ? BULL : BEAR;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(si === 1 ? (zh() ? "牛" : "Bull") : (zh() ? "熊" : "Bear"),
        x(t.length - 1) + 8, y(t[t.length - 1][si]));
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var i = Math.round((px - padL) / plotW * (t.length - 1));
      if (i < 0 || i >= t.length) { p.tip.hidden = true; return; }
      drawTrend();                     // clear old crosshair
      var c = panels.trend.ctx;
      c.strokeStyle = MUTED;
      c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x(i), padT); c.lineTo(x(i), padT + plotH); c.stroke();
      c.setLineDash([]);
      tipAt(p, ev, t[i][0],
        (zh() ? "牛 " : "Bull ") + fmt(t[i][1]) + " · " + (zh() ? "熊 " : "Bear ") + fmt(t[i][2]));
    };
  }

  /* ---------- issuers ---------- */

  function drawIssuers() {
    var p = panels.issuers;
    if (!p) return;
    var iss = DATA.underlyings[state.ul].issuers || [];
    var rowH = 30;
    var dim = sizeCanvas(p, Math.max(120, iss.length * rowH + 30));
    var ctx = p.ctx;
    var padL = 128, padR = 60, padT = 12;
    var plotW = dim.w - padL - padR;
    var maxV = 1;
    iss.forEach(function (r) { maxV = Math.max(maxV, r[2] + r[3]); });

    ctx.font = MONO;
    ctx.textBaseline = "middle";
    p.view = [];
    iss.forEach(function (r, idx) {
      var y = padT + idx * rowH + 5;
      var barH = rowH - 12;
      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.fillText(r[1], padL - 8, y + barH / 2);
      var wB = r[2] / maxV * plotW, wR = r[3] / maxV * plotW;
      ctx.fillStyle = BULL;
      ctx.fillRect(padL, y, Math.max(wB, r[2] > 0 ? 2 : 0), barH);
      ctx.fillStyle = BEAR;
      ctx.fillRect(padL + wB + 2, y, Math.max(wR, r[3] > 0 ? 2 : 0), barH);
      if (idx < 3) {
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        ctx.fillText(fmt(r[2] + r[3]), padL + wB + wR + 8, y + barH / 2);
      }
      p.view.push({ y0: y - 5, y1: y - 5 + rowH, r: r });
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var y = ev.clientY - rect.top;
      var hit = null;
      p.view.forEach(function (it) { if (y >= it.y0 && y < it.y1) hit = it; });
      if (!hit) { p.tip.hidden = true; return; }
      tipAt(p, ev, hit.r[1],
        (zh() ? "牛 " : "Bull ") + fmt(hit.r[2]) + " · " + (zh() ? "熊 " : "Bear ") + fmt(hit.r[3]));
    };
  }

  /* ---------- new listings ---------- */

  function drawNewlist() {
    var p = panels.newlist;
    if (!p) return;
    var nl = DATA.underlyings[state.ul].newlist || [];
    var dim = sizeCanvas(p, 220);
    var ctx = p.ctx;
    if (!nl.length) return;
    var padL = 40, padR = 16, padT = 12, padB = 26;
    var plotW = dim.w - padL - padR, plotH = dim.h - padT - padB;
    var maxV = 1;
    nl.forEach(function (r) { maxV = Math.max(maxV, r[1], r[2]); });
    var groupW = plotW / nl.length;
    var barW = Math.min(18, groupW / 2 - 3);

    ctx.font = MONO;
    for (var g = 0; g <= 2; g++) {
      var gv = maxV * g / 2;
      var gy = padT + (1 - g / 2) * plotH;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(gv)), padL - 6, gy);
    }
    p.view = [];
    nl.forEach(function (r, i) {
      var cx = padL + i * groupW + groupW / 2;
      var hB = r[1] / maxV * plotH, hR = r[2] / maxV * plotH;
      ctx.fillStyle = BULL;
      ctx.fillRect(cx - barW - 1, padT + plotH - hB, barW, hB);
      ctx.fillStyle = BEAR;
      ctx.fillRect(cx + 1, padT + plotH - hR, barW, hR);
      ctx.fillStyle = MUTED; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(r[0].slice(3), cx, dim.h - padB + 8);
      p.view.push({ x0: cx - groupW / 2, x1: cx + groupW / 2, r: r });
    });

    p.canvas.onpointermove = function (ev) {
      var rect = p.canvas.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var hit = null;
      p.view.forEach(function (it) { if (x >= it.x0 && x < it.x1) hit = it; });
      if (!hit) { p.tip.hidden = true; return; }
      tipAt(p, ev, hit.r[0],
        (zh() ? "新牛證 " : "New bulls ") + hit.r[1] + " · " + (zh() ? "新熊證 " : "New bears ") + hit.r[2]);
    };
  }

  /* ---------- MCE ---------- */

  function mceTable() {
    var body = $("cbbc-mce-body");
    if (!body) return;
    body.innerHTML = "";
    DATA.mce.items.slice(0, 14).forEach(function (it) {
      var tr = document.createElement("tr");
      var side = it[4] === "Bull";
      tr.innerHTML =
        "<td>" + it[3] + "</td>" +
        "<td>" + it[0] + "</td>" +
        '<td><span class="mce-side" style="--c:' + (side ? BULL : BEAR) + '">' +
        (side ? (zh() ? "牛" : "Bull") : (zh() ? "熊" : "Bear")) + "</span> " + it[5] + "</td>" +
        "<td>" + it[2].replace(/ (Issuance|Asia|Products|B\.V\.|Limited|Corporation|and Shanghai Banking).*/, "") + "</td>";
      body.appendChild(tr);
    });
    var more = $("cbbc-mce-more");
    if (more) {
      more.hidden = DATA.mce.count <= 14;
      more.querySelectorAll("b").forEach(function (b) { b.textContent = String(DATA.mce.count); });
    }
  }
})();
