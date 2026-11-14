/**
 * Pure Domain models for full PDF editing, existing text modification, whiteout/redaction,
 * annotations, forms, watermarks, headers/footers, links, crop, and page operations.
 */
import type { DisplayRotation } from './viewer.ts';

export interface NormalizedRect {
  /** Left edge in [0..1] relative to page width */
  readonly x: number;
  /** Top edge in [0..1] relative to page height */
  readonly y: number;
  /** Width in [0..1] relative to page width */
  readonly width: number;
  /** Height in [0..1] relative to page height */
  readonly height: number;
}

export interface PdfPointRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Converts normalized top-left UI coordinates [0..1] to PDF bottom-left points (1/72").
 */
export function normalizedRectToPdfPoints(
  rect: NormalizedRect,
  pageWidthPt: number,
  pageHeightPt: number
): PdfPointRect {
  const width = Math.max(1, rect.width * pageWidthPt);
  const height = Math.max(1, rect.height * pageHeightPt);
  const x = rect.x * pageWidthPt;
  const y = pageHeightPt - rect.y * pageHeightPt - height;
  return { x, y, width, height };
}

export type PdfStandardFamily = 'Helvetica' | 'TimesRoman' | 'Courier';
export type TextAlign = 'left' | 'center' | 'right';

export type AnnotationKind = 'highlight' | 'underline' | 'strikeout' | 'rect' | 'ellipse' | 'note' | 'freehand';

export interface TextOverlayItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly text: string;
  readonly fontSizePt: number;
  readonly colorHex: string;
  readonly fontFamily: PdfStandardFamily;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly align?: TextAlign;
}

export interface RawTextRun {
  readonly text: string;
  readonly leftPt: number;
  readonly topPt: number;
  readonly baselineYPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly fontSizePt: number;
  readonly fontFamily: PdfStandardFamily;
  readonly bold: boolean;
  readonly italic: boolean;
}

export interface ExistingTextBlock {
  readonly id: string;
  readonly sourcePageIndex: number;
  readonly rect: NormalizedRect;
  readonly text: string;
  readonly fontSizePt: number;
  readonly fontFamily: PdfStandardFamily;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly textColorHex: string;
  readonly backgroundHex: string;
}

export interface ExistingTextEdit {
  readonly key: string; // `${pageUid}:${blockId}`
  readonly pageUid: string;
  readonly blockId: string;
  readonly originalRect: NormalizedRect;
  readonly currentRect: NormalizedRect;
  readonly originalText: string;
  readonly currentText: string;
  readonly fontSizePt: number;
  readonly fontFamily: PdfStandardFamily;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly colorHex: string;
  readonly backgroundHex: string;
  readonly deleted: boolean;
}

/**
 * Pure deterministic algorithm that groups raw PDF text runs into editable lines/paragraphs
 * without merging separate columns or table cells.
 */
