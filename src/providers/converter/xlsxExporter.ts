/**
 * Excel (.xlsx) OOXML & CSV Exporter Provider backed by `fflate`.
 * Generates strict ECMA-376 multi-sheet Spreadsheets with numeric auto-typing
 * and sanitized sheet names, without Node.js polyfills.
 */
import { strToU8, zipSync } from 'fflate';
import {
  analyzeExtractedPage,
  escapeXml,
  sanitizeXmlText,
  type PdfPageExtractedContent,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';

function toExcelColName(zeroBasedCol: number): string {
  let n = zeroBasedCol;
  let name = '';
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function sanitizeSheetName(raw: string, fallbackIdx: number): string {
  const cleaned = sanitizeXmlText(raw).replace(/[\\/?*[\]:]/g, ' ').trim();
  const capped = (cleaned || `Page ${fallbackIdx}`).slice(0, 31);
  return capped || `Page ${fallbackIdx}`;
}

function tryParseNumericCell(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function buildWorksheetXml(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>(Aucun texte extractible sur cette page)</t></is></c></row></sheetData>' +
      '</worksheet>'
    );
  }

  const maxCols = Math.max(1, ...rows.map((r) => r.length));
  const colWidths = new Array<number>(maxCols).fill(14);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      colWidths[c] = Math.min(58, Math.max(colWidths[c], (row[c]?.length ?? 0) + 3));
    }
  }

  const colsXml = colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const rowsXml = rows
    .map((row, rIdx) => {
      const excelRow = rIdx + 1;
      const styleAttr = rIdx === 0 ? ' s="1"' : '';
      const cellsXml = row
        .map((cell, cIdx) => {
          const ref = `${toExcelColName(cIdx)}${excelRow}`;
          const trimmed = sanitizeXmlText(cell).trim();
          if (!trimmed) return '';
          const numeric = tryParseNumericCell(trimmed);
          if (numeric !== null && rIdx > 0) {
            return `<c r="${ref}" t="n"><v>${numeric}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(trimmed)}</t></is></c>`;
        })
        .filter(Boolean)
        .join('');
      return `<row r="${excelRow}">${cellsXml}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    '</worksheet>'
  );
}

export function exportPagesToXlsx(
  pages: readonly PdfPageExtractedContent[]
): { readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));
  const sheetEntries = analyses.map((a, idx) => ({
    name: sanitizeSheetName(`Page ${a.pageIndex + 1}`, idx + 1),
    xml: buildWorksheetXml(a.tableRows),
  }));

  const summaryRows: string[][] = [['Page', 'Lignes détectées', 'Colonnes détectées', 'Statut texte']];
  for (const a of analyses) {
    summaryRows.push([
      `${a.pageIndex + 1}`,
      `${a.lines.length}`,
      `${a.columnCount}`,
      a.hasText ? 'Texte extrait' : 'Aucun flux texte (image/vierge)',
    ]);
  }
  sheetEntries.push({
    name: 'Synthèse',
    xml: buildWorksheetXml(summaryRows),
  });

  const contentTypeOverrides = sheetEntries
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const sheetDefs = sheetEntries
    .map(
      (s, idx) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('');

  const workbookRels = sheetEntries
    .map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        contentTypeOverrides +
        '</Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${sheetDefs}</sheets>` +
        '</workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        workbookRels +
        `<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
        '</styleSheet>'
    ),
  };

  sheetEntries.forEach((s, idx) => {
    files[`xl/worksheets/sheet${idx + 1}.xml`] = strToU8(s.xml);
  });

  return { bytes: zipSync(files, { level: 6 }), analyses };
}

export function exportPagesToCsv(
  pages: readonly PdfPageExtractedContent[]
): { readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));
  const csvLines: string[] = [];

  const escapeCsvCell = (val: string) => {
    const clean = sanitizeXmlText(val);
    if (/[";\r\n]/.test(clean)) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };

  for (const a of analyses) {
    if (analyses.length > 1) {
      csvLines.push(`# Page ${a.pageIndex + 1}`);
    }
    for (const row of a.tableRows) {
      csvLines.push(row.map(escapeCsvCell).join(';'));
    }
  }

  // UTF-8 BOM + CRLF for instant opening in French Microsoft Excel
  const body = `\uFEFF${csvLines.join('\r\n')}`;
  return { bytes: strToU8(body), analyses };
}
