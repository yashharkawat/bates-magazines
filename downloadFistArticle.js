const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const mkdirp = require("mkdirp");
const slugify = require("slugify");

const articles = require("./first-articles.json");
const articles2 = require("./articles.json");

const articleTitles = articles2.map((article) => article.title);

// Font sizes to generate PDFs in
const fontSizes = [2,4,6,8];

function isArticleTitle(text) {
    // check if text is in the articleTitles array
    if(articleTitles.includes(text)) {
        return true;
    }
    // check if text is in the articleTitles array
    const articleTitle = articleTitles.find((title) => text.includes(title));
    if(articleTitle) {
        return true;
    }
    
    return false;
}

function processHeadingAndContent(text) {
    // Split text into words
    const words = text.split(/\s+/);
    
    // If text is less than 100 words, treat it all as heading
    if (words.length < 100) {
        return {
            heading: text,
            content: ""
        };
    }

    // Find the first sentence end (period followed by space or newline)
    const firstSentenceMatch = text.match(/^[^.]+\.\s/);
    if (firstSentenceMatch) {
        const firstSentence = firstSentenceMatch[0];
        const remainingContent = text.slice(firstSentence.length);
        return {
            heading: firstSentence.trim(),
            content: remainingContent.trim()
        };
    }

    // If no clear sentence break, use first 50 words as heading
    const heading = words.slice(0, 50).join(' ');
    const content = words.slice(50).join(' ');
    return {
        heading: heading,
        content: content
    };
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

    const sections = [];
    let currentSection = {
        heading: articleTitle,
        content: "",
        tag: "h2"
    };
    
    let el = heading[0].nextSibling;
    let isLastHeading = false;

    while (el) {
        if (el.type === "tag") {
            const text = $(el).text().trim();
            
            if(isArticleTitle(text) && (el.tagName === "a" || el.tagName === "h2" || el.tagName === "h3" || el.tagName === "h4")) {
                isLastHeading = true;
                
                // Save previous section
                if (currentSection.content && currentSection.content.length > 100) {
                    sections.push({
                        ...currentSection
                    });
                }

                if(text.length > 100) {
                    const { heading, content } = processHeadingAndContent(text);
                    currentSection = {
                        heading: heading,
                        tag: el.tagName,
                        content: content.replace(/\n/g, " "),
                    };
                }
                else {
                    // Start new section
                    currentSection = {
                        heading: text,
                        tag: el.tagName,
                        content: "",
                    };
                }
            } else if (text) {
                if (currentSection.content) {
                    currentSection.content += "\n\n" + text.replace(/\n/g, " ");
                } else {
                    currentSection.content = text.replace(/\n/g, " ");
                }
            }
        }
        el = el.nextSibling;
    }

    // Add the last section
    if (currentSection.content) {
        sections.push({
            ...currentSection
        });
    }

    let formattedContent = "";

    for (const section of sections) {
        if(section.content) {
            formattedContent += section.heading + "\n\n" + section.content + "\n\n";
            break;
        }
    }

    // console.log("formattedContent", formattedContent);

    return formattedContent;
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

async function downloadFirstArticles() {
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
        
        // Process all years in order
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

        const folderName = "first-articles";
        const outputPath = path.join(__dirname, folderName, `first_articles_${fontSize}pt.pdf`);
        const fullText = allContent.join('\n\n');
        await saveAsPdf(fullText, outputPath, `First Articles Collection`, fontSize);
        console.log(`✅ Saved PDF (${fontSize}pt): ${outputPath}`);
    }
}

downloadFirstArticles();