export function groupTextRunsIntoBlocks(
  runs: readonly RawTextRun[],
  sourcePageIndex: number,
  pageWidthPt: number,
  pageHeightPt: number
): ExistingTextBlock[] {
  const validRuns = runs.filter((r) => r.text.trim().length > 0);
  if (validRuns.length === 0 || pageWidthPt <= 0 || pageHeightPt <= 0) return [];

  const sorted = [...validRuns].sort((a, b) => {
    const dy = a.baselineYPt - b.baselineYPt;
    if (Math.abs(dy) > Math.max(2, Math.min(a.fontSizePt, b.fontSizePt) * 0.35)) {
      return dy;
    }
    return a.leftPt - b.leftPt;
  });

  interface LineGroup {
    runs: RawTextRun[];
    leftPt: number;
    rightPt: number;
    topPt: number;
    bottomPt: number;
    baselineYPt: number;
    fontSizePt: number;
    fontFamily: PdfStandardFamily;
    bold: boolean;
    italic: boolean;
    text: string;
  }

  const lines: LineGroup[] = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    const sameBaseline =
      last &&
      Math.abs(run.baselineYPt - last.baselineYPt) <= Math.max(2.5, Math.min(run.fontSizePt, last.fontSizePt) * 0.4) &&
      Math.abs(run.fontSizePt - last.fontSizePt) <= 2.5;
    const horizontalGap = last ? run.leftPt - last.rightPt : 9999;

    // Do not merge widely separated table columns on the same line
    if (sameBaseline && horizontalGap < run.fontSizePt * 2.5) {
      const needsSpace = horizontalGap > run.fontSizePt * 0.16 && !last.text.endsWith(' ') && !run.text.startsWith(' ');
      last.runs.push(run);
      last.text = last.text + (needsSpace ? ' ' : '') + run.text;
      last.rightPt = Math.max(last.rightPt, run.leftPt + run.widthPt);
      last.leftPt = Math.min(last.leftPt, run.leftPt);
      last.topPt = Math.min(last.topPt, run.topPt);
      last.bottomPt = Math.max(last.bottomPt, run.topPt + run.heightPt);
    } else {
      lines.push({
        runs: [run],
        leftPt: run.leftPt,
        rightPt: run.leftPt + run.widthPt,
        topPt: run.topPt,
        bottomPt: run.topPt + run.heightPt,
        baselineYPt: run.baselineYPt,
        fontSizePt: run.fontSizePt,
        fontFamily: run.fontFamily,
        bold: run.bold,
        italic: run.italic,
        text: run.text,
      });
    }
  }

  // Merge consecutive lines into cohesive paragraph blocks when left-aligned with normal line height
  const paragraphs: LineGroup[] = [];
  for (const line of lines) {
    const prev = paragraphs[paragraphs.length - 1];
    const verticalGap = prev ? line.topPt - prev.bottomPt : 9999;
    const canMergeParagraph =
      prev &&
      Math.abs(line.leftPt - prev.leftPt) <= 10 &&
      Math.abs(line.fontSizePt - prev.fontSizePt) <= 1 &&
      line.fontFamily === prev.fontFamily &&
      line.bold === prev.bold &&
      line.italic === prev.italic &&
      verticalGap >= -2 &&
      verticalGap <= line.fontSizePt * 0.85 &&
      !prev.text.trimEnd().endsWith(':') &&
      !/^[-•*\d+[.)]/.test(line.text.trimStart());

    if (canMergeParagraph) {
      prev.text = `${prev.text}\n${line.text}`;
      prev.leftPt = Math.min(prev.leftPt, line.leftPt);
      prev.rightPt = Math.max(prev.rightPt, line.rightPt);
      prev.topPt = Math.min(prev.topPt, line.topPt);
      prev.bottomPt = Math.max(prev.bottomPt, line.bottomPt);
    } else {
      paragraphs.push({ ...line });
    }
  }

  const padPt = 2;
  return paragraphs.map((p, idx) => {
    const xPt = Math.max(0, p.leftPt - padPt);
    const yPt = Math.max(0, p.topPt - padPt);
    const wPt = Math.min(pageWidthPt - xPt, Math.max(12, p.rightPt - p.leftPt + padPt * 2));
    const hPt = Math.min(pageHeightPt - yPt, Math.max(10, p.bottomPt - p.topPt + padPt * 2));
    return {
      id: `blk-${sourcePageIndex}-${idx}`,
      sourcePageIndex,
      rect: {
        x: xPt / pageWidthPt,
        y: yPt / pageHeightPt,
        width: wPt / pageWidthPt,
        height: hPt / pageHeightPt,
      },
      text: p.text,
      fontSizePt: Math.round(p.fontSizePt * 10) / 10,
      fontFamily: p.fontFamily,
      bold: p.bold,
      italic: p.italic,
      textColorHex: '#0f172a',
      backgroundHex: '#ffffff',
    };
  });
}

export interface AnnotationOverlayItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly kind: AnnotationKind;
  readonly rect: NormalizedRect;
  readonly colorHex: string;
  readonly opacity: number;
  readonly strokeWidthPt: number;
  readonly noteText?: string;
  /** Normalized [0..1] points for freehand stroke */
  readonly points?: readonly { readonly x: number; readonly y: number }[];
}

export interface ImageOverlayItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly imageBytes: Uint8Array;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly label: string;
}

export interface WhiteoutRectItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly fillHex: string;
  readonly mode: 'whiteout' | 'redact';
}

export interface LinkAnnotationItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly url: string;
}

export interface CreatedFormFieldItem {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly fieldName: string;
  readonly kind: 'text' | 'checkbox';
  readonly defaultValue: string | boolean;
}

export interface WatermarkConfig {
  readonly enabled: boolean;
  readonly text: string;
  readonly fontSizePt: number;
  readonly colorHex: string;
  readonly opacity: number;
  readonly angleDeg: number;
}

export interface HeaderFooterConfig {
  readonly enabled: boolean;
  readonly headerLeft: string;
  readonly headerCenter: string;
  readonly headerRight: string;
  readonly footerLeft: string;
  readonly footerCenter: string;
  readonly footerRight: string;
  readonly fontSizePt: number;
  readonly colorHex: string;
}

