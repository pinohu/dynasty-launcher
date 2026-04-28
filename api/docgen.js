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
function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let n = index;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name || 'A';
}

function normalizeAccent(accent) {
  const hex = String(accent || '').replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : 'C9A84C';
}

function sanitizeSheetName(name, usedNames) {
  const base = String(name || 'Data')
    .replace(/[*?:/\\[\]]/g, '')
    .trim()
    .slice(0, 31) || 'Data';
  let candidate = base;
  let i = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` ${i}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function parseWorkbookCell(value) {
  const num = String(value ?? '').replace(/[$,%]/g, '').trim();
  if (num !== '' && !Number.isNaN(Number(num))) return Number(num);
  return String(value ?? '');
}

function buildCell(rowIndex, colIndex, value, styleId = 0) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const style = styleId ? ` s="${styleId}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function buildSheetXml({ rows, widths = [], frozenRows = 0 }) {
  const maxCols = Math.max(1, ...rows.map((row) => row.length));
  const maxRows = Math.max(1, rows.length);
  const cols = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(10, Math.min(50, width))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = frozenRows > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => buildCell(rowIndex + 1, colIndex + 1, cell.value, cell.style));
    return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(maxCols)}${maxRows}"/>
  ${pane}
  ${cols}
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function buildStylesXml(accentHex) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="10"/><color rgb="FF333333"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="24"/><color rgb="FF${accentHex}"/><name val="Calibri"/></font>
    <font><i/><sz val="11"/><color rgb="FF999999"/><name val="Calibri"/></font>
    <font><b/><sz val="9"/><color rgb="FFCC0000"/><name val="Calibri"/></font>
    <font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${accentHex}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5F5F5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="medium"><color rgb="FF333333"/></bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFEEEEEE"/></bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="2" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export async function generateExcel(title, markdownContent, branding = {}) {
  const JSZip = (await import('jszip')).default;
  const { name = 'Business', accent = '#C9A84C', date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } = branding;
  const accentHex = normalizeAccent(accent);

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

  const sheets = [{
    name: 'Cover',
    rows: [
      [],
      [],
      [{ value: name, style: 2 }],
      [],
      [{ value: title, style: 0 }],
      [],
      [{ value: `Generated ${date}`, style: 3 }],
      [{ value: 'Prepared by Your Deputy Intelligence Engine', style: 3 }],
      [],
      [{ value: 'CONFIDENTIAL', style: 4 }],
    ],
    widths: [50],
    frozenRows: 0,
  }];

  // Create sheets for each section with tables
  const usedNames = new Set(['cover']);
  for (const section of sections) {
    if (section.tables.length === 0) continue;
    const sheetName = sanitizeSheetName(section.title, usedNames);
    const rows = [];

    // Add section description text
    if (section.text.length > 0) {
      rows.push([{ value: section.text.slice(0, 3).join(' '), style: 5 }]);
      rows.push([]);
    }

    // Add table data
    let isFirstRow = true;
    for (const cells of section.tables) {
      const style = isFirstRow ? 1 : (rows.length % 2 === 0 ? 6 : 7);
      rows.push(cells.map(c => ({ value: parseWorkbookCell(c), style })));
      isFirstRow = false;
    }

    // Auto-fit columns
    const maxCols = Math.max(1, ...rows.map((row) => row.length));
    const widths = Array.from({ length: maxCols }, (_, colIndex) => {
      let maxLen = 10;
      for (const row of rows) {
        const cell = row[colIndex];
        if (!cell) continue;
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = Math.min(len + 2, 40);
      }
      return maxLen;
    });

    // Freeze header row
    sheets.push({ name: sheetName, rows, widths, frozenRows: section.text.length > 0 ? 3 : 1 });
  }

  // If no data sheets were created, add a placeholder
  if (sheets.length <= 1) {
    sheets.push({
      name: 'Data',
      rows: [[{ value: 'This document contains narrative content. See the .md or .docx version for the full document.', style: 5 }]],
      widths: [50],
      frozenRows: 0,
    });
  }

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Your Deputy</dc:creator>
  <dc:title>${xmlEscape(title)}</dc:title>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Your Deputy</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>
</Properties>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('\n  ')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', buildStylesXml(accentHex));
  sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, buildSheetXml(sheet));
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
