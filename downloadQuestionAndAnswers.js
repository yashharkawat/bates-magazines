const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const mkdirp = require("mkdirp");
const slugify = require("slugify");

const articles = require("./first-articles.json");
const fontSizes = [2,4,6,8];

function isArticleTitle(text) {
    // check if text is in the articleTitles array
    if(text?.toLowerCase().includes("questions and answers")) {
        return true;
    }
    return false;
}

function extractArticleContent($, articleTitle) {
    const allHeaders = $(`:header`);
    
    const heading = allHeaders.filter((_, el) => {
        const text = $(el).text().trim();
        return text.toLowerCase() === articleTitle.toLowerCase();
    }).first();

    if (!heading.length) {
        console.warn(`❌ Heading not found for "${articleTitle}"`);
        return null;
    }
    
    let el = heading[0].nextSibling;
    let content = "";
    let isLastHeading = false;

    while (el) {
        if (el.type === "tag") {
            const text = $(el).text().trim();
            
            if(isArticleTitle(text) && el.tagName === "a") {
                content = text;
                isLastHeading = true;
            }
            else if (text && isLastHeading) {
                content += "\n\n" + text;
            }
        }
        el = el.nextSibling;
    }

    if(content.length > 100) {
        return content;
    }
    else {
        return null;
    }
}

async function saveAsPdf(text, filePath, title, fontSize) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });

    mkdirp.sync(path.dirname(filePath));
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Title of the PDF - scale title font size proportionally
    const titleFontSize = fontSize + 4;
    doc.fontSize(titleFontSize).font('Times-Bold').text(title, { underline: true, align: 'center' });
    doc.moveDown(2);

    // Main content with specified font size
    doc.fontSize(fontSize).font('Times-Roman').text(text, {
        align: 'justify',
        lineGap: fontSize * 0.4 // Scale line gap with font size
    });

    doc.end();
    await new Promise((res) => writeStream.on("finish", res));
}

async function downloadQuestionAndAnswers() {
    const grouped = {};

    // Group articles by year
    for (const article of articles) {
        const { year, month, title, url } = article;
        const yearKey = year.toString();
        if (!grouped[yearKey]) {
            grouped[yearKey] = new Map();
        }
        grouped[yearKey].set(month, { title, url, month });
    }

    // Process each font size
    for (const fontSize of fontSizes) {
        console.log(`\n📝 Generating PDF with font size ${fontSize}pt`);
        const allContent = [];

        // Process all years
        const years = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
        for (const year of years) {
            const yearContent = [];

            for (const [_, articleInfo] of grouped[year]) {
                const { title, url, month } = articleInfo;
                try {
                    console.log(`📥 Fetching article: ${title} (${month} ${year})`);
                    const { data } = await axios.get(url);
                    const $ = cheerio.load(data);

                    const content = extractArticleContent($, title);
                    if (content) {
                        yearContent.push(`\n\n${month} ${year}\n\n${content}`);
                    }
                } catch (err) {
                    console.error(`❌ Error with "${title}": ${err.message}`);
                }
            }

            if (yearContent.length > 0) {
                allContent.push(`\n\nYear ${year}\n${'='.repeat(50)}\n\n${yearContent.join('\n\n' + '-'.repeat(30) + '\n\n')}`);
            }
        }

        if (allContent.length === 0) {
            console.warn(`⚠️ No valid articles found, skipping PDF.`);
            continue;
        }

        const folderName = "questions-and-answers";
        const outputPath = path.join(__dirname, folderName, `questions_and_answers_${fontSize}pt.pdf`);
        await saveAsPdf(allContent.join('\n\n'), outputPath, `Questions and Answers Collection`, fontSize);
        console.log(`✅ Saved PDF (${fontSize}pt): ${outputPath}`);
    }
}

downloadQuestionAndAnswers();
