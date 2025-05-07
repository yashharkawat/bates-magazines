const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const mkdirp = require("mkdirp");
const slugify = require("slugify");

const articles = require("./articles.json");

function extractArticleContent($, articleTitle) {
  const heading = $(`:header`).filter((_, el) => {
    const text = $(el).text().trim();
    return text.toLowerCase() === articleTitle.toLowerCase();
  }).first();

  if (!heading.length) {
    console.warn(`❌ Heading not found for "${articleTitle}"`);
    return null;
  }

  const contents = [];
  let el = heading[0].nextSibling;

  while (el && el.tagName !== "H2" && el.tagName !== "H3" && el.tagName !== "H4") {
    if (el.type === "tag") {
      contents.push($(el).text().trim());
    }
    el = el.nextSibling;
  }

  return contents.join("\n\n");
}

async function saveAsPdf(text, filePath, title) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });

    mkdirp.sync(path.dirname(filePath));
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.fontSize(10).font('Times-Roman').text(title, { underline: true });
    doc.moveDown();
    doc.fontSize(2).font('Times-Roman').text(text, {
        align: 'justify',
        lineGap: 2
    });

    doc.end();
    await new Promise((res) => writeStream.on("finish", res));
}


async function downloadArticles() {
    const grouped = {};

    // Step 1: Group articles by year and month
    for (const { year, month, title, url } of articles) {
        const key = `${year}-${month}`;
        if (!grouped[key]) grouped[key] = { year, month, urls: new Set(), entries: [] };

        if (!grouped[key].urls.has(url)) {
            grouped[key].urls.add(url);
            grouped[key].entries.push({ title, url });
        }
    }

    // Step 2: Process each group
    for (const key in grouped) {
        const { year, month, entries } = grouped[key];
        const combinedContent = [];

        for (const { title, url } of entries) {
            try {
                console.log(`📥 Fetching: ${title} (${month} ${year})`);
                const { data } = await axios.get(url);
                const $ = cheerio.load(data);

                const content = extractArticleContent($, title);
                if (!content || content.length < 50) {
                    console.warn(`⚠️ Skipped "${title}" due to short or missing content.`);
                    continue;
                }

                combinedContent.push(`\n\n${title}\n\n${content}`);
            } catch (err) {
                console.error(`❌ Error with "${title}": ${err.message}`);
            }
        }

        if (combinedContent.length === 0) {
            console.warn(`⚠️ No valid articles for ${month} ${year}, skipping PDF.`);
            continue;
        }

        const fullText = combinedContent.join('\n\n\n');
        const outputPath = path.join(__dirname, "downloads", year, `${month}.pdf`);
        await saveAsPdf(fullText, outputPath, `${month} ${year}`);
        console.log(`✅ Saved Monthly PDF: ${outputPath}`);
    }
}


downloadArticles();
