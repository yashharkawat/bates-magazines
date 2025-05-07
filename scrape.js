const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const BASE = "https://www.central-fixation.com/better-eyesight-magazine/";

function extractYearAndMonth(text) {
  const match = text.match(/([A-Za-z]+)\s+(\d{4})/); // e.g., "July 1921"
  if (!match) return {};
  const [, month, year] = match;
  return { year, month };
}

async function getIssueLinks() {
  const { data } = await axios.get(BASE);
  const $ = cheerio.load(data);
  const links = [];

  $('a[href*="better-eyesight-"]').each((_, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr("href");

    if (href && href.endsWith(".php")) {
      const fullUrl = href.startsWith("http") ? href : new URL(href, BASE).href;
      links.push({ title, url: fullUrl });
    }
  });

  return links;
}

async function extractArticlesFromIssue(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const articleTitles = [];

    $("h2, h3, h4").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 3) articleTitles.push(text);
    });

    return articleTitles;
  } catch (err) {
    console.error(`❌ Failed to fetch ${url}: ${err.message}`);
    return [];
  }
}

(async () => {
  const issues = await getIssueLinks();
  const results = [];

  for (const issue of issues) {
    console.log(`🔍 Scraping: ${issue.title}`);
    const articles = await extractArticlesFromIssue(issue.url);
    const { year, month } = extractYearAndMonth(issue.title);

    if (!year || !month) {
      console.warn(`⚠️ Skipped issue due to unrecognized date: ${issue.title}`);
      continue;
    }

    for (const articleTitle of articles) {
      results.push({
        year,
        month,
        title: articleTitle,
        url: issue.url,
      });
    }
  }

  const outputPath = path.join(__dirname, "articles.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`✅ Saved ${results.length} articles to ${outputPath}`);
})();
