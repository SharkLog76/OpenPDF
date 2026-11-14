/**
 * PDF.js Renderer Provider (Encapsulates pdfjs-dist behind Domain & Contracts).
 * Owns document handles, worker lifetime, bounded LRU page render cache, and AbortSignal cancellation.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ADMISSION_LIMITS } from '../../contracts/schemas.ts';
import type { DomainError } from '../../contracts/errors.ts';
import {
  groupTextRunsIntoBlocks,
  type ExistingTextBlock,
  type NormalizedRect,
  type PdfStandardFamily,
  type RawTextRun,
} from '../../domain/editor.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type {
  DisplayRotation,
  OutlineNode,
  PageMetrics,
  PdfMetadataFacts,
  SearchMatch,
} from '../../domain/viewer.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface RenderedPagePayload {
  readonly cacheKey: string;
  readonly pageIndex: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

interface TextItemSpan {
  readonly str: string;
  readonly transform: number[];
  readonly width: number;
  readonly height: number;
}

const MAX_CANVAS_EDGE_PX = 8192;
const MAX_CANVAS_AREA_PX = 33_554_432; // ~134 MiB RGBA ceiling per offscreen surface

function clampCanvasScale(logicalWidth: number, logicalHeight: number, desiredMultiplier: number): number {
  const safeW = Math.max(1, logicalWidth);
  const safeH = Math.max(1, logicalHeight);
  let mult = Math.max(0.1, desiredMultiplier);
  if (safeW * mult > MAX_CANVAS_EDGE_PX) {
    mult = MAX_CANVAS_EDGE_PX / safeW;
  }
  if (safeH * mult > MAX_CANVAS_EDGE_PX) {
    mult = Math.min(mult, MAX_CANVAS_EDGE_PX / safeH);
  }
  const area = safeW * mult * (safeH * mult);
  if (area > MAX_CANVAS_AREA_PX) {
    mult *= Math.sqrt(MAX_CANVAS_AREA_PX / area);
  }
  return Math.max(0.05, mult);
}

function releaseCanvasSurface(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export class PdfJsDocumentHandle {
  private readonly doc: pdfjsLib.PDFDocumentProxy;
  private readonly docSha256: string;
  private readonly lruCache = new Map<string, HTMLCanvasElement>();
  private readonly pageTextCache = new Map<number, string>();
  private readonly editableBlocksCache = new Map<number, ExistingTextBlock[]>();
  private readonly basePixelCanvasCache = new Map<number, HTMLCanvasElement>();
  private disposed = false;

  private constructor(doc: pdfjsLib.PDFDocumentProxy, docSha256: string) {
    this.doc = doc;
    this.docSha256 = docSha256;
  }

  static async open(
    bytes: Uint8Array,
    docSha256: string,
    password?: string
  ): Promise<Result<PdfJsDocumentHandle, DomainError>> {
    try {
      const dataCopy = new Uint8Array(bytes.byteLength);
      dataCopy.set(bytes);
      const loadingTask = pdfjsLib.getDocument({
        data: dataCopy,
        password,
        enableXfa: false,
        useWorkerFetch: false,
        maxImageSize: 67_108_864,
        canvasMaxAreaInBytes: 134_217_728,
      });
      const doc = await loadingTask.promise;
      return ok(new PdfJsDocumentHandle(doc, docSha256));
    } catch (e: unknown) {
      const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
      const code = typeof e === 'object' && e !== null && 'code' in e ? Number((e as { code: unknown }).code) : 0;
      const msg = e instanceof Error ? e.message : String(e);

      if (name === 'PasswordException') {
        if (code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
          return err({
            code: 'IncorrectPassword',
            message: 'Mot de passe PDF incorrect. Veuillez réessayer.',
          });
        }
        return err({
          code: 'PasswordRequired',
          message: 'Ce document PDF est protégé par un mot de passe.',
        });
      }

      return err({
        code: 'CorruptedPdf',
        message: 'Impossible d’analyser la structure interne du PDF.',
        cause: msg,
      });
    }
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  async getPageMetrics(pageIndex: number): Promise<PageMetrics> {
    const page = await this.doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const rawRot = ((page.rotate % 360) + 360) % 360;
    const inherentRotation: DisplayRotation =
      rawRot === 90 || rawRot === 180 || rawRot === 270 ? rawRot : 0;
    return {
      pageIndex,
      widthPt: viewport.width,
      heightPt: viewport.height,
      inherentRotation,
    };
  }

  async getMetadataFacts(hasAcroForm: boolean, hasExistingSignatures: boolean): Promise<PdfMetadataFacts> {
    const meta = await this.doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const str = (key: string): string | null => {
      const val = info[key];
      return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
    };

    return {
      title: str('Title'),
      author: str('Author'),
      subject: str('Subject'),
      creator: str('Creator'),
      producer: str('Producer'),
      pdfFormatVersion: str('PDFFormatVersion'),
      pageCount: this.doc.numPages,
      isEncrypted: Boolean(info['IsEncrypted'] ?? false),
      hasAcroForm,
      hasExistingSignatures,
    };
  }

  async getOutlines(): Promise<OutlineNode[]> {
    const raw = await this.doc.getOutline().catch(() => null);
    if (!raw || raw.length === 0) return [];

    const resolveItem = async (
      item: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy['getOutline']>>[number],
      prefix: string
    ): Promise<OutlineNode> => {
      let pageIndex: number | null = null;
      if (item.dest) {
        try {
          const destArray =
            typeof item.dest === 'string' ? await this.doc.getDestination(item.dest) : item.dest;
          if (Array.isArray(destArray) && destArray[0]) {
            const idx = await this.doc.getPageIndex(destArray[0] as Parameters<pdfjsLib.PDFDocumentProxy['getPageIndex']>[0]);
            if (typeof idx === 'number' && idx >= 0) pageIndex = idx;
          }
        } catch {
          pageIndex = null;
        }
      }

      const children = item.items
        ? await Promise.all(item.items.map((child, idx) => resolveItem(child, `${prefix}-${idx}`)))
        : [];

      return {
        id: prefix,
        title: item.title || 'Sans titre',
        pageIndex,
        children,
      };
    };

    return Promise.all(raw.map((item, i) => resolveItem(item, `out-${i}`)));
  }

  /**
   * Renders a PDF page onto the target canvas with LRU cache & AbortSignal cancellation.
   */
  async renderPageToCanvas(
    pageIndex: number,
    targetCanvas: HTMLCanvasElement,
    scale: number,
    extraRotation: DisplayRotation,
    signal?: AbortSignal,
    devicePixelRatio: number = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  ): Promise<Result<RenderedPagePayload, DomainError>> {
    if (this.disposed || signal?.aborted) {
      return err({ code: 'RenderCancelled', message: 'Rendu annulé.' });
    }

    const dpr = Math.min(2, Math.max(1, devicePixelRatio));
    const cacheKey = `${this.docSha256}:${pageIndex}:${scale.toFixed(3)}:${extraRotation}:${dpr}`;

    const cached = this.lruCache.get(cacheKey);
    if (cached) {
      // Refresh LRU position
      this.lruCache.delete(cacheKey);
      this.lruCache.set(cacheKey, cached);
      targetCanvas.width = cached.width;
      targetCanvas.height = cached.height;
      targetCanvas.style.width = cached.style.width;
      targetCanvas.style.height = cached.style.height;
      const ctx = targetCanvas.getContext('2d');
      ctx?.drawImage(cached, 0, 0);
      return ok({
        cacheKey,
        pageIndex,
        widthPx: parseFloat(cached.style.width) || cached.width,
        heightPx: parseFloat(cached.style.height) || cached.height,
      });
    }

    try {
      const page = await this.doc.getPage(pageIndex + 1);
      if (this.disposed || signal?.aborted) {
        return err({ code: 'RenderCancelled', message: 'Rendu annulé.' });
      }

      const totalRotation = (page.rotate + extraRotation) % 360;
      const viewport = page.getViewport({ scale, rotation: totalRotation });
      const safeDpr = clampCanvasScale(viewport.width, viewport.height, dpr);

      const offscreen = document.createElement('canvas');
      offscreen.width = Math.max(1, Math.floor(viewport.width * safeDpr));
      offscreen.height = Math.max(1, Math.floor(viewport.height * safeDpr));
      offscreen.style.width = `${Math.floor(viewport.width)}px`;
      offscreen.style.height = `${Math.floor(viewport.height)}px`;

      const offCtx = offscreen.getContext('2d');
      if (!offCtx) {
        return err({ code: 'CorruptedPdf', message: 'Contexte Canvas 2D indisponible.' });
      }

      const renderTask = page.render({
        canvas: offscreen,
        canvasContext: offCtx,
        viewport,
        transform: safeDpr !== 1 ? [safeDpr, 0, 0, safeDpr, 0, 0] : undefined,
      });

      const abortHandler = () => {
        renderTask.cancel();
      };
      signal?.addEventListener('abort', abortHandler, { once: true });

      try {
        await renderTask.promise;
      } finally {
        signal?.removeEventListener('abort', abortHandler);
      }

      if (this.disposed || signal?.aborted) {
        return err({ code: 'RenderCancelled', message: 'Rendu annulé.' });
      }

      // Store in bounded LRU cache
      if (this.lruCache.size >= ADMISSION_LIMITS.MAX_RENDER_CACHE_PAGES) {
        const oldestKey = this.lruCache.keys().next().value;
        if (oldestKey !== undefined) {
          const evicted = this.lruCache.get(oldestKey);
          if (evicted) releaseCanvasSurface(evicted);
          this.lruCache.delete(oldestKey);
        }
      }
      this.lruCache.set(cacheKey, offscreen);

      targetCanvas.width = offscreen.width;
      targetCanvas.height = offscreen.height;
      targetCanvas.style.width = offscreen.style.width;
      targetCanvas.style.height = offscreen.style.height;
      const targetCtx = targetCanvas.getContext('2d');
      targetCtx?.drawImage(offscreen, 0, 0);

      return ok({
        cacheKey,
        pageIndex,
        widthPx: Math.floor(viewport.width),
        heightPx: Math.floor(viewport.height),
      });
    } catch (e: unknown) {
      const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
      if (name === 'RenderingCancelledException' || signal?.aborted) {
        return err({ code: 'RenderCancelled', message: 'Rendu annulé.' });
      }
      return err({
        code: 'CorruptedPdf',
        message: `Erreur lors du rendu de la page ${pageIndex + 1}.`,
        cause: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Renders a small thumbnail canvas for the left navigation panel.
   */
  async renderThumbnail(pageIndex: number, targetCanvas: HTMLCanvasElement, extraRotation: DisplayRotation): Promise<void> {
    if (this.disposed) return;
    const page = await this.doc.getPage(pageIndex + 1);
    const totalRotation = (page.rotate + extraRotation) % 360;
    const baseVp = page.getViewport({ scale: 1, rotation: totalRotation });
    const targetWidth = 136;
    const scale = clampCanvasScale(baseVp.width, baseVp.height, targetWidth / Math.max(1, baseVp.width));
    const viewport = page.getViewport({ scale, rotation: totalRotation });

    targetCanvas.width = Math.max(1, Math.floor(viewport.width));
    targetCanvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    await page.render({ canvas: targetCanvas, canvasContext: ctx, viewport }).promise.catch(() => undefined);
  }

  /**
   * Extracts positioned text spans for copy/selection overlay on a page.
   */
  async getPageTextLayerSpans(
    pageIndex: number,
    scale: number,
    extraRotation: DisplayRotation
  ): Promise<Array<{ text: string; leftPx: number; topPx: number; fontSizePx: number; widthPx: number }>> {
    if (this.disposed) return [];
    const page = await this.doc.getPage(pageIndex + 1);
    const totalRotation = (page.rotate + extraRotation) % 360;
    const viewport = page.getViewport({ scale, rotation: totalRotation });
    const textContent = await page.getTextContent();

    const spans: Array<{ text: string; leftPx: number; topPx: number; fontSizePx: number; widthPx: number }> = [];
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !rawItem.str) continue;
      const item = rawItem as unknown as TextItemSpan;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSizePx = Math.max(6, Math.hypot(tx[0], tx[1]));
      const leftPx = tx[4];
      const topPx = tx[5] - fontSizePx * 0.85;
      const widthPx = Math.max(4, item.width * scale);
      spans.push({ text: item.str, leftPx, topPx, fontSizePx, widthPx });
    }
    return spans;
  }

  /**
   * Searches text across pages with cooperative async yields.
   */
  async searchText(query: string, caseSensitive: boolean, signal?: AbortSignal): Promise<SearchMatch[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];
    const needle = caseSensitive ? cleanQuery : cleanQuery.toLowerCase();
    const matches: SearchMatch[] = [];

    for (let p = 0; p < this.doc.numPages; p++) {
      if (this.disposed || signal?.aborted) break;
      let pageText = this.pageTextCache.get(p);
      if (pageText === undefined) {
        const page = await this.doc.getPage(p + 1);
        const content = await page.getTextContent();
        pageText = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ');
        this.pageTextCache.set(p, pageText);
      }

      const haystack = caseSensitive ? pageText : pageText.toLowerCase();
      let startIdx = 0;
      let matchIdxInPage = 0;
      while (startIdx < haystack.length) {
        const found = haystack.indexOf(needle, startIdx);
        if (found === -1) break;
        const snippetStart = Math.max(0, found - 28);
        const snippetEnd = Math.min(pageText.length, found + needle.length + 36);
        const snippet =
          (snippetStart > 0 ? '…' : '') +
          pageText.slice(snippetStart, snippetEnd) +
          (snippetEnd < pageText.length ? '…' : '');
        matches.push({
          id: `m-${p}-${matchIdxInPage}`,
          pageIndex: p,
          matchIndexInPage: matchIdxInPage,
          snippet,
        });
        matchIdxInPage++;
        startIdx = found + Math.max(1, needle.length);
      }

      // Cooperative yield every 10 pages
      if (p % 10 === 9) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return matches;
  }

  private async getBaseScaleCanvas(pageIndex: number): Promise<HTMLCanvasElement | null> {
    if (this.disposed || typeof document === 'undefined') return null;
    const cached = this.basePixelCanvasCache.get(pageIndex);
    if (cached) return cached;

    const page = await this.doc.getPage(pageIndex + 1);
    const baseVp = page.getViewport({ scale: 1 });
    const safeScale = clampCanvasScale(baseVp.width, baseVp.height, 1);
    const viewport = page.getViewport({ scale: safeScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => undefined);
    if (this.basePixelCanvasCache.size >= 8) {
      const oldest = this.basePixelCanvasCache.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.basePixelCanvasCache.get(oldest);
        if (evicted) releaseCanvasSurface(evicted);
        this.basePixelCanvasCache.delete(oldest);
      }
    }
    this.basePixelCanvasCache.set(pageIndex, canvas);
    return canvas;
  }

  private sampleBoxColors(
    canvas: HTMLCanvasElement,
    rect: NormalizedRect
  ): { readonly backgroundHex: string; readonly textColorHex: string } {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { backgroundHex: '#ffffff', textColorHex: '#0f172a' };

    const x0 = Math.max(0, Math.floor(rect.x * canvas.width));
    const y0 = Math.max(0, Math.floor(rect.y * canvas.height));
    const w = Math.max(2, Math.min(canvas.width - x0, Math.ceil(rect.width * canvas.width)));
    const h = Math.max(2, Math.min(canvas.height - y0, Math.ceil(rect.height * canvas.height)));

    const toHex = (r: number, g: number, b: number) =>
      `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

    // Sample perimeter ring just outside/on border of box for background color mode
    const borderCounts = new Map<string, number>();
    const samplePixel = (px: number, py: number) => {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
      const d = ctx.getImageData(px, py, 1, 1).data;
      // Quantize slightly by 4 to merge subtle JPEG/antialias noise
      const qr = Math.min(255, Math.round(d[0] / 4) * 4);
      const qg = Math.min(255, Math.round(d[1] / 4) * 4);
      const qb = Math.min(255, Math.round(d[2] / 4) * 4);
      const hex = toHex(qr, qg, qb);
      borderCounts.set(hex, (borderCounts.get(hex) ?? 0) + 1);
    };

    const stepX = Math.max(1, Math.floor(w / 8));
    for (let x = x0; x <= x0 + w; x += stepX) {
      samplePixel(x, Math.max(0, y0 - 1));
      samplePixel(x, Math.min(canvas.height - 1, y0 + h + 1));
    }
    samplePixel(Math.max(0, x0 - 1), y0 + Math.floor(h / 2));
    samplePixel(Math.min(canvas.width - 1, x0 + w + 1), y0 + Math.floor(h / 2));

    let backgroundHex = '#ffffff';
    let bestCount = -1;
    for (const [hex, cnt] of borderCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        backgroundHex = hex;
      }
    }

    const bgR = parseInt(backgroundHex.slice(1, 3), 16);
    const bgG = parseInt(backgroundHex.slice(3, 5), 16);
    const bgB = parseInt(backgroundHex.slice(5, 7), 16);

    // Find pixel inside box with maximum contrast from backgroundHex as foreground text color
    let textColorHex = bgR * 0.299 + bgG * 0.587 + bgB * 0.114 < 128 ? '#ffffff' : '#0f172a';
    let maxDist = 35; // Minimum contrast threshold
    const imgData = ctx.getImageData(x0, y0, w, h).data;
    for (let i = 0; i < imgData.length; i += 12) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
      if (dist > maxDist) {
        maxDist = dist;
        textColorHex = toHex(r, g, b);
      }
    }

    return { backgroundHex, textColorHex };
  }

  async sampleAreaBackgroundColor(pageIndex: number, rect: NormalizedRect): Promise<string> {
    const canvas = await this.getBaseScaleCanvas(pageIndex);
    if (!canvas) return '#ffffff';
    return this.sampleBoxColors(canvas, rect).backgroundHex;
  }

  /**
   * Extracts raw PDF.js text runs and page point dimensions for both interactive text editing
   * and Office/Web conversion workflows.
   */
  async extractRawPageTextRuns(
    pageIndex: number
  ): Promise<{ readonly widthPt: number; readonly heightPt: number; readonly runs: RawTextRun[] }> {
    if (this.disposed) {
      return { widthPt: 595.28, heightPt: 841.89, runs: [] };
    }

    const page = await this.doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const styles = (textContent.styles ?? {}) as Record<string, { fontFamily?: string }>;

    const runs: RawTextRun[] = [];
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !rawItem.str) continue;
      const item = rawItem as unknown as TextItemSpan & { fontName?: string };
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSizePt = Math.max(5, Math.hypot(tx[0], tx[1]));
      const leftPt = tx[4];
      const baselineYPt = tx[5];
      const topPt = baselineYPt - fontSizePt * 0.85;
      const widthPt = Math.max(2, item.width);
      const heightPt = Math.max(fontSizePt * 1.15, item.height || fontSizePt * 1.15);

      const fontNameRaw = `${item.fontName ?? ''} ${styles[item.fontName ?? '']?.fontFamily ?? ''}`;
      let fontFamily: PdfStandardFamily = 'Helvetica';
      if (/times|serif|georgia|garamond/i.test(fontNameRaw) && !/sans/i.test(fontNameRaw)) {
        fontFamily = 'TimesRoman';
      } else if (/courier|mono|consolas/i.test(fontNameRaw)) {
        fontFamily = 'Courier';
      }
      const bold = /bold|black|heavy|700|800/i.test(fontNameRaw);
      const italic = /italic|oblique/i.test(fontNameRaw);

      runs.push({
        text: item.str,
        leftPt,
        topPt,
        baselineYPt,
        widthPt,
        heightPt,
        fontSizePt,
        fontFamily,
        bold,
        italic,
      });
    }

    return { widthPt: viewport.width, heightPt: viewport.height, runs };
  }

  /**
   * Renders a PDF page into encoded PNG or JPEG bytes at the requested DPI (72..300).
   */
  async renderPageToRasterBytes(
    pageIndex: number,
    format: 'png' | 'jpeg',
    dpi: number = 150
  ): Promise<{ readonly bytes: Uint8Array; readonly widthPx: number; readonly heightPx: number } | null> {
    if (this.disposed || typeof document === 'undefined') return null;

    const clampedDpi = Math.min(300, Math.max(72, dpi));
    const page = await this.doc.getPage(pageIndex + 1);
    const baseVp = page.getViewport({ scale: 1 });
    const scale = clampCanvasScale(baseVp.width, baseVp.height, clampedDpi / 72);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => undefined);

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.92 : undefined;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    const widthPx = canvas.width;
    const heightPx = canvas.height;
    releaseCanvasSurface(canvas);
    if (!blob) return null;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, widthPx, heightPx };
  }

  /**
   * Extracts grouped editable text blocks for "Modifier le PDF" mode,
   * including sampled background & foreground colors per block.
   */
  async extractEditableTextBlocks(pageIndex: number): Promise<ExistingTextBlock[]> {
    if (this.disposed) return [];
    const cached = this.editableBlocksCache.get(pageIndex);
    if (cached) return cached;

    const { widthPt, heightPt, runs } = await this.extractRawPageTextRuns(pageIndex);
    const grouped = groupTextRunsIntoBlocks(runs, pageIndex, widthPt, heightPt);
    const baseCanvas = await this.getBaseScaleCanvas(pageIndex);
    const enriched = baseCanvas
      ? grouped.map((blk) => {
          const sampled = this.sampleBoxColors(baseCanvas, blk.rect);
          return {
            ...blk,
            backgroundHex: sampled.backgroundHex,
            textColorHex: sampled.textColorHex,
          };
        })
      : grouped;

    this.editableBlocksCache.set(pageIndex, enriched);
    return enriched;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.lruCache.values()) releaseCanvasSurface(c);
    this.lruCache.clear();
    this.pageTextCache.clear();
    this.editableBlocksCache.clear();
    for (const c of this.basePixelCanvasCache.values()) releaseCanvasSurface(c);
    this.basePixelCanvasCache.clear();
    await this.doc.cleanup(false).catch(() => undefined);
    await this.doc.loadingTask?.destroy?.().catch(() => undefined);
  }
}
