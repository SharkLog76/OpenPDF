import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Move, RotateCcw, Trash2 } from 'lucide-react';
import type {
  AnnotationOverlayItem,
  CreatedFormFieldItem,
  ExistingTextBlock,
  ExistingTextEdit,
  HeaderFooterConfig,
  ImageOverlayItem,
  LinkAnnotationItem,
  NormalizedRect,
  PageBackgroundConfig,
  PageCropConfig,
  PageTransformState,
  PdfStandardFamily,
  TextOverlayItem,
  WatermarkConfig,
  WhiteoutRectItem,
} from '../../../domain/editor.ts';
import type { SignaturePlacement, VisualSignatureAsset } from '../../../domain/signing.ts';
import type { DisplayRotation, PageMetrics } from '../../../domain/viewer.ts';
import type { PdfJsDocumentHandle } from '../../../providers/renderer/pdfJsRenderer.ts';

export type EditorToolMode =
  | 'read'
  | 'edit-pdf'
  | 'add-text'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'rect'
  | 'ellipse'
  | 'note'
  | 'freehand'
  | 'whiteout'
  | 'redact'
  | 'add-link'
  | 'add-form-text'
  | 'add-form-check'
  | 'place-signature';

interface PdfPageCanvasProps {
  readonly renderer: PdfJsDocumentHandle;
  readonly pageTransform: PageTransformState;
  readonly displayPageIndex: number;
  readonly totalPages: number;
  readonly metrics: PageMetrics;
  readonly zoom: number;
  readonly globalRotation: DisplayRotation;
  readonly activeTool: EditorToolMode;
  readonly texts: readonly TextOverlayItem[];
  readonly existingTextEdits: Readonly<Record<string, ExistingTextEdit>>;
  readonly annotations: readonly AnnotationOverlayItem[];
  readonly images: readonly ImageOverlayItem[];
  readonly whiteouts: readonly WhiteoutRectItem[];
  readonly links: readonly LinkAnnotationItem[];
  readonly createdFormFields: readonly CreatedFormFieldItem[];
  readonly watermark: WatermarkConfig | null;
  readonly headerFooter: HeaderFooterConfig | null;
  readonly pageCrop: PageCropConfig | null;
  readonly pageBackground: PageBackgroundConfig | null;
  readonly signaturePlacements: readonly SignaturePlacement[];
  readonly signatureAssetsById: ReadonlyMap<string, VisualSignatureAsset>;
  readonly selectedOverlayId: string | null;
  readonly onSelectOverlay: (id: string | null) => void;
  readonly onCreateTextAt: (pageIndex: number, rect: NormalizedRect) => void;
  readonly onUpdateText: (prev: TextOverlayItem, next: TextOverlayItem) => void;
  readonly onDeleteText: (item: TextOverlayItem) => void;
  readonly onUpsertExistingTextEdit: (
    previous: ExistingTextEdit | null,
    next: ExistingTextEdit
  ) => void;
  readonly onCreateAnnotation: (item: AnnotationOverlayItem) => void;
  readonly onDeleteAnnotation: (item: AnnotationOverlayItem) => void;
  readonly onCreateWhiteout: (item: WhiteoutRectItem) => void;
  readonly onDeleteWhiteout: (item: WhiteoutRectItem) => void;
  readonly onCreateLink: (item: LinkAnnotationItem) => void;
  readonly onDeleteLink: (item: LinkAnnotationItem) => void;
  readonly onCreateFormField: (item: CreatedFormFieldItem) => void;
  readonly onDeleteFormField: (item: CreatedFormFieldItem) => void;
  readonly onUpdateImageRect: (id: string, prev: NormalizedRect, next: NormalizedRect) => void;
  readonly onDeleteImage: (item: ImageOverlayItem) => void;
  readonly onPlaceSignatureAt: (pageIndex: number, rect: NormalizedRect) => void;
  readonly onUpdateSignaturePlacementRect: (id: string, nextRect: NormalizedRect) => void;
  readonly onDeleteSignaturePlacement: (id: string) => void;
  readonly onPageBecomeVisible?: (displayPageIndex: number) => void;
}

function fontFamilyToCss(family: PdfStandardFamily): string {
  switch (family) {
    case 'TimesRoman':
      return "'Times New Roman', Times, serif";
    case 'Courier':
      return "'Courier New', Courier, monospace";
    case 'Helvetica':
    default:
      return 'Helvetica, Arial, sans-serif';
  }
}

