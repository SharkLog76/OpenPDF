/**
 * Boundary Admission Limits & Format Magic-Byte Validators (Single Canonical Owner).
 */
import { err, ok, type Result } from '../domain/result.ts';
import type { DomainError } from './errors.ts';

export const ADMISSION_LIMITS = {
  MAX_PDF_BYTES: 256 * 1024 * 1024, // 256 MiB
  MAX_MERGE_TOTAL_BYTES: 512 * 1024 * 1024, // 512 MiB
  MAX_EMBED_IMAGE_BYTES: 25 * 1024 * 1024, // 25 MiB
  MAX_SIGNATURE_IMAGE_BYTES: 5 * 1024 * 1024, // 5 MiB
  MAX_CERT_BYTES: 1 * 1024 * 1024, // 1 MiB
  MAX_RENDER_CACHE_PAGES: 12,
  MAX_LEDGER_HISTORY: 200,
} as const;

export type DetectedImageFormat = 'png' | 'jpeg' | 'webp' | 'svg';

/**
 * Validates that raw bytes represent a PDF header ("%PDF-") within the first 1024 bytes
 * per ISO 32000-1 and do not exceed the PDF admission byte budget.
 */
export function validatePdfAdmission(
  bytes: Uint8Array,
  maxBytes: number = ADMISSION_LIMITS.MAX_PDF_BYTES
): Result<{ readonly headerVersion: string | null }, DomainError> {
  if (bytes.byteLength === 0) {
    return err({
      code: 'EmptyFile',
      message: 'Le fichier sélectionné est vide (0 octet).',
    });
  }
  if (bytes.byteLength > maxBytes) {
    return err({
      code: 'FileTooLarge',
      message: `Le fichier PDF dépasse le budget d'admission (${Math.round(bytes.byteLength / (1024 * 1024))} Mo > ${Math.round(maxBytes / (1024 * 1024))} Mo).`,
      byteLength: bytes.byteLength,
      maxBytes,
    });
  }

  const scanLimit = Math.min(bytes.byteLength, 1024);
  const needle = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  let foundAt = -1;

  for (let i = 0; i <= scanLimit - needle.length; i++) {
    if (
      bytes[i] === needle[0] &&
      bytes[i + 1] === needle[1] &&
      bytes[i + 2] === needle[2] &&
      bytes[i + 3] === needle[3] &&
      bytes[i + 4] === needle[4]
    ) {
      foundAt = i;
      break;
    }
  }

  if (foundAt === -1) {
    return err({
      code: 'InvalidPdfHeader',
      message: 'En-tête %PDF- introuvable dans les 1024 premiers octets. Ce fichier n’est pas un PDF valide.',
    });
  }

  // Extract up to 5 bytes after "%PDF-" e.g. "1.7" or "2.0"
  let versionStr = '';
  for (let j = foundAt + 5; j < Math.min(bytes.byteLength, foundAt + 12); j++) {
    const ch = bytes[j];
    if (ch === 0x0a || ch === 0x0d || ch === 0x20) break;
    versionStr += String.fromCharCode(ch);
  }
  const headerVersion = /^\d+\.\d+$/.test(versionStr) ? versionStr : null;

  return ok({ headerVersion });
}

/**
 * Inspects magic bytes of an image or signature file (never trusting file extension alone).
 */
export function detectImageFormat(
  bytes: Uint8Array,
  maxBytes: number = ADMISSION_LIMITS.MAX_SIGNATURE_IMAGE_BYTES
): Result<DetectedImageFormat, DomainError> {
  if (bytes.byteLength === 0) {
    return err({ code: 'EmptyFile', message: 'Le fichier image est vide.' });
  }
  if (bytes.byteLength > maxBytes) {
    return err({
      code: 'SignatureImageTooLarge',
      message: `Le fichier signature dépasse le budget autorisé (${Math.round(maxBytes / (1024 * 1024))} Mo).`,
      byteLength: bytes.byteLength,
      maxBytes,
    });
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ok('png');
  }

  // JPEG: FF D8 FF
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return ok('jpeg');
  }

  // WebP: RIFF....WEBP
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return ok('webp');
  }

  // SVG: XML/UTF-8 text beginning (after optional BOM/XML decl/comments) with <svg
  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 2048)))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (/<!\s*(doctype|entity)/i.test(headText) || /<html[\s>]/i.test(headText)) {
    return err({
      code: 'UnsupportedSignatureFileFormat',
      message: 'Fichier SVG rejeté : déclarations XML dangereuses ou document HTML détecté.',
    });
  }
  const strippedProlog = headText
    .replace(/^(?:<\?xml[^?]*\?>\s*)*/i, '')
    .replace(/^(?:<!--[\s\S]*?-->\s*)*/, '');
  if (/^<svg[\s>]/i.test(strippedProlog)) {
    return ok('svg');
  }

  return err({
    code: 'UnsupportedSignatureFileFormat',
    message: 'Format de fichier signature non pris en charge (formats admis : PNG, SVG, JPEG, WebP).',
  });
}

