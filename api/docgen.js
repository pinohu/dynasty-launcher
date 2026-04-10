// Your Deputy — Multi-Format Document Generator
// Generates .docx and .pdf versions of markdown documents with professional branding

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
         Table, TableRow, TableCell, WidthType, BorderStyle,
         Header, Footer, PageNumber, Tab, TabStopType,
         ShadingType, ImageRun, TableOfContents } from 'docx';

// ── Generate branded DOCX from markdown content ──────────────────────────
export async function generateDocx(title, markdownContent, branding = {}) {
  const { name = 'Business', accent = '#C9A84C', date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } = branding;

  // Parse markdown into sections
  const lines = markdownContent.split('\n');
  const children = [];

  // Cover page
  children.push(
    new Paragraph({ spacing: { before: 4000 } }),
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 56, color: accent.replace('#', ''), font: 'Helvetica' })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({ text: name, size: 28, color: '666666', font: 'Helvetica' })],
      alignment: AlignmentType.CENTER, spacing: { after: 600 }
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated ${date}`, size: 20, color: '999999', italics: true })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Prepared by Your Deputy Intelligence Engine', size: 18, color: 'AAAAAA' })],
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ pageBreakBefore: true }) // Page break after cover
  );

  // Parse markdown content
  let inTable = false;
  let tableRows = [];
  let inCodeBlock = false;
  let codeContent = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed && !inCodeBlock) {
      if (inTable && tableRows.length > 0) {
        children.push(buildTable(tableRows, accent));
        tableRows = [];
        inTable = false;
      }
      continue;
    }

    // Code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        children.push(new Paragraph({
          children: [new TextRun({ text: codeContent.join('\n'), font: 'Courier New', size: 18, color: '333333' })],
          shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
          spacing: { before: 100, after: 100 }
        }));
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeContent.push(line); continue; }

    // Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (trimmed.includes('---')) continue; // Skip separator
      inTable = true;
      tableRows.push(trimmed.split('|').filter(c => c.trim()).map(c => c.trim()));
      continue;
    }
    if (inTable && tableRows.length > 0) {
      children.push(buildTable(tableRows, accent));
      tableRows = [];
      inTable = false;
    }

    // Headings
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^#\s+/, ''), bold: true, size: 36, color: accent.replace('#', '') })],
        heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }
      }));
      continue;
    }
    if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^##\s+/, ''), bold: true, size: 28, color: '333333' })],
        heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 },
        border: { bottom: { color: accent.replace('#', ''), size: 2, style: BorderStyle.SINGLE, space: 4 } }
      }));
      continue;
    }
    if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^###\s+/, ''), bold: true, size: 24, color: '555555' })],
        heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 }
      }));
      continue;
    }

    // Blockquotes (styled as callout boxes)
    if (trimmed.startsWith('>')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^>\s*/, ''), italics: true, size: 20, color: '666666' })],
        indent: { left: 720 },
        border: { left: { color: accent.replace('#', ''), size: 6, style: BorderStyle.SINGLE, space: 8 } },
        spacing: { before: 100, after: 100 }
      }));
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.replace(/^[-*]\s+/, '');
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        bullet: { level: 0 }, spacing: { before: 40, after: 40 }
      }));
      continue;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      children.push(new Paragraph({
        children: parseInlineFormatting(numMatch[2]),
        numbering: { reference: 'default-numbering', level: 0 },
        spacing: { before: 40, after: 40 }
      }));
      continue;
    }

    // Horizontal rules
    if (trimmed === '---' || trimmed === '***') {
      children.push(new Paragraph({
        border: { bottom: { color: 'DDDDDD', size: 1, style: BorderStyle.SINGLE } },
        spacing: { before: 200, after: 200 }
      }));
      continue;
    }

    // Regular paragraph
    children.push(new Paragraph({
      children: parseInlineFormatting(trimmed),
      spacing: { before: 60, after: 60, line: 276 } // 1.15 line spacing
    }));
  }

  // Flush remaining table
  if (tableRows.length > 0) children.push(buildTable(tableRows, accent));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { size: 22, font: 'Helvetica', color: '333333' } }
      }
    },
    numbering: { config: [{ reference: 'default-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: name, bold: true, size: 16, color: accent.replace('#', '') }),
              new TextRun({ text: `  |  ${title}`, size: 16, color: '999999' })
            ],
            alignment: AlignmentType.RIGHT
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${name} — Confidential`, size: 14, color: 'AAAAAA' }),
              new TextRun({ children: [new Tab()], size: 14 }),
              new TextRun({ text: 'Page ', size: 14, color: 'AAAAAA' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: 'AAAAAA' }),
              new TextRun({ text: ' of ', size: 14, color: 'AAAAAA' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: 'AAAAAA' })
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: 9026 }]
          })]
        })
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

