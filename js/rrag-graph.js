/**
 * Interactive force-directed graph of the rrag wiki.
 * Data: /data/rrag-graph.json (rebuilt weekly by .github/workflows/rrag-graph.yml).
 * Hand-rolled canvas simulation — no dependencies, matching the rest of the site.
 */
(function () {
  "use strict";

  var GROUP_COLORS = {
    sources: "#c14a2b",
    concepts: "#2e7d51",
    mocs: "#8f6a12",
    index: "#5158b8",
    entities: "#5158b8"
  };
  var INK = "#1a1815";
  var EDGE = "rgba(26, 24, 21, 0.10)";
  var EDGE_DIM = "rgba(26, 24, 21, 0.04)";
  var REPO_BLOB = "https://github.com/yutsang/rrag/blob/main/wiki/";
  var LABEL_MIN_DEG = 18;

  var container = document.getElementById("rrag-graph");
  if (!container) return;
  var canvas = container.querySelector("canvas");
  var tooltip = container.querySelector(".graph-tooltip");
  var ctx = canvas.getContext("2d");

  var nodes = [], links = [], adj = [];
  var scale = 1, tx = 0, ty = 0;          // view transform
  var alpha = 1, userMoved = false;
  var hoverIdx = -1, dragIdx = -1, panning = false;
  var pointerLast = null, raf = null;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  fetch("/data/rrag-graph.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(function () {
      container.classList.add("graph-failed");
    });

  function init(data) {
    var stats = document.getElementById("rrag-stats");
    if (stats) {
      stats.querySelector("[data-stat=pages]").textContent = data.nodes.length;
      stats.querySelector("[data-stat=links]").textContent = data.links.length;
      stats.querySelector("[data-stat=updated]").textContent = data.generated;
    }

    // Seed each group in its own angular sector so clusters read immediately
    var groups = {};
    data.nodes.forEach(function (n) { groups[n.group] = true; });
    var groupList = Object.keys(groups);
    nodes = data.nodes.map(function (n, i) {
      var sector = (groupList.indexOf(n.group) / groupList.length) * Math.PI * 2;
      var jitter = Math.random() * Math.PI / 2;
      var r = 120 + Math.random() * 160;
      return {
        id: n.id, group: n.group, path: n.path, deg: n.deg,
        x: Math.cos(sector + jitter) * r,
        y: Math.sin(sector + jitter) * r,
        vx: 0, vy: 0,
        r: 3.5 + Math.sqrt(n.deg) * 1.1
      };
    });
    links = data.links;
    adj = nodes.map(function () { return []; });
    links.forEach(function (l) { adj[l[0]].push(l[1]); adj[l[1]].push(l[0]); });

    resize();
    window.addEventListener("resize", resize);
    bindPointer();

    if (reduceMotion) {
      for (var i = 0; i < 300; i++) tick();
      fit(); draw();
    } else {
      loop();
    }
  }

  /* ---------- simulation ---------- */

  function tick() {
    var i, j, n, m, dx, dy, d2, d, f;
    // pairwise repulsion
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        m = nodes[j];
        dx = n.x - m.x; dy = n.y - m.y;
        d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 90000) continue;
        f = 900 / d2;
        dx *= f; dy *= f;
        n.vx += dx; n.vy += dy;
        m.vx -= dx; m.vy -= dy;
      }
    }
    // springs
    for (i = 0; i < links.length; i++) {
      n = nodes[links[i][0]]; m = nodes[links[i][1]];
      dx = m.x - n.x; dy = m.y - n.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      f = (d - 46) * 0.012;
      dx = dx / d * f; dy = dy / d * f;
      n.vx += dx; n.vy += dy;
      m.vx -= dx; m.vy -= dy;
    }
    // gravity toward center + integrate
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n.vx -= n.x * 0.004; n.vy -= n.y * 0.004;
      if (i !== dragIdx) {
        n.x += n.vx * alpha; n.y += n.vy * alpha;
      }
      n.vx *= 0.82; n.vy *= 0.82;
    }
  }

  function loop() {
    tick();
    if (!userMoved) fit();
    draw();
    alpha = Math.max(alpha * 0.995, 0.06);
    raf = requestAnimationFrame(loop);
  }

  /* ---------- rendering ---------- */

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var w = container.clientWidth;
    var h = Math.max(420, Math.min(640, Math.round(w * 0.66)));
    canvas.style.height = h + "px";
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fit() {
    if (!nodes.length) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    nodes.forEach(function (n) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    });
    var w = container.clientWidth, h = parseFloat(canvas.style.height);
    var pad = 40;
    scale = Math.min((w - pad * 2) / (maxX - minX + 1), (h - pad * 2) / (maxY - minY + 1), 1.6);
    tx = w / 2 - (minX + maxX) / 2 * scale;
    ty = h / 2 - (minY + maxY) / 2 * scale;
  }

  function draw() {
    var w = container.clientWidth, h = parseFloat(canvas.style.height) || 420;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    var focus = hoverIdx >= 0;
    var neigh = focus ? adj[hoverIdx] : null;

    // edges
    ctx.lineWidth = 1 / scale;
    for (var i = 0; i < links.length; i++) {
      var a = links[i][0], b = links[i][1];
      var lit = focus && (a === hoverIdx || b === hoverIdx);
      ctx.strokeStyle = focus ? (lit ? "rgba(193,74,43,0.5)" : EDGE_DIM) : EDGE;
      ctx.beginPath();
      ctx.moveTo(nodes[a].x, nodes[a].y);
      ctx.lineTo(nodes[b].x, nodes[b].y);
      ctx.stroke();
    }

    // nodes
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var isFocus = i === hoverIdx || (focus && neigh.indexOf(i) !== -1);
      ctx.globalAlpha = focus && !isFocus ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = GROUP_COLORS[n.group] || GROUP_COLORS.index;
      ctx.fill();
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = "#f5f1e8";           // 2px surface ring separates overlapping marks
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // labels: hubs always, everything on hover focus
    ctx.font = (11 / scale) + "px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "middle";
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var show = n.deg >= LABEL_MIN_DEG || i === hoverIdx || (focus && neigh.indexOf(i) !== -1);
      if (!show) continue;
      ctx.globalAlpha = focus && i !== hoverIdx && neigh.indexOf(i) === -1 ? 0.3 : 1;
      ctx.fillStyle = INK;
      ctx.fillText(n.id, n.x + n.r + 4 / scale, n.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------- interaction ---------- */

  function toWorld(px, py) {
    return { x: (px - tx) / scale, y: (py - ty) / scale };
  }

  function nodeAt(px, py) {
    var p = toWorld(px, py);
    var best = -1, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var dx = nodes[i].x - p.x, dy = nodes[i].y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var hit = Math.max(nodes[i].r, 9 / scale);   // hit target >= mark
      if (d < hit && d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function pos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function bindPointer() {
    canvas.addEventListener("pointerdown", function (ev) {
      var p = pos(ev);
      dragIdx = nodeAt(p.x, p.y);
      panning = dragIdx === -1;
      pointerLast = p;
      canvas.setPointerCapture(ev.pointerId);
      if (dragIdx !== -1) alpha = Math.max(alpha, 0.4);
    });

    canvas.addEventListener("pointermove", function (ev) {
      var p = pos(ev);
      if (dragIdx !== -1) {
        var w = toWorld(p.x, p.y);
        nodes[dragIdx].x = w.x; nodes[dragIdx].y = w.y;
        nodes[dragIdx].vx = 0; nodes[dragIdx].vy = 0;
        userMoved = true;
      } else if (panning && pointerLast) {
        tx += p.x - pointerLast.x; ty += p.y - pointerLast.y;
        userMoved = true;
      } else {
        var idx = nodeAt(p.x, p.y);
        if (idx !== hoverIdx) {
          hoverIdx = idx;
          canvas.style.cursor = idx === -1 ? "grab" : "pointer";
          updateTooltip(p);
          if (reduceMotion) draw();
        } else if (idx !== -1) {
          updateTooltip(p);
        }
      }
      pointerLast = p;
    });

    canvas.addEventListener("pointerup", function (ev) {
      var p = pos(ev);
      var moved = false;
      if (pointerLast) {
        moved = Math.abs(p.x - pointerLast.x) > 3 || Math.abs(p.y - pointerLast.y) > 3;
      }
      var idx = nodeAt(p.x, p.y);
      if (dragIdx !== -1 && idx === dragIdx && !moved) {
        window.open(REPO_BLOB + encodeURI(nodes[idx].path), "_blank", "noopener");
      }
      dragIdx = -1; panning = false;
    });

    canvas.addEventListener("pointerleave", function () {
      hoverIdx = -1; tooltip.hidden = true;
      if (reduceMotion) draw();
    });

    canvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var p = pos(ev);
      var k = ev.deltaY < 0 ? 1.12 : 0.89;
      var w = toWorld(p.x, p.y);
      scale = Math.min(Math.max(scale * k, 0.25), 5);
      tx = p.x - w.x * scale; ty = p.y - w.y * scale;
      userMoved = true;
      if (reduceMotion) draw();
    }, { passive: false });

    var reset = document.getElementById("rrag-reset");
    if (reset) reset.addEventListener("click", function () {
      userMoved = false; alpha = Math.max(alpha, 0.3);
      fit();
      if (reduceMotion) draw();
    });
  }

  function updateTooltip(p) {
    if (hoverIdx === -1) { tooltip.hidden = true; return; }
    var n = nodes[hoverIdx];
    tooltip.querySelector(".graph-tooltip__title").textContent = n.id;
    tooltip.querySelector(".graph-tooltip__meta").textContent =
      n.group + " · " + n.deg + " links";
    tooltip.hidden = false;
    var w = container.clientWidth;
    tooltip.style.left = Math.min(p.x + 14, w - tooltip.offsetWidth - 8) + "px";
    tooltip.style.top = (p.y + 14) + "px";
  }
})();