function expandHeaderFooterPattern(pattern: string, displayPageIndex: number, totalPages: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return pattern
    .replace(/\{page\}/g, String(displayPageIndex + 1))
    .replace(/\{total\}/g, String(totalPages))
    .replace(/\{date\}/g, today);
}

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  renderer,
  pageTransform,
  displayPageIndex,
  totalPages,
  metrics,
  zoom,
  globalRotation,
  activeTool,
  texts,
  existingTextEdits,
  annotations,
  images,
  whiteouts,
  links,
  createdFormFields,
  watermark,
  headerFooter,
  pageCrop,
  pageBackground,
  signaturePlacements,
  signatureAssetsById,
  selectedOverlayId,
  onSelectOverlay,
  onCreateTextAt,
  onUpdateText,
  onDeleteText,
  onUpsertExistingTextEdit,
  onCreateAnnotation,
  onDeleteAnnotation,
  onCreateWhiteout,
  onDeleteWhiteout,
  onCreateLink,
  onDeleteLink,
  onCreateFormField,
  onDeleteFormField,
  onUpdateImageRect,
  onDeleteImage,
  onPlaceSignatureAt,
  onUpdateSignaturePlacementRect,
  onDeleteSignaturePlacement,
  onPageBecomeVisible,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [textSpans, setTextSpans] = useState<
    Array<{ text: string; leftPx: number; topPx: number; fontSizePx: number; widthPx: number }>
  >([]);
  const [existingBlocks, setExistingBlocks] = useState<ExistingTextBlock[]>([]);

  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingExistingKey, setEditingExistingKey] = useState<string | null>(null);
  const [pendingLinkRect, setPendingLinkRect] = useState<NormalizedRect | null>(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('https://');
  const prevTextIdsRef = useRef<Set<string>>(new Set(texts.map((t) => t.id)));

  // Auto-open inline editor when user places a brand-new added text block
  useEffect(() => {
    const prev = prevTextIdsRef.current;
    const added = texts.find((t) => !prev.has(t.id));
    if (added && activeTool === 'add-text') {
      setEditingTextId(added.id);
    }
    prevTextIdsRef.current = new Set(texts.map((t) => t.id));
  }, [texts, activeTool]);

  const isBlankPage = pageTransform.kind === 'blank' || pageTransform.sourcePageIndex < 0;
  const baseWidthPt = isBlankPage ? pageTransform.blankSizePt?.widthPt ?? 595.28 : metrics.widthPt;
  const baseHeightPt = isBlankPage ? pageTransform.blankSizePt?.heightPt ?? 841.89 : metrics.heightPt;
  const inherentRotation = isBlankPage ? 0 : metrics.inherentRotation;

  const effectiveRotation = (((globalRotation + pageTransform.addedRotation) % 360) as DisplayRotation);
  const totalAngle = (inherentRotation + effectiveRotation) % 360;
  const swapped = totalAngle === 90 || totalAngle === 270;
  const widthPx = Math.max(1, Math.floor((swapped ? baseHeightPt : baseWidthPt) * zoom));
  const heightPx = Math.max(1, Math.floor((swapped ? baseWidthPt : baseHeightPt) * zoom));

  // Viewport virtualization via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
          onPageBecomeVisible?.(displayPageIndex);
        }
      },
      { rootMargin: '320px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [displayPageIndex, onPageBecomeVisible]);

  // Render canvas, selectable read layer, and editable text blocks when visible
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;
    const controller = new AbortController();

    if (isBlankPage) {
      const canvas = canvasRef.current;
      const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      canvas.width = Math.max(1, Math.floor(widthPx * dpr));
      canvas.height = Math.max(1, Math.floor(heightPx * dpr));
      canvas.style.width = `${widthPx}px`;
      canvas.style.height = `${heightPx}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setTextSpans([]);
      setExistingBlocks([]);
      return () => controller.abort();
    }

    void renderer.renderPageToCanvas(
      pageTransform.sourcePageIndex,
      canvasRef.current,
      zoom,
      effectiveRotation,
      controller.signal
    );

    if (activeTool === 'read') {
      void renderer
        .getPageTextLayerSpans(pageTransform.sourcePageIndex, zoom, effectiveRotation)
        .then((spans) => {
          if (!controller.signal.aborted) setTextSpans(spans);
        });
    } else {
      setTextSpans([]);
    }

    if (activeTool === 'edit-pdf') {
      void renderer.extractEditableTextBlocks(pageTransform.sourcePageIndex).then((blocks) => {
        if (!controller.signal.aborted) setExistingBlocks(blocks);
      });
    }

    return () => controller.abort();
  }, [
    isVisible,
    isBlankPage,
    widthPx,
    heightPx,
    renderer,
    pageTransform.sourcePageIndex,
    zoom,
    effectiveRotation,
    activeTool,
  ]);

  const toNormalized = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const makeInitialExistingEdit = (editKey: string, blk: ExistingTextBlock): ExistingTextEdit => ({
    key: editKey,
    pageUid: pageTransform.uid,
    blockId: blk.id,
    originalRect: blk.rect,
    currentRect: blk.rect,
    originalText: blk.text,
    currentText: blk.text,
    fontSizePt: blk.fontSizePt,
    fontFamily: blk.fontFamily,
    bold: blk.bold,
    italic: blk.italic,
    colorHex: blk.textColorHex,
    backgroundHex: blk.backgroundHex,
    deleted: false,
  });

  const handleLayerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    onSelectOverlay(null);
    setEditingTextId(null);
    setEditingExistingKey(null);
    setPendingLinkRect(null);

    if (activeTool === 'read' || activeTool === 'edit-pdf') return;
    const pt = toNormalized(e.clientX, e.clientY);

    if (activeTool === 'add-text') {
      onCreateTextAt(displayPageIndex, {
        x: Math.min(0.74, pt.x),
        y: Math.min(0.9, pt.y),
        width: 0.25,
        height: 0.055,
      });
      return;
    }

    if (activeTool === 'note') {
      onCreateAnnotation({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        pageIndex: displayPageIndex,
        kind: 'note',
        rect: { x: Math.min(0.75, pt.x), y: Math.min(0.88, pt.y), width: 0.22, height: 0.08 },
        colorHex: '#f59e0b',
        opacity: 0.95,
        strokeWidthPt: 1,
        noteText: 'Note de révision',
      });
      return;
    }

    if (activeTool === 'place-signature') {
      onPlaceSignatureAt(displayPageIndex, {
        x: Math.max(0.02, Math.min(0.68, pt.x - 0.14)),
        y: Math.max(0.02, Math.min(0.86, pt.y - 0.05)),
        width: 0.28,
        height: 0.1,
      });
      return;
    }

    if (activeTool === 'freehand') {
      setFreehandPoints([pt]);
      return;
    }

    setDrawStart(pt);
    setDrawCurrent(pt);
  };

  const handleLayerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'freehand' && freehandPoints.length > 0) {
      const pt = toNormalized(e.clientX, e.clientY);
      setFreehandPoints((prev) => [...prev, pt]);
      return;
    }
    if (drawStart) {
      setDrawCurrent(toNormalized(e.clientX, e.clientY));
    }
  };

  const handleLayerPointerUp = () => {
    if (activeTool === 'freehand' && freehandPoints.length >= 2) {
      onCreateAnnotation({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        pageIndex: displayPageIndex,
        kind: 'freehand',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        colorHex: '#ef4444',
        opacity: 0.95,
        strokeWidthPt: 2.2,
        points: freehandPoints,
      });
      setFreehandPoints([]);
      return;
    }

    if (drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const width = Math.abs(drawCurrent.x - drawStart.x);
      const height = Math.abs(drawCurrent.y - drawStart.y);

      if (width > 0.012 && height > 0.008) {
        const rect: NormalizedRect = { x, y, width, height };
        if (activeTool === 'whiteout' || activeTool === 'redact') {
          const id = `wo-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          if (activeTool === 'redact' || isBlankPage) {
            onCreateWhiteout({
              id,
              pageIndex: displayPageIndex,
              rect,
              fillHex: activeTool === 'redact' ? '#000000' : '#ffffff',
              mode: activeTool === 'redact' ? 'redact' : 'whiteout',
            });
          } else {
            void renderer.sampleAreaBackgroundColor(pageTransform.sourcePageIndex, rect).then((bgHex) => {
              onCreateWhiteout({
                id,
                pageIndex: displayPageIndex,
                rect,
                fillHex: bgHex,
                mode: 'whiteout',
              });
            });
          }
        } else if (activeTool === 'add-link') {
          setPendingLinkRect(rect);
          setPendingLinkUrl('https://');
        } else if (activeTool === 'add-form-text' || activeTool === 'add-form-check') {
          const suffix = Math.random().toString(36).slice(2, 6);
          onCreateFormField({
            id: `fld-${Date.now()}-${suffix}`,
            pageIndex: displayPageIndex,
            rect:
              activeTool === 'add-form-check'
                ? { x, y, width: Math.max(0.025, Math.min(0.06, width)), height: Math.max(0.025, Math.min(0.05, height)) }
                : rect,
            kind: activeTool === 'add-form-check' ? 'checkbox' : 'text',
            fieldName: activeTool === 'add-form-check' ? `case_${suffix}` : `champ_${suffix}`,
            defaultValue: activeTool === 'add-form-check' ? false : '',
          });
        } else {
          const kind =
            activeTool === 'highlight'
              ? 'highlight'
              : activeTool === 'underline'
                ? 'underline'
                : activeTool === 'strikeout'
                  ? 'strikeout'
                  : activeTool === 'ellipse'
                    ? 'ellipse'
                    : 'rect';
          const colorHex =
            kind === 'highlight'
              ? '#facc15'
              : kind === 'underline'
                ? '#2563eb'
                : '#ef4444';
          onCreateAnnotation({
            id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            pageIndex: displayPageIndex,
            kind,
            rect,
            colorHex,
            opacity: kind === 'highlight' ? 0.35 : 0.92,
            strokeWidthPt: 2,
          });
        }
      } else if (activeTool === 'add-form-text' || activeTool === 'add-form-check') {
        const suffix = Math.random().toString(36).slice(2, 6);
        onCreateFormField({
          id: `fld-${Date.now()}-${suffix}`,
          pageIndex: displayPageIndex,
          rect:
            activeTool === 'add-form-check'
              ? { x: Math.min(0.94, drawStart.x), y: Math.min(0.94, drawStart.y), width: 0.032, height: 0.026 }
              : { x: Math.min(0.72, drawStart.x), y: Math.min(0.92, drawStart.y), width: 0.25, height: 0.042 },
          kind: activeTool === 'add-form-check' ? 'checkbox' : 'text',
          fieldName: activeTool === 'add-form-check' ? `case_${suffix}` : `champ_${suffix}`,
          defaultValue: activeTool === 'add-form-check' ? false : '',
        });
      }
    }
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const imageUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const im of images) {
      const copy = new Uint8Array(im.imageBytes.byteLength);
      copy.set(im.imageBytes);
      map.set(im.id, URL.createObjectURL(new Blob([copy.buffer], { type: im.mimeType })));
    }
    return map;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const u of imageUrls.values()) URL.revokeObjectURL(u);
    };
  }, [imageUrls]);

  const sigUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, asset] of signatureAssetsById.entries()) {
      const copy = new Uint8Array(asset.pngBytes.byteLength);
      copy.set(asset.pngBytes);
      map.set(id, URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' })));
    }
    return map;
  }, [signatureAssetsById]);

  useEffect(() => {
    return () => {
      for (const u of sigUrls.values()) URL.revokeObjectURL(u);
    };
  }, [sigUrls]);

  const startDragOrResize = (
    e: React.PointerEvent,
    initialRect: NormalizedRect,
    mode: 'drag' | 'resize',
    onCommit: (nextRect: NormalizedRect) => void,
    onClickWithoutDrag?: () => void
  ) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect || containerRect.width <= 0 || containerRect.height <= 0) return;

    let didMove = false;

    const handleMove = (mv: PointerEvent) => {
      if (!didMove && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 4) {
        return;
      }
      didMove = true;
      const dx = (mv.clientX - startX) / containerRect.width;
      const dy = (mv.clientY - startY) / containerRect.height;
      if (mode === 'drag') {
        onCommit({
          ...initialRect,
          x: Math.min(1 - initialRect.width, Math.max(0, initialRect.x + dx)),
          y: Math.min(1 - initialRect.height, Math.max(0, initialRect.y + dy)),
        });
      } else {
        onCommit({
          ...initialRect,
          width: Math.min(1 - initialRect.x, Math.max(0.03, initialRect.width + dx)),
          height: Math.min(1 - initialRect.y, Math.max(0.02, initialRect.height + dy)),
        });
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!didMove) {
        onClickWithoutDrag?.();
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // Existing text edits belonging to this page instance
  const pageExistingEdits = useMemo(() => {
    const prefix = `${pageTransform.uid}:`;
    return Object.entries(existingTextEdits).filter(([k]) => k.startsWith(prefix));
  }, [existingTextEdits, pageTransform.uid]);

  // Unified interactive existing-text blocks for edit-pdf mode (never remounts across initial click -> edit)
  const unifiedEditableBlocks = useMemo(() => {
    if (activeTool !== 'edit-pdf') return [];
    const seen = new Set<string>();
    const items: Array<{ key: string; existing: ExistingTextEdit | null; resolved: ExistingTextEdit }> = [];

    for (const blk of existingBlocks) {
      const editKey = `${pageTransform.uid}:${blk.id}`;
      seen.add(editKey);
      const existing = existingTextEdits[editKey] ?? null;
      items.push({
        key: editKey,
        existing,
        resolved: existing ?? makeInitialExistingEdit(editKey, blk),
      });
    }

    for (const [editKey, edit] of pageExistingEdits) {
      if (!seen.has(editKey)) {
        items.push({ key: editKey, existing: edit, resolved: edit });
      }
    }

    return items;
  }, [activeTool, existingBlocks, existingTextEdits, pageExistingEdits, pageTransform.uid]);

  return (
    <div
      ref={containerRef}
      className="page-frame"
      style={{ width: `${widthPx}px`, height: `${heightPx}px`, position: 'relative' }}
      data-page-index={displayPageIndex}
    >
      <canvas ref={canvasRef} className="page-canvas" style={{ width: `${widthPx}px`, height: `${heightPx}px` }} />

      {/* Page Background Tint Preview */}
      {pageBackground?.enabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: pageBackground.colorHex,
            opacity: 0.35,
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* Original background cover patches hiding underlying PDF text whenever an edit exists */}
      {pageExistingEdits.map(([editKey, edit]) => (
        <React.Fragment key={`patch-${editKey}`}>
          <div
            style={{
              position: 'absolute',
              left: `calc(${edit.originalRect.x * 100}% - 2px)`,
              top: `calc(${edit.originalRect.y * 100}% - 2px)`,
              width: `calc(${edit.originalRect.width * 100}% + 4px)`,
              height: `calc(${edit.originalRect.height * 100}% + 4px)`,
              background: edit.backgroundHex,
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
          {activeTool !== 'edit-pdf' && !edit.deleted && (
            <div
              style={{
                position: 'absolute',
                left: `${edit.currentRect.x * 100}%`,
                top: `${edit.currentRect.y * 100}%`,
                width: `${edit.currentRect.width * 100}%`,
                minHeight: `${edit.currentRect.height * 100}%`,
                color: edit.colorHex,
                fontSize: `${edit.fontSizePt * zoom}px`,
                fontFamily: fontFamilyToCss(edit.fontFamily),
                fontWeight: edit.bold ? 700 : 400,
                fontStyle: edit.italic ? 'italic' : 'normal',
                lineHeight: 1.2,
                pointerEvents: 'none',
                zIndex: 3,
                whiteSpace: 'pre-wrap',
              }}
            >
              {edit.currentText}
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Watermark Preview */}
      {watermark?.enabled && watermark.text.trim() && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 5,
          }}
        >
          <span
            style={{
              fontSize: `${watermark.fontSizePt * zoom}px`,
              fontWeight: 700,
              color: watermark.colorHex,
              opacity: watermark.opacity,
              transform: `rotate(${-watermark.angleDeg}deg)`,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {watermark.text}
          </span>
        </div>
      )}

      {/* Header & Footer Preview */}
      {headerFooter?.enabled && (
        <>
          <div
            style={{
              position: 'absolute',
              top: `${22 * zoom}px`,
              left: '5%',
              right: '5%',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: `${headerFooter.fontSizePt * zoom}px`,
              color: headerFooter.colorHex,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <span>{expandHeaderFooterPattern(headerFooter.headerLeft, displayPageIndex, totalPages)}</span>
            <span>{expandHeaderFooterPattern(headerFooter.headerCenter, displayPageIndex, totalPages)}</span>
            <span>{expandHeaderFooterPattern(headerFooter.headerRight, displayPageIndex, totalPages)}</span>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: `${22 * zoom}px`,
              left: '5%',
              right: '5%',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: `${headerFooter.fontSizePt * zoom}px`,
              color: headerFooter.colorHex,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <span>{expandHeaderFooterPattern(headerFooter.footerLeft, displayPageIndex, totalPages)}</span>
            <span>{expandHeaderFooterPattern(headerFooter.footerCenter, displayPageIndex, totalPages)}</span>
            <span>{expandHeaderFooterPattern(headerFooter.footerRight, displayPageIndex, totalPages)}</span>
          </div>
        </>
      )}

      {/* Crop Box Preview Overlay */}
      {pageCrop?.enabled && (
        <div
          style={{
            position: 'absolute',
            top: `${pageCrop.marginTopPt * zoom}px`,
            right: `${pageCrop.marginRightPt * zoom}px`,
            bottom: `${pageCrop.marginBottomPt * zoom}px`,
            left: `${pageCrop.marginLeftPt * zoom}px`,
            border: '1.5px dashed #ef4444',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.14)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Selectable PDF Text Layer in Read Mode */}
      {activeTool === 'read' && (
        <div className="text-layer">
          {textSpans.map((sp, i) => (
            <span
              key={i}
              style={{
                left: `${sp.leftPx}px`,
                top: `${sp.topPx}px`,
                fontSize: `${sp.fontSizePx}px`,
                width: `${sp.widthPx}px`,
              }}
            >
              {sp.text}
            </span>
          ))}
        </div>
      )}

      {/* Interactive Edit & Signature Overlay Layer */}
      <div
        className="interactive-layer"
        style={{
          pointerEvents: activeTool === 'read' ? 'none' : 'auto',
          cursor:
            activeTool === 'read'
              ? 'default'
              : activeTool === 'edit-pdf'
                ? 'text'
                : 'crosshair',
          zIndex: 6,
        }}
        onPointerDown={handleLayerPointerDown}
        onPointerMove={handleLayerPointerMove}
        onPointerUp={handleLayerPointerUp}
      >
        {/* Whiteout / Redaction Rectangles (inside interactive-layer so selectable/deletable) */}
        {whiteouts.map((wo) => {
          const isSelected = selectedOverlayId === wo.id;
          const isDarkRedact = wo.mode === 'redact';
          return (
            <div
              key={wo.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              style={{
                left: `${wo.rect.x * 100}%`,
                top: `${wo.rect.y * 100}%`,
                width: `${wo.rect.width * 100}%`,
                height: `${wo.rect.height * 100}%`,
                background: wo.fillHex,
                border:
                  activeTool === 'read'
                    ? 'none'
                    : isSelected
                      ? '1.5px solid #2563eb'
                      : '1px dashed rgba(148,163,184,0.35)',
                pointerEvents: activeTool === 'read' ? 'none' : 'auto',
                zIndex: 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(wo.id);
              }}
            >
              {isSelected && (
                <button
                  className="delete-chip"
                  title={isDarkRedact ? 'Retirer ce caviardage' : 'Retirer ce correcteur'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteWhiteout(wo);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Unified Interactive PDF Existing Text Blocks in Edit-PDF Mode */}
        {activeTool === 'edit-pdf' &&
          unifiedEditableBlocks.map(({ key: editKey, existing, resolved }) => {
            const isSelected = selectedOverlayId === editKey;
            const isEditing = editingExistingKey === editKey;

            if (resolved.deleted) {
              return (
                <div
                  key={editKey}
                  className={`existing-text-box ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${resolved.originalRect.x * 100}%`,
                    top: `${resolved.originalRect.y * 100}%`,
                    width: `${resolved.originalRect.width * 100}%`,
                    height: `${resolved.originalRect.height * 100}%`,
                    borderStyle: 'dotted',
                    borderColor: 'rgba(239, 68, 68, 0.6)',
                    pointerEvents: 'auto',
                    zIndex: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Bloc texte masqué — cliquez pour restaurer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOverlay(editKey);
                    onUpsertExistingTextEdit(existing, { ...resolved, deleted: false });
                  }}
                >
                  <RotateCcw size={11} color="#ef4444" />
                </div>
              );
            }

            return (
              <div
                key={editKey}
                className={`existing-text-box ${isSelected ? 'selected' : ''}`}
                title="Cliquer pour éditer le texte · Glisser (ou poignée bleue) pour déplacer"
                style={{
                  left: `${resolved.currentRect.x * 100}%`,
                  top: `${resolved.currentRect.y * 100}%`,
                  width: `${resolved.currentRect.width * 100}%`,
                  minWidth: isEditing ? '90px' : undefined,
                  minHeight: `${Math.max(14, resolved.fontSizePt * zoom * 1.25)}px`,
                  height: isEditing || existing ? 'auto' : `${resolved.currentRect.height * 100}%`,
                  color: existing ? resolved.colorHex : 'transparent',
                  fontSize: `${resolved.fontSizePt * zoom}px`,
                  fontFamily: fontFamilyToCss(resolved.fontFamily),
                  fontWeight: resolved.bold ? 700 : 400,
                  fontStyle: resolved.italic ? 'italic' : 'normal',
                  lineHeight: 1.2,
                  pointerEvents: 'auto',
                  zIndex: isSelected || isEditing ? 12 : 8,
                  background: isSelected && !isEditing ? 'rgba(59, 130, 246, 0.09)' : 'transparent',
                  cursor: isEditing ? 'text' : 'pointer',
                }}
                onPointerDown={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                    return;
                  }
                  e.stopPropagation();
                  if (!existing) {
                    onUpsertExistingTextEdit(null, resolved);
                  }
                  onSelectOverlay(editKey);
                  startDragOrResize(
                    e,
                    resolved.currentRect,
                    'drag',
                    (nextRect) =>
                      onUpsertExistingTextEdit(existing, { ...resolved, currentRect: nextRect }),
                    () => setEditingExistingKey(editKey)
                  );
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={resolved.currentText}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingExistingKey(null);
                      }
                    }}
                    onChange={(e) =>
                      onUpsertExistingTextEdit(existing, { ...resolved, currentText: e.target.value })
                    }
                    onBlur={() => setEditingExistingKey(null)}
                    style={{
                      display: 'block',
                      width: '100%',
                      minHeight: `${Math.max(24, resolved.fontSizePt * zoom * 1.45)}px`,
                      height: '100%',
                      margin: 0,
                      padding: '1px 3px',
                      border: 'none',
                      outline: '1.5px solid #2563eb',
                      background: resolved.backgroundHex,
                      color: resolved.colorHex,
                      fontSize: 'inherit',
                      fontFamily: 'inherit',
                      fontWeight: 'inherit',
                      fontStyle: 'inherit',
                      lineHeight: 1.2,
                      resize: 'both',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : existing ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{resolved.currentText}</div>
                ) : null}

                {(isSelected || isEditing) && (
                  <>
                    <div
                      className="drag-chip"
                      title="Déplacer ce bloc"
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        setEditingExistingKey(null);
                        startDragOrResize(e, resolved.currentRect, 'drag', (nextRect) =>
                          onUpsertExistingTextEdit(existing, { ...resolved, currentRect: nextRect })
                        );
                      }}
                    >
                      <Move size={10} />
                    </div>
                    <div
                      className="resize-handle"
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) =>
                        startDragOrResize(e, resolved.currentRect, 'resize', (nextRect) =>
                          onUpsertExistingTextEdit(existing, { ...resolved, currentRect: nextRect })
                        )
                      }
                    />
                    <button
                      className="delete-chip"
                      title="Masquer / supprimer ce bloc de texte PDF"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingExistingKey(null);
                        onUpsertExistingTextEdit(existing, { ...resolved, deleted: true });
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}

        {/* Annotations */}
        {annotations.map((ann) => {
          if (ann.kind === 'freehand' && ann.points && ann.points.length >= 2) {
            const pathD = ann.points
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x * widthPx} ${p.y * heightPx}`)
              .join(' ');
            return (
              <svg
                key={ann.id}
                width={widthPx}
                height={heightPx}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path
                  d={pathD}
                  stroke={ann.colorHex}
                  strokeWidth={ann.strokeWidthPt * zoom}
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            );
          }

          const isSelected = selectedOverlayId === ann.id;
          return (
            <div
              key={ann.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              style={{
                left: `${ann.rect.x * 100}%`,
                top: `${ann.rect.y * 100}%`,
                width: `${ann.rect.width * 100}%`,
                height: `${ann.rect.height * 100}%`,
                background:
                  ann.kind === 'highlight'
                    ? 'rgba(250, 204, 21, 0.35)'
                    : ann.kind === 'note'
                      ? 'rgba(254, 243, 199, 0.92)'
                      : 'transparent',
                border:
                  ann.kind === 'rect' || ann.kind === 'note' || ann.kind === 'ellipse'
                    ? `2px solid ${ann.colorHex}`
                    : undefined,
                borderBottom: ann.kind === 'underline' ? `2.5px solid ${ann.colorHex}` : undefined,
                borderRadius: ann.kind === 'ellipse' ? '50%' : '2px',
                padding: ann.kind === 'note' ? '4px' : undefined,
                color: '#1e293b',
                fontSize: `${11 * zoom}px`,
                pointerEvents: 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(ann.id);
              }}
            >
              {ann.kind === 'strikeout' && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '50%',
                    height: '2px',
                    background: ann.colorHex,
                  }}
                />
              )}
              {ann.kind === 'note' ? ann.noteText : null}
              {isSelected && (
                <button
                  className="delete-chip"
                  title="Supprimer l'annotation"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnnotation(ann);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Hyperlinks */}
        {links.map((lk) => {
          const isSelected = selectedOverlayId === lk.id;
          return (
            <div
              key={lk.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              title={`Lien : ${lk.url}`}
              style={{
                left: `${lk.rect.x * 100}%`,
                top: `${lk.rect.y * 100}%`,
                width: `${lk.rect.width * 100}%`,
                height: `${lk.rect.height * 100}%`,
                border: '1.5px solid #2563eb',
                background: 'rgba(37, 99, 235, 0.08)',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0 4px',
                fontSize: `${Math.max(9, 10 * zoom)}px`,
                color: '#1d4ed8',
                overflow: 'hidden',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(lk.id);
              }}
            >
              <ExternalLink size={11} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lk.url}</span>
              {isSelected && (
                <button
                  className="delete-chip"
                  title="Supprimer ce lien"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLink(lk);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Created Interactive AcroForm Fields */}
        {createdFormFields.map((fld) => {
          const isSelected = selectedOverlayId === fld.id;
          return (
            <div
              key={fld.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              title={`Champ ${fld.kind === 'checkbox' ? 'case à cocher' : 'texte'} : ${fld.fieldName}`}
              style={{
                left: `${fld.rect.x * 100}%`,
                top: `${fld.rect.y * 100}%`,
                width: `${fld.rect.width * 100}%`,
                height: `${fld.rect.height * 100}%`,
                border: '1.5px solid #0284c7',
                background: 'rgba(224, 242, 254, 0.72)',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: fld.kind === 'checkbox' ? 'center' : 'flex-start',
                padding: '0 4px',
                fontSize: `${Math.max(9, 10 * zoom)}px`,
                color: '#0369a1',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(fld.id);
              }}
            >
              {fld.kind === 'checkbox' ? (fld.defaultValue ? '☑' : '☐') : fld.fieldName}
              {isSelected && (
                <button
                  className="delete-chip"
                  title="Supprimer ce champ de formulaire"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFormField(fld);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Added Text Blocks */}
        {texts.map((txt) => {
          const isSelected = selectedOverlayId === txt.id;
          const isEditing = editingTextId === txt.id;
          return (
            <div
              key={txt.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              style={{
                left: `${txt.rect.x * 100}%`,
                top: `${txt.rect.y * 100}%`,
                width: `${txt.rect.width * 100}%`,
                minHeight: `${txt.rect.height * 100}%`,
                color: txt.colorHex,
                fontSize: `${txt.fontSizePt * zoom}px`,
                fontFamily: fontFamilyToCss(txt.fontFamily),
                fontWeight: txt.bold ? 700 : 400,
                fontStyle: txt.italic ? 'italic' : 'normal',
                textAlign: txt.align ?? 'left',
                lineHeight: 1.25,
                pointerEvents: 'auto',
                zIndex: isSelected || isEditing ? 12 : 9,
                background: isSelected && !isEditing ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
              }}
              onPointerDown={(e) => {
                if (isEditing) {
                  e.stopPropagation();
                  return;
                }
                onSelectOverlay(txt.id);
                startDragOrResize(
                  e,
                  txt.rect,
                  'drag',
                  (nextRect) => onUpdateText(txt, { ...txt, rect: nextRect }),
                  () => setEditingTextId(txt.id)
                );
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(txt.id);
                setEditingTextId(txt.id);
              }}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  value={txt.text}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditingTextId(null);
                    }
                  }}
                  onChange={(e) => onUpdateText(txt, { ...txt, text: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: `${Math.max(26, txt.fontSizePt * zoom * 1.6)}px`,
                    height: '100%',
                    border: 'none',
                    outline: '1.5px solid #2563eb',
                    background: 'rgba(255,255,255,0.94)',
                    color: txt.colorHex,
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    fontWeight: 'inherit',
                    fontStyle: 'inherit',
                    textAlign: txt.align ?? 'left',
                    resize: 'both',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{txt.text}</div>
              )}
              {(isSelected || isEditing) && (
                <>
                  <div
                    className="drag-chip"
                    title="Déplacer ce texte"
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      setEditingTextId(null);
                      startDragOrResize(e, txt.rect, 'drag', (nextRect) =>
                        onUpdateText(txt, { ...txt, rect: nextRect })
                      );
                    }}
                  >
                    <Move size={10} />
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) =>
                      startDragOrResize(e, txt.rect, 'resize', (nextRect) =>
                        onUpdateText(txt, { ...txt, rect: nextRect })
                      )
                    }
                  />
                  <button
                    className="delete-chip"
                    title="Supprimer ce texte"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTextId(null);
                      onDeleteText(txt);
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Inserted Images */}
        {images.map((im) => {
          const isSelected = selectedOverlayId === im.id;
          const url = imageUrls.get(im.id);
          return (
            <div
              key={im.id}
              className={`overlay-item ${isSelected ? 'selected' : ''}`}
              style={{
                left: `${im.rect.x * 100}%`,
                top: `${im.rect.y * 100}%`,
                width: `${im.rect.width * 100}%`,
                height: `${im.rect.height * 100}%`,
                pointerEvents: 'auto',
              }}
              onPointerDown={(e) => {
                onSelectOverlay(im.id);
                startDragOrResize(e, im.rect, 'drag', (nextRect) =>
                  onUpdateImageRect(im.id, im.rect, nextRect)
                );
              }}
            >
              {url && (
                <img
                  src={url}
                  alt={im.label}
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
              {isSelected && (
                <>
                  <div
                    className="resize-handle"
                    onPointerDown={(e) =>
                      startDragOrResize(e, im.rect, 'resize', (nextRect) =>
                        onUpdateImageRect(im.id, im.rect, nextRect)
                      )
                    }
                  />
                  <button
                    className="delete-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteImage(im);
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Visual Signature Placements */}
        {signaturePlacements
          .filter((sp) => sp.applyToAllPages || sp.pageIndex === displayPageIndex)
          .map((sp) => {
            const isSelected = selectedOverlayId === sp.id;
            const url = sigUrls.get(sp.assetId);
            return (
              <div
                key={`${sp.id}-${displayPageIndex}`}
                className={`overlay-item ${isSelected ? 'selected' : ''}`}
                style={{
                  left: `${sp.rect.x * 100}%`,
                  top: `${sp.rect.y * 100}%`,
                  width: `${sp.rect.width * 100}%`,
                  height: `${sp.rect.height * 100}%`,
                  pointerEvents: 'auto',
                  border: sp.metadata.showMetadataBox
                    ? '1.5px solid #2563eb'
                    : '1px dashed rgba(37, 99, 235, 0.55)',
                  background: sp.metadata.showMetadataBox ? 'rgba(248, 250, 252, 0.9)' : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '3px',
                }}
                onPointerDown={(e) => {
                  onSelectOverlay(sp.id);
                  startDragOrResize(e, sp.rect, 'drag', (nextRect) =>
                    onUpdateSignaturePlacementRect(sp.id, nextRect)
                  );
                }}
              >
                {url && (
                  <img
                    src={url}
                    alt="Signature"
                    draggable={false}
                    style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain' }}
                  />
                )}
                {sp.metadata.showMetadataBox && (
                  <div style={{ fontSize: `${Math.max(8, 8.5 * zoom)}px`, color: '#1e293b', lineHeight: 1.15 }}>
                    <div>
                      Signé par {sp.metadata.signerName || 'Signataire'} · {sp.metadata.signedAtIso.slice(0, 10)}
                    </div>
                    {sp.metadata.reason && <div style={{ opacity: 0.75 }}>{sp.metadata.reason}</div>}
                  </div>
                )}
                {isSelected && (
                  <>
                    <div
                      className="resize-handle"
                      onPointerDown={(e) =>
                        startDragOrResize(e, sp.rect, 'resize', (nextRect) =>
                          onUpdateSignaturePlacementRect(sp.id, nextRect)
                        )
                      }
                    />
                    <button
                      className="delete-chip"
                      title="Retirer cette signature"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSignaturePlacement(sp.id);
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}

        {/* Pending Hyperlink Popover */}
        {pendingLinkRect && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(0.65, pendingLinkRect.x) * 100}%`,
              top: `${Math.min(0.85, pendingLinkRect.y + pendingLinkRect.height + 0.01) * 100}%`,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: 8,
              zIndex: 20,
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              width: 240,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>URL du lien hypertexte</div>
            <input
              autoFocus
              className="text-input"
              style={{ marginBottom: 6 }}
              value={pendingLinkUrl}
              onChange={(e) => setPendingLinkUrl(e.target.value)}
              placeholder="https://exemple.org"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingLinkUrl.trim()) {
                  onCreateLink({
                    id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    pageIndex: displayPageIndex,
                    rect: pendingLinkRect,
                    url: pendingLinkUrl.trim(),
                  });
                  setPendingLinkRect(null);
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="tool-btn" onClick={() => setPendingLinkRect(null)}>
                Annuler
              </button>
              <button
                className="tool-btn primary"
                onClick={() => {
                  if (!pendingLinkUrl.trim()) return;
                  onCreateLink({
                    id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    pageIndex: displayPageIndex,
                    rect: pendingLinkRect,
                    url: pendingLinkUrl.trim(),
                  });
                  setPendingLinkRect(null);
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* Active Drag Box Preview */}
        {drawStart && drawCurrent && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(drawStart.x, drawCurrent.x) * 100}%`,
              top: `${Math.min(drawStart.y, drawCurrent.y) * 100}%`,
              width: `${Math.abs(drawCurrent.x - drawStart.x) * 100}%`,
              height: `${Math.abs(drawCurrent.y - drawStart.y) * 100}%`,
              border: activeTool === 'redact' ? '2px solid #000000' : '2px dashed #3b82f6',
              background:
                activeTool === 'highlight'
                  ? 'rgba(250, 204, 21, 0.25)'
                  : activeTool === 'redact'
                    ? 'rgba(0, 0, 0, 0.65)'
                    : 'rgba(59, 130, 246, 0.1)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Active Freehand Preview */}
        {freehandPoints.length >= 2 && (
          <svg width={widthPx} height={heightPx} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <path
              d={freehandPoints
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * widthPx} ${p.y * heightPx}`)
                .join(' ')}
              stroke="#ef4444"
              strokeWidth={2.2 * zoom}
              fill="none"
            />
          </svg>
        )}
      </div>
    </div>
  );
};