// ── Helper: Parse inline markdown formatting ─────────────────────────────
function parseInlineFormatting(text) {
  const runs = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`|_(.+?)_|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 22 }));
    }
    if (match[1]) runs.push(new TextRun({ text: match[1], bold: true, size: 22 }));
    else if (match[2]) runs.push(new TextRun({ text: match[2], font: 'Courier New', size: 20, shading: { type: ShadingType.SOLID, color: 'F0F0F0' } }));
    else if (match[3]) runs.push(new TextRun({ text: match[3], italics: true, size: 22 }));
    else if (match[4]) runs.push(new TextRun({ text: match[4], color: '0066CC', underline: {}, size: 22 }));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: 22 }));
  }
  return runs.length ? runs : [new TextRun({ text, size: 22 })];
}

// ── Helper: Build formatted table ────────────────────────────────────────
function buildTable(rows, accent) {
  const isHeader = rows.length > 1;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) => new TableRow({
      children: cells.map(cell => new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: cell, bold: rowIdx === 0 && isHeader, size: 20,
            color: rowIdx === 0 ? 'FFFFFF' : '333333',
            font: 'Helvetica'
          })],
          spacing: { before: 40, after: 40 }
        })],
        shading: rowIdx === 0 && isHeader ? { type: ShadingType.SOLID, color: accent.replace('#', '') } : rowIdx % 2 === 0 ? { type: ShadingType.SOLID, color: 'F9F9F9' } : undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 }
      }))
    }))
  });
}

// ── Generate branded PDF from markdown ───────────────────────────────────
export async function generatePdf(title, markdownContent, branding = {}) {
  const PDFDocument = (await import('pdfkit')).default;
  const { name = 'Business', accent = '#C9A84C', date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } = branding;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 72, bufferPages: true,
      info: { Title: title, Author: name, Subject: `${title} — Generated by Your Deputy`, Creator: 'Your Deputy Intelligence Engine' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cover page
    doc.moveDown(6);
    doc.fontSize(32).fillColor(accent).text(title, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#666666').text(name, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#999999').text(`Generated ${date}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#AAAAAA').text('Prepared by Your Deputy Intelligence Engine', { align: 'center' });
    doc.addPage();

    // Parse and render content
    const lines = markdownContent.split('\n');
    let inCode = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed && !inCode) { doc.moveDown(0.3); continue; }

      // Code blocks
      if (trimmed.startsWith('```')) { inCode = !inCode; continue; }
      if (inCode) { doc.fontSize(9).fillColor('#333333').font('Courier').text(line); doc.font('Helvetica'); continue; }

      // Headings
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        doc.moveDown(0.8); doc.fontSize(22).fillColor(accent).font('Helvetica-Bold').text(trimmed.replace(/^#\s+/, ''));
        doc.moveTo(72, doc.y + 4).lineTo(540, doc.y + 4).strokeColor(accent).lineWidth(1.5).stroke();
        doc.moveDown(0.4); doc.font('Helvetica'); continue;
      }
      if (trimmed.startsWith('## ')) {
        doc.moveDown(0.6); doc.fontSize(16).fillColor('#333333').font('Helvetica-Bold').text(trimmed.replace(/^##\s+/, ''));
        doc.moveTo(72, doc.y + 2).lineTo(400, doc.y + 2).strokeColor('#DDDDDD').lineWidth(0.5).stroke();
        doc.moveDown(0.3); doc.font('Helvetica'); continue;
      }
      if (trimmed.startsWith('### ')) {
        doc.moveDown(0.4); doc.fontSize(13).fillColor('#555555').font('Helvetica-Bold').text(trimmed.replace(/^###\s+/, ''));
        doc.moveDown(0.2); doc.font('Helvetica'); continue;
      }

      // Blockquotes
      if (trimmed.startsWith('>')) {
        doc.fontSize(10).fillColor('#666666').font('Helvetica-Oblique').text(trimmed.replace(/^>\s*/, ''), 90, doc.y, { width: 432 });
        doc.font('Helvetica'); continue;
      }

      // Bullets
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        doc.fontSize(10.5).fillColor('#333333').text(`  •  ${trimmed.replace(/^[-*]\s+/, '')}`, { indent: 18 }); continue;
      }

      // Horizontal rule
      if (trimmed === '---' || trimmed === '***') {
        doc.moveDown(0.3); doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#EEEEEE').lineWidth(0.5).stroke(); doc.moveDown(0.3); continue;
      }

      // Table rows (simple rendering)
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
        const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
        doc.fontSize(9).fillColor('#333333').text(cells.join('  |  '), { indent: 10 });
        continue;
      }

      // Regular text — strip bold/italic markdown for PDF
      let plainText = trimmed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1');
      doc.fontSize(10.5).fillColor('#333333').text(plainText, { lineGap: 3 });

      // Page overflow check
      if (doc.y > 680) doc.addPage();
    }

    // Footer on all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#AAAAAA');
      doc.text(`${name} — Confidential`, 72, 730, { width: 468, align: 'left' });
      doc.text(`Page ${i + 1} of ${pages.count}`, 72, 730, { width: 468, align: 'right' });
    }

    doc.end();
  });
}

