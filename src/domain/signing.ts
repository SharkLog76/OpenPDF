/**
 * Pure Domain models for visual signature assets, PKCS#12 certificates,
 * cryptographic signing placements, and REA Evidence-based verification.
 */
import type { NormalizedRect } from './editor.ts';

export type SignatureAssetKind = 'imported-image' | 'handwritten' | 'stamp';

export interface VisualSignatureAsset {
  readonly id: string;
  readonly label: string;
  readonly kind: SignatureAssetKind;
  /** Always normalized to PNG RGBA bytes for deterministic embedding & preview */
  readonly pngBytes: Uint8Array;
  readonly sha256: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly createdAtIso: string;
}

export interface CertificateMetadata {
  readonly subjectCommonName: string;
  readonly issuerCommonName: string;
  readonly serialNumberHex: string;
  readonly notBeforeIso: string;
  readonly notAfterIso: string;
  readonly fingerprintSha256: string;
  readonly isSelfSigned: boolean;
  readonly isExpiredAtCheckTime: boolean;
}

export interface SignatureMetadataOverlay {
  readonly signerName: string;
  readonly reason: string;
  readonly location: string;
  readonly signedAtIso: string;
  readonly showMetadataBox: boolean;
}

export interface SignaturePlacement {
  readonly id: string;
  readonly assetId: string;
  readonly pageIndex: number;
  readonly rect: NormalizedRect;
  readonly applyToAllPages: boolean;
  readonly metadata: SignatureMetadataOverlay;
}

/**
 * REA Evidence classification for signature inspection:
 * - observations: raw bytes, ByteRange, cryptographic digest comparison
 * - derivations: X.509 parsed fields, validity window vs local clock
 * - unknowns: external root CA trust, TSA revocation (not queried offline)
 */
export interface SignatureVerificationRecord {
  readonly fieldName: string;
  readonly byteRange: readonly [number, number, number, number] | null;
  readonly subFilter: string | null;
  readonly status: 'intact' | 'tampered' | 'unknown';
  readonly observations: readonly string[];
  readonly derivations: readonly string[];
  readonly unknowns: readonly string[];
  readonly certificate: CertificateMetadata | null;
}

export interface VaultEntrySummary {
  readonly id: string;
  readonly label: string;
  readonly kind: SignatureAssetKind;
  readonly createdAtIso: string;
  readonly sha256: string;
}
