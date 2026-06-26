// Shared logic for the Weekly Intelligence Briefs translation pipeline.
//
// Both the Eleventy build (src/_data/briefs.js) and the runtime translation
// function (netlify/functions/translate-briefs.mjs) import this module so the
// Supabase query, the date slugs and — critically — the Blobs cache keys are
// computed identically on both sides. A cache entry written by the function is
// therefore found unchanged by the build.
//
// Why a runtime function does the translating: the Netlify AI Gateway only
// injects ANTHROPIC_* credentials into compute contexts (Functions / Edge
// Functions), NOT into the build command. Translating inside the Eleventy
// build always failed and every brief fell back to English. The function runs
// at request time where the gateway is available, caches each result in Blobs,
// and the build reads those cached translations.

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

// Name of the Netlify Blobs store that holds cached translations.
const CACHE_STORE = "brief-translations";

// Translation model — Haiku is fast and inexpensive, which matters when a
// first run translates every historical brief into four languages.
const TRANSLATION_MODEL = "claude-haiku-4-5";

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

// Canonical Blobs cache key for one translation. Must stay identical on the
// build and function sides.
function cacheKey(id, lang, hash) {
  return `${id}/${lang}/${hash}`;
}

// Fetch the latest briefs from Supabase via PostgREST and reduce them to the
// canonical (English) source briefs: newest-first, one per date. Returns an
// array of { id, date, itemCount, iso, markdown, hash }. Returns [] (and logs
// a warning) if Supabase is not configured or unreachable so callers degrade
// gracefully. This HTTP call works in both the build and at runtime.
async function fetchSourceBriefs() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "[briefs] SUPABASE_URL / SUPABASE_ANON_KEY not set — no briefs available."
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
      console.warn(`[briefs] Supabase responded ${res.status} — no briefs available.`);
      return [];
    }
    rows = await res.json();
  } catch (err) {
    console.warn(`[briefs] Failed to fetch briefs (${err.message}) — no briefs available.`);
    return [];
  }

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

  return sourceBriefs;
}

// System prompt for one target language. Phrased as a direct, forceful
// instruction: earlier wording ("translate only the human-readable prose")
// caused claude-haiku to occasionally echo the document back in English, which
// is why we are explicit that every sentence must be rendered in the target
// language.
function translationSystemPrompt(lang) {
  const n = LANG_NAMES[lang];
  return (
    `Translate the following Markdown document from English into ${n}. ` +
    `Output only the ${n} translation, with no preamble, commentary or code fences. ` +
    `Keep all Markdown structure — headings, lists, tables, links, emphasis, ` +
    `blockquotes and line breaks — intact and in the same order. Keep URLs ` +
    `unchanged and keep the brand names AfricanSTN, POPIA and STZA unchanged. ` +
    `Every English sentence must be rendered in ${n}; do not leave any sentence ` +
    `in English.`
  );
}

// Heuristic guard against a translation that came back untranslated. The model
// occasionally returns the source verbatim, or (with weaker prompting) leaves
// the markdown headings in English while translating only the body prose \u2014
// which reads as "not translated" because headings are the most prominent
// text. Caching either as a "translation" would silently show English with no
// fallback notice, so we treat them as failures. A single English brand-style
// title line (e.g. "# AfricanSTN Weekly Intelligence Brief") is tolerated.
function looksUntranslated(source, output, lang) {
  if (!output) return true;
  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(source) === norm(output)) return true;
  // Arabic output must contain Arabic script.
  if (lang === "ar" && !/[\u0600-\u06FF]/.test(output)) return true;

  // Heading guard: how many source headings survive verbatim in the output.
  const headings = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^#{1,6}\s+\S/.test(l) && l.length >= 8);
  const srcHeads = headings(source);
  if (srcHeads.length >= 2) {
    const outHeads = new Set(headings(output));
    let identical = 0;
    for (const h of srcHeads) if (outHeads.has(h)) identical++;
    if (identical / srcHeads.length > 0.5) return true;
  }
  return false;
}

async function requestTranslation(markdown, lang, { baseUrl, apiKey, temperature }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      max_tokens: 8000,
      temperature,
      system: translationSystemPrompt(lang),
      messages: [{ role: "user", content: markdown }],
    }),
  });
  if (!res.ok) {
    console.warn(`[briefs] Translation to ${lang} failed (HTTP ${res.status}).`);
    return null;
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Translate a markdown document into `lang` via the Anthropic-compatible
// endpoint described by { baseUrl, apiKey }. Returns the translated markdown,
// or null if credentials are missing, the request fails, or the model returned
// the text untranslated (callers then fall back to English). At runtime the
// credentials come from the AI Gateway's ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY.
async function translateMarkdown(markdown, lang, { baseUrl, apiKey } = {}) {
  baseUrl = baseUrl || process.env.ANTHROPIC_BASE_URL;
  apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) return null;

  // First pass is deterministic (temperature 0). If it comes back untranslated,
  // retry once with a little temperature to break the echo.
  for (const temperature of [0, 0.4]) {
    let text;
    try {
      text = await requestTranslation(markdown, lang, { baseUrl, apiKey, temperature });
    } catch (err) {
      console.warn(`[briefs] Translation to ${lang} errored (${err.message}).`);
      return null;
    }
    if (text && !looksUntranslated(markdown, text, lang)) return text;
  }

  console.warn(`[briefs] Translation to ${lang} came back untranslated — using English.`);
  return null;
}

// Run async tasks with a bounded concurrency so a large run stays within AI
// Gateway rate limits.
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

module.exports = {
  TARGET_LANGS,
  LANG_NAMES,
  LOCALES,
  CACHE_STORE,
  TRANSLATION_MODEL,
  formatHuman,
  isoDate,
  contentHash,
  cacheKey,
  fetchSourceBriefs,
  translateMarkdown,
  looksUntranslated,
  runPool,
};
