import { getStore } from '@netlify/blobs'
import core from '../lib/briefs-core.cjs'

// Runtime translation function for the Weekly Intelligence Briefs.
//
// The Eleventy build cannot translate briefs itself: the Netlify AI Gateway
// only injects ANTHROPIC_* credentials into compute contexts (Functions / Edge
// Functions), never into the build command. This function runs at request time
// where the gateway IS available. It:
//
//   1. fetches the current briefs from Supabase,
//   2. for every brief x target language, returns the cached translation from
//      Netlify Blobs, or translates it now via the AI Gateway and caches it,
//   3. responds with a { "<date>|<lang>": "<translated markdown>" } map.
//
// The build (src/_data/briefs.js) calls this endpoint over HTTPS and bakes the
// returned translations into the static pages. Because translation is keyed by
// a hash of the source markdown, edited briefs are re-translated automatically
// and unchanged ones are served from cache.

// Cap how many fresh translations we perform per invocation so a cold cache
// cannot blow the function's execution time budget. Anything left untranslated
// stays English for this build and is filled in on the next call (the cache
// only grows). With a warm cache this cap is never reached.
const MAX_FRESH_PER_CALL = 24
// Concurrent AI Gateway requests — bounded to respect per-account rate limits.
const MAX_CONCURRENCY = 6

export default async () => {
  const briefs = await core.fetchSourceBriefs()

  let store = null
  try {
    store = getStore(core.CACHE_STORE)
  } catch {
    // Blobs unavailable — we can still translate, just without caching.
  }

  // Build the full task list (every brief x every target language).
  const tasks = []
  for (const brief of briefs) {
    for (const lang of core.TARGET_LANGS) {
      tasks.push({ brief, lang })
    }
  }

  let freshCount = 0
  const map = {}

  await core.runPool(
    tasks,
    async ({ brief, lang }) => {
      const key = core.cacheKey(brief.id, lang, brief.hash)
      const mapKey = `${brief.date}|${lang}`

      // Cache hit — serve it.
      if (store) {
        try {
          const cached = await store.get(key, { type: 'text' })
          if (cached) {
            map[mapKey] = cached
            return
          }
        } catch {
          /* fall through to translate */
        }
      }

      // Respect the per-call work budget for fresh translations.
      if (freshCount >= MAX_FRESH_PER_CALL) return
      freshCount++

      const translated = await core.translateMarkdown(brief.markdown, lang)
      if (!translated) return

      map[mapKey] = translated
      if (store) {
        try {
          await store.set(key, translated)
        } catch {
          /* caching is best-effort */
        }
      }
    },
    MAX_CONCURRENCY
  )

  return Response.json(
    { count: Object.keys(map).length, fresh: freshCount, translations: map },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const config = {
  path: '/api/translate-briefs',
}
