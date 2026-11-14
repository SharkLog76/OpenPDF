import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  analyzeExtractedPage,
  buildStructuredLinesFromRuns,
  buildStructuredParagraphs,
  deriveExportFilename,
  escapeXml,
  extractTabularRowsAndColumns,
  sanitizeXmlText,
  type PdfPageExtractedContent,
} from '../src/domain/converter.ts';
import type { RawTextRun } from '../src/domain/editor.ts';
import { exportPagesToDocx } from '../src/providers/converter/docxExporter.ts';
import { exportPagesToPptx } from '../src/providers/converter/pptxExporter.ts';
import {
  exportPagesToHtml,
  exportPagesToImages,
  exportPagesToText,
} from '../src/providers/converter/webAndImageExporter.ts';
import { exportPagesToCsv, exportPagesToXlsx } from '../src/providers/converter/xlsxExporter.ts';

function run(
  text: string,
  leftPt: number,
  baselineYPt: number,
  fontSizePt = 11,
  widthPt = 75,
  bold = false
): RawTextRun {
  return {
    text,
    leftPt,
    topPt: baselineYPt - fontSizePt,
    baselineYPt,
    widthPt,
    heightPt: fontSizePt * 1.2,
    fontSizePt,
    fontFamily: 'Helvetica',
    bold,
    italic: false,
  };
}

const SAMPLE_PAGE_1: PdfPageExtractedContent = {
  pageIndex: 0,
  widthPt: 595.28,
  heightPt: 841.89,
  runs: [
    run('Rapport Trimestriel', 50, 80, 22, 180, true),
    run('Article', 50, 140, 11, 55, true),
    run('Quantite', 210, 140, 11, 60, true),
    run('Total', 370, 140, 11, 45, true),
    run('Licence Pro', 50, 162, 11, 70),
    run('4', 210, 162, 11, 14),
    run('1250.50', 370, 162, 11, 50),
    run('Support', 50, 184, 11, 55),
    run('2', 210, 184, 11, 14),
    run('300', 370, 184, 11, 30),
  ],
};

const SCANNED_PAGE_WITH_PNG: PdfPageExtractedContent = {
  pageIndex: 1,
  widthPt: 595.28,
  heightPt: 841.89,
  runs: [],
  rasterPngBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
  rasterWidthPx: 100,
  rasterHeightPx: 140,
};

