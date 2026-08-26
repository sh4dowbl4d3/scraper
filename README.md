# The Polite Scraper

A scraper that downloads book data from a public practice sandbox, turns messy HTML into clean, validated JSON, and survives broken pages without crashing — with an honest report at the end of every run.

## Target Classification

**Site:** books.toscrape.com

**Why this site is appropriate:** toscrape.com explicitly describes itself as a sandbox built for practicing web scraping — it exists specifically to be scraped, unlike a real commercial site.

**Scope:** first 3 pages of the book catalogue only (not the entire site), and the 60 individual book pages linked from those 3 pages.

**Data collected:** book title, price, availability, star rating, and description.

**robots.txt check:** requested `https://books.toscrape.com/robots.txt` — returned `404 Not Found`. No robots.txt file exists on this site, so no crawl-delay or disallow rules apply.

I will not reuse this code on another site without checking its rules and terms first.

## Setup & Running

```bash
git clone https://github.com/sh4dowbl4d3/scraper.git
cd scraper
npm install
node src/index.js
```

This single command runs the entire pipeline: discovers the 3 catalogue pages, visits all 60 book pages, normalizes and validates every record, and writes results to `output/books.json`, `output/errors.json`, and `output/run-report.json`.

Running it twice produces the same 60 records, not 120 — the run is idempotent.

## Politeness rules followed

- **Custom User-Agent**: identifies this project honestly (`FlyRankInternship-A9/1.0`, with a link back to this repo) rather than pretending to be a browser.
- **Caching**: every fetched page is saved to `cache/` and reused on subsequent runs — the live site is only hit once per page, ever, across however many times you re-run the scraper locally.
- **Delay between real requests**: 500ms pause after every actual network fetch (not after cache hits) — the site never receives a burst of rapid-fire requests.
- **Timeout**: every request is capped at 8 seconds via `AbortController`, so a hanging connection can't stall the whole run.
- **Selective retries**: timeouts and 5xx server errors get retried (up to 2 extra attempts with increasing backoff); 404s and 403s are never retried, since asking again won't change a page that doesn't exist or a site that said no.

## Record schema

Each validated record in `books.json` has this shape (enforced with Zod):

| Field | Type | Notes |
|---|---|---|
| `title` | string | non-empty |
| `product_url` | string (URL) | canonical identity for the record; duplicates collapse to one |
| `price_gbp` | number | parsed from `price_text`, e.g. `51.77` |
| `price_text` | string | original raw text, e.g. `"£51.77"` |
| `availability_text` | string | raw availability text from the page |
| `rating_text` | string or null | e.g. `"Three"`; null if genuinely absent |
| `description` | string or null | null if the page has no description — never invented |
| `source_page` | string (URL) | which of the 3 catalogue pages this book was discovered on |
| `fetched_at` | string (ISO timestamp) | when this record was fetched |

Records that fail validation are written to `errors.json` with a reason instead of silently entering `books.json`.

## Sample run report

```json
{
  "start_time": "2026-08-26T11:18:10.106Z",
  "duration_ms": 192,
  "pages_fetched": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

This run finished in under a second because every page was already cached from a prior run — no live requests were made.

## Why no browser was needed

This assignment needed no browser automation because the data is already present in the HTML the server sends on first response — there's no client-side JavaScript rendering step to wait for. A headless browser here would only add cost (memory, startup time, complexity) with no benefit over a plain HTTP request.

## Ethics note

Scraping should default to the least invasive option available: check for an official API before scraping HTML, since an API is a maintained contract while HTML structure can silently change or break. Never bypass logins, paywalls, or explicit blocks — a site that requires authentication or returns a 403 is communicating a boundary, not issuing a technical puzzle to solve. Collect only the fields actually needed for the stated purpose, and cache aggressively so the target server is touched as few times as possible.

## Known limitation

Cache-hit counts are not currently tracked separately in `run-report.json` — the report reflects total pages processed but doesn't distinguish how many were served from cache versus fetched live in a given run.
