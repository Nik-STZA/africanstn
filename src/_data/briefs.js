// Build-time data source for the Weekly Intelligence Briefs section.
//
// Reads the `weekly_reports` table from Supabase via the PostgREST endpoint
// using the public anon key. This runs once per Eleventy build (SSG), so the
// briefs are baked into static HTML — no client-side Supabase calls and no
// secrets shipped to the browser.
//
// The English brief bodies are translated into the site's other four languages
// (fr/pt/ar/sw) so the briefs respond to the language selector like the rest of
// the site. Translation cannot happen here: the Netlify AI Gateway only injects
// ANTHROPIC_* credentials into Functions / Edge Functions, never into the build
// command, so calling it from this build always fell back to English. Instead a
// runtime function (netlify/functions/translate-briefs.mjs) performs the
// translation where the gateway is available and caches each result in Netlify
// Blobs. This build pulls those translations two ways, in order of preference:
//
//   1. directly from the Blobs cache (fast, no network round trip), and
//   2. from the translation function over HTTPS, which also fills the cache for
//      any brief that has not been translated yet.
//
// Every step degrades gracefully: if neither source yields a translation, the
// brief is emitted with its original English body and flagged so the template
// can show a short "original English" notice.

const core = require("../../netlify/lib/briefs-core.cjs");

// Best-effort handle to the Netlify Blobs translation cache. In a normal
// Netlify build the store auto-configures; otherwise fall back to explicit site
// id + token from the environment. Returns null if Blobs is unavailable, in
// which case translations come from the function endpoint instead.
function getCacheStore() {
  let getStore;
  try {
    ({ getStore } = require("@netlify/blobs"));
  } catch (e) {
    return null;
  }

  try {
    return getStore(core.CACHE_STORE);
  } catch (e) {
    /* not auto-configured — try explicit credentials below */
  }

  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (!siteID || !token) return null;
  try {
    return getStore({ name: core.CACHE_STORE, siteID, token });
  } catch (e) {
    return null;
  }
}

// Read whatever translations are already cached in Blobs. Returns a Map keyed
// by "<date>|<lang>". Missing entries simply aren't present.
async function readCachedTranslations(store, briefs) {
  const out = new Map();
  if (!store) return out;

  const tasks = [];
  for (const brief of briefs) {
    for (const lang of core.TARGET_LANGS) {
      tasks.push({ brief, lang });
    }
  }

  await core.runPool(
    tasks,
    async ({ brief, lang }) => {
      try {
        const cached = await store.get(core.cacheKey(brief.id, lang, brief.hash), {
          type: "text",
        });
        if (cached) out.set(`${brief.date}|${lang}`, cached);
      } catch (e) {
        /* missing or unreadable — skip */
      }
    },
    8
  );

  return out;
}

// Ask the runtime translation function for translations. This works from the
// build because it is a plain HTTPS GET (the same kind of request used to reach
// Supabase). The function translates anything still missing and caches it, so
// this also primes the Blobs cache for next time. Returns a Map keyed by
// "<date>|<lang>", or an empty Map if the endpoint is unreachable.
async function fetchTranslationsFromFunction() {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return new Map();

  const endpoint = `${base.replace(/\/+$/, "")}/api/translate-briefs`;
  // Bound the wait so a slow or hanging function never stalls the build; on
  // timeout we just emit English and the cache is warmed for the next build.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[briefs] Translation function responded ${res.status}.`);
      return new Map();
    }
    const data = await res.json();
    return new Map(Object.entries(data.translations || {}));
  } catch (err) {
    console.warn(`[briefs] Translation function unreachable (${err.message}).`);
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function () {
  const sourceBriefs = await core.fetchSourceBriefs();
  if (sourceBriefs.length === 0) return [];

  // Prefer the Blobs cache (fast); fall back to the function endpoint for any
  // brief/language still missing.
  const store = getCacheStore();
  const translations = await readCachedTranslations(store, sourceBriefs);

  const needsFunction = sourceBriefs.some((brief) =>
    core.TARGET_LANGS.some((lang) => !translations.has(`${brief.date}|${lang}`))
  );
  if (needsFunction) {
    const fromFn = await fetchTranslationsFromFunction();
    for (const [k, v] of fromFn) {
      if (!translations.has(k)) translations.set(k, v);
    }
  }

  // Flatten into one page object per (language, brief). The templates paginate
  // over this array: brief.njk renders one detail page each, and briefs.njk
  // filters by language for each list page.
  const pages = [];
  for (const brief of sourceBriefs) {
    pages.push({
      id: brief.id,
      date: brief.date,
      lang: "en",
      itemCount: brief.itemCount,
      publishedHuman: core.formatHuman(brief.iso, "en"),
      markdown: brief.markdown,
      translated: true,
    });
    for (const lang of core.TARGET_LANGS) {
      const translated = translations.get(`${brief.date}|${lang}`);
      pages.push({
        id: brief.id,
        date: brief.date,
        lang,
        itemCount: brief.itemCount,
        publishedHuman: core.formatHuman(brief.iso, lang),
        markdown: translated || brief.markdown,
        translated: Boolean(translated),
      });
    }
  }

  return pages;
};
