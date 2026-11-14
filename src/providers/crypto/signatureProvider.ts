/**
 * Crypto & Signature Provider (Single Canonical Owner for visual signature normalization,
 * PKCS#12 parsing, PKCS#7 /ByteRange PDF signing, and REA Evidence-based verification).
 */
import forge from 'node-forge';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS, detectImageFormat } from '../../contracts/schemas.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type {
  CertificateMetadata,
  SignatureVerificationRecord,
  VisualSignatureAsset,
} from '../../domain/signing.ts';
import { computeSha256Hex } from '../filesystem/boundedFileSystem.ts';

function readAsn1SequenceTotalLength(derBytes: Uint8Array): number | null {
  if (derBytes.length < 2 || derBytes[0] !== 0x30) return null;
  const lenByte = derBytes[1];
  if ((lenByte & 0x80) === 0) {
    return 2 + lenByte;
  }
  const numLenBytes = lenByte & 0x7f;
  if (numLenBytes === 0 || numLenBytes > 4 || derBytes.length < 2 + numLenBytes) return null;
  let contentLen = 0;
  for (let i = 0; i < numLenBytes; i++) {
    contentLen = (contentLen << 8) | derBytes[2 + i];
  }
  return 2 + numLenBytes + contentLen;
}

function uint8ToBinaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return chunks.join('');
}

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Normalizes an imported visual signature file (.png, .svg, .jpg, .webp) into PNG RGBA bytes,
 * optionally stripping near-white paper background pixels to transparent alpha.
 */
export async function normalizeSignatureImageFile(
  rawBytes: Uint8Array,
  label: string,
  removeWhiteBackground: boolean
): Promise<Result<VisualSignatureAsset, DomainError>> {
  const formatRes = detectImageFormat(rawBytes, ADMISSION_LIMITS.MAX_SIGNATURE_IMAGE_BYTES);
  if (!formatRes.ok) return err(formatRes.error);

  const fmt = formatRes.value;
  const mime =
    fmt === 'png'
      ? 'image/png'
      : fmt === 'jpeg'
        ? 'image/jpeg'
        : fmt === 'webp'
          ? 'image/webp'
          : 'image/svg+xml';

  try {
    const copy = new Uint8Array(rawBytes.byteLength);
    copy.set(rawBytes);
    const blob = new Blob([copy.buffer], { type: mime });
    const imgUrl = URL.createObjectURL(blob);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Décodage image impossible'));
      el.src = imgUrl;
    }).finally(() => URL.revokeObjectURL(imgUrl));

    const maxDim = 900;
    const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || 400, img.naturalHeight || 200));
    const widthPx = Math.max(1, Math.round((img.naturalWidth || 400) * scale));
    const heightPx = Math.max(1, Math.round((img.naturalHeight || 200) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return err({ code: 'ImageDecodeFailed', message: 'Contexte Canvas 2D indisponible pour normaliser la signature.' });
    }
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    if (removeWhiteBackground && fmt !== 'svg') {
      const imageData = ctx.getImageData(0, 0, widthPx, heightPx);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (r > 232 && g > 232 && b > 232) {
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) {
      return err({ code: 'ImageDecodeFailed', message: 'Échec de conversion PNG de la signature.' });
    }
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const sha256 = await computeSha256Hex(pngBytes);

    return ok({
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: label || 'Signature importée',
      kind: 'imported-image',
      pngBytes,
      sha256,
      widthPx,
      heightPx,
      createdAtIso: new Date().toISOString(),
    });
  } catch {
    return err({
      code: 'ImageDecodeFailed',
      message: 'Impossible de décoder ce fichier image signature.',
    });
  }
}

/**
 * Creates a clean typographic stamp PNG asset in browser canvas.
 */
export async function createTypographicStampAsset(
  signerName: string,
  subtitle: string,
  colorHex: string = '#1d4ed8'
): Promise<Result<VisualSignatureAsset, DomainError>> {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return err({ code: 'ImageDecodeFailed', message: 'Contexte Canvas 2D indisponible.' });
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = colorHex;
  ctx.font = 'italic 600 44px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(signerName.trim() || 'Signataire', 28, 72, canvas.width - 56);

  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle.trim() || `Signé électroniquement · ${new Date().toISOString().slice(0, 10)}`, 28, 128, canvas.width - 56);

  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!pngBlob) {
    return err({ code: 'ImageDecodeFailed', message: 'Échec de génération du tampon.' });
  }
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const sha256 = await computeSha256Hex(pngBytes);

  return ok({
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: `Tampon : ${signerName.trim() || 'Signataire'}`,
    kind: 'stamp',
    pngBytes,
    sha256,
    widthPx: canvas.width,
    heightPx: canvas.height,
    createdAtIso: new Date().toISOString(),
  });
}

