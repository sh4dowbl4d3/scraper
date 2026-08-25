const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { z } = require("zod");

const USER_AGENT =
  "FlyRankInternship-A9/1.0 (+https://github.com/Nikku2716/scraper)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndCache(url, cacheFile) {
  const cachePath = path.join(__dirname, "..", "cache", cacheFile);

  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, "utf-8");
    console.log(`CACHE HIT ${url} (${html.length} bytes)`);
    return { html, wasCache: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (response.status !== 200) {
    throw new Error(`Fetch failed for ${url}: status ${response.status}`);
  }

  const html = await response.text();
  fs.writeFileSync(cachePath, html);
  console.log(`FETCH ${url} (${html.length} bytes)`);
  return { html, wasCache: false };
}

async function discoverBookUrls() {
  let pageUrl = "https://books.toscrape.com/catalogue/page-1.html";
  let pageNum = 1;
  const allBooks = [];

  while (pageUrl) {
    const cacheFile = `catalogue-page-${pageNum}.html`;
    const { html, wasCache } = await fetchAndCache(pageUrl, cacheFile);
    if (!wasCache) await sleep(500);

    const $ = cheerio.load(html);
    const currentPageUrl = pageUrl;

    $(".product_pod h3 a").each((i, el) => {
      const relativeHref = $(el).attr("href");
      const absoluteUrl = new URL(relativeHref, currentPageUrl).href;
      allBooks.push({ url: absoluteUrl, sourcePage: currentPageUrl });
    });

    const nextRelative = $(".next a").attr("href");
    if (nextRelative && pageNum < 3) {
      pageUrl = new URL(nextRelative, pageUrl).href;
      pageNum++;
    } else {
      pageUrl = null;
    }
  }

  const seen = new Set();
  const uniqueBooks = [];
  for (const book of allBooks) {
    if (!seen.has(book.url)) {
      seen.add(book.url);
      uniqueBooks.push(book);
    }
  }

  console.log(
    `catalogue_pages=${pageNum} discovered=${allBooks.length} unique_urls=${uniqueBooks.length}`,
  );
  return uniqueBooks;
}

async function extractBookDetails(bookUrl, sourcePage, retries = 2) {
  const urlParts = bookUrl.split("/");
  const cacheFile = `book-${urlParts[urlParts.length - 2]}.html`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { html, wasCache } = await fetchAndCache(bookUrl, cacheFile);
      if (!wasCache) await sleep(500);

      const $ = cheerio.load(html);
      const product = $(".product_page");

      const title = product.find("h1").text().trim();
      const price_text = product.find(".price_color").first().text().trim();
      const availability_text = product.find(".availability").text().trim();

      const ratingClasses = product.find(".star-rating").attr("class") || "";
      const rating_text =
        ratingClasses.split(" ").find((c) => c !== "star-rating") || null;

      const descriptionEl = $("#product_description").next("p");
      const description = descriptionEl.length
        ? descriptionEl.text().trim()
        : null;

      return {
        title,
        product_url: bookUrl,
        price_text,
        availability_text,
        rating_text,
        description,
        source_page: sourcePage,
        fetched_at: new Date().toISOString(),
      };
    } catch (err) {
      if (attempt < retries) {
        console.log(
          `RETRY ${attempt + 1}/${retries} for ${bookUrl}: ${err.message}`,
        );
        await sleep(1000 * (attempt + 1));
      } else {
        throw err;
      }
    }
  }
}

const BookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_gbp: z.number().positive(),
  price_text: z.string(),
  availability_text: z.string(),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string(),
});

function normalizeRecord(raw) {
  const priceMatch = raw.price_text.match(/[\d.]+/);
  const price_gbp = priceMatch ? parseFloat(priceMatch[0]) : NaN;

  return {
    title: raw.title,
    product_url: raw.product_url,
    price_gbp,
    price_text: raw.price_text,
    availability_text: raw.availability_text,
    rating_text: raw.rating_text,
    description: raw.description,
    source_page: raw.source_page,
    fetched_at: raw.fetched_at,
  };
}

async function main() {
  const books = await discoverBookUrls();

  const validRecords = [];
  const errors = [];

  for (const book of books) {
    try {
      const raw = await extractBookDetails(book.url, book.sourcePage);
      const normalized = normalizeRecord(raw);

      const result = BookSchema.safeParse(normalized);
      if (result.success) {
        validRecords.push(result.data);
      } else {
        errors.push({
          url: book.url,
          reason: result.error.issues.map((i) => i.message).join(", "),
        });
      }
    } catch (err) {
      errors.push({ url: book.url, reason: err.message });
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "..", "output", "books.json"),
    JSON.stringify(validRecords, null, 2),
  );
  fs.writeFileSync(
    path.join(__dirname, "..", "output", "errors.json"),
    JSON.stringify(errors, null, 2),
  );

  console.log(`valid=${validRecords.length} invalid=${errors.length}`);
}

main();