describe('converter/pdf-export-formats — Analyse géométrique & Export Word/Excel/PPTX/CSV/Web/Images', () => {
  it('nettoie les caractères XML interdits et dérive les noms de fichiers exportés', () => {
    expect(sanitizeXmlText('Bon\x00jour\x07 !')).toBe('Bonjour !');
    expect(escapeXml(`A & B <C> "D"`)).toBe('A &amp; B &lt;C&gt; &quot;D&quot;');
    expect(deriveExportFilename('Contrat.PDF', 'docx')).toBe('Contrat.docx');
    expect(deriveExportFilename('Facture.pdf', 'png', true)).toBe('Facture_pages_png.zip');
  });

  it('reconstruit les lignes, titres et colonnes tabulaires depuis les positions PDF', () => {
    const lines = buildStructuredLinesFromRuns(SAMPLE_PAGE_1.runs);
    expect(lines.length).toBe(4);
    expect(lines[0].text).toBe('Rapport Trimestriel');

    const paragraphs = buildStructuredParagraphs(lines);
    expect(paragraphs[0].headingLevel).toBe(1);

    const table = extractTabularRowsAndColumns(lines.slice(1));
    expect(table.columnCount).toBe(3);
    expect(table.rows).toEqual([
      ['Article', 'Quantite', 'Total'],
      ['Licence Pro', '4', '1250.50'],
      ['Support', '2', '300'],
    ]);

    const scanAnalysis = analyzeExtractedPage(SCANNED_PAGE_WITH_PNG);
    expect(scanAnalysis.hasText).toBe(false);
    expect(scanAnalysis.unknownReason).toContain('aucun flux texte extractible');
  });

  it('génère un fichier Word (.docx) valide contenant les textes et tableaux structurés', async () => {
    const res = await exportPagesToDocx([SAMPLE_PAGE_1], 'Rapport.pdf', false);
    const unzipped = unzipSync(res.bytes);
    expect(Object.keys(unzipped)).toContain('word/document.xml');
    const docXml = strFromU8(unzipped['word/document.xml']);
    expect(docXml).toContain('Licence Pro');
    expect(docXml).toContain('1250.50');
  });

  it('génère un classeur Excel (.xlsx) strict avec feuilles, types numériques et un CSV UTF-8 FR', () => {
    const xlsxRes = exportPagesToXlsx([SAMPLE_PAGE_1, SCANNED_PAGE_WITH_PNG]);
    const zip = unzipSync(xlsxRes.bytes);
    expect(Object.keys(zip)).toContain('[Content_Types].xml');
    expect(Object.keys(zip)).toContain('xl/workbook.xml');
    expect(Object.keys(zip)).toContain('xl/worksheets/sheet1.xml');
    expect(Object.keys(zip)).toContain('xl/worksheets/sheet2.xml');

    const sheet1 = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(sheet1).toContain('<v>1250.5</v>');
    expect(sheet1).toContain('<t xml:space="preserve">Licence Pro</t>');

    const csvRes = exportPagesToCsv([SAMPLE_PAGE_1]);
    expect(Array.from(csvRes.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csvText = strFromU8(csvRes.bytes.slice(3));
    expect(csvText).toContain('Article;Quantite;Total');
    expect(csvText).toContain('Licence Pro;4;1250.50');
  });

  it('génère une présentation PowerPoint (.pptx) en mode texte éditable et en mode visuel HD + notes', () => {
    const editablePptx = exportPagesToPptx([SAMPLE_PAGE_1], 'editable-text');
    const editZip = unzipSync(editablePptx.bytes);
    expect(Object.keys(editZip)).toContain('ppt/presentation.xml');
    expect(Object.keys(editZip)).toContain('ppt/slides/slide1.xml');
    const slide1 = strFromU8(editZip['ppt/slides/slide1.xml']);
    expect(slide1).toContain('Rapport Trimestriel');

    const visualPptx = exportPagesToPptx([SCANNED_PAGE_WITH_PNG], 'visual-slides');
    const visZip = unzipSync(visualPptx.bytes);
    expect(Object.keys(visZip)).toContain('ppt/media/image1.png');
    expect(Object.keys(visZip)).toContain('ppt/notesSlides/notesSlide1.xml');
  });

  it('génère des exports HTML, TXT, PNG direct (1 page) et archive ZIP (multi-pages)', () => {
    const txtRes = exportPagesToText([SAMPLE_PAGE_1]);
    expect(strFromU8(txtRes.bytes)).toContain('Rapport Trimestriel');

    const htmlRes = exportPagesToHtml([SAMPLE_PAGE_1, SCANNED_PAGE_WITH_PNG], 'Rapport.pdf');
    const html = strFromU8(htmlRes.bytes);
    expect(html).toContain('Exporté par OpenPDF');
    expect(html).toContain('<h1>Rapport Trimestriel</h1>');
    expect(html).toContain('data:image/png;base64,');

    const singlePng = exportPagesToImages(
      [{ ...SCANNED_PAGE_WITH_PNG, pageIndex: 0 }],
      'png'
    );
    expect(singlePng.isArchive).toBe(false);
    expect(Array.from(singlePng.bytes.slice(0, 4))).toEqual([137, 80, 78, 71]);

    const multiZip = exportPagesToImages(
      [
        { ...SCANNED_PAGE_WITH_PNG, pageIndex: 0 },
        { ...SCANNED_PAGE_WITH_PNG, pageIndex: 1 },
      ],
      'png'
    );
    expect(multiZip.isArchive).toBe(true);
    const imgZip = unzipSync(multiZip.bytes);
    expect(Object.keys(imgZip)).toEqual(['page-001.png', 'page-002.png']);
  });
});
