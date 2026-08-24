const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const USER_AGENT =
  "FlyRankInternship-A9/1.0 (+https://github.com/YOUR_USERNAME/scraper)";

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
  const timeout = setTimeout(() => controller.abort(), 5000);

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
  const allBookUrls = [];

  while (pageUrl) {
    const cacheFile = `catalogue-page-${pageNum}.html`;
    const { html, wasCache } = await fetchAndCache(pageUrl, cacheFile);
    if (!wasCache) await sleep(500);

    const $ = cheerio.load(html);

    $(".product_pod h3 a").each((i, el) => {
      const relativeHref = $(el).attr("href");
      const absoluteUrl = new URL(relativeHref, pageUrl).href;
      allBookUrls.push(absoluteUrl);
    });

    const nextRelative = $(".next a").attr("href");
    if (nextRelative && pageNum < 3) {
      pageUrl = new URL(nextRelative, pageUrl).href;
      pageNum++;
    } else {
      pageUrl = null;
    }
  }

  const uniqueUrls = [...new Set(allBookUrls)];
  console.log(
    `catalogue_pages=${pageNum} discovered=${allBookUrls.length} unique_urls=${uniqueUrls.length}`,
  );
  return uniqueUrls;
}

async function main() {
  const bookUrls = await discoverBookUrls();
}

main();
