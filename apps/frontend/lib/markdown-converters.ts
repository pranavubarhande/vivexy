import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import puppeteer from 'puppeteer';
import markdownIt from 'markdown-it';

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export async function convertMarkdownToPdf(
  markdown: string,
  title: string
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Convert markdown to HTML
    const htmlContent = md.render(markdown);

    // Create a styled HTML document
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              line-height: 1.6;
              margin: 40px;
              color: #333;
            }
            h1, h2, h3, h4, h5, h6 {
              color: #2c3e50;
              margin-top: 24px;
              margin-bottom: 16px;
            }
            h1 { font-size: 28px; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
            h2 { font-size: 24px; border-bottom: 1px solid #bdc3c7; padding-bottom: 4px; }
            h3 { font-size: 20px; }
            p { margin-bottom: 16px; }
            code {
              background-color: #f8f8f8;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: 'Monaco', 'Menlo', monospace;
              font-size: 14px;
            }
            pre {
              background-color: #f8f8f8;
              padding: 16px;
              border-radius: 6px;
              overflow-x: auto;
              font-family: 'Monaco', 'Menlo', monospace;
              font-size: 14px;
              margin: 16px 0;
            }
            blockquote {
              border-left: 4px solid #3498db;
              padding-left: 16px;
              margin-left: 0;
              color: #555;
              font-style: italic;
            }
            ul, ol { margin-bottom: 16px; padding-left: 24px; }
            li { margin-bottom: 8px; }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 16px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px 12px;
              text-align: left;
            }
            th { background-color: #f5f5f5; font-weight: bold; }
            a { color: #3498db; text-decoration: none; }
            a:hover { text-decoration: underline; }
            @media print {
              body { margin: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${htmlContent}
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function convertMarkdownToWord(
  markdown: string,
  title: string
): Promise<Buffer> {
  // Parse markdown and convert to docx structure
  const lines = markdown.split('\n');
  const docSections: Paragraph[] = [];

  // Add title
  docSections.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
    })
  );

  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        docSections.push(
          new Paragraph({
            children: [new TextRun(currentParagraph.join(' '))],
          })
        );
        currentParagraph = [];
      }

      docSections.push(
        new Paragraph({
          text: line.substring(2),
          heading: HeadingLevel.HEADING_1,
        })
      );
    } else if (line.startsWith('## ')) {
      if (currentParagraph.length > 0) {
        docSections.push(
          new Paragraph({
            children: [new TextRun(currentParagraph.join(' '))],
          })
        );
        currentParagraph = [];
      }

      docSections.push(
        new Paragraph({
          text: line.substring(3),
          heading: HeadingLevel.HEADING_2,
        })
      );
    } else if (line.startsWith('### ')) {
      if (currentParagraph.length > 0) {
        docSections.push(
          new Paragraph({
            children: [new TextRun(currentParagraph.join(' '))],
          })
        );
        currentParagraph = [];
      }

      docSections.push(
        new Paragraph({
          text: line.substring(4),
          heading: HeadingLevel.HEADING_3,
        })
      );
    } else if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        docSections.push(
          new Paragraph({
            children: [
              new TextRun({ text: codeBlockContent, font: 'Courier New' }),
            ],
          })
        );
        inCodeBlock = false;
        codeBlockContent = '';
      } else {
        // Start code block
        if (currentParagraph.length > 0) {
          docSections.push(
            new Paragraph({
              children: [new TextRun(currentParagraph.join(' '))],
            })
          );
          currentParagraph = [];
        }
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      codeBlockContent += line + '\n';
    } else if (line.trim() === '') {
      // Empty line - flush current paragraph
      if (currentParagraph.length > 0) {
        docSections.push(
          new Paragraph({
            children: [new TextRun(currentParagraph.join(' '))],
          })
        );
        currentParagraph = [];
      }
    } else {
      // Regular paragraph
      currentParagraph.push(line);
    }
  }

  // Flush remaining content
  if (currentParagraph.length > 0) {
    docSections.push(
      new Paragraph({
        children: [new TextRun(currentParagraph.join(' '))],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docSections,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
