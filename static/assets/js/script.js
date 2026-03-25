/* ============================================================
   AfricanSTN — script.js v2.0
   Mobile nav · Scroll reveal · Manual theme override
   ============================================================ */

(function () {
  'use strict';

  /* ── MOBILE NAV ── */
  var hamburger = document.querySelector('.nav-hamburger');
  var mobileNav = document.querySelector('.nav-mobile');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', function (e) {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── ACTIVE NAV LINK ── */
  var path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(function (a) {
    if (a.getAttribute('href') === path) a.classList.add('active');
    if (!path && a.getAttribute('href') === 'index.html') a.classList.add('active');
  });

  /* ── SCROLL REVEAL ── */
  /* Respects prefers-reduced-motion (CSS handles the no-animation case) */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('revealed'); });
  }

  /* ── MANUAL THEME TOGGLE ── */
  /* Allows user to override system preference.
     Stored in localStorage so it persists between pages. */
  var THEME_KEY = 'africanstn-theme';
  var toggleBtn = document.querySelector('.theme-toggle');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (toggleBtn) toggleBtn.textContent = '☀ Light';
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (toggleBtn) toggleBtn.textContent = '☽ Dark';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (toggleBtn) toggleBtn.textContent = '◑ Auto';
    }
  }

  /* On load: apply saved preference if any */
  var saved = localStorage.getItem(THEME_KEY);
  if (saved) applyTheme(saved);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var current = localStorage.getItem(THEME_KEY) || 'system';
      var next = current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system';
      if (next === 'system') {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, next);
      }
      applyTheme(next);
    });
  }

  /* ── TALLY FORM LOADER ── */
  /* Loads Tally embed script once if the page has a Tally iframe */
  if (document.querySelector('iframe[data-tally-src]')) {
    var tallyScript = document.createElement('script');
    tallyScript.src = 'https://tally.so/widgets/embed.js';
    tallyScript.onload = function () {
      if (window.Tally) window.Tally.loadEmbeds();
    };
    document.head.appendChild(tallyScript);
  }

}());
