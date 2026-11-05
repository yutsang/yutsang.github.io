/**
 * Tab switching and shared freshness bar for the combined HKEX data page
 * (/projects/hkex-data/). The three dashboards (CBBC, Stock Connect,
 * short-selling) are built by their own independent chart scripts, which
 * still each fetch their own JSON; this file only owns navigation between
 * them and the single "last updated" readout, since all three JSON files
 * are now committed together by one daily pipeline run.
 */
(function () {
  "use strict";

  var TABS = ["cbbc", "stock-connect", "short-selling", "market-pulse"];

  function activate(name) {
    if (TABS.indexOf(name) === -1) name = TABS[0];
    document.querySelectorAll(".hkex-tab").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".hkex-panel").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-tab") !== name;
    });
    // Panels were sized at 0 width while hidden; let each chart re-measure.
    window.dispatchEvent(new Event("resize"));
  }

  document.querySelectorAll(".hkex-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-tab");
      activate(name);
      history.replaceState(null, "", "#" + name);
    });
  });

  activate((location.hash || "#" + TABS[0]).slice(1));

  /* ---------- shared freshness bar ---------- */

  function hktNow() {
    var n = new Date();
    return new Date(n.getTime() + (480 + n.getTimezoneOffset()) * 60000);
  }

  function loadFreshness(bust) {
    return fetch("/data/shortselling-latest.json" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        document.querySelectorAll(".hkex-asof").forEach(function (el) { el.textContent = d.date || "—"; });
        document.querySelectorAll(".hkex-generated").forEach(function (el) {
          el.textContent = (d.generated || "—").replace(" UTC", "");
        });
        var now = hktNow();
        var day = now.getDay(), hm = now.getHours() * 100 + now.getMinutes();
        var trading = day >= 1 && day <= 5 && hm >= 930 && hm <= 1610;
        var sameDay = d.date === now.toISOString().slice(0, 10);
        var stateName = trading ? "live" : (sameDay ? "fresh" : "stale");
        ["live", "fresh", "stale"].forEach(function (s) {
          var el = document.getElementById("hkex-state-" + s);
          if (el) el.hidden = s !== stateName;
        });
      });
  }

  loadFreshness(false).catch(function () {});

  var rb = document.getElementById("hkex-refresh");
  if (rb) rb.addEventListener("click", function () {
    rb.disabled = true;
    window.dispatchEvent(new Event("hkex:refresh-all"));   // each chart module re-fetches + redraws
    loadFreshness(true).catch(function () {}).then(function () {
      setTimeout(function () { rb.disabled = false; }, 600);
    });
  });
})();