// ── Generate branded Excel workbook from markdown tables ─────────────────
export async function generateExcel(title, markdownContent, branding = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const { name = 'Business', accent = '#C9A84C', date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } = branding;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Your Deputy';
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  // Parse markdown into sections — each ## heading becomes a sheet
  const sections = [];
  let currentSection = { title: 'Overview', tables: [], text: [] };
  const lines = markdownContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      if (currentSection.tables.length > 0 || currentSection.text.length > 0) sections.push(currentSection);
      currentSection = { title: trimmed.replace(/^##\s+/, '').replace(/[*_`]/g, '').slice(0, 31), tables: [], text: [] };
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim().replace(/\*\*/g, ''));
      currentSection.tables.push(cells);
    } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('>') && !trimmed.startsWith('---')) {
      currentSection.text.push(trimmed.replace(/\*\*/g, '').replace(/[`_]/g, ''));
    }
  }
  if (currentSection.tables.length > 0 || currentSection.text.length > 0) sections.push(currentSection);

  // If no sections with tables found, create a single sheet from any tables
  if (sections.length === 0 || sections.every(s => s.tables.length === 0)) {
    const allTables = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
        allTables.push(trimmed.split('|').filter(c => c.trim()).map(c => c.trim().replace(/\*\*/g, '')));
      }
    }
    if (allTables.length > 0) sections.push({ title: 'Data', tables: allTables, text: [] });
  }

  // Create a Cover sheet
  const cover = workbook.addWorksheet('Cover', { properties: { tabColor: { argb: accent.replace('#', 'FF') } } });
  cover.getColumn(1).width = 50;
  cover.getCell('A3').value = name;
  cover.getCell('A3').font = { size: 24, bold: true, color: { argb: accent.replace('#', 'FF') } };
  cover.getCell('A5').value = title;
  cover.getCell('A5').font = { size: 18, color: { argb: 'FF333333' } };
  cover.getCell('A7').value = `Generated ${date}`;
  cover.getCell('A7').font = { size: 11, italic: true, color: { argb: 'FF999999' } };
  cover.getCell('A8').value = 'Prepared by Your Deputy Intelligence Engine';
  cover.getCell('A8').font = { size: 10, color: { argb: 'FFAAAAAA' } };
  cover.getCell('A10').value = 'CONFIDENTIAL';
  cover.getCell('A10').font = { size: 9, bold: true, color: { argb: 'FFCC0000' } };

  // Create sheets for each section with tables
  for (const section of sections) {
    if (section.tables.length === 0) continue;
    const sheetName = section.title.slice(0, 31).replace(/[*?:/\\[\]]/g, '');
    const ws = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: accent.replace('#', 'FF') } } });

    // Add section description text
    if (section.text.length > 0) {
      const descRow = ws.addRow([section.text.slice(0, 3).join(' ')]);
      descRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' }, size: 10 };
      ws.addRow([]);
    }

    // Add table data
    let isFirstRow = true;
    for (const cells of section.tables) {
      const row = ws.addRow(cells.map(c => {
        // Try to parse numbers
        const num = c.replace(/[$,%]/g, '').trim();
        if (!isNaN(num) && num !== '') return parseFloat(num);
        return c;
      }));

      if (isFirstRow) {
        // Style header row
        row.eachCell((cell, colNumber) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent.replace('#', 'FF') } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { bottom: { style: 'medium', color: { argb: 'FF333333' } } };
        });
        isFirstRow = false;
      } else {
        // Style data rows with alternating colors
        const rowIdx = row.number;
        row.eachCell((cell) => {
          cell.font = { size: 10, color: { argb: 'FF333333' } };
          if (rowIdx % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          }
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
          // Format cells that look like currency
          if (typeof cell.value === 'number') {
            cell.numFmt = cell.value > 100 ? '$#,##0' : '#,##0.0%';
          }
        });
      }
    }

    // Auto-fit columns
    ws.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell({ includeEmpty: false }, cell => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = Math.min(len + 2, 40);
      });
      col.width = maxLen;
    });

    // Freeze header row
    ws.views = [{ state: 'frozen', ySplit: section.text.length > 0 ? 3 : 1 }];
  }

  // If no data sheets were created, add a placeholder
  if (workbook.worksheets.length <= 1) {
    const ws = workbook.addWorksheet('Data');
    ws.getCell('A1').value = 'This document contains narrative content. See the .md or .docx version for the full document.';
    ws.getCell('A1').font = { italic: true, color: { argb: 'FF666666' } };
  }

  return workbook.xlsx.writeBuffer();
}
