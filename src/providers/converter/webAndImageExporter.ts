/**
 * Web HTML, Plain Text, and PNG/JPEG Image/Archive Exporter Provider backed by `fflate`.
 */
import { strToU8, zipSync } from 'fflate';
import {
  analyzeExtractedPage,
  escapeXml,
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

  const sectionsHtml = analyses
    .map((a, idx) => {
      const src = pages[idx];
      const blocks: string[] = [];
      for (const p of a.paragraphs) {
        const tag =
          p.headingLevel === 1 ? 'h1' : p.headingLevel === 2 ? 'h2' : p.headingLevel === 3 ? 'h3' : 'p';
        const styleParts: string[] = [];
        if (p.bold && tag === 'p') styleParts.push('font-weight:700');
        if (p.italic) styleParts.push('font-style:italic');
        const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join(';')}"` : '';
        blocks.push(`<${tag}${styleAttr}>${escapeXml(p.text)}</${tag}>`);
      }

      if (!a.hasText && src.rasterPngBytes) {
        const b64 = uint8ToBase64(src.rasterPngBytes);
        blocks.push(
          `<img src="data:image/png;base64,${b64}" alt="Page ${a.pageIndex + 1}" style="max-width:100%;height:auto;border:1px solid #cbd5e1;" />`
        );
      } else if (!a.hasText) {
        blocks.push(`<p><em>Page ${a.pageIndex + 1} : aucun texte extractible</em></p>`);
      }

      return `<section class="pdf-page-export"><div class="page-label">Page ${a.pageIndex + 1}</div>${blocks.join('\n')}</section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeXml(docTitle)} — Exporté par OpenPDF</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 28px 16px; line-height: 1.55; }
  .doc-container { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
  .pdf-page-export { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 28px 34px; box-shadow: 0 4px 16px rgba(15,23,42,.08); }
  .page-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; }
  h1 { font-size: 1.45rem; margin: 0 0 10px; }
  h2 { font-size: 1.2rem; margin: 14px 0 8px; }
  h3 { font-size: 1.05rem; margin: 12px 0 6px; }
  p { margin: 0 0 9px; }
</style>
</head>
<body>
<main class="doc-container">
${sectionsHtml}
</main>
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
