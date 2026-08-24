const fs = require('fs');
const path = require('path');

const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/Nikku2716/scraper)';

async function fetchAndCache(url, cacheFile) {
  const cachePath = path.join(__dirname, '..', 'cache', cacheFile);

  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf-8');
    console.log(`CACHE HIT ${url} (${html.length} bytes)`);
    return html;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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
  return html;
}

async function main() {
  await fetchAndCache('https://books.toscrape.com/catalogue/page-1.html', 'catalogue-page-1.html');
}

main();
