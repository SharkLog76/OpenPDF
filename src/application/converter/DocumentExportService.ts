/**
 * Document Export Coordinator (Application Layer).
 * Converts the current PDF session (including pending unsaved edits/signatures when requested)
 * into Office/Web/Image formats and produces an explicit REA audit summary.
 */
import type { DomainError } from '../../contracts/errors.ts';
import {
  EXPORT_FORMAT_CATALOG,
  deriveExportFilename,
  type ConversionAuditReport,
  type ExportRequestOptions,
  type PdfPageExtractedContent,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import { exportPagesToDocx } from '../../providers/converter/docxExporter.ts';
import { exportPagesToPptx } from '../../providers/converter/pptxExporter.ts';
import { exportPagesToCsv, exportPagesToXlsx } from '../../providers/converter/xlsxExporter.ts';
import {
  exportPagesToHtml,
  exportPagesToImages,
  exportPagesToText,
} from '../../providers/converter/webAndImageExporter.ts';
import { computeSha256Hex } from '../../providers/filesystem/boundedFileSystem.ts';
import { PdfJsDocumentHandle } from '../../providers/renderer/pdfJsRenderer.ts';

export interface ExportConversionOutput {
  readonly bytes: Uint8Array;
  readonly suggestedFileName: string;
  readonly filterName: string;
  readonly extensions: string[];
  readonly mimeType: string;
  readonly audit: ConversionAuditReport;
}

export class DocumentExportService {
  async convertPdfBytes(
    compiledPdfBytes: Uint8Array,
    sourceDisplayName: string,
    options: ExportRequestOptions
  ): Promise<Result<ExportConversionOutput, DomainError>> {
    const descriptor =
      EXPORT_FORMAT_CATALOG.find((f) => f.id === options.format) ?? EXPORT_FORMAT_CATALOG[0];

    const sha = await computeSha256Hex(compiledPdfBytes);
    const handleRes = await PdfJsDocumentHandle.open(compiledPdfBytes, sha);
    if (!handleRes.ok) {
      return err({
        code: 'ConversionFailed',
        message: 'Impossible d’ouvrir le PDF compilé pour la conversion.',
        cause: handleRes.error.message,
      });
    }

    const handle = handleRes.value;
    try {
      const total = handle.pageCount;
      const targetIndices =
        options.pageScope === 'current'
          ? [Math.min(Math.max(0, options.currentPageIndex), Math.max(0, total - 1))]
          : Array.from({ length: total }, (_, idx) => idx);

      const MAX_RASTER_EXPORT_PAGES = 150;
      const bulkRasterFormat =
        options.format === 'png' ||
        options.format === 'jpeg' ||
        (options.format === 'pptx' && options.pptxMode === 'visual-slides') ||
        (options.format === 'docx' && options.includeVisualPagesInWord);
      if (bulkRasterFormat && targetIndices.length > MAX_RASTER_EXPORT_PAGES) {
        return err({
          code: 'ConversionFailed',
          message: `Export image/visuel limité à ${MAX_RASTER_EXPORT_PAGES} pages par lot (${targetIndices.length} demandées) pour préserver la mémoire. Exportez la page courante ou divisez le PDF.`,
        });
      }

      const extracted: PdfPageExtractedContent[] = [];

      for (const pageIndex of targetIndices) {
        const { widthPt, heightPt, runs } = await handle.extractRawPageTextRuns(pageIndex);

        const needsPng =
          options.format === 'png' ||
          (options.format === 'pptx' && (options.pptxMode === 'visual-slides' || runs.length === 0)) ||
          (options.format === 'docx' && (options.includeVisualPagesInWord || runs.length === 0)) ||
          (options.format === 'html' && runs.length === 0);

        const needsJpeg = options.format === 'jpeg';
        const dpi =
          options.format === 'png' || options.format === 'jpeg' ? options.rasterDpi : 150;

        let rasterPngBytes: Uint8Array | undefined;
        let rasterJpegBytes: Uint8Array | undefined;
        let rasterWidthPx: number | undefined;
        let rasterHeightPx: number | undefined;

        if (needsPng) {
          const rendered = await handle.renderPageToRasterBytes(pageIndex, 'png', dpi);
          if (rendered) {
            rasterPngBytes = rendered.bytes;
            rasterWidthPx = rendered.widthPx;
            rasterHeightPx = rendered.heightPx;
          }
        }
        if (needsJpeg) {
          const rendered = await handle.renderPageToRasterBytes(pageIndex, 'jpeg', dpi);
          if (rendered) {
            rasterJpegBytes = rendered.bytes;
            rasterWidthPx = rendered.widthPx;
            rasterHeightPx = rendered.heightPx;
          }
        }

        extracted.push({
          pageIndex,
          widthPt,
          heightPt,
          runs,
          rasterPngBytes,
          rasterJpegBytes,
          rasterWidthPx,
          rasterHeightPx,
        });

        // Cooperative yield so UI remains responsive on large documents
        if (pageIndex % 4 === 3) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      let outBytes: Uint8Array;
      let isArchive = false;
      let analyses: StructuredPageAnalysis[] = [];

      if (options.format === 'docx') {
        const res = await exportPagesToDocx(
          extracted,
          sourceDisplayName,
          options.includeVisualPagesInWord
        );
        outBytes = res.bytes;
        analyses = res.analyses;
      } else if (options.format === 'xlsx') {
        const res = exportPagesToXlsx(extracted);
        outBytes = res.bytes;
        analyses = res.analyses;
      } else if (options.format === 'csv') {
        const res = exportPagesToCsv(extracted);
        outBytes = res.bytes;
        analyses = res.analyses;
      } else if (options.format === 'pptx') {
        const res = exportPagesToPptx(extracted, options.pptxMode);
        outBytes = res.bytes;
        analyses = res.analyses;
      } else if (options.format === 'png' || options.format === 'jpeg') {
        const res = exportPagesToImages(extracted, options.format);
        outBytes = res.bytes;
        isArchive = res.isArchive;
        analyses = res.analyses;
      } else if (options.format === 'html') {
        const res = exportPagesToHtml(extracted, sourceDisplayName);
        outBytes = res.bytes;
        analyses = res.analyses;
      } else {
        const res = exportPagesToText(extracted);
        outBytes = res.bytes;
        analyses = res.analyses;
      }

      const totalRuns = extracted.reduce((acc, p) => acc + p.runs.length, 0);
      const totalParagraphs = analyses.reduce((acc, a) => acc + a.paragraphs.length, 0);
      const unknowns = analyses
        .map((a) => a.unknownReason)
        .filter((u): u is string => u !== null);

      const observations = [
        `${extracted.length} page(s) analysée(s) localement depuis « ${sourceDisplayName} ».`,
        `${totalRuns} segments typographiques PDF.js observés.`,
      ];

      const derivations = [
        `Format cible généré : ${descriptor.label} (${Math.max(1, Math.round(outBytes.byteLength / 1024))} Ko).`,
        options.format === 'xlsx' || options.format === 'csv'
          ? `${analyses.reduce((s, a) => s + a.tableRows.length, 0)} ligne(s) tabulaire(s) structurée(s).`
          : `${totalParagraphs} bloc(s)/paragraphe(s) ou diapositive(s) reconstitués.`,
      ];

      const finalExt = isArchive ? 'zip' : descriptor.extension;
      const suggestedFileName = deriveExportFilename(
        sourceDisplayName,
        descriptor.extension,
        isArchive
      );

      return ok({
        bytes: outBytes,
        suggestedFileName,
        filterName: isArchive ? 'Archive ZIP d’images' : descriptor.filterName,
        extensions: [finalExt],
        mimeType: isArchive ? 'application/zip' : descriptor.mimeType,
        audit: {
          format: options.format,
          observations,
          derivations,
          unknowns,
        },
      });
    } catch (e: unknown) {
      return err({
        code: 'ConversionFailed',
        message: 'La conversion du PDF vers le format demandé a échoué.',
        cause: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await handle.dispose();
    }
  }
}