function extractCertificateMetadata(cert: forge.pki.Certificate): CertificateMetadata {
  const getCn = (attrs: forge.pki.CertificateField[]) => {
    const cn = attrs.find((a) => a.shortName === 'CN' || a.name === 'commonName');
    return cn && typeof cn.value === 'string' ? cn.value : 'Inconnu';
  };
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(derBytes);
  const now = Date.now();
  const notBefore = cert.validity.notBefore.getTime();
  const notAfter = cert.validity.notAfter.getTime();

  return {
    subjectCommonName: getCn(cert.subject.attributes),
    issuerCommonName: getCn(cert.issuer.attributes),
    serialNumberHex: cert.serialNumber,
    notBeforeIso: cert.validity.notBefore.toISOString(),
    notAfterIso: cert.validity.notAfter.toISOString(),
    fingerprintSha256: md.digest().toHex(),
    isSelfSigned: cert.issuer.hash === cert.subject.hash,
    isExpiredAtCheckTime: now < notBefore || now > notAfter,
  };
}

interface ParsedPkcs12 {
  readonly privateKey: forge.pki.rsa.PrivateKey;
  readonly certificate: forge.pki.Certificate;
  readonly chain: readonly forge.pki.Certificate[];
  readonly metadata: CertificateMetadata;
}

/**
 * Parses a .pfx / .p12 file in memory without ever persisting the passphrase or private key.
 */
export function parsePkcs12Container(
  p12Bytes: Uint8Array,
  passphrase: string
): Result<ParsedPkcs12, DomainError> {
  if (p12Bytes.byteLength === 0) {
    return err({ code: 'EmptyFile', message: 'Le fichier certificat .pfx/.p12 est vide.' });
  }
  if (p12Bytes.byteLength > ADMISSION_LIMITS.MAX_CERT_BYTES) {
    return err({
      code: 'CertificateTooLarge',
      message: 'Le fichier certificat dépasse 1 Mo.',
      byteLength: p12Bytes.byteLength,
      maxBytes: ADMISSION_LIMITS.MAX_CERT_BYTES,
    });
  }

  try {
    const binStr = uint8ToBinaryString(p12Bytes);
    const p12Asn1 = forge.asn1.fromDer(binStr);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);

    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
    ];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];

    const firstKey = keyBags.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
    const certs = certBags.map((b) => b.cert).filter((c): c is forge.pki.Certificate => Boolean(c));

    if (!firstKey || certs.length === 0) {
      return err({
        code: 'InvalidPkcs12Container',
        message: 'Le conteneur .pfx/.p12 ne contient pas de paire clé privée + certificat X.509 valide.',
      });
    }

    const signingCert = certs[0];
    return ok({
      privateKey: firstKey,
      certificate: signingCert,
      chain: certs,
      metadata: extractCertificateMetadata(signingCert),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid password|PKCS#12 MAC could not be verified/i.test(msg)) {
      return err({
        code: 'InvalidPkcs12Passphrase',
        message: 'Phrase secrète incorrecte pour ce fichier .pfx / .p12.',
      });
    }
    return err({
      code: 'InvalidPkcs12Container',
      message: 'Impossible de décoder le fichier certificat .pfx / .p12.',
      cause: msg,
    });
  }
}

/**
 * Generates a local self-signed RSA-2048 PKCS#12 (.p12) container for testing or internal workflows.
 */
export function generateSelfSignedPkcs12(
  commonName: string,
  organization: string,
  passphrase: string
): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Math.floor(Date.now() / 1000));
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: commonName.trim() || 'OpenPDF Local Signer' },
    { name: 'organizationName', value: organization.trim() || 'OpenPDF Local' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyCertSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: '3des',
    friendlyName: commonName.trim() || 'OpenPDF Signer',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i);
  return out;
}

const SIGNATURE_HEX_CAPACITY = 16384; // 8192 raw DER bytes

