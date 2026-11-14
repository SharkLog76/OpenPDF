import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createInitialEditorState } from '../src/application/ledger/CommandLedger.ts';
import { detectImageFormat, sanitizeSvgMarkup } from '../src/contracts/schemas.ts';
import type { VisualSignatureAsset } from '../src/domain/signing.ts';
import {
  generateSelfSignedPkcs12,
  parsePkcs12Container,
  signPdfWithPkcs12,
  verifyPdfSignatures,
} from '../src/providers/crypto/signatureProvider.ts';
import { createSamplePdfBytes } from '../src/providers/filesystem/boundedFileSystem.ts';
import { compileEditedPdf } from '../src/providers/mutator/pdfLibMutator.ts';
import { decryptAssetPayload, encryptAssetPayload } from '../src/providers/storage/signatureVaultStore.ts';

// Minimal valid 1x1 transparent PNG
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('signing/pdf-signature — Formats Signatures, Coffre AES-GCM & PKCS#7 /ByteRange', () => {
  it('détecte les magic bytes PNG/SVG et rejette les formats non pris en charge', () => {
    const pngRes = detectImageFormat(TINY_PNG);
    expect(pngRes.ok && pngRes.value === 'png').toBe(true);

    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    const svgRes = detectImageFormat(svgBytes);
    expect(svgRes.ok && svgRes.value === 'svg').toBe(true);

    const badRes = detectImageFormat(new TextEncoder().encode('not-an-image'));
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) expect(badRes.error.code).toBe('UnsupportedSignatureFileFormat');
  });

  it('chiffre et déchiffre un fichier signature via AES-GCM 256 (Coffre local)', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const asset: VisualSignatureAsset = {
      id: 'sig-test-1',
      label: 'Ma signature PNG',
      kind: 'imported-image',
      pngBytes: TINY_PNG,
      sha256: 'abc123',
      widthPx: 1,
      heightPx: 1,
      createdAtIso: '2026-11-13T07:00:00.000Z',
    };

    const encrypted = await encryptAssetPayload(asset, key);
    expect(encrypted.ciphertext.byteLength).toBeGreaterThan(20);

    const decrypted = await decryptAssetPayload(encrypted, key);
    expect(decrypted.id).toBe(asset.id);
    expect(decrypted.label).toBe(asset.label);
    expect(decrypted.pngBytes).toEqual(TINY_PNG);
  });

  it('incruste une signature visuelle, signe avec .p12 (PKCS#7 /ByteRange), vérifie Intact puis détecte Tampered', async () => {
    const samplePdf = await createSamplePdfBytes();
    const editorState = createInitialEditorState(3);

    const visualAsset: VisualSignatureAsset = {
      id: 'sig-vis-1',
      label: 'Paraphe PNG',
      kind: 'imported-image',
      pngBytes: TINY_PNG,
      sha256: 'deadbeef',
      widthPx: 1,
      heightPx: 1,
      createdAtIso: new Date().toISOString(),
    };

    const compiled = await compileEditedPdf(samplePdf, editorState, {
      visualSignatures: [
        {
          asset: visualAsset,
          placement: {
            id: 'place-1',
            assetId: visualAsset.id,
            pageIndex: 0,
            rect: { x: 0.1, y: 0.72, width: 0.3, height: 0.1 },
            applyToAllPages: true,
            metadata: {
              signerName: 'Alexandre Martin',
              reason: 'Validation contrat',
              location: 'Paris',
              signedAtIso: '2026-11-13T07:30:00.000Z',
              showMetadataBox: true,
            },
          },
        },
      ],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    // Generate local .p12 certificate
    const p12Bytes = generateSelfSignedPkcs12('Alexandre Martin', 'OpenPDF Studio', 'secret123');

    // Wrong passphrase must fail cleanly with InvalidPkcs12Passphrase
    const badPass = parsePkcs12Container(p12Bytes, 'wrong-password');
    expect(badPass.ok).toBe(false);
    if (!badPass.ok) expect(badPass.error.code).toBe('InvalidPkcs12Passphrase');

    // Sign compiled PDF with valid .p12
    const signRes = await signPdfWithPkcs12(compiled.value, p12Bytes, 'secret123', {
      signerName: 'Alexandre Martin',
      reason: 'Validation contrat',
      location: 'Paris',
    });
    expect(signRes.ok).toBe(true);
    if (!signRes.ok) return;

    expect(signRes.value.certificate.subjectCommonName).toBe('Alexandre Martin');

    // Reopen signed PDF structurally to ensure PDF integrity
    const signedPdfDoc = await PDFDocument.load(signRes.value.signedBytes, { ignoreEncryption: true });
    expect(signedPdfDoc.getPageCount()).toBe(3);

    // Verify PKCS#7 signature -> must be intact
    const verifications = await verifyPdfSignatures(signRes.value.signedBytes);
    expect(verifications).toHaveLength(1);
    expect(verifications[0].status).toBe('intact');
    expect(verifications[0].subFilter).toBe('adbe.pkcs7.detached');
    expect(verifications[0].certificate?.subjectCommonName).toBe('Alexandre Martin');
    expect(verifications[0].unknowns.length).toBeGreaterThan(0);

    // Flip 1 byte in the first signed segment (outside /Contents) -> must detect tampering!
    const tampered = new Uint8Array(signRes.value.signedBytes);
    tampered[50] = tampered[50] ^ 0xff;
    const tamperedVerifications = await verifyPdfSignatures(tampered);
    expect(tamperedVerifications).toHaveLength(1);
    expect(tamperedVerifications[0].status).toBe('tampered');

    // Shadow / incremental append attack after EOF must NEVER be reported as 'intact'
    const shadow = new Uint8Array(signRes.value.signedBytes.length + 20);
    shadow.set(signRes.value.signedBytes, 0);
    shadow.set(new TextEncoder().encode('\n%shadow-append-bad\n'), signRes.value.signedBytes.length);
    const shadowVerifications = await verifyPdfSignatures(shadow);
    expect(shadowVerifications).toHaveLength(1);
    expect(shadowVerifications[0].status).toBe('tampered');

    // Gap injection attack inside [a+b, c) outside <hex> must be rejected as 'tampered'
    const gapAttack = new Uint8Array(signRes.value.signedBytes);
    expect(verifications[0].byteRange).not.toBeNull();
    const brC = verifications[0].byteRange![2];
    const gapInject = new TextEncoder().encode('>/Evil 1 ');
    gapAttack.set(gapInject, brC - gapInject.length);
    const gapVerifications = await verifyPdfSignatures(gapAttack);
    expect(gapVerifications).toHaveLength(1);
    expect(gapVerifications[0].status).toBe('tampered');
  });

  it('rejette les SVG actifs/XXE et détecte le détournement d’ID (AAD AES-GCM) dans le coffre', async () => {
    expect(sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>').ok).toBe(true);
    expect(sanitizeSvgMarkup('<!DOCTYPE svg><svg><path d="M0 0"/></svg>').ok).toBe(false);
    expect(sanitizeSvgMarkup('<svg><script>alert(1)</script></svg>').ok).toBe(false);
    expect(sanitizeSvgMarkup('<svg onload="alert(1)"><rect width="10" height="10"/></svg>').ok).toBe(false);
    expect(sanitizeSvgMarkup('<svg><image href="https://evil.example/leak.png"/></svg>').ok).toBe(false);
    expect(detectImageFormat(new TextEncoder().encode('<!DOCTYPE html><html><svg></svg></html>'), 1024).ok).toBe(false);

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const asset: VisualSignatureAsset = {
      id: 'sig-aad-1',
      label: 'AAD Test',
      kind: 'handwritten',
      pngBytes: TINY_PNG,
      sha256: 'a'.repeat(64),
      widthPx: 1,
      heightPx: 1,
      createdAtIso: new Date().toISOString(),
    };
    const enc = await encryptAssetPayload(asset, key);
    await expect(decryptAssetPayload({ ...enc, id: 'sig-aad-tampered' }, key)).rejects.toThrow();
  });
});
