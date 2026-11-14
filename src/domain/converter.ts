/**
 * Pure Domain models and geometric layout/table inference algorithms
 * for PDF -> Office / Web / Image export (converter/pdf-export-formats).
 */
import { groupTextRunsIntoBlocks, type ExistingTextBlock, type PdfStandardFamily, type RawTextRun } from './editor.ts';

export type ExportFormatId =
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'png'
  | 'jpeg'
  | 'html'
  | 'txt';

export type DocxExportMode = 'exact-layout' | 'flowing-text';
export type PptxExportMode = 'exact-slides' | 'editable-text' | 'visual-slides';
export type ExportPageScope = 'all' | 'current';

export interface ExportFormatDescriptor {
  readonly id: ExportFormatId;
  readonly label: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly filterName: string;
  readonly summary: string;
}

export const EXPORT_FORMAT_CATALOG: readonly ExportFormatDescriptor[] = [
  {
    id: 'docx',
    label: 'Microsoft Word (.docx)',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filterName: 'Document Word',
    summary: 'Rendu 100% conforme au PDF (mise en page, polices, images, dimensions exactes) avec texte éditable.',
  },
  {
    id: 'xlsx',
    label: 'Microsoft Excel (.xlsx)',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filterName: 'Classeur Excel',
    summary: 'Grilles de lignes/colonnes détectées géométriquement par page avec typage numérique.',
  },
  {
    id: 'pptx',
    label: 'Microsoft PowerPoint (.pptx)',
    extension: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    filterName: 'Présentation PowerPoint',
    summary: 'Diapositives haute fidélité visuelle avec visuels HD et zones de texte éditables superposées.',
  },
  {
    id: 'csv',
    label: 'Tableau CSV (.csv)',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    filterName: 'Fichier CSV',
    summary: 'Export tabulaire UTF-8 (BOM + séparateur point-virgule compatible Excel FR).',
  },
  {
    id: 'png',
    label: 'Image PNG (.png / .zip)',
    extension: 'png',
    mimeType: 'image/png',
    filterName: 'Image PNG',
    summary: 'Rendu bitmap sans perte (image directe si 1 page, archive .zip si multi-pages).',
  },
  {
    id: 'jpeg',
    label: 'Image JPEG (.jpg / .zip)',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    filterName: 'Image JPEG',
    summary: 'Rendu photo compressé léger (fichier .jpg unique ou archive .zip multi-pages).',
  },
  {
    id: 'html',
    label: 'Page Web autonome (.html)',
    extension: 'html',
    mimeType: 'text/html;charset=utf-8',
    filterName: 'Page HTML',
    summary: 'Feuille PDF haute fidélité avec arrière-plan graphique HD, texte sélectionnable et style d’impression.',
  },
  {
    id: 'txt',
    label: 'Texte brut (.txt)',
    extension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    filterName: 'Fichier texte',
    summary: 'Extraction linéaire du flux texte page par page en UTF-8.',
  },
];

export interface ExportRequestOptions {
  readonly format: ExportFormatId;
  readonly docxMode?: DocxExportMode;
  readonly pptxMode: PptxExportMode;
  readonly includeVisualPagesInWord?: boolean;
  readonly rasterDpi: 150 | 300;
  readonly pageScope: ExportPageScope;
  readonly currentPageIndex: number;
}

export interface PdfPageExtractedContent {
  readonly pageIndex: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly runs: readonly RawTextRun[];
  readonly blocks?: readonly ExistingTextBlock[];
  readonly rasterPngBytes?: Uint8Array;
  readonly rasterJpegBytes?: Uint8Array;
  readonly rasterWidthPx?: number;
  readonly rasterHeightPx?: number;
}

export interface LayoutLine {
  readonly baselineYPt: number;
  readonly leftPt: number;
  readonly topPt: number;
  readonly rightPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly fontSizePt: number;
  readonly fontFamily: PdfStandardFamily;
  readonly colorHex?: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly text: string;
  readonly runs: readonly RawTextRun[];
}

