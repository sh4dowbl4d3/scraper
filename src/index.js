const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/Nikku2716/scraper)';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAndCache(url, cacheFile) {
  const cachePath = path.join(__dirname, '..', 'cache', cacheFile);

  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf-8');
    console.log(`CACHE HIT ${url} (${html.length} bytes)`);
    return { html, wasCache: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: controller.signal
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
  let pageUrl = 'https://books.toscrape.com/catalogue/page-1.html';
  let pageNum = 1;
  const allBooks = []; // now stores { url, sourcePage }

  while (pageUrl) {
    const cacheFile = `catalogue-page-${pageNum}.html`;
    const { html, wasCache } = await fetchAndCache(pageUrl, cacheFile);
    if (!wasCache) await sleep(500);

    const $ = cheerio.load(html);
    const currentPageUrl = pageUrl;

    $('.product_pod h3 a').each((i, el) => {
      const relativeHref = $(el).attr('href');
      const absoluteUrl = new URL(relativeHref, currentPageUrl).href;
      allBooks.push({ url: absoluteUrl, sourcePage: currentPageUrl });
    });

    const nextRelative = $('.next a').attr('href');
    if (nextRelative && pageNum < 3) {
      pageUrl = new URL(nextRelative, pageUrl).href;
      pageNum++;
    } else {
      pageUrl = null;
    }
  }

  // Deduplicate by url, keeping first occurrence's sourcePage
  const seen = new Set();
  const uniqueBooks = [];
  for (const book of allBooks) {
    if (!seen.has(book.url)) {
      seen.add(book.url);
      uniqueBooks.push(book);
    }
  }

  console.log(`catalogue_pages=${pageNum} discovered=${allBooks.length} unique_urls=${uniqueBooks.length}`);
  return uniqueBooks;
}

async function extractBookDetails(bookUrl, sourcePage) {
  const urlParts = bookUrl.split('/');
  const cacheFile = `book-${urlParts[urlParts.length - 2]}.html`;

  const { html, wasCache } = await fetchAndCache(bookUrl, cacheFile);
  if (!wasCache) await sleep(500);

  const $ = cheerio.load(html);
  const product = $('.product_page');

  const title = product.find('h1').text().trim();
  const price_text = product.find('.price_color').first().text().trim();
  const availability_text = product.find('.availability').text().trim();

  const ratingClasses = product.find('.star-rating').attr('class') || '';
  const rating_text = ratingClasses.split(' ').find(c => c !== 'star-rating') || null;

  const descriptionEl = $('#product_description').next('p');
  const description = descriptionEl.length ? descriptionEl.text().trim() : null;

  return {
    title,
    product_url: bookUrl,
    price_text,
    availability_text,
    rating_text,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString()
  };
}

async function main() {
  const books = await discoverBookUrls();
  const records = [];

  for (const book of books) {
    try {
      const record = await extractBookDetails(book.url, book.sourcePage);
      records.push(record);
    } catch (err) {
      console.log(`FAILED ${book.url}: ${err.message}`);
    }
  }

  console.log(JSON.stringify(records[0], null, 2));
  console.log(`detail_pages=${records.length}`);
}

main();