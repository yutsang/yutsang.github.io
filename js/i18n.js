/*
 * Site-wide bilingual controller.
 *
 * Strategy: no URL routing. Language is stored in localStorage["site-lang"]
 * and applied as `document.documentElement.lang`. Paired markup like
 *   <span data-lang="en">Hello</span><span data-lang="zh">你好</span>
 * is shown/hidden via CSS (see css/site.css).
 *
 * This file has two entry points:
 *   1. The IIFE at the bottom — runs immediately to set the lang attribute
 *      before paint, avoiding a flash of the wrong language.
 *   2. Window.SiteI18n.init() — called from site-ui.js after DOMContentLoaded
 *      to wire up the .lang-toggle button.
 *
 * Keep the pre-paint path synchronous and dependency-free.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "site-lang";
  var SUPPORTED = ["en", "zh"];

  function safeGet() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function safeSet(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch (e) {}
  }

  function detectInitial() {
    var stored = safeGet();
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    // First visit: infer from browser language, default to en.
    var nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    if (nav.indexOf("zh") === 0) return "zh";
    return "en";
  }

  function applyLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = "en";
    document.documentElement.lang = lang;
    // Also update title if a bilingual <title data-title-en/zh> pattern is used.
    var t = document.querySelector("title[data-title-en]");
    if (t) {
      var other = t.getAttribute("data-title-" + lang);
      if (other) t.textContent = other;
    }
    // Fire a custom event so page-specific code (charts, etc.) can react.
    try {
      document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: lang } }));
    } catch (e) {}
  }

  function current() {
    return document.documentElement.lang === "zh" ? "zh" : "en";
  }

  function toggle() {
    var next = current() === "zh" ? "en" : "zh";
    safeSet(next);
    applyLang(next);
  }

  function init() {
    document.querySelectorAll(".lang-toggle").forEach(function (btn) {
      if (btn.__i18nBound) return;
      btn.__i18nBound = true;
      btn.addEventListener("click", toggle);
    });
  }

  // Expose API for site-ui.js and page scripts.
  window.SiteI18n = {
    init: init,
    current: current,
    toggle: toggle,
    applyLang: applyLang,
  };

  // Pre-paint: apply as early as possible.
  applyLang(detectInitial());

  // Belt-and-braces: also hook up on DOMContentLoaded in case pages forget.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
