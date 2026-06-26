// Build-time data source for the Weekly Intelligence Briefs section.
//
// Reads the `weekly_reports` table from Supabase via the PostgREST endpoint
// using the public anon key. This runs once per Eleventy build (SSG), so the
// briefs are baked into static HTML — no client-side Supabase calls and no
// secrets shipped to the browser.
//
// The GitHub pipeline (src/generateWeeklyReport.js) populates the table; this
// file only ever reads from it.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Format an ISO timestamp as e.g. "25 June 2026".
function formatHuman(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Reduce an ISO timestamp to the YYYY-MM-DD slug used in brief URLs.
function isoDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
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

  // Map rows to template-friendly objects, derive the date slug + display
  // strings, and drop any duplicate dates (rows are newest-first, so the
  // first occurrence wins) to keep per-date permalinks unique.
  const seen = new Set();
  const briefs = [];
  for (const row of rows) {
    const date = isoDate(row.created_at);
    if (!date || seen.has(date)) continue;
    seen.add(date);

    const human = formatHuman(row.created_at);
    briefs.push({
      id: row.id,
      date, // URL slug, e.g. "2026-06-25"
      itemCount: row.item_count,
      publishedHuman: human,
      weekEnding: human,
      title: `Weekly Intelligence Brief — w/e ${human}`,
      markdown: row.report_markdown || "",
    });
  }

  return briefs;
};
