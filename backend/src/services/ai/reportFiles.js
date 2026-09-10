/**
 * SAM report file builders — Node port of the pure builders in api/ai_history.php:
 * aiReportXlsxContent (+ aiXlsxColsXml column-autosize), aiReportImageContent (SVG),
 * and aiZipStore. Returns Buffers/strings ready to write to the uploads folder.
 *
 * Why a real .xlsx (OOXML zip) and not HTML-as-.xls: Defender/Chrome flag disguised
 * spreadsheets as a virus and block the download. This builds a genuine package with
 * a hand-rolled stored zip — no dependency needed.
 */

// ── helpers ──────────────────────────────────────────────────────────────────
const xmlEscape = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function cleanText(value, maxLength = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '-';
  if (text.length > maxLength) return text.slice(0, maxLength - 3).replace(/\s+$/, '') + '...';
  return text;
}

const pad2 = (n) => String(n).padStart(2, '0');
function stamp(d = new Date(), withSeconds = false) {
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(d.getSeconds())}` : base;
}

// ── CRC32 (for the stored zip) ───────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a ZIP (stored, no compression) from { name: contentString } pairs. */
function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let count = 0;

  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const len = data.length;

    const lf = Buffer.alloc(30);
    lf.write('PK\x03\x04', 0, 'binary');
    lf.writeUInt16LE(20, 4);   // version needed
    lf.writeUInt16LE(0, 6);    // flags
    lf.writeUInt16LE(0, 8);    // method: stored
    lf.writeUInt16LE(0, 10);   // mod time
    lf.writeUInt16LE(0x21, 12);// mod date (1980-01-01)
    lf.writeUInt32LE(crc, 14);
    lf.writeUInt32LE(len, 18);
    lf.writeUInt32LE(len, 22);
    lf.writeUInt16LE(nameBuf.length, 26);
    lf.writeUInt16LE(0, 28);
    localParts.push(lf, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.write('PK\x01\x02', 0, 'binary');
    cd.writeUInt16LE(20, 4);   // version made by
    cd.writeUInt16LE(20, 6);   // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(len, 20);
    cd.writeUInt32LE(len, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);   // extra
    cd.writeUInt16LE(0, 32);   // comment
    cd.writeUInt16LE(0, 34);   // disk
    cd.writeUInt16LE(0, 36);   // internal attrs
    cd.writeUInt32LE(0, 38);   // external attrs
    cd.writeUInt32LE(offset, 42);
    centralParts.push(cd, nameBuf);

    offset += lf.length + nameBuf.length + data.length;
    count++;
  }

  const central = Buffer.concat(centralParts);
  const local = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);
  eocd.write('PK\x05\x06', 0, 'binary');
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, central, eocd]);
}

// ── XLSX ─────────────────────────────────────────────────────────────────────
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1 - m) / 26);
  }
  return s;
}
const strCell = (ref, s, value) =>
  `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
const numCell = (ref, s, value) => `<c r="${ref}" s="${s}"><v>${value}</v></c>`;