function findAsciiSubarray(haystack: Uint8Array, needleStr: string): number {
  const needle = new TextEncoder().encode(needleStr);
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Signs a PDF document with a detached PKCS#7 / CMS SHA-256 signature using /ByteRange.
 */
export async function signPdfWithPkcs12(
  pdfBytes: Uint8Array,
  p12Bytes: Uint8Array,
  passphrase: string,
  signerDetails: { readonly signerName?: string; readonly reason?: string; readonly location?: string }
): Promise<Result<{ readonly signedBytes: Uint8Array; readonly certificate: CertificateMetadata }, DomainError>> {
  const parsedP12 = parsePkcs12Container(p12Bytes, passphrase);
  if (!parsedP12.ok) return err(parsedP12.error);

  try {
    const doc = await PDFDocument.load(pdfBytes);
    const context = doc.context;
    const pages = doc.getPages();
    const firstPage = pages[0];

    const byteRangePlaceholder = context.obj([
      PDFNumber.of(0),
      PDFNumber.of(1000000001),
      PDFNumber.of(1000000002),
      PDFNumber.of(1000000003),
    ]);
    const contentsPlaceholder = PDFHexString.of('0'.repeat(SIGNATURE_HEX_CAPACITY));

    const sigDict = context.obj({
      Type: PDFName.of('Sig'),
      Filter: PDFName.of('Adobe.PPKLite'),
      SubFilter: PDFName.of('adbe.pkcs7.detached'),
      ByteRange: byteRangePlaceholder,
      Contents: contentsPlaceholder,
      Name: PDFString.of(signerDetails.signerName || parsedP12.value.metadata.subjectCommonName),
      Reason: PDFString.of(signerDetails.reason || 'Document signé électroniquement via OpenPDF'),
      Location: PDFString.of(signerDetails.location || 'Local'),
      M: PDFString.fromDate(new Date()),
    });
    const sigRef = context.register(sigDict);

    const fieldName = `OpenPDFSig_${Date.now()}`;
    const widgetDict = context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Widget'),
      FT: PDFName.of('Sig'),
      Rect: [0, 0, 0, 0],
      V: sigRef,
      T: PDFString.of(fieldName),
      F: 4,
      P: firstPage.ref,
    });
    const widgetRef = context.register(widgetDict);

    firstPage.node.addAnnot(widgetRef);

    // Attach to AcroForm Fields array & set SigFlags = 3
    const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
    if (acroForm instanceof PDFDict) {
      const fieldsArr = acroForm.lookup(PDFName.of('Fields'));
      if (fieldsArr instanceof PDFArray) {
        fieldsArr.push(widgetRef);
      } else {
        acroForm.set(PDFName.of('Fields'), context.obj([widgetRef]));
      }
      acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    } else {
      const newForm = context.obj({
        Fields: [widgetRef],
        SigFlags: 3,
      });
      doc.catalog.set(PDFName.of('AcroForm'), context.register(newForm));
    }

    const saved = await doc.save({ useObjectStreams: false });
    const contentsNeedle = `<${'0'.repeat(SIGNATURE_HEX_CAPACITY)}>`;
    const contentsStart = findAsciiSubarray(saved, contentsNeedle);
    if (contentsStart === -1) {
      return err({
        code: 'ByteRangeComputationFailed',
        message: 'Impossible de localiser le tampon /Contents dans le flux PDF généré.',
      });
    }
    const contentsEnd = contentsStart + contentsNeedle.length;

    const brMarker = '[ 0 1000000001 1000000002 1000000003 ]';
    const brStart = findAsciiSubarray(saved, brMarker);
    if (brStart === -1) {
      return err({
        code: 'ByteRangeComputationFailed',
        message: 'Impossible de localiser le marqueur /ByteRange dans le flux PDF généré.',
      });
    }

    const br1 = contentsStart;
    const br2 = contentsEnd;
    const br3 = saved.length - contentsEnd;
    const pad10 = (n: number) => String(n).padEnd(10, ' ');
    const brReplacement = `[ 0 ${pad10(br1)} ${pad10(br2)} ${pad10(br3)} ]`;
    if (brReplacement.length !== brMarker.length) {
      return err({
        code: 'ByteRangeComputationFailed',
        message: 'Longueur du /ByteRange incohérente avec le marqueur réservé.',
      });
    }

    const brBytes = new TextEncoder().encode(brReplacement);
    saved.set(brBytes, brStart);

    // Hash and sign exact ByteRange segments
    const part1 = saved.subarray(0, br1);
    const part2 = saved.subarray(br2, br2 + br3);
    const combined = new Uint8Array(part1.length + part2.length);
    combined.set(part1, 0);
    combined.set(part2, part1.length);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(uint8ToBinaryString(combined));
    for (const c of parsedP12.value.chain) {
      p7.addCertificate(c);
    }
    p7.addSigner({
      key: parsedP12.value.privateKey,
      certificate: parsedP12.value.certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
      ],
    });
    p7.sign({ detached: true });

    const derHex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes()).toUpperCase();
    if (derHex.length > SIGNATURE_HEX_CAPACITY) {
      return err({
        code: 'ByteRangeComputationFailed',
        message: `La signature PKCS#7 (${derHex.length} hex) dépasse la capacité réservée (${SIGNATURE_HEX_CAPACITY}).`,
      });
    }

    const paddedHex = derHex.padEnd(SIGNATURE_HEX_CAPACITY, '0');
    const hexBytes = new TextEncoder().encode(paddedHex);
    saved.set(hexBytes, contentsStart + 1);

    return ok({
      signedBytes: saved,
      certificate: parsedP12.value.metadata,
    });
  } catch (e: unknown) {
    return err({
      code: 'ByteRangeComputationFailed',
      message: 'Échec lors de la création de la signature PKCS#7.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Inspects and cryptographically verifies /Sig /ByteRange PKCS#7 signatures in a PDF,
 * returning REA-structured Observations, Derivations, and Unknowns.
 */
export async function verifyPdfSignatures(pdfBytes: Uint8Array): Promise<SignatureVerificationRecord[]> {
  const latin1 = new TextDecoder('latin1').decode(pdfBytes);
  const results: SignatureVerificationRecord[] = [];

  // Match ByteRange arrays across the PDF
  const brRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let match: RegExpExecArray | null;
  let sigIdx = 0;

  while ((match = brRegex.exec(latin1)) !== null) {
    sigIdx++;
    const a = Number(match[1]);
    const b = Number(match[2]);
    const c = Number(match[3]);
    const d = Number(match[4]);
    const byteRange: [number, number, number, number] = [a, b, c, d];

    const windowStart = Math.max(0, match.index - 400);
    const windowEnd = Math.min(latin1.length, match.index + 24000);
    const slice = latin1.slice(windowStart, windowEnd);

    const subFilterMatch = /\/SubFilter\s*\/([A-Za-z0-9._-]+)/.exec(slice);
    const subFilter = subFilterMatch ? subFilterMatch[1] : null;
    const nameMatch = /\/Name\s*\(([^)]*)\)/.exec(slice);
    const fieldName = nameMatch?.[1] || `Signature #${sigIdx}`;

    const observations: string[] = [];
    const derivations: string[] = [];
    const unknowns: string[] = [
      'Confiance racine externe (CA Root / eIDAS / CRL / OCSP) non vérifiée hors ligne.',
    ];

    if (a + b > pdfBytes.length || c + d > pdfBytes.length || b <= 0 || c < a + b) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'unknown',
        observations: [`/ByteRange [${a} ${b} ${c} ${d}] hors limites du fichier (${pdfBytes.length} octets).`],
        derivations,
        unknowns,
        certificate: null,
      });
      continue;
    }

    // Locate /Contents <HEX> immediately between ByteRange end (a+b) and start of second segment (c)
    const gapText = new TextDecoder('latin1').decode(pdfBytes.subarray(a + b, c));
    const hexMatch = /<([0-9a-fA-F\s]+)>/.exec(gapText);
    if (!hexMatch) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'unknown',
        observations: [`/ByteRange [${a} ${b} ${c} ${d}] détecté, mais flux hexadécimal /Contents introuvable dans l'intervalle.`],
        derivations,
        unknowns,
        certificate: null,
      });
      continue;
    }

    const rawCmsPadded = hexToUint8(hexMatch[1]);
    const exactDerLen = readAsn1SequenceTotalLength(rawCmsPadded);
    const cmsBytes = exactDerLen !== null && exactDerLen <= rawCmsPadded.length
      ? rawCmsPadded.subarray(0, exactDerLen)
      : rawCmsPadded;

    observations.push(`/ByteRange [${a}, ${b}, ${c}, ${d}] couvre ${b + d} / ${pdfBytes.length} octets du PDF.`);

    const covered = new Uint8Array(b + d);
    covered.set(pdfBytes.subarray(a, a + b), 0);
    covered.set(pdfBytes.subarray(c, c + d), b);
    const observedDigestHex = await computeSha256Hex(covered);
    observations.push(`Condensat SHA-256 observé des plages signées : ${observedDigestHex.slice(0, 24)}…`);

    try {
      const asn1 = forge.asn1.fromDer(uint8ToBinaryString(cmsBytes));
      const p7 = forge.pkcs7.messageFromAsn1(asn1) as unknown as {
        certificates?: forge.pki.Certificate[];
        rawCapture?: {
          digestAlgorithm?: string;
          signature?: string;
          authenticatedAttributes?: forge.asn1.Asn1[];
        };
      };

      const certs = p7.certificates ?? [];
      const signerCert = certs[0] ?? null;
      const certMeta = signerCert ? extractCertificateMetadata(signerCert) : null;
      if (certMeta) {
        derivations.push(
          `Certificat X.509 extrait : CN="${certMeta.subjectCommonName}", Émetteur="${certMeta.issuerCommonName}" (${certMeta.isSelfSigned ? 'auto-signé' : 'chaîne CA'}).`
        );
      }

      // Inspect authenticatedAttributes messageDigest (OID 1.2.840.113549.1.9.4)
      const authAttrs = p7.rawCapture?.authenticatedAttributes ?? [];
      let embeddedDigestHex: string | null = null;
      for (const attr of authAttrs) {
        // SEQUENCE { OID, SET { OCTET STRING } }
        const val = attr.value;
        if (Array.isArray(val) && val.length >= 2) {
          const oidDer = val[0];
          const oid = typeof oidDer.value === 'string' ? forge.asn1.derToOid(oidDer.value) : '';
          if (oid === forge.pki.oids.messageDigest) {
            const setNode = val[1];
            const octets = Array.isArray(setNode.value) ? setNode.value[0] : null;
            if (octets && typeof octets.value === 'string') {
              embeddedDigestHex = forge.util.bytesToHex(octets.value);
            }
          }
        }
      }

      let cryptoSignatureValid = false;
      if (signerCert && p7.rawCapture?.signature && authAttrs.length > 0) {
        // Re-encode authenticatedAttributes as a DER SET (tag 0x31) per RFC 5652 §5.4
        const setAsn1 = forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SET,
          true,
          authAttrs
        );
        const setDer = forge.asn1.toDer(setAsn1).getBytes();
        const md = forge.md.sha256.create();
        md.update(setDer);
        const rsaPub = signerCert.publicKey as forge.pki.rsa.PublicKey;
        cryptoSignatureValid = rsaPub.verify(md.digest().bytes(), p7.rawCapture.signature);
      }

      if (embeddedDigestHex !== null) {
        const digestMatches = embeddedDigestHex.toLowerCase() === observedDigestHex.toLowerCase();
        if (digestMatches && cryptoSignatureValid) {
          observations.push('Condensat SHA-256 et signature RSA CMS concordent exactement avec les octets du PDF.');
          results.push({
            fieldName,
            byteRange,
            subFilter,
            status: 'intact',
            observations,
            derivations,
            unknowns,
            certificate: certMeta,
          });
        } else {
          observations.push(
            digestMatches
              ? 'La signature cryptographique RSA sur les attributs authentifiés est invalide.'
              : `Discordance de condensat : signé=${embeddedDigestHex.slice(0, 16)}… vs observé=${observedDigestHex.slice(0, 16)}… (document modifié après signature).`
          );
          results.push({
            fieldName,
            byteRange,
            subFilter,
            status: 'tampered',
            observations,
            derivations,
            unknowns,
            certificate: certMeta,
          });
        }
      } else {
        results.push({
          fieldName,
          byteRange,
          subFilter,
          status: 'unknown',
          observations,
          derivations,
          unknowns: [...unknowns, 'Attribut messageDigest absent ou format CMS non supporté hors ligne.'],
          certificate: certMeta,
        });
      }
    } catch (e: unknown) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'unknown',
        observations: [
          ...observations,
          `Impossible de décoder la structure CMS PKCS#7 : ${e instanceof Error ? e.message : String(e)}`,
        ],
        derivations,
        unknowns,
        certificate: null,
      });
    }
  }

  return results;
}
