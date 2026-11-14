import { describe, expect, it } from 'vitest';
import { ADMISSION_LIMITS, validatePdfAdmission } from '../src/contracts/schemas.ts';
import { clampZoom, rotateDisplayCW } from '../src/domain/viewer.ts';
import { admitPdfBytes, createSamplePdfBytes } from '../src/providers/filesystem/boundedFileSystem.ts';
import { inspectAcroFormFields } from '../src/providers/mutator/pdfLibMutator.ts';

describe('viewer/pdf-reading — Admission, Identité & Métadonnées', () => {
  it('admet un PDF de démonstration multi-pages et calcule son empreinte SHA-256 sans altérer les octets', async () => {
    const sampleBytes = await createSamplePdfBytes();
    const snapshot = new Uint8Array(sampleBytes);

    const res = await admitPdfBytes(sampleBytes, 'demo.pdf');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.identity.displayName).toBe('demo.pdf');
    expect(res.value.identity.byteLength).toBe(sampleBytes.byteLength);
    expect(res.value.identity.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.value.identity.headerVersion).toMatch(/^\d+\.\d+$/);

    // Source bytes remain byte-for-byte identical
    expect(sampleBytes).toEqual(snapshot);

    // AcroForm fields are detected cleanly
    const formRes = await inspectAcroFormFields(res.value.bytes);
    expect(formRes.ok).toBe(true);
    if (!formRes.ok) return;
    expect(formRes.value.fields.some((f) => f.name === 'signer_full_name')).toBe(true);
    expect(formRes.value.fields.some((f) => f.name === 'approved_terms' && f.kind === 'checkbox')).toBe(true);
  });

  it('rejette un fichier vide (EmptyFile)', () => {
    const res = validatePdfAdmission(new Uint8Array(0));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EmptyFile');
  });

  it('rejette un fichier texte renommé en .pdf (InvalidPdfHeader)', () => {
    const fakePdf = new TextEncoder().encode('Ceci est un fichier texte banal, pas un PDF.');
    const res = validatePdfAdmission(fakePdf);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('InvalidPdfHeader');
  });

  it('rejette un fichier dépassant le budget d’admission (FileTooLarge)', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n...');
    const res = validatePdfAdmission(bytes, 5);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('FileTooLarge');
      expect(ADMISSION_LIMITS.MAX_PDF_BYTES).toBe(256 * 1024 * 1024);
    }
  });

  it('borne correctement le zoom et la rotation d’affichage', () => {
    expect(clampZoom(0.05)).toBe(0.25);
    expect(clampZoom(10)).toBe(4);
    expect(rotateDisplayCW(270)).toBe(0);
    expect(rotateDisplayCW(90)).toBe(180);
  });
});