export interface TextLayoutBox {
  readonly text: string;
  readonly leftPt: number;
  readonly topPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly fontSizePt: number;
  readonly fontFamily: PdfStandardFamily;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly colorHex: string;
}

export function extractPageLayoutBoxes(page: PdfPageExtractedContent): TextLayoutBox[] {
  const widthPt = Math.max(10, page.widthPt);
  const heightPt = Math.max(10, page.heightPt);

  if (page.blocks && page.blocks.length > 0) {
    return page.blocks.map((b) => ({
      text: b.text,
      leftPt: b.rect.x * widthPt,
      topPt: b.rect.y * heightPt,
      widthPt: Math.max(12, b.rect.width * widthPt),
      heightPt: Math.max(10, b.rect.height * heightPt),
      fontSizePt: b.fontSizePt,
      fontFamily: b.fontFamily,
      bold: b.bold,
      italic: b.italic,
      colorHex: b.textColorHex || '#000000',
    }));
  }

  if (page.runs.length > 0) {
    const blocks = groupTextRunsIntoBlocks(page.runs, page.pageIndex, widthPt, heightPt);
    return blocks.map((b) => ({
      text: b.text,
      leftPt: b.rect.x * widthPt,
      topPt: b.rect.y * heightPt,
      widthPt: Math.max(12, b.rect.width * widthPt),
      heightPt: Math.max(10, b.rect.height * heightPt),
      fontSizePt: b.fontSizePt,
      fontFamily: b.fontFamily,
      bold: b.bold,
      italic: b.italic,
      colorHex: b.textColorHex || '#000000',
    }));
  }

  return [];
}

export interface StructuredParagraph {
  readonly text: string;
  readonly headingLevel: 0 | 1 | 2 | 3;
  readonly fontSizePt: number;
  readonly bold: boolean;
  readonly italic: boolean;
}

export interface StructuredPageAnalysis {
  readonly pageIndex: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly lines: readonly LayoutLine[];
  readonly paragraphs: readonly StructuredParagraph[];
  readonly tableRows: readonly (readonly string[])[];
  readonly columnCount: number;
  readonly rawText: string;
  readonly hasText: boolean;
  readonly unknownReason: string | null;
}

export interface ConversionAuditReport {
  readonly format: ExportFormatId;
  readonly observations: readonly string[];
  readonly derivations: readonly string[];
  readonly unknowns: readonly string[];
}

/** Removes ASCII control chars disallowed by XML 1.0 (keeping tab, LF, CR). */
export function sanitizeXmlText(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd)
    ) {
      out += input[i];
    }
  }
  return out;
}