export interface PageCropConfig {
  readonly enabled: boolean;
  readonly marginTopPt: number;
  readonly marginRightPt: number;
  readonly marginBottomPt: number;
  readonly marginLeftPt: number;
}

export interface PageBackgroundConfig {
  readonly enabled: boolean;
  readonly colorHex: string;
}

export interface AcroFormFieldDescriptor {
  readonly name: string;
  readonly kind: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unknown';
  readonly value: string | boolean;
  readonly options?: readonly string[];
  readonly readOnly: boolean;
}

export interface PageTransformState {
  /** Unique stable ID tracking the original, duplicated, or blank page across reorders */
  readonly uid: string;
  /** 'source' refers to a page in the opened source PDF; 'blank' is a newly inserted blank page */
  readonly kind?: 'source' | 'blank';
  /** 0-based index in the current source document */
  readonly sourceDocIndex: number;
  /** 0-based page index inside that source document (-1 for blank pages) */
  readonly sourcePageIndex: number;
  /** Additional permanent rotation applied in editor */
  readonly addedRotation: DisplayRotation;
  /** Page dimensions in PDF points for blank pages */
  readonly blankSizePt?: { readonly widthPt: number; readonly heightPt: number };
}

export type EditCommand =
  | { readonly type: 'ADD_TEXT'; readonly item: TextOverlayItem }
  | { readonly type: 'UPDATE_TEXT'; readonly id: string; readonly previous: TextOverlayItem; readonly next: TextOverlayItem }
  | { readonly type: 'DELETE_TEXT'; readonly item: TextOverlayItem }
  | { readonly type: 'UPSERT_EXISTING_TEXT_EDIT'; readonly previous: ExistingTextEdit | null; readonly next: ExistingTextEdit }
  | { readonly type: 'ADD_ANNOTATION'; readonly item: AnnotationOverlayItem }
  | { readonly type: 'DELETE_ANNOTATION'; readonly item: AnnotationOverlayItem }
  | { readonly type: 'INSERT_IMAGE'; readonly item: ImageOverlayItem }
  | { readonly type: 'UPDATE_IMAGE_RECT'; readonly id: string; readonly previousRect: NormalizedRect; readonly nextRect: NormalizedRect }
  | { readonly type: 'DELETE_IMAGE'; readonly item: ImageOverlayItem }
  | { readonly type: 'ADD_WHITEOUT'; readonly item: WhiteoutRectItem }
  | { readonly type: 'DELETE_WHITEOUT'; readonly item: WhiteoutRectItem }
  | { readonly type: 'ADD_LINK'; readonly item: LinkAnnotationItem }
  | { readonly type: 'DELETE_LINK'; readonly item: LinkAnnotationItem }
  | { readonly type: 'CREATE_FORM_FIELD'; readonly item: CreatedFormFieldItem }
  | { readonly type: 'DELETE_FORM_FIELD'; readonly item: CreatedFormFieldItem }
  | { readonly type: 'SET_WATERMARK'; readonly previous: WatermarkConfig | null; readonly next: WatermarkConfig | null }
  | { readonly type: 'SET_HEADER_FOOTER'; readonly previous: HeaderFooterConfig | null; readonly next: HeaderFooterConfig | null }
  | { readonly type: 'SET_PAGE_CROP'; readonly previous: PageCropConfig | null; readonly next: PageCropConfig | null }
  | { readonly type: 'SET_PAGE_BACKGROUND'; readonly previous: PageBackgroundConfig | null; readonly next: PageBackgroundConfig | null }
  | { readonly type: 'ROTATE_PAGE'; readonly pageUid: string; readonly delta: DisplayRotation }
  | { readonly type: 'DELETE_PAGE'; readonly pageUid: string; readonly removedIndex: number; readonly snapshot: PageTransformState }
  | { readonly type: 'DUPLICATE_PAGE'; readonly afterPageUid: string; readonly created: PageTransformState }
  | { readonly type: 'INSERT_BLANK_PAGE'; readonly insertAtIndex: number; readonly created: PageTransformState }
  | { readonly type: 'REORDER_PAGES'; readonly previousOrder: readonly PageTransformState[]; readonly nextOrder: readonly PageTransformState[] }
  | { readonly type: 'SET_FORM_FIELD'; readonly fieldName: string; readonly previousValue: string | boolean; readonly nextValue: string | boolean };

export interface EditorDocumentState {
  readonly pages: readonly PageTransformState[];
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
  readonly formValues: Readonly<Record<string, string | boolean>>;
}
