/**
 * Word (.docx) OOXML Exporter Provider backed by `docx`.
 * Preserves structured headings, paragraphs, detected geometric tables,
 * page breaks, and high-resolution raster fallback for scanned/image-only pages.
 */
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  analyzeExtractedPage,
  sanitizeXmlText,
  type PdfPageExtractedContent,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';

export async function exportPagesToDocx(
  pages: readonly PdfPageExtractedContent[],
  docTitle: string,
  includeVisualPages: boolean
): Promise<{ readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] }> {
  const analyses: StructuredPageAnalysis[] = pages.map((p) => analyzeExtractedPage(p));
  const children: Array<Paragraph | Table> = [];

  for (let i = 0; i < analyses.length; i++) {
    const analysis = analyses[i];
    const sourcePage = pages[i];

    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // If page has multi-column tabular layout (>=2 columns & >=2 rows), render an editable Word table
    const looksTabular = analysis.columnCount >= 2 && analysis.tableRows.length >= 2;
    if (looksTabular && !includeVisualPages) {
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: analysis.tableRows.map(
          (row, rIdx) =>
            new TableRow({
              children: row.map(
                (cellText) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: sanitizeXmlText(cellText),
                            bold: rIdx === 0,
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  })
              ),
            })
        ),
      });
      children.push(table);
    } else if (analysis.hasText) {
      for (const para of analysis.paragraphs) {
        const heading =
          para.headingLevel === 1
            ? HeadingLevel.HEADING_1
            : para.headingLevel === 2
              ? HeadingLevel.HEADING_2
              : para.headingLevel === 3
                ? HeadingLevel.HEADING_3
                : undefined;

        children.push(
          new Paragraph({
            heading,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: sanitizeXmlText(para.text),
                bold: para.bold || para.headingLevel > 0,
                italics: para.italic,
                size: Math.round(Math.min(44, Math.max(16, para.fontSizePt * 2))),
              }),
            ],
          })
        );
      }
    }

    // Embed visual capture when scanned/image-only or when visual hybrid mode is enabled
    if ((!analysis.hasText || includeVisualPages) && sourcePage.rasterPngBytes) {
      const maxWidthPx = 600;
      const ratio = sourcePage.heightPt / Math.max(1, sourcePage.widthPt);
      const targetW = maxWidthPx;
      const targetH = Math.round(maxWidthPx * ratio);
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: sourcePage.rasterPngBytes,
              transformation: { width: targetW, height: targetH },
            }),
          ],
        })
      );
    } else if (!analysis.hasText) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[Page ${analysis.pageIndex + 1} : aucun texte extractible]`,
              italics: true,
              color: '64748B',
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    creator: 'OpenPDF',
    title: sanitizeXmlText(docTitle),
    description: 'Document converti localement par OpenPDF',
    sections: [{ children }],
  });

  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return { bytes: new Uint8Array(arrayBuffer), analyses };
}