/** Auto-size columns from content so data isn't clipped to Excel's ~8-char default. */
function colsXml(columns, rows) {
  const widths = [5.0]; // "#" index column
  for (const col of columns) {
    let max = String(col).length;
    for (const row of rows) max = Math.max(max, String(row[col] ?? '').length);
    widths.push(Math.min(60, Math.max(8, max + 2)));
  }
  let xml = '<cols>';
  widths.forEach((w, i) => {
    const idx = i + 1;
    xml += `<col min="${idx}" max="${idx}" width="${w.toFixed(2)}" customWidth="1"/>`;
  });
  return xml + '</cols>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="10">' +
    '<font><sz val="10"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="13"/><color rgb="FF17233A"/><name val="Calibri"/></font>' +
    '<font><sz val="9"/><color rgb="FF526176"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><sz val="9"/><color rgb="FF9CA3AF"/><name val="Calibri"/></font>' +
    '<font><sz val="10"/><color rgb="FF1F2A44"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF15803D"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFB45309"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFDC2626"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="9">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1455D9"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FF"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0FFF4"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFBEB"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF5F5"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FBFF"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF0D40B0"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top style="medium"><color rgb="FF1455D9"/></top><bottom/><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="5" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="6" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="7" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="8" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="9" fillId="8" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

function reportXlsxContent(title, rows) {
  if (!rows.length) rows = [{ Message: 'No records found for this report.' }];
  const columns = Object.keys(rows[0]);
  const generated = stamp(new Date(), true);
  const total = rows.length;
  const attendanceCounts = rows.reduce((counts, row) => {
    const status = String(row.Status ?? row.status ?? '').trim().toUpperCase();
    if (Object.hasOwn(counts, status)) counts[status] += 1;
    return counts;
  }, { PRESENT: 0, LATE: 0, ABSENT: 0 });
  const attendanceSummary = Object.values(attendanceCounts).some(Boolean)
    ? ` | Present: ${attendanceCounts.PRESENT} | Late: ${attendanceCounts.LATE} | Absent: ${attendanceCounts.ABSENT}`
    : '';
  const colCount = columns.length + 1;
  const lastCol = colLetter(colCount);

  let sd = '';
  let r = 1;
  sd += `<row r="${r}" ht="22" customHeight="1">${strCell('A' + r, 1, title)}</row>`; r++;
  sd += `<row r="${r}" ht="16" customHeight="1">${strCell('A' + r, 2, `Generated by SAMELCO II AI (SAM) | ${generated} | Total: ${total} record(s)${attendanceSummary}`)}</row>`; r++;

  sd += `<row r="${r}" ht="20" customHeight="1">${strCell('A' + r, 3, '#')}`;
  let ci = 2;
  for (const col of columns) { sd += strCell(colLetter(ci) + r, 3, String(col)); ci++; }
  sd += '</row>'; r++;

  rows.forEach((row, i) => {
    const baseStyle = i % 2 === 0 ? 5 : 6;
    const attendanceStatus = String(row.Status ?? row.status ?? '').trim().toUpperCase();
    const attendanceStyle = attendanceStatus === 'PRESENT' ? 7
      : attendanceStatus === 'LATE' ? 8
        : attendanceStatus === 'ABSENT' ? 9 : 0;
    sd += `<row r="${r}" ht="18" customHeight="1">${numCell('A' + r, attendanceStyle || 4, i + 1)}`;
    ci = 2;
    for (const col of columns) {
      const val = String(row[col] ?? '');
      const lower = val.trim().toLowerCase();
      let style = attendanceStyle || baseStyle;
      if (lower === 'approved' || lower === '2' || lower.includes('approved')) style = 7;
      else if (lower === 'pending' || lower === '1' || lower.includes('pending')) style = 8;
      else if (lower === 'rejected' || lower === '3' || lower.includes('rejected') || lower.includes('denied')) style = 9;
      const ref = colLetter(ci) + r;
      if (val !== '' && !Number.isNaN(Number(val)) && !/^0\d/.test(val)) sd += numCell(ref, style, Number(val));
      else sd += strCell(ref, style, val);
      ci++;
    }
    sd += '</row>'; r++;
  });

  const footerRow = r;
  sd += `<row r="${r}" ht="16" customHeight="1">${strCell('A' + r, 10, `SAMELCO II — ${title} — ${total} record(s) — ${generated}`)}</row>`;

  const merges = `<mergeCells count="3"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/><mergeCell ref="A${footerRow}:${lastCol}${footerRow}"/></mergeCells>`;

  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    colsXml(columns, rows) +
    `<sheetData>${sd}</sheetData>${merges}</worksheet>`;

  let sheetName = title.replace(/[/\\?*[\]:]/g, ' ').trim().slice(0, 31) || 'Report';

  return zipStore({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml': stylesXml(),
    'xl/worksheets/sheet1.xml': sheet,
  });
}

// ── SVG report image (with the row-number/column overlap fixed) ──────────────
function reportImageContent(title, rows) {
  rows = rows.slice(0, 25);
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 7) : ['Message'];
  if (!rows.length) rows = [{ Message: 'No records found for this report.' }];

  const colCount = columns.length;
  const width = 1220;
  const rowH = 32;
  const tableW = 1140;
  const tableX = 40;
  const headerBot = 122;
  const footerH = 50;
  const numW = 40;
  const dataW = tableW - numW;
  const colW = Math.floor(dataW / Math.max(1, colCount));
  const maxChars = Math.max(6, Math.floor(colW / 7));
  const dataBottom = headerBot + rows.length * rowH;
  const height = dataBottom + footerH + 16;
  const generated = stamp();
  const colX = (ci) => tableX + numW + ci * colW;

  // Accessibility: <title>/<desc> give screen readers an accessible name and
  // summary — SVG has no native alt text, this is the standard equivalent.
  const a11yTitle = xmlEscape(cleanText(title, 120));
  const a11yDesc = xmlEscape(`Table with ${columns.length} column(s) — ${columns.join(', ')} — and ${rows.length} row(s).`);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="svgTitle svgDesc">`;
  svg += `<title id="svgTitle">${a11yTitle}</title><desc id="svgDesc">${a11yDesc}</desc>`;
  svg += '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8f0fe"/><stop offset="100%" stop-color="#f6f8fb"/></linearGradient>';
  svg += '<linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1455d9"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs>';
  svg += '<rect width="100%" height="100%" fill="url(#bg)"/>';
  svg += `<rect x="${tableX}" y="16" width="${tableW}" height="${height - 32}" rx="18" fill="#fff" stroke="#c7d2fe" stroke-width="1.5"/>`;
  svg += `<rect x="${tableX}" y="16" width="${tableW}" height="72" rx="18" fill="url(#hdr)"/>`;
  svg += `<rect x="${tableX}" y="52" width="${tableW}" height="36" fill="url(#hdr)"/>`;
  svg += '<circle cx="72" cy="52" r="20" fill="#fff" opacity="0.2"/>';
  svg += '<text x="72" y="58" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">SAM</text>';
  svg += `<text x="102" y="45" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">${xmlEscape(cleanText(title, 90))}</text>`;
  svg += `<text x="102" y="68" font-family="Arial,sans-serif" font-size="11" fill="#c7d8ff">Generated ${xmlEscape(generated)} &amp;nbsp;|&amp;nbsp; ${rows.length} record(s)</text>`;
  svg += `<rect x="${tableX}" y="88" width="${tableW}" height="34" fill="#1e3a8a"/>`;
  svg += `<text x="${tableX + 12}" y="110" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff">#</text>`;
  columns.forEach((col, ci) => {
    svg += `<text x="${colX(ci) + 8}" y="110" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff">${xmlEscape(cleanText(col, maxChars))}</text>`;
  });
  rows.forEach((row, ri) => {
    const rowTop = headerBot + ri * rowH;
    svg += `<rect x="${tableX}" y="${rowTop}" width="${tableW}" height="${rowH}" fill="${ri % 2 === 0 ? '#ffffff' : '#f0f5ff'}"/>`;
  });
  for (let ci = 0; ci <= colCount; ci++) {
    const sx = colX(ci);
    svg += `<line x1="${sx}" y1="${headerBot}" x2="${sx}" y2="${dataBottom}" stroke="#e5ecf6" stroke-width="1"/>`;
  }
  rows.forEach((row, ri) => {
    const baseline = headerBot + ri * rowH + 21;
    svg += `<text x="${tableX + 12}" y="${baseline}" font-family="Arial,sans-serif" font-size="10" fill="#9ca3af">${ri + 1}</text>`;
    columns.forEach((col, ci) => {
      const val = cleanText(row[col] ?? '', maxChars);
      const lower = val.toLowerCase();
      let fill = '#1f2a44';
      if (lower === 'approved' || lower === '2' || lower.includes('approved')) fill = '#15803d';
      else if (lower === 'pending' || lower === '1' || lower.includes('pending')) fill = '#b45309';
      else if (lower === 'rejected' || lower === '3' || lower.includes('rejected')) fill = '#dc2626';
      svg += `<text x="${colX(ci) + 8}" y="${baseline}" font-family="Arial,sans-serif" font-size="11" fill="${fill}">${xmlEscape(val)}</text>`;
    });
  });
  const footY = dataBottom + 8;
  svg += `<line x1="${tableX}" y1="${footY}" x2="${tableX + tableW}" y2="${footY}" stroke="#c7d2fe" stroke-width="1"/>`;
  svg += `<text x="${tableX + 10}" y="${footY + 22}" font-family="Arial,sans-serif" font-size="10" fill="#6b7280">SAMELCO II — Generated by SAM AI</text>`;
  svg += `<text x="${tableX + tableW - 10}" y="${footY + 22}" font-family="Arial,sans-serif" font-size="10" fill="#6b7280" text-anchor="end">${xmlEscape(generated)}</text>`;
  svg += '</svg>';
  return svg;
}

