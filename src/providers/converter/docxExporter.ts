/**
 * Word (.docx) OOXML Exporter Provider backed by `docx`.
 * Offers two export modes:
 * 1. 'exact-layout' (default): 100% geometric and visual fidelity matching the PDF:
 *    - Exact section page sizes in twips (1 pt = 20 twips) with zero margins.
 *    - Full-page high-resolution raster background anchored behind document (`behindDocument: true`, `wrap: NONE`).
 *    - Floating text boxes (`w:framePr`) positioned at exact coordinates (`anchor: 'page'`)
 *      preserving font families, font sizes, colors, bold, and italic.
 * 2. 'flowing-text': Continuous semantic document structure with headings, paragraphs, and detected tables
 *    for users who prefer a reflowable Word document.
 */
import {
  Document,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type ISectionOptions,
} from 'docx';
import {
  analyzeExtractedPage,
  extractPageLayoutBoxes,
  sanitizeXmlText,
  type DocxExportMode,
  type PdfPageExtractedContent,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';

function cleanColorHex(colorHex?: string): string {
  if (!colorHex) return '000000';
  const clean = colorHex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return clean.toUpperCase();
  }
  return '000000';
}

function resolveDocxFont(family?: string): string {
  if (!family) return 'Arial';
  const lower = family.toLowerCase();
  if (lower.includes('times') || lower.includes('serif')) return 'Times New Roman';
  if (lower.includes('courier') || lower.includes('mono')) return 'Courier New';
  return 'Arial';
}

