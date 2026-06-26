// Build-time data source for the Weekly Intelligence Briefs section.
//
// Reads the `weekly_reports` table from Supabase via the PostgREST endpoint
// using the public anon key. This runs once per Eleventy build (SSG), so the
// briefs are baked into static HTML — no client-side Supabase calls and no
// secrets shipped to the browser.
//
// The English brief bodies are then translated into the site's other four
// languages (fr/pt/ar/sw) at build time using Netlify AI Gateway, so the
// briefs respond to the language selector like the rest of the site. Each
// translation is cached in Netlify Blobs keyed by brief id, language and a
// hash of the source markdown, so only new or changed briefs are translated
// on subsequent builds. Every step degrades gracefully: if translation or
// caching is unavailable, the brief is emitted with its original English body
// and flagged so the template can show a short "original English" notice.

const crypto = require("crypto");

// Languages the site is built in. English is the source; the rest are targets
// for machine translation. Kept in sync with src/_data/languages.json.
const TARGET_LANGS = ["fr", "pt", "ar", "sw"];
const LANG_NAMES = {
  fr: "French",
  pt: "Portuguese",
  ar: "Arabic",
  sw: "Swahili",
};
// BCP-47 locales used to format the published date per language.
const LOCALES = { en: "en-GB", fr: "fr-FR", pt: "pt-PT", ar: "ar", sw: "sw" };

// Translation model — Haiku is fast and inexpensive, which matters when a
// first build translates every historical brief into four languages.
const TRANSLATION_MODEL = "claude-haiku-4-5";
// Cap concurrent AI Gateway requests so a large first build does not exhaust
// the per-account tokens-per-minute budget all at once.
const MAX_CONCURRENCY = 6;

// Format an ISO timestamp for display in a given language, e.g. "25 June 2026"
// in English or "25 juin 2026" in French. Falls back to an empty string on a
// bad date.
function formatHuman(iso, lang) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] || "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch (e) {
    return "";
  }
}

// Reduce an ISO timestamp to the YYYY-MM-DD slug used in brief URLs.
function isoDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

// Short stable fingerprint of the source markdown, used in the cache key so a
// brief that is edited upstream is re-translated rather than served stale.
function contentHash(text) {
  return crypto.createHash("sha1").update(text || "").digest("hex").slice(0, 12);
}

// Best-effort handle to the Netlify Blobs store used for translation caching.
// In a normal Netlify build the store auto-configures; otherwise we fall back
// to explicit site id + token from the environment. Returns null if Blobs is
// unavailable, in which case translations simply run every build.
function getCacheStore() {
  let getStore;
  try {
    ({ getStore } = require("@netlify/blobs"));
  } catch (e) {
    return null;
  }

  try {
    return getStore("brief-translations");
  } catch (e) {
    /* not auto-configured — try explicit credentials below */
  }

  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (!siteID || !token) return null;
  try {
    return getStore({ name: "brief-translations", siteID, token });
  } catch (e) {
    return null;
  }
}

// Translate a markdown document into `lang` via Netlify AI Gateway's Anthropic
// endpoint. Returns the translated markdown, or null if the gateway is not
// configured or the request fails (the caller then falls back to English).
async function translateMarkdown(markdown, lang) {
  const base = process.env.ANTHROPIC_BASE_URL;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!base || !key) return null;

  const langName = LANG_NAMES[lang];
  const system =
    `You are a professional translator. Translate the user's Markdown document ` +
    `from English into ${langName}. Preserve all Markdown formatting exactly — ` +
    `headings, lists, tables, links, emphasis, blockquotes and line breaks. ` +
    `Translate only the human-readable prose. Do not translate URLs, code, or ` +
    `proper nouns that are brand names (for example "AfricanSTN", "POPIA", "STZA"). ` +
    `Return only the translated Markdown with no preamble, commentary or code fences.`;

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: markdown }],
      }),
    });
    if (!res.ok) {
      console.warn(`[briefs] Translation to ${lang} failed (HTTP ${res.status}).`);
      return null;
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.warn(`[briefs] Translation to ${lang} errored (${err.message}).`);
    return null;
  }
}

// Fetch a cached translation, or produce and cache one. Returns the translated
// markdown or null when translation is unavailable.
async function getTranslation(store, brief, lang) {
  const cacheKey = `${brief.id}/${lang}/${brief.hash}`;

  if (store) {
    try {
      const cached = await store.get(cacheKey, { type: "text" });
      if (cached) return cached;
    } catch (e) {
      /* cache read failed — fall through to translate */
    }
  }

  const translated = await translateMarkdown(brief.markdown, lang);
  if (translated && store) {
    try {
      await store.set(cacheKey, translated);
    } catch (e) {
      /* cache write failed — non-fatal */
    }
  }
  return translated;
}

// Run async tasks with a bounded concurrency so a large first build stays
// within AI Gateway rate limits.
async function runPool(items, worker, limit) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

module.exports = async function () {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "[briefs] SUPABASE_URL / SUPABASE_ANON_KEY not set — building with no briefs."
    );
    return [];
  }

  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/weekly_reports` +
    `?select=id,report_markdown,item_count,created_at&order=created_at.desc`;

  let rows = [];
  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`[briefs] Supabase responded ${res.status} — building with no briefs.`);
      return [];
    }
    rows = await res.json();
  } catch (err) {
    console.warn(`[briefs] Failed to fetch briefs (${err.message}) — building with no briefs.`);
    return [];
  }

  // Map rows to the canonical (English) brief, derive the date slug + content
  // hash, and drop any duplicate dates (rows are newest-first, so the first
  // occurrence wins) to keep per-date permalinks unique.
  const seen = new Set();
  const sourceBriefs = [];
  for (const row of rows) {
    const date = isoDate(row.created_at);
    if (!date || seen.has(date)) continue;
    seen.add(date);

    const markdown = row.report_markdown || "";
    sourceBriefs.push({
      id: row.id,
      date, // URL slug, e.g. "2026-06-25"
      itemCount: row.item_count,
      iso: row.created_at,
      markdown,
      hash: contentHash(markdown),
    });
  }

  // Build the translation task list (every brief × every target language) and
  // run it through a bounded pool. Cached translations resolve instantly.
  const store = getCacheStore();
  const tasks = [];
  for (const brief of sourceBriefs) {
    for (const lang of TARGET_LANGS) {
      tasks.push({ brief, lang });
    }
  }
  const translations = await runPool(
    tasks,
    ({ brief, lang }) => getTranslation(store, brief, lang),
    MAX_CONCURRENCY
  );
  const translationByKey = new Map();
  tasks.forEach((task, i) => {
    translationByKey.set(`${task.brief.date}|${task.lang}`, translations[i]);
  });

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
      publishedHuman: formatHuman(brief.iso, "en"),
      markdown: brief.markdown,
      translated: true,
    });
    for (const lang of TARGET_LANGS) {
      const translated = translationByKey.get(`${brief.date}|${lang}`);
      pages.push({
        id: brief.id,
        date: brief.date,
        lang,
        itemCount: brief.itemCount,
        publishedHuman: formatHuman(brief.iso, lang),
        markdown: translated || brief.markdown,
        translated: Boolean(translated),
      });
    }
  }

  return pages;
};