export function escapeXml(input: string): string {
  return sanitizeXmlText(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function deriveExportFilename(
  sourceDisplayName: string,
  extension: string,
  isArchive: boolean = false
): string {
  const base = sourceDisplayName.trim().replace(/\.pdf$/i, '') || 'document';
  if (isArchive) {
    return `${base}_pages_${extension}.zip`;
  }
  return `${base}.${extension}`;
}

function median(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Groups raw PDF text runs into horizontal reading lines sorted top-to-bottom.
 */
export function buildStructuredLinesFromRuns(runs: readonly RawTextRun[]): LayoutLine[] {
  const nonEmpty = runs.filter((r) => sanitizeXmlText(r.text).trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const sorted = [...nonEmpty].sort((a, b) => {
    if (Math.abs(a.baselineYPt - b.baselineYPt) > 2.5) {
      return a.baselineYPt - b.baselineYPt;
    }
    return a.leftPt - b.leftPt;
  });

  const groups: RawTextRun[][] = [];
  for (const run of sorted) {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push([run]);
      continue;
    }
    const refRun = current[0];
    const tol = Math.max(3.5, Math.min(refRun.fontSizePt, run.fontSizePt) * 0.45);
    if (Math.abs(run.baselineYPt - refRun.baselineYPt) <= tol) {
      current.push(run);
    } else {
      groups.push([run]);
    }
  }

  return groups
    .map((group) => {
      const lineRuns = [...group].sort((a, b) => a.leftPt - b.leftPt);
      let joined = '';
      let prevRight = lineRuns[0].leftPt;
      let prevFont = lineRuns[0].fontSizePt;
      let boldWeight = 0;
      let italicWeight = 0;
      let totalLen = 0;

      for (let i = 0; i < lineRuns.length; i++) {
        const r = lineRuns[i];
        const clean = sanitizeXmlText(r.text);
        if (!clean) continue;
        if (i > 0) {
          const gap = r.leftPt - prevRight;
          if (gap > Math.max(20, prevFont * 2.4)) {
            joined += '   ';
          } else if (gap > Math.max(1.5, prevFont * 0.2) && !joined.endsWith(' ') && !clean.startsWith(' ')) {
            joined += ' ';
          }
        }
        joined += clean;
        prevRight = Math.max(prevRight, r.leftPt + r.widthPt);
        prevFont = r.fontSizePt;
        totalLen += clean.length;
        if (r.bold) boldWeight += clean.length;
        if (r.italic) italicWeight += clean.length;
      }

      const trimmed = joined.trim();
      const first = lineRuns[0];
      const last = lineRuns[lineRuns.length - 1];
      const leftPt = first.leftPt;
      const rightPt = Math.max(first.leftPt + first.widthPt, last.leftPt + last.widthPt);
      const topPt = Math.min(...lineRuns.map((r) => r.topPt));
      const heightPt = Math.max(
        ...lineRuns.map((r) => r.heightPt || (r.fontSizePt * 1.2)),
        10
      );
      const widthPt = Math.max(10, rightPt - leftPt);
      const fontFamily = first.fontFamily;

      return {
        baselineYPt: first.baselineYPt,
        leftPt,
        topPt,
        rightPt,
        widthPt,
        heightPt,
        fontSizePt: median(
          lineRuns.map((r) => r.fontSizePt),
          10.5
        ),
        fontFamily,
        colorHex: undefined,
        bold: totalLen > 0 && boldWeight / totalLen >= 0.65,
        italic: totalLen > 0 && italicWeight / totalLen >= 0.65,
        text: trimmed,
        runs: lineRuns,
      };
    })
    .filter((l) => l.text.length > 0);
}

/**
 * Infers structured paragraphs and heading levels from visual lines and relative font sizing.
 */
export function buildStructuredParagraphs(lines: readonly LayoutLine[]): StructuredParagraph[] {
  if (lines.length === 0) return [];
  const bodySize = median(
    lines.map((l) => l.fontSizePt),
    10.5
  );

  const classifyHeading = (line: LayoutLine): 0 | 1 | 2 | 3 => {
    if (line.fontSizePt >= bodySize * 1.55 && line.text.length <= 140) return 1;
    if (line.fontSizePt >= bodySize * 1.24 && line.text.length <= 160) return 2;
    if (line.bold && line.fontSizePt >= bodySize * 1.08 && line.text.length <= 110) return 3;
    return 0;
  };

  const out: StructuredParagraph[] = [];
  let acc: LayoutLine[] = [];

  const flush = () => {
    if (acc.length === 0) return;
    const headingLevel = classifyHeading(acc[0]);
    const text = acc
      .map((l) => l.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({
      text,
      headingLevel,
      fontSizePt: median(
        acc.map((l) => l.fontSizePt),
        bodySize
      ),
      bold: acc.every((l) => l.bold),
      italic: acc.every((l) => l.italic),
    });
    acc = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = acc[acc.length - 1];
    if (!prev) {
      acc.push(line);
      continue;
    }

    const lineGap = line.baselineYPt - prev.baselineYPt;
    const expectedLineStep = Math.max(12, prev.fontSizePt * 1.35);
    const prevHeading = classifyHeading(prev);
    const currHeading = classifyHeading(line);
    const isListStart = /^([-•*]|\d+[.)])\s+/.test(line.text);
    const fontChangedSignificantly = Math.abs(line.fontSizePt - prev.fontSizePt) >= 2.0;

    if (
      lineGap > expectedLineStep * 1.45 ||
      prevHeading !== currHeading ||
      isListStart ||
      fontChangedSignificantly
    ) {
      flush();
    }
    acc.push(line);
  }
  flush();
  return out;
}

/**
 * Clusters horizontal spans across rows into rectangular tabular cells for Excel / CSV.
 */
export function extractTabularRowsAndColumns(
  lines: readonly LayoutLine[]
): { readonly rows: string[][]; readonly columnCount: number } {
  if (lines.length === 0) return { rows: [], columnCount: 0 };

  interface RawCell {
    readonly x: number;
    readonly text: string;
  }

  const rowCells: RawCell[][] = [];
  const columnAnchorCandidates: number[] = [];

  for (const line of lines) {
    const cells: RawCell[] = [];
    let currentText = '';
    let currentX = line.runs[0]?.leftPt ?? line.leftPt;
    let prevRight = currentX;

    for (let i = 0; i < line.runs.length; i++) {
      const r = line.runs[i];
      const clean = sanitizeXmlText(r.text);
      if (!clean) continue;

      if (i === 0) {
        currentText = clean;
        currentX = r.leftPt;
        prevRight = r.leftPt + r.widthPt;
        continue;
      }

      const gap = r.leftPt - prevRight;
      const cellSplitThreshold = Math.max(12, r.fontSizePt * 1.3);
      if (gap >= cellSplitThreshold) {
        const finalized = currentText.trim();
        if (finalized) {
          cells.push({ x: currentX, text: finalized });
          columnAnchorCandidates.push(currentX);
        }
        currentText = clean;
        currentX = r.leftPt;
      } else {
        if (gap > Math.max(1.5, r.fontSizePt * 0.2) && !currentText.endsWith(' ') && !clean.startsWith(' ')) {
          currentText += ' ';
        }
        currentText += clean;
      }
      prevRight = Math.max(prevRight, r.leftPt + r.widthPt);
    }

    const tail = currentText.trim();
    if (tail) {
      cells.push({ x: currentX, text: tail });
      columnAnchorCandidates.push(currentX);
    }
    if (cells.length > 0) rowCells.push(cells);
  }

  // Cluster column anchor X coordinates within 20pt tolerance
  const sortedAnchors = [...columnAnchorCandidates].sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of sortedAnchors) {
    const last = columns[columns.length - 1];
    if (last === undefined || x - last > 20) {
      columns.push(x);
    }
  }

  if (columns.length <= 1) {
    return {
      rows: lines.map((l) => [l.text]),
      columnCount: 1,
    };
  }

  const colCount = Math.min(32, columns.length);
  const grid = rowCells.map((cells) => {
    const row = new Array<string>(colCount).fill('');
    for (const cell of cells) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < colCount; c++) {
        const d = Math.abs(cell.x - columns[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      row[bestIdx] = row[bestIdx] ? `${row[bestIdx]} ${cell.text}` : cell.text;
    }
    return row;
  });

  return { rows: grid, columnCount: colCount };
}

export function analyzeExtractedPage(page: PdfPageExtractedContent): StructuredPageAnalysis {
  const lines = buildStructuredLinesFromRuns(page.runs);
  const paragraphs = buildStructuredParagraphs(lines);
  const table = extractTabularRowsAndColumns(lines);
  const rawText = lines.map((l) => l.text).join('\n');
  const hasText = lines.length > 0;

  return {
    pageIndex: page.pageIndex,
    widthPt: page.widthPt,
    heightPt: page.heightPt,
    lines,
    paragraphs,
    tableRows: table.rows,
    columnCount: table.columnCount,
    rawText,
    hasText,
    unknownReason: hasText
      ? null
      : `Page ${page.pageIndex + 1} : aucun flux texte extractible (page vierge, vectorielle ou numérisée sans OCR).`,
  };
}
