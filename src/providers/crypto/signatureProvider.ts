/**
 * Crypto & Signature Provider (Single Canonical Owner for visual signature normalization,
 * PKCS#12 parsing, PKCS#7 /ByteRange PDF signing, and REA Evidence-based verification).
 */
import forge from 'node-forge';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS, detectImageFormat, sanitizeSvgMarkup } from '../../contracts/schemas.ts';
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
  let safeBytes = rawBytes;
  if (fmt === 'svg') {
    const svgText = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
    const sanitizedSvg = sanitizeSvgMarkup(svgText);
    if (!sanitizedSvg.ok) return err(sanitizedSvg.error);
    let cleanText = sanitizedSvg.value;
    if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
      const parsed = new DOMParser().parseFromString(cleanText, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName.toLowerCase() !== 'svg') {
        return err({
          code: 'ImageDecodeFailed',
          message: 'Structure XML/SVG invalide ou corrompue.',
        });
      }
      const forbiddenTags = new Set([
        'script',
        'foreignobject',
        'iframe',
        'object',
        'embed',
        'applet',
        'frame',
        'frameset',
        'meta',
        'base',
        'link',
        'animate',
        'set',
      ]);
      const allEls = Array.from(parsed.querySelectorAll('*'));
      for (const el of allEls) {
        if (forbiddenTags.has(el.localName.toLowerCase())) {
          return err({
            code: 'ImageDecodeFailed',
            message: `Élément SVG non autorisé (${el.localName}) rejeté par sécurité.`,
          });
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          const val = attr.value.trim();
          if (name.startsWith('on')) {
            return err({
              code: 'ImageDecodeFailed',
              message: `Attribut événement SVG non autorisé (${attr.name}).`,
            });
          }
          if ((name === 'href' || name === 'xlink:href' || name === 'src') && val && !val.startsWith('#')) {
            return err({
              code: 'ImageDecodeFailed',
              message: 'Référence externe interdite dans les attributs SVG.',
            });
          }
        }
      }
      cleanText = new XMLSerializer().serializeToString(parsed.documentElement);
    }
    safeBytes = new TextEncoder().encode(cleanText);
  }

  const mime =
    fmt === 'png'
      ? 'image/png'
      : fmt === 'jpeg'
        ? 'image/jpeg'
        : fmt === 'webp'
          ? 'image/webp'
          : 'image/svg+xml';

  try {
    const copy = new Uint8Array(safeBytes.byteLength);
    copy.set(safeBytes);
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
      id: `sig-${crypto.randomUUID()}`,
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
    id: `sig-${crypto.randomUUID()}`,
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
  const serialBytes = new Uint8Array(16);
  crypto.getRandomValues(serialBytes);
  serialBytes[0] = (serialBytes[0] & 0x7f) | 0x01; // positive non-zero ASN.1 serial
  cert.serialNumber = Array.from(serialBytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
    algorithm: 'aes256',
    count: 25_000,
    saltSize: 16,
    friendlyName: commonName.trim() || 'OpenPDF Signer',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i);
  return out;
}

const SIGNATURE_HEX_CAPACITY = 16384; // 8192 raw DER bytes

