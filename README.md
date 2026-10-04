# Polite scraper

A Node.js scraper that extracts book data from books.toscrape.com, validates records with Zod, caches responses locally, and logs run summaries to JSON.

## Target classification

The target site is `books.toscrape.com`, a sandbox created for scraping practice.

The crawl covers the first 3 catalog pages and the 60 book detail pages linked from them. Collected fields include title, price, availability, star rating, and description.

A request to `https://books.toscrape.com/robots.txt` returned 404, so the site specifies no crawl-delay or disallow rules.

## Setup and running

```bash
git clone https://github.com/sh4dowbl4d3/scraper.git
cd scraper
npm install
node src/index.js
```

Running `node src/index.js` fetches the 3 catalogue pages, scrapes all 60 book pages, validates each record, and writes output files:
- `output/books.json` contains validated records.
- `output/errors.json` logs records that fail validation.
- `output/run-report.json` records execution metrics.

The scraper is idempotent. Re-running the script processes the existing cache and outputs the same 60 records without creating duplicates.

## Politeness rules

- Requests include a custom User-Agent header (`FlyRankInternship-A9/1.0`) with a repository link.
- Fetched HTML is cached in `cache/` and reused across runs, avoiding repeated requests to the live site.
- Real network requests pause for 500ms between calls. Cached pages do not trigger this delay.
- Requests time out after 8 seconds using `AbortController`.
- Network timeouts and 5xx server responses retry up to 2 times with backoff. 403 and 404 responses fail immediately without retries.

## Record schema

Zod validates each record written to `output/books.json`:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Non-empty |
| `product_url` | string (URL) | Canonical URL used for deduplication |
| `price_gbp` | number | Parsed from `price_text` (e.g., `51.77`) |
| `price_text` | string | Raw price text from page (e.g., `"£51.77"`) |
| `availability_text` | string | Raw availability text |
| `rating_text` | string or null | Rating label (e.g., `"Three"`), or null if absent |
| `description` | string or null | Book description, or null if absent |
| `source_page` | string (URL) | Catalogue page where the book was found |
| `fetched_at` | string (ISO timestamp) | Fetch timestamp |

Records that fail schema validation are logged to `output/errors.json` with failure details.

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

This run took under a second because all 63 pages were read from local cache.

## Why no browser was needed

The target pages do not rely on client-side JavaScript rendering. The server returns the required data in the initial HTML document, so direct HTTP requests with Cheerio are sufficient and avoid the resource overhead of a headless browser.

## Ethics note

Check for an official API before scraping HTML. Do not bypass logins, paywalls, or access restrictions. Request only necessary fields, and cache responses locally to minimize traffic to the host server.

## Known limitation

`output/run-report.json` tracks total pages processed, but does not currently separate cache hits from live network fetches.