/**
 * Build the `[SAM_TABLE]` payload the messenger frontend renders as a real
 * in-chat HTML table (see formatSamTableReply in messenger/script.js). Includes
 * ALL rows — the table is the "complete" view — while the UI caps display to 6
 * columns, so the attached Excel remains the every-column source of truth.
 */
function buildSamTable(title, rows, { columns, total, note } = {}) {
  if (!rows.length) rows = [{ Message: 'No records found for this report.' }];
  const cols = (columns && columns.length ? columns : Object.keys(rows[0])).slice(0, 6);
  const cleanRows = rows.map((r) => {
    const o = {};
    for (const c of cols) o[c] = cleanText(r[c] ?? '', 90);
    return o;
  });
  const payload = {
    title,
    columns: cols,
    rows: cleanRows,
    total: total ?? rows.length,
    shown: cleanRows.length,
    note: note || `Showing all ${rows.length} record(s).`,
  };
  return `[SAM_TABLE]\n${JSON.stringify(payload)}\n[/SAM_TABLE]`;
}

/** One CSV field, quoted (and internal quotes doubled) only when it needs to be. */
function csvField(value) {
  const str = String(value ?? '');
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * reportCsvContent — plain CSV, no title/metadata rows (unlike the Excel export)
 * so it opens cleanly in any spreadsheet tool with headers on row 1. UTF-8 BOM
 * prefix so Excel on Windows doesn't mangle non-ASCII names.
 */
function reportCsvContent(title, rows) {
  if (!rows.length) rows = [{ Message: 'No records found for this report.' }];
  const columns = Object.keys(rows[0]);
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvField(row[col])).join(','));
  }
  return `﻿${lines.join('\r\n')}`;
}