function findLastAsciiSubarray(haystack: Uint8Array, needleStr: string): number {
  const needle = new TextEncoder().encode(needleStr);
  outer: for (let i = haystack.length - needle.length; i >= 0; i--) {
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
    const contentsStart = findLastAsciiSubarray(saved, contentsNeedle);
    if (contentsStart === -1) {
      return err({
        code: 'ByteRangeComputationFailed',
        message: 'Impossible de localiser le tampon /Contents dans le flux PDF généré.',
      });
    }
    const contentsEnd = contentsStart + contentsNeedle.length;

    const brMarker = '[ 0 1000000001 1000000002 1000000003 ]';
    const brStart = findLastAsciiSubarray(saved, brMarker);
    if (brStart === -1 || Math.abs(contentsStart - brStart) > 4096) {
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

function resolveDigestDescriptor(digestOid: string): {
  readonly label: string;
  readonly webCryptoAlg: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  readonly createForgeMd: () => forge.md.MessageDigest;
  readonly deprecated?: boolean;
} | null {
  switch (digestOid) {
    case forge.pki.oids.sha256:
      return { label: 'SHA-256', webCryptoAlg: 'SHA-256', createForgeMd: () => forge.md.sha256.create() };
    case forge.pki.oids.sha384:
      return { label: 'SHA-384', webCryptoAlg: 'SHA-384', createForgeMd: () => forge.md.sha384.create() };
    case forge.pki.oids.sha512:
      return { label: 'SHA-512', webCryptoAlg: 'SHA-512', createForgeMd: () => forge.md.sha512.create() };
    case forge.pki.oids.sha1:
      return {
        label: 'SHA-1 (obsolète)',
        webCryptoAlg: 'SHA-1',
        createForgeMd: () => forge.md.sha1.create(),
        deprecated: true,
      };
    default:
      return null;
  }
}

function selectMatchingSignerCert(
  certs: forge.pki.Certificate[],
  issuerAsn1: forge.asn1.Asn1 | undefined,
  serialRaw: string | undefined
): forge.pki.Certificate | null {
  if (certs.length === 0) return null;
  if (issuerAsn1 && serialRaw) {
    const targetIssuerDer = forge.asn1.toDer(issuerAsn1).getBytes();
    const targetSerial = forge.util.bytesToHex(serialRaw).replace(/^0+/, '').toLowerCase();
    for (const c of certs) {
      const certIssuerDer = forge.asn1.toDer(forge.pki.distinguishedNameToAsn1(c.issuer)).getBytes();
      const certSerial = c.serialNumber.replace(/^0+/, '').toLowerCase();
      if (certIssuerDer === targetIssuerDer && certSerial === targetSerial) {
        return c;
      }
    }
    return null;
  }
  return certs[0];
}

async function computeBytesDigestHex(
  data: Uint8Array,
  alg: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const hashBuf = await crypto.subtle.digest(alg, copy.buffer);
  return Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
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
  const rawMatches = Array.from(latin1.matchAll(brRegex));
  let sigIdx = 0;

  for (const match of rawMatches) {
    sigIdx++;
    const a = Number(match[1]);
    const b = Number(match[2]);
    const c = Number(match[3]);
    const d = Number(match[4]);
    const byteRange: [number, number, number, number] = [a, b, c, d];
    const matchIndex = match.index ?? 0;

    const windowStart = Math.max(0, matchIndex - 400);
    const windowEnd = Math.min(latin1.length, matchIndex + 24000);
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

    const boundsValid =
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      Number.isSafeInteger(c) &&
      Number.isSafeInteger(d) &&
      a === 0 &&
      b > 0 &&
      c >= a + b &&
      d > 0 &&
      c + d <= pdfBytes.length;

    if (!boundsValid) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'tampered',
        observations: [`/ByteRange [${a} ${b} ${c} ${d}] invalide ou hors limites du fichier (${pdfBytes.length} octets).`],
        derivations,
        unknowns,
        certificate: null,
      });
      continue;
    }

    // Strict Gap Injection protection: [a+b, c) must contain ONLY the /Contents <hex> token
    const gapText = new TextDecoder('latin1').decode(pdfBytes.subarray(a + b, c));
    const trimmedGap = gapText.trim();
    if (!/^<([0-9a-fA-F\s]+)>$/.test(trimmedGap)) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'tampered',
        observations: [
          `/ByteRange [${a} ${b} ${c} ${d}] suspect : données non signées injectées dans l'interstice /Contents.`,
        ],
        derivations,
        unknowns,
        certificate: null,
      });
      continue;
    }
    const hexMatch = /^<([0-9a-fA-F\s]+)>$/.exec(trimmedGap);
    if (!hexMatch) {
      results.push({
        fieldName,
        byteRange,
        subFilter,
        status: 'unknown',
        observations: [`/ByteRange [${a} ${b} ${c} ${d}] détecté, mais flux hexadécimal /Contents introuvable.`],
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

    const trailingUnsignedBytes = pdfBytes.length - (c + d);
    const covered = new Uint8Array(b + d);
    covered.set(pdfBytes.subarray(a, a + b), 0);
    covered.set(pdfBytes.subarray(c, c + d), b);

    try {
      const asn1 = forge.asn1.fromDer(uint8ToBinaryString(cmsBytes));
      const p7 = forge.pkcs7.messageFromAsn1(asn1) as unknown as {
        certificates?: forge.pki.Certificate[];
        rawCapture?: {
          digestAlgorithm?: string;
          issuer?: forge.asn1.Asn1;
          serial?: string;
          signature?: string;
          authenticatedAttributes?: forge.asn1.Asn1[];
        };
      };

      const digestOid = p7.rawCapture?.digestAlgorithm
        ? forge.asn1.derToOid(p7.rawCapture.digestAlgorithm)
        : forge.pki.oids.sha256;
      const digestDesc = resolveDigestDescriptor(digestOid);
      if (!digestDesc) {
        results.push({
          fieldName,
          byteRange,
          subFilter,
          status: 'unknown',
          observations: [...observations, `Algorithme de condensat CMS non approuvé ou inconnu (${digestOid}).`],
          derivations,
          unknowns,
          certificate: null,
        });
        continue;
      }

      if (digestDesc.deprecated) {
        derivations.push('Attention : cette signature utilise SHA-1 (algorithme cryptographique déprécié).');
      }

      const observedDigestHex = await computeBytesDigestHex(covered, digestDesc.webCryptoAlg);
      observations.push(`Condensat ${digestDesc.label} observé des plages signées : ${observedDigestHex.slice(0, 24)}…`);

      const certs = p7.certificates ?? [];
      const signerCert = selectMatchingSignerCert(certs, p7.rawCapture?.issuer, p7.rawCapture?.serial);
      const certMeta = signerCert ? extractCertificateMetadata(signerCert) : null;
      if (certMeta && signerCert) {
        derivations.push(
          `Certificat X.509 extrait : CN="${certMeta.subjectCommonName}", Émetteur="${certMeta.issuerCommonName}" (${certMeta.isSelfSigned ? 'auto-signé' : 'chaîne CA'}).`
        );
        const now = Date.now();
        if (now < signerCert.validity.notBefore.getTime() || now > signerCert.validity.notAfter.getTime()) {
          derivations.push('Certificat hors période de validité (expiré ou pas encore valide).');
        }
      } else if (certs.length > 0) {
        derivations.push('Aucun certificat embarqué ne correspond à l’émetteur/numéro de série du SignerInfo CMS.');
      }

      // Inspect authenticatedAttributes messageDigest (OID 1.2.840.113549.1.9.4)
      const authAttrs = p7.rawCapture?.authenticatedAttributes ?? [];
      let embeddedDigestHex: string | null = null;
      for (const attr of authAttrs) {
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
      let nonRsaKey = false;
      if (signerCert && p7.rawCapture?.signature && authAttrs.length > 0) {
        const rsaPub = signerCert.publicKey as Partial<forge.pki.rsa.PublicKey>;
        if (typeof rsaPub.verify === 'function') {
          const setAsn1 = forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.SET,
            true,
            authAttrs
          );
          const setDer = forge.asn1.toDer(setAsn1).getBytes();
          const md = digestDesc.createForgeMd();
          md.update(setDer);
          cryptoSignatureValid = rsaPub.verify(md.digest().bytes(), p7.rawCapture.signature);
        } else {
          nonRsaKey = true;
        }
      }

      if (nonRsaKey) {
        results.push({
          fieldName,
          byteRange,
          subFilter,
          status: 'unknown',
          observations,
          derivations,
          unknowns: [...unknowns, 'Clé publique non-RSA (ECDSA/EdDSA) non vérifiée par ce validateur local.'],
          certificate: certMeta,
        });
      } else if (embeddedDigestHex !== null) {
        const digestMatches = embeddedDigestHex.toLowerCase() === observedDigestHex.toLowerCase();
        if (digestMatches && cryptoSignatureValid && trailingUnsignedBytes === 0) {
          observations.push(`Condensat ${digestDesc.label}, /ByteRange intégral et signature RSA CMS valides.`);
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
          if (trailingUnsignedBytes > 0) {
            observations.push(
              `Attention : ${trailingUnsignedBytes} octet(s) non couverts par le /ByteRange en fin de fichier (modification incrémentale ou attaque Shadow détectée).`
            );
          } else if (!digestMatches) {
            observations.push(
              `Discordance de condensat : signé=${embeddedDigestHex.slice(0, 16)}… vs observé=${observedDigestHex.slice(0, 16)}… (document modifié après signature).`
            );
          } else {
            observations.push('La signature cryptographique RSA sur les attributs authentifiés est invalide.');
          }
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
