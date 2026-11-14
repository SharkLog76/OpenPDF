/**
 * Pure Domain models for PDF reading & viewing (viewer/pdf-reading).
 */

export interface DocumentIdentity {
  /** Deterministic SHA-256 hex digest of admitted source bytes */
  readonly sha256: string;
  /** Exact byte length of admitted source PDF */
  readonly byteLength: number;
  /** Caller-facing display name (kept separate from cryptographic identity) */
  readonly displayName: string;
  /** Admitted header version string observed (e.g. "1.7"), null if unknown */
  readonly headerVersion: string | null;
}

export type ViewMode = 'single' | 'continuous' | 'double';

export type DisplayRotation = 0 | 90 | 180 | 270;

export interface PageMetrics {
  readonly pageIndex: number;
  /** Width in PDF points (1/72 inch) */
  readonly widthPt: number;
  /** Height in PDF points (1/72 inch) */
  readonly heightPt: number;
  /** Inherent PDF page rotation in degrees */
  readonly inherentRotation: DisplayRotation;
}

export interface ViewportState {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly zoom: number;
  readonly rotation: DisplayRotation;
  readonly viewMode: ViewMode;
}

export interface OutlineNode {
  readonly id: string;
  readonly title: string;
  readonly pageIndex: number | null;
  readonly children: readonly OutlineNode[];
}

export interface SearchMatch {
  readonly id: string;
  readonly pageIndex: number;
  readonly matchIndexInPage: number;
  readonly snippet: string;
}

export interface PdfMetadataFacts {
  readonly title: string | null;
  readonly author: string | null;
  readonly subject: string | null;
  readonly creator: string | null;
  readonly producer: string | null;
  readonly pdfFormatVersion: string | null;
  readonly pageCount: number;
  readonly isEncrypted: boolean;
  readonly hasAcroForm: boolean;
  readonly hasExistingSignatures: boolean;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(4, Math.max(0.25, Math.round(zoom * 100) / 100));
}

export function rotateDisplayCW(current: DisplayRotation): DisplayRotation {
  return (((current + 90) % 360) as DisplayRotation);
}
