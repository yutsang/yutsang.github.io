/**
 * CBBC street-outstanding distribution ladder.
 * Data: /data/cbbc-latest.json, rebuilt each trading morning by
 * .github/workflows/cbbc-data.yml from HKEX's public CBBC full list.
 */
(function () {
  "use strict";

  var BULL = "#2e7d51";
  var BEAR = "#c14a2b";
  var INK = "#1a1815";
  var MUTED = "#706a5e";
  var GRID = "rgba(26, 24, 21, 0.07)";
  var SURFACE = "#f5f1e8";

  var container = document.getElementById("cbbc-chart");
  if (!container) return;
  var canvas = container.querySelector("canvas");
  var tooltip = container.querySelector(".graph-tooltip");
  var ctx = canvas.getContext("2d");
  var lang = function () { return document.documentElement.lang || "en"; };

  var DATA = null;
  var state = { ul: "HSI", mult: 2 };   // mult × base step
  var view = [];                         // rendered rows for hit-testing

  fetch("/data/cbbc-latest.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      buildFilters();
      document.querySelectorAll(".cbbc-asof").forEach(function (el) {
        el.textContent = d.os_asof + " HKT";
      });
      resize();
      window.addEventListener("resize", resize);
      bindHover();
    })
    .catch(function () { container.classList.add("graph-failed"); });

  function buildFilters() {
    var ulRow = document.getElementById("cbbc-ul-filters");
    Object.keys(DATA.underlyings).forEach(function (ul) {
      var d = DATA.underlyings[ul];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cbbc-chip" + (ul === state.ul ? " is-active" : "");
      b.innerHTML = '<span data-lang="en">' + d.en + '</span><span data-lang="zh">' + d.zh + "</span>";
      b.addEventListener("click", function () {
        state.ul = ul;
        ulRow.querySelectorAll(".cbbc-chip").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        updateBucketLabels();
        draw();
      });
      ulRow.appendChild(b);
    });

    document.querySelectorAll("[data-mult]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mult = parseInt(b.getAttribute("data-mult"), 10);
        document.querySelectorAll("[data-mult]").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        draw();
      });
    });
    updateBucketLabels();
  }

  function updateBucketLabels() {
    var step = DATA.underlyings[state.ul].step;
    document.querySelectorAll("[data-mult]").forEach(function (b) {
      var m = parseInt(b.getAttribute("data-mult"), 10);
      var v = step * m;
      b.textContent = (v >= 1 ? v.toFixed(0) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    });
  }

  function merged() {
    var d = DATA.underlyings[state.ul];
    var step = d.step * state.mult;
    var map = {};
    d.buckets.forEach(function (b) {
      var lv = Math.floor(b[0] / step + 1e-9) * step;
      var key = lv.toFixed(4);
      if (!map[key]) map[key] = { level: lv, bull: 0, bear: 0 };
      map[key].bull += b[1];
      map[key].bear += b[2];
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return b.level - a.level; });   // high levels on top
    // Focus the ladder: keep rows within a window around spot that covers
    // the bulk of outstanding, but always at least 12 rows each side.
    var spotIdx = rows.findIndex(function (r) { return r.level <= d.spot; });
    if (spotIdx < 0) spotIdx = Math.floor(rows.length / 2);
    var lo = Math.max(0, spotIdx - 16), hi = Math.min(rows.length, spotIdx + 16);
    return { d: d, step: step, rows: rows.slice(lo, hi) };
  }

  function fmt(x) {
    if (x >= 1e6) return (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(0) + "K";
    return String(Math.round(x));
  }

  function fmtLevel(lv, step) {
    return step >= 1 ? lv.toLocaleString("en-US") : lv.toFixed(2);
  }

  function resize() {
    if (!DATA) return;
    var dpr = window.devicePixelRatio || 1;
    var w = container.clientWidth;
    var h = 560;
    canvas.style.height = h + "px";
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    var m = merged();
    var w = container.clientWidth, h = parseFloat(canvas.style.height) || 560;
    ctx.clearRect(0, 0, w, h);

    var padL = 74, padR = 60, padT = 18, padB = 10;
    var plotW = w - padL - padR;
    var rows = m.rows;
    var rowH = Math.min(24, (h - padT - padB) / Math.max(rows.length, 1));
    var barH = Math.max(6, rowH - 4);
    var maxV = 1;
    rows.forEach(function (r) { maxV = Math.max(maxV, r.bull, r.bear); });

    view = [];
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "middle";

    // spot divider
    var spotY = null;
    for (var k = 0; k < rows.length; k++) {
      if (rows[k].level <= m.d.spot) { spotY = padT + k * rowH; break; }
    }
    if (spotY !== null) {
      ctx.strokeStyle = INK;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padL - 60, spotY);
      ctx.lineTo(w - 6, spotY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = INK;
      ctx.textAlign = "right";
      ctx.fillText((lang() === "zh" ? "現價估算 " : "est. spot ") + fmtLevel(m.d.spot, m.step), w - 8, spotY - 9);
    }

    rows.forEach(function (r, idx) {
      var y = padT + idx * rowH + (rowH - barH) / 2;
      var isBear = r.level > m.d.spot;
      var v = isBear ? r.bear : r.bull;
      var len = v / maxV * plotW;

      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.fillText(fmtLevel(r.level, m.step), padL - 8, y + barH / 2);

      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(padL, y + barH / 2);
      ctx.lineTo(padL + plotW, y + barH / 2);
      ctx.stroke();

      if (v > 0) {
        ctx.fillStyle = isBear ? BEAR : BULL;
        rounded(padL, y, Math.max(len, 2), barH, 3);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = SURFACE;   // surface gap between adjacent bars
        rounded(padL, y, Math.max(len, 2), barH, 3);
        ctx.stroke();
      }
      view.push({ y0: padT + idx * rowH, y1: padT + (idx + 1) * rowH, row: r, isBear: isBear, v: v });
    });

    // direct labels on the heaviest zone of each side only
    ["bull", "bear"].forEach(function (side) {
      var best = null;
      view.forEach(function (it) {
        var val = side === "bear" ? (it.isBear ? it.v : 0) : (!it.isBear ? it.v : 0);
        if (val > 0 && (!best || val > best.v)) best = { it: it, v: val };
      });
      if (best) {
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        ctx.fillText(fmt(best.v), padL + best.v / maxV * plotW + 6,
          (best.it.y0 + best.it.y1) / 2);
      }
    });
  }

  function rounded(x, y, w2, h2, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w2 - r, y);
    ctx.arcTo(x + w2, y, x + w2, y + r, r);
    ctx.lineTo(x + w2, y + h2 - r);
    ctx.arcTo(x + w2, y + h2, x + w2 - r, y + h2, r);
    ctx.lineTo(x, y + h2);
    ctx.closePath();
  }

  function bindHover() {
    canvas.addEventListener("pointermove", function (ev) {
      var rect = canvas.getBoundingClientRect();
      var y = ev.clientY - rect.top;
      var hit = null;
      for (var k = 0; k < view.length; k++) {
        if (y >= view[k].y0 && y < view[k].y1) { hit = view[k]; break; }
      }
      if (!hit || hit.v <= 0) { tooltip.hidden = true; return; }
      var m = merged();
      var zh = lang() === "zh";
      tooltip.querySelector(".graph-tooltip__title").textContent =
        fmtLevel(hit.row.level, m.step) + " – " + fmtLevel(hit.row.level + m.step, m.step);
      tooltip.querySelector(".graph-tooltip__meta").textContent =
        (hit.isBear ? (zh ? "熊證 " : "Bear ") : (zh ? "牛證 " : "Bull ")) +
        Math.round(hit.v).toLocaleString("en-US") +
        (zh ? " 單位（等價指數/股份）" : " units (index/share equivalent)");
      tooltip.hidden = false;
      var px = ev.clientX - rect.left;
      tooltip.style.left = Math.min(px + 14, container.clientWidth - tooltip.offsetWidth - 8) + "px";
      tooltip.style.top = (y + 14) + "px";
    });
    canvas.addEventListener("pointerleave", function () { tooltip.hidden = true; });
  }
})();
