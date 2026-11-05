(function () {
  "use strict";

  function initNav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var toggle = nav.querySelector(".nav-toggle");
    var links = nav.querySelector(".nav-links");
    if (!toggle || !links) return;

    function close() {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  function initHomeFromConfig() {
    var c = window.SITE_CONFIG;
    if (!c) return;
    var nameEl = document.getElementById("site-brand-name");
    if (nameEl && c.brand && !nameEl.querySelector("[data-lang]")) {
      nameEl.textContent = c.brand;
    }
    var initialsEl = document.getElementById("site-initials");
    if (initialsEl && c.initials) initialsEl.textContent = c.initials;
  }

  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        var id = this.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function initLanguageToggle() {
    // Full implementation lives in js/i18n.js — this is a safety net
    // in case i18n.js was loaded but failed to bind (e.g. nav injected later).
    if (window.SiteI18n && typeof window.SiteI18n.init === "function") {
      window.SiteI18n.init();
    }
  }

  function initContactFormDemo() {
    var form = document.querySelector(".contact-form form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      alert("Thank you for your message. This demo form is not connected to a backend.");
      form.reset();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initLanguageToggle();
    initHomeFromConfig();
    initSmoothAnchors();
    initContactFormDemo();
  });
})();