export async function exportPagesToDocx(
  pages: readonly PdfPageExtractedContent[],
  docTitle: string,
  modeOrIncludeVisual: boolean | DocxExportMode = 'exact-layout'
): Promise<{ readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] }> {
  const analyses: StructuredPageAnalysis[] = pages.map((p) => analyzeExtractedPage(p));
  const mode: DocxExportMode =
    typeof modeOrIncludeVisual === 'boolean'
      ? modeOrIncludeVisual
        ? 'exact-layout'
        : 'flowing-text'
      : modeOrIncludeVisual;

  if (mode === 'exact-layout') {
    const sections: ISectionOptions[] = [];

    for (let i = 0; i < pages.length; i++) {
      const sourcePage = pages[i];
      const analysis = analyses[i];

      const widthPt = Math.max(10, sourcePage.widthPt);
      const heightPt = Math.max(10, sourcePage.heightPt);
      const widthTwips = Math.round(widthPt * 20);
      const heightTwips = Math.round(heightPt * 20);
      const isLandscape = widthPt > heightPt;

      const sectionChildren: (Paragraph | Table)[] = [];

      // 1. High-resolution raster backdrop (all vector graphics, logos, borders, backgrounds)
      if (sourcePage.rasterPngBytes) {
        sectionChildren.push(
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [
              new ImageRun({
                type: 'png',
                data: sourcePage.rasterPngBytes,
                transformation: {
                  width: Math.round(widthPt * (96 / 72)),
                  height: Math.round(heightPt * (96 / 72)),
                },
                floating: {
                  horizontalPosition: {
                    offset: 0,
                    relative: HorizontalPositionRelativeFrom.PAGE,
                  },
                  verticalPosition: {
                    offset: 0,
                    relative: VerticalPositionRelativeFrom.PAGE,
                  },
                  wrap: {
                    type: TextWrappingType.NONE,
                  },
                  behindDocument: true,
                },
              }),
            ],
          })
        );
      }

      // 2. Overlaid editable text boxes with exact coordinates and typography
      const boxes = extractPageLayoutBoxes(sourcePage);

      if (boxes.length > 0) {
        for (const box of boxes) {
          const textClean = sanitizeXmlText(box.text);
          if (!textClean.trim()) continue;

          const xTwips = Math.round(Math.max(0, box.leftPt) * 20);
          const yTwips = Math.round(Math.max(0, box.topPt) * 20);
          const wTwips = Math.round(Math.max(20, box.widthPt) * 20);
          const hTwips = Math.round(Math.max(12, box.heightPt) * 20);
          const fontName = resolveDocxFont(box.fontFamily);
          const fontSizeHalfPt = Math.round(Math.max(6, Math.min(72, box.fontSizePt)) * 2);
          const color = cleanColorHex(box.colorHex);

          const textRuns: TextRun[] = [];
          const parts = textClean.split('\n');
          for (let pi = 0; pi < parts.length; pi++) {
            const part = parts[pi];
            if (pi > 0) {
              textRuns.push(new TextRun({ break: 1, font: fontName, size: fontSizeHalfPt }));
            }
            textRuns.push(
              new TextRun({
                text: part,
                font: fontName,
                size: fontSizeHalfPt,
                bold: box.bold,
                italics: box.italic,
                color,
              })
            );
          }

          if (textRuns.length > 0) {
            sectionChildren.push(
              new Paragraph({
                frame: {
                  type: 'absolute',
                  position: { x: xTwips, y: yTwips },
                  width: wTwips,
                  height: hTwips,
                  anchor: { horizontal: 'page', vertical: 'page' },
                  wrap: 'none',
                },
                spacing: { before: 0, after: 0, line: Math.round(box.fontSizePt * 24) },
                children: textRuns,
              })
            );
          }
        }
      } else if (analysis.lines.length > 0) {
        for (const line of analysis.lines) {
          const textClean = sanitizeXmlText(line.text);
          if (!textClean.trim()) continue;
          const xTwips = Math.round(Math.max(0, line.leftPt) * 20);
          const yTwips = Math.round(Math.max(0, line.topPt) * 20);
          const wTwips = Math.round(Math.max(20, line.widthPt) * 20);
          const hTwips = Math.round(Math.max(12, line.heightPt) * 20);

          sectionChildren.push(
            new Paragraph({
              frame: {
                type: 'absolute',
                position: { x: xTwips, y: yTwips },
                width: wTwips,
                height: hTwips,
                anchor: { horizontal: 'page', vertical: 'page' },
                wrap: 'none',
              },
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({
                  text: textClean,
                  font: resolveDocxFont(line.fontFamily),
                  size: Math.round(Math.max(6, Math.min(72, line.fontSizePt)) * 2),
                  bold: line.bold,
                  italics: line.italic,
                  color: cleanColorHex(line.colorHex),
                }),
              ],
            })
          );
        }
      }

      // Every docx Section must have at least one child paragraph
      if (sectionChildren.length === 0) {
        sectionChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[Page ${i + 1}]`,
                size: 18,
                color: '94A3B8',
              }),
            ],
          })
        );
      }

      sections.push({
        properties: {
          page: {
            size: {
              width: widthTwips,
              height: heightTwips,
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              header: 0,
              footer: 0,
            },
          },
        },
        children: sectionChildren,
      });
    }

    const doc = new Document({
      creator: 'OpenPDF',
      title: sanitizeXmlText(docTitle),
      description: 'Document converti en haute fidélité par OpenPDF',
      sections,
    });

    const arrayBuffer = await Packer.toArrayBuffer(doc);
    return { bytes: new Uint8Array(arrayBuffer), analyses };
  }

  // Fallback / alternative: flowing-text mode
  const children: Array<Paragraph | Table> = [];

  for (let i = 0; i < analyses.length; i++) {
    const analysis = analyses[i];
    const sourcePage = pages[i];

    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const looksTabular = analysis.columnCount >= 2 && analysis.tableRows.length >= 2;
    if (looksTabular) {
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

    if (!analysis.hasText && sourcePage.rasterPngBytes) {
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
    description: 'Document converti en flux continu par OpenPDF',
    sections: [{ children }],
  });

  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return { bytes: new Uint8Array(arrayBuffer), analyses };
}
