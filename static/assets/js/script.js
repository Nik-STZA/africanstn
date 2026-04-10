/* ============================================================
   AfricanSTN — script.js v3.0
   Mobile nav · Scroll reveal · Cookie consent · Theme toggle
   ============================================================ */

(function () {
  'use strict';

  var CONSENT_KEY = 'africanstn-consent';
  var THEME_KEY = 'africanstn-theme';

  /* ── CONSENT HELPERS ── */
  function getConsent() {
    return localStorage.getItem(CONSENT_KEY);
  }

  function hasFullConsent() {
    return getConsent() === 'accept_all';
  }

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
  /* Respects cookie consent — only persists to localStorage when
     the user has accepted functionality cookies. */
  var toggleBtn = document.querySelector('.theme-toggle');

  function getEffectiveColorScheme(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateTallyTheme(effectiveScheme) {
    var iframe = document.getElementById('tally-iframe');
    if (!iframe) return;
    var src = iframe.getAttribute('src') || iframe.getAttribute('data-tally-src') || '';
    if (!src || src.indexOf('tally.so') === -1) return;
    // Remove existing theme param if present
    src = src.replace(/([?&])theme=(dark|light)/, '$1').replace(/[?&]$/, '');
    // Tally treats "dark" theme = light text; default/no param = dark text.
    // We only need to add theme=dark when the effective scheme is dark.
    if (effectiveScheme === 'dark') {
      src += (src.indexOf('?') !== -1 ? '&' : '?') + 'theme=dark';
    }
    if (iframe.src && iframe.src.indexOf('tally.so') !== -1) {
      iframe.src = src;
    }
  }

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
    updateTallyTheme(getEffectiveColorScheme(theme));
  }

  /* On load: only read saved theme if consent allows it */
  if (hasFullConsent()) {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
  }

  /* Session-only fallback when consent is not granted */
  var sessionTheme = null;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var current;
      if (hasFullConsent()) {
        current = localStorage.getItem(THEME_KEY) || 'system';
      } else {
        current = sessionTheme || 'system';
      }
      var next = current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system';

      if (hasFullConsent()) {
        if (next === 'system') {
          localStorage.removeItem(THEME_KEY);
        } else {
          localStorage.setItem(THEME_KEY, next);
        }
      } else {
        sessionTheme = next;
      }
      applyTheme(next);
    });
  }

  /* ── COOKIE CONSENT BANNER ── */
  var banner = document.getElementById('cookie-banner');
  var acceptBtn = document.getElementById('cookie-accept');
  var essentialsBtn = document.getElementById('cookie-essentials');

  function loadGoogleAnalytics() {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', {
      'analytics_storage': 'granted',
      'functionality_storage': 'granted',
      'personalization_storage': 'granted'
    });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-TRYEETGY0L';
    document.head.appendChild(s);
    s.onload = function () {
      gtag('js', new Date());
      gtag('config', 'G-TRYEETGY0L');
    };
  }

  function logConsentToServer(action) {
    try {
      var payload = JSON.stringify({ action: action });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/consent-log', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/consent-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        });
      }
    } catch (e) {
      /* Silently fail — consent logging is non-critical */
    }
  }

  function dismissBanner() {
    if (banner) {
      banner.setAttribute('aria-hidden', 'true');
      banner.classList.remove('cookie-banner--visible');
    }
  }

  function handleConsent(choice) {
    localStorage.setItem(CONSENT_KEY, choice);
    dismissBanner();
    logConsentToServer(choice);

    if (choice === 'accept_all') {
      loadGoogleAnalytics();
      /* Now that consent is granted, persist current theme if set */
      var currentTheme = document.documentElement.getAttribute('data-theme');
      if (currentTheme) {
        localStorage.setItem(THEME_KEY, currentTheme);
      }
    } else {
      /* Essentials only — deny all optional storage */
      if (typeof gtag === 'function') {
        gtag('consent', 'update', {
          'analytics_storage': 'denied',
          'functionality_storage': 'denied',
          'personalization_storage': 'denied'
        });
      }
      /* Remove any previously stored theme preference */
      localStorage.removeItem(THEME_KEY);
    }
  }

  if (banner && !getConsent()) {
    banner.setAttribute('aria-hidden', 'false');
    banner.classList.add('cookie-banner--visible');
  }

  if (acceptBtn) {
    acceptBtn.addEventListener('click', function () { handleConsent('accept_all'); });
  }
  if (essentialsBtn) {
    essentialsBtn.addEventListener('click', function () { handleConsent('essentials_only'); });
  }


}());