/**
 * Validates and normalizes an external hyperlink URI for PDF annotations.
 * Allows strictly http:, https:, and mailto: schemes; rejects javascript:, file:, UNC, and embedded credentials.
 */
export function sanitizeSafeLinkUrl(rawUrl: string): Result<string, DomainError> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return err({ code: 'UnsafeUrl', message: 'L’URL du lien est vide.' });
  }
  // Reject ASCII control characters, backslashes (UNC / Windows traversal), and angle brackets
  if (/[\u0000-\u001F\u007F\\<>]/.test(trimmed)) {
    return err({
      code: 'UnsafeUrl',
      message: 'URL invalide : caractères de contrôle ou chemins locaux interdits.',
    });
  }

  const candidate =
    trimmed.includes('://') || trimmed.toLowerCase().startsWith('mailto:')
      ? trimmed
      : trimmed.toLowerCase().startsWith('www.')
        ? `https://${trimmed}`
        : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return err({
      code: 'UnsafeUrl',
      message: `URL invalide ou schéma manquant (utilisez https://, http:// ou mailto:) : "${trimmed}".`,
    });
  }

  const proto = parsed.protocol.toLowerCase();
  if (proto !== 'https:' && proto !== 'http:' && proto !== 'mailto:') {
    return err({
      code: 'UnsafeUrl',
      message: `Protocole interdit (${parsed.protocol}) : seuls https://, http:// et mailto: sont autorisés.`,
    });
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return err({
      code: 'UnsafeUrl',
      message: 'Les URLs contenant des identifiants intégrés (user:pass@) sont interdites.',
    });
  }

  if ((proto === 'http:' || proto === 'https:') && !parsed.hostname) {
    return err({
      code: 'UnsafeUrl',
      message: 'Nom d’hôte manquant dans l’URL.',
    });
  }

  return ok(parsed.toString());
}

/**
 * Fail-closed validator for SVG signature files before rasterization.
 * Rejects XXE/DOCTYPE entities, scripts, foreignObject/iframe/embed, inline JS handlers, and external URLs.
 */
export function sanitizeSvgMarkup(rawSvg: string): Result<string, DomainError> {
  const normalized = rawSvg.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : caractères de contrôle illégaux détectés.',
    });
  }
  if (/<!\s*(doctype|entity)/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : DOCTYPE et ENTITY XML interdits.',
    });
  }
  if (/<\s*(script|foreignObject|iframe|object|embed|applet|frame|frameset|meta|base|link|animate|set)\b/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : balise active ou embarquée interdite (script, foreignObject, iframe...).',
    });
  }
  if (/\bon[a-z]{2,}\s*=/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : gestionnaires d’événements inline (onload, onclick, etc.) interdits.',
    });
  }
  if (/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : URI scriptable interdite.',
    });
  }
  // Block external resource fetches from inside an offline vector signature
  if (/(?:href|xlink:href|src)\s*=\s*["']\s*(?!#)(?!data:image\/(?:png|jpeg|webp);base64,)[^"']+["']/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : références externes interdites dans une signature vectorielle.',
    });
  }
  if (/url\(\s*["']?\s*(?!#)(?:https?:|file:|\/\/)/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'SVG rejeté : chargement CSS externe interdit dans une signature vectorielle.',
    });
  }
  if (!/<svg[\s>]/i.test(normalized)) {
    return err({
      code: 'ImageDecodeFailed',
      message: 'Contenu SVG racine (<svg>) introuvable.',
    });
  }

  return ok(normalized);
}

/**
 * Parses a 1-based page range expression such as "1-3, 5, 7-9" into sorted unique 0-based page indices.
 */
export function parsePageRangeExpression(expr: string, totalPages: number): Result<number[], DomainError> {
  const trimmed = expr.trim();
  if (!trimmed) {
    return err({ code: 'InvalidPageRange', message: 'Veuillez indiquer une plage de pages (ex: 1-3, 5).' });
  }
  const indices = new Set<number>();
  const parts = trimmed.split(',');
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < start || end > totalPages) {
        return err({
          code: 'InvalidPageRange',
          message: `Plage invalide "${token}" pour un document de ${totalPages} page(s).`,
        });
      }
      for (let p = start; p <= end; p++) indices.add(p - 1);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const p = Number(token);
      if (p < 1 || p > totalPages) {
        return err({
          code: 'InvalidPageRange',
          message: `Numéro de page ${p} hors limites (1 à ${totalPages}).`,
        });
      }
      indices.add(p - 1);
      continue;
    }
    return err({
      code: 'InvalidPageRange',
      message: `Syntaxe de plage invalide : "${token}". Utilisez par exemple "1-3, 5".`,
    });
  }

  if (indices.size === 0) {
    return err({ code: 'InvalidPageRange', message: 'Aucune page valide sélectionnée.' });
  }
  return ok(Array.from(indices).sort((a, b) => a - b));
}