module.exports = {
  cleanText,
  colLetter,
  colsXml,
  zipStore,
  reportXlsxContent,
  reportImageContent,
  reportCsvContent,
  buildSamTable,
};

/**
 * reportPdfContent — Node port ng aiReportPdfContent() (api/ai_history.php).
 *
 * Gumagawa ng PDF nang WALANG library: hand-built na PDF 1.4 objects na may monospace
 * (Courier) na talahanayan. Kaya gumagana ito kahit walang npm package sa server.
 *
 * MAHALAGA: ang PDF ay byte-offset based (ang xref ay tumuturo sa eksaktong posisyon ng
 * bawat object). Kaya LAHAT ng haba ay bibilangin sa BYTES gamit ang latin1 Buffer —
 * hindi sa JS string .length na UTF-16 ang bilang. Kapag mali ang offset, sira ang PDF.
 *
 * @param {string} title
 * @param {Array<Object>} rows
 * @returns {Buffer} raw PDF bytes
 */
function reportPdfContent(title, rows) {
  let data = Array.isArray(rows) && rows.length ? rows : [{ Message: 'No records found for this report.' }];
  const columns = Object.keys(data[0]);

  /**
   * ASCII-safe (WinAnsi ang Courier) at isahang space lang.
   *
   * MAHALAGA: ang PHP ay nagpapalit KADA BYTE (preg_replace sa binary string), kaya ang
   * "Ñ" (2 bytes sa UTF-8) ay nagiging "??" — hindi "?". Kailangang tularan ito nang eksakto,
   * kung hindi ay maiiba ang lapad ng column at ang byte offsets ng PDF.
   */
  const clean = (v) => {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    // Bawat byte ng UTF-8 na wala sa 0x20-0x7E ay nagiging isang "?".
    return Buffer.from(s, 'utf8')
      .reduce((out, byte) => out + (byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '?'), '');
  };

  // Lapad bawat column (naka-cap), siguradong kasya ang header label.
  const CAP = 22;
  const widths = {};
  for (const c of columns) {
    let w = clean(c).length;
    for (const r of data) w = Math.max(w, clean(r[c] ?? '').length);
    widths[c] = Math.min(Math.max(w, 3), CAP);
  }

  const padCell = (s, w) => (s.length > w ? s.slice(0, w) : s.padEnd(w));
  const rowToLine = (vals) => columns.map((c) => padCell(clean(vals[c] ?? ''), widths[c])).join(' ');

  const headerLine = columns.map((c) => padCell(clean(c), widths[c])).join(' ');
  const sepLine = '-'.repeat(headerLine.length);
  const bodyLines = data.map(rowToLine);

  // Geometry: landscape Letter.
  const pw = 792;
  const ph = 612;
  const left = 36;
  const top = 560;
  const lineH = 10;
  const linesPerPage = 47;

  // PDF string escaping: backslash, open paren, close paren.
  const esc = (s) => String(s)
    .split('\\').join('\\\\')
    .split('(').join('\\(')
    .split(')').join('\\)');
  const titleClean = clean(title);

  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} `
    + `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  const generated = `Generated by SAMELCO II AI (SAM) | ${stamp} | ${data.length} record(s)`;

  // Hatiin ang body sa pages; inuulit ang header sa bawat pahina.
  const pagesLines = [];
  for (let i = 0; i < bodyLines.length; i += linesPerPage) pagesLines.push(bodyLines.slice(i, i + linesPerPage));
  if (!pagesLines.length) pagesLines.push([]);

  const contents = pagesLines.map((chunk, pi) => {
    let s = `BT /F1 14 Tf 1 0 0 1 ${left} ${ph - 40} Tm (${esc(titleClean)}) Tj ET\n`;
    s += `BT /F2 7 Tf 1 0 0 1 ${left} ${ph - 56} Tm (${esc(generated)}) Tj ET\n`;
    s += `BT /F2 8 Tf ${lineH} TL 1 0 0 1 ${left} ${top} Tm\n`;
    s += `(${esc(headerLine)}) Tj T*\n`;
    s += `(${esc(sepLine)}) Tj T*\n`;
    for (const ln of chunk) s += `(${esc(ln)}) Tj T*\n`;
    s += 'ET\n';
    s += `BT /F2 7 Tf 1 0 0 1 ${left} 24 Tm (${esc(`Page ${pi + 1} of ${pagesLines.length}`)}) Tj ET\n`;
    return s;
  });

  // Objects: 1=catalog, 2=pages, 3=Helvetica-Bold, 4=Courier, tapos page+contents bawat pahina.
  const pageCount = contents.length;
  const objects = {};
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

  const firstPageObj = 5;
  const kids = [];
  for (let i = 0; i < pageCount; i++) kids.push(`${firstPageObj + i * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} /MediaBox [0 0 ${pw} ${ph}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = firstPageObj + i * 2;
    const contentObjNum = pageObjNum + 1;
    objects[pageObjNum] = `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`;
    const stream = contents[i];
    // strlen() ng PHP = bilang ng BYTES, kaya Buffer.byteLength (latin1) ang katumbas.
    objects[contentObjNum] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`;
  }

  const nums = Object.keys(objects).map(Number).sort((a, b) => a - b);
  const maxObj = nums[nums.length - 1];

  let pdf = '%PDF-1.4\n';
  const offsets = {};
  for (const num of nums) {
    offsets[num] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${num} 0 obj\n${objects[num]}\nendobj\n`;
  }

  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${maxObj + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let n = 1; n <= maxObj; n++) {
    pdf += offsets[n] !== undefined
      ? `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
      : '0000000000 65535 f \n';
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

module.exports.reportPdfContent = reportPdfContent;
