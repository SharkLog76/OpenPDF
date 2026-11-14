/**
 * Web HTML, Plain Text, and PNG/JPEG Image/Archive Exporter Provider backed by `fflate`.
 * Produces high-fidelity web sheets and clean plain text / raster archives.
 */
import { strToU8, zipSync } from 'fflate';
import {
  analyzeExtractedPage,
  escapeXml,
  extractPageLayoutBoxes,
  type PdfPageExtractedContent,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function resolveHtmlFont(family?: string): string {
  if (!family) return 'Arial, Helvetica, sans-serif';
  const lower = family.toLowerCase();
  if (lower.includes('times') || lower.includes('serif')) return '"Times New Roman", Times, serif';
  if (lower.includes('courier') || lower.includes('mono')) return '"Courier New", Courier, monospace';
  return 'Arial, Helvetica, sans-serif';
}

function cleanColorHex(colorHex?: string): string {
  if (!colorHex) return '#0F172A';
  const clean = colorHex.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(clean)) {
    return clean.startsWith('#') ? clean : `#${clean}`;
  }
  return '#0F172A';
}

export function exportPagesToText(
  pages: readonly PdfPageExtractedContent[]
): { readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));
  const sections = analyses.map((a) => {
    const header = `=== Page ${a.pageIndex + 1} ===`;
    const body = a.hasText ? a.rawText : '[Aucun flux texte extractible]';
    return `${header}\n${body}`;
  });
  return { bytes: strToU8(sections.join('\n\n')), analyses };
}

export function exportPagesToHtml(
  pages: readonly PdfPageExtractedContent[],
  docTitle: string
): { readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));

  const sheetsHtml = pages
    .map((src, idx) => {
      const a = analyses[idx];
      const widthPt = Math.max(100, src.widthPt);
      const heightPt = Math.max(100, src.heightPt);
      const boxes = extractPageLayoutBoxes(src);

      const textSpans: string[] = [];
      if (boxes.length > 0) {
        for (const b of boxes) {
          const font = resolveHtmlFont(b.fontFamily);
          const color = cleanColorHex(b.colorHex);
          const weight = b.bold ? '700' : '400';
          const style = b.italic ? 'italic' : 'normal';
          const escaped = escapeXml(b.text).replace(/\n/g, '<br/>');

          textSpans.push(
            `<div class="pdf-text-box" style="left:${b.leftPt.toFixed(2)}pt;top:${b.topPt.toFixed(2)}pt;width:${Math.max(20, b.widthPt).toFixed(2)}pt;min-height:${Math.max(10, b.heightPt).toFixed(2)}pt;font-size:${b.fontSizePt.toFixed(1)}pt;font-family:${font};color:${color};font-weight:${weight};font-style:${style};">${escaped}</div>`
          );
        }
      } else if (a.lines.length > 0) {
        for (const l of a.lines) {
          const font = resolveHtmlFont(l.fontFamily);
          const color = cleanColorHex(l.colorHex);
          const weight = l.bold ? '700' : '400';
          const style = l.italic ? 'italic' : 'normal';
          const escaped = escapeXml(l.text);

          textSpans.push(
            `<div class="pdf-text-box" style="left:${l.leftPt.toFixed(2)}pt;top:${l.topPt.toFixed(2)}pt;width:${Math.max(20, l.widthPt).toFixed(2)}pt;min-height:${Math.max(10, l.heightPt).toFixed(2)}pt;font-size:${l.fontSizePt.toFixed(1)}pt;font-family:${font};color:${color};font-weight:${weight};font-style:${style};">${escaped}</div>`
          );
        }
      }

      let bgHtml = '';
      if (src.rasterPngBytes) {
        const b64 = uint8ToBase64(src.rasterPngBytes);
        bgHtml = `<img class="pdf-sheet-bg" src="data:image/png;base64,${b64}" alt="Arrière-plan Page ${a.pageIndex + 1}" />`;
      }

      return `<div class="pdf-sheet" style="width:${widthPt.toFixed(2)}pt;height:${heightPt.toFixed(2)}pt;">
  ${bgHtml}
  <div class="pdf-text-layer">${textSpans.join('\n    ')}</div>
</div>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeXml(docTitle)} — Conforme OpenPDF</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: #475569;
    margin: 0;
    padding: 32px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .pdf-sheet {
    position: relative;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    overflow: hidden;
  }
  .pdf-sheet-bg {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
    user-select: none;
  }
  .pdf-text-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
  }
  .pdf-text-box {
    position: absolute;
    line-height: 1.18;
    white-space: pre-wrap;
    word-break: break-word;
    transform-origin: top left;
  }
  @media print {
    @page { margin: 0; size: auto; }
    body { background: none; padding: 0; gap: 0; }
    .pdf-sheet { box-shadow: none; margin: 0; page-break-after: always; }
  }
</style>
</head>
<body>
${sheetsHtml}
</body>
</html>`;

  return { bytes: strToU8(html), analyses };
}

export function exportPagesToImages(
  pages: readonly PdfPageExtractedContent[],
  format: 'png' | 'jpeg'
): { readonly bytes: Uint8Array; readonly isArchive: boolean; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));
  const ext = format === 'jpeg' ? 'jpg' : 'png';

  const rendered = pages.map((p) => {
    const data = format === 'jpeg' ? p.rasterJpegBytes : p.rasterPngBytes;
    return { pageIndex: p.pageIndex, data: data ?? new Uint8Array(0) };
  });

  if (rendered.length === 1) {
    return { bytes: rendered[0].data, isArchive: false, analyses };
  }

  const archiveMap: Record<string, Uint8Array> = {};
  for (const item of rendered) {
    const padded = String(item.pageIndex + 1).padStart(3, '0');
    archiveMap[`page-${padded}.${ext}`] = item.data;
  }

  return {
    bytes: zipSync(archiveMap, { level: 3 }),
    isArchive: true,
    analyses,
  };
}
