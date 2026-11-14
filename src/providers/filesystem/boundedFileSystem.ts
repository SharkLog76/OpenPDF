/**
 * Bounded FileSystem & Admission Provider (Single Canonical Owner for raw PDF byte admission,
 * File System Access API overwrite/new-version saving, and SHA-256 identity).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ADMISSION_LIMITS, validatePdfAdmission } from '../../contracts/schemas.ts';
import type { DomainError } from '../../contracts/errors.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type { DocumentIdentity } from '../../domain/viewer.ts';

export type FileOriginHandle =
  | { readonly kind: 'tauri-path'; readonly path: string; readonly displayName: string }
  | { readonly kind: 'fs-handle'; readonly handle: FileSystemFileHandle; readonly displayName: string }
  | { readonly kind: 'memory'; readonly displayName: string }
  | { readonly kind: 'sample'; readonly displayName: string };

export function hasWritableDiskOrigin(origin: FileOriginHandle | null | undefined): boolean {
  return origin?.kind === 'tauri-path' || origin?.kind === 'fs-handle';
}

interface FsPickerWindow {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface AdmittedPdfDocument {
  readonly identity: DocumentIdentity;
  readonly bytes: Uint8Array;
}

/**
 * Derives an incremented version filename (e.g. "contrat.pdf" -> "contrat_v2.pdf", "contrat_v2.pdf" -> "contrat_v3.pdf").
 */
export function deriveNextVersionFilename(currentName: string): string {
  const clean = currentName.trim() || 'document.pdf';
  const withoutExt = clean.replace(/\.pdf$/i, '');
  const versionMatch = /^(.*)_v(\d+)$/i.exec(withoutExt);
  if (versionMatch) {
    const nextNum = Number(versionMatch[2]) + 1;
    return `${versionMatch[1]}_v${nextNum}.pdf`;
  }
  return `${withoutExt}_v2.pdf`;
}

/**
 * Admits raw PDF bytes against byte budgets and magic header checks,
 * returning an immutable copy and deterministic DocumentIdentity.
 */
export async function admitPdfBytes(
  rawBytes: Uint8Array,
  displayName: string,
  maxBytes: number = ADMISSION_LIMITS.MAX_PDF_BYTES
): Promise<Result<AdmittedPdfDocument, DomainError>> {
  const check = validatePdfAdmission(rawBytes, maxBytes);
  if (!check.ok) return err(check.error);

  const safeCopy = new Uint8Array(rawBytes.byteLength);
  safeCopy.set(rawBytes);

  const sha256 = await computeSha256Hex(safeCopy);
  return ok({
    identity: {
      sha256,
      byteLength: safeCopy.byteLength,
      displayName: displayName || 'document.pdf',
      headerVersion: check.value.headerVersion,
    },
    bytes: safeCopy,
  });
}

export async function admitPdfFile(
  file: File,
  maxBytes: number = ADMISSION_LIMITS.MAX_PDF_BYTES
): Promise<Result<AdmittedPdfDocument, DomainError>> {
  if (file.size === 0) {
    return err({ code: 'EmptyFile', message: 'Le fichier sélectionné est vide (0 octet).' });
  }
  if (file.size > maxBytes) {
    return err({
      code: 'FileTooLarge',
      message: `Le fichier "${file.name}" dépasse le budget d'admission (${Math.round(file.size / (1024 * 1024))} Mo > ${Math.round(maxBytes / (1024 * 1024))} Mo).`,
      byteLength: file.size,
      maxBytes,
    });
  }
  const buffer = await file.arrayBuffer();
  return admitPdfBytes(new Uint8Array(buffer), file.name, maxBytes);
}

/**
 * Checks whether the File System Access API picker is available in this host browser.
 */
export function supportsNativeFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as FsPickerWindow).showOpenFilePicker === 'function';
}

/**
 * Opens a PDF via native File System Access picker so we retain its FileSystemFileHandle
 * for optional explicit in-place overwrite ("Enregistrer").
 * Returns null if the user cancelled the picker, or falls back cleanly when unsupported.
 */
export async function openPdfWithNativePicker(): Promise<
  Result<{ readonly file: File; readonly handle: FileSystemFileHandle } | null, DomainError>
> {
  const win = typeof window !== 'undefined' ? (window as unknown as FsPickerWindow) : null;
  if (!win?.showOpenFilePicker) {
    return err({
      code: 'OverwriteHandleUnavailable',
      message: 'API File System Access non disponible dans ce navigateur.',
    });
  }

  try {
    const [handle] = await win.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Documents PDF', accept: { 'application/pdf': ['.pdf'] } }],
    });
    if (!handle) return ok(null);
    const file = await handle.getFile();
    return ok({ file, handle });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return ok(null);
    }
    return err({
      code: 'OverwriteFailed',
      message: 'Impossible d’ouvrir le sélecteur de fichiers natif.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Attempts to obtain a FileSystemFileHandle from a drag-and-drop DataTransferItem.
 */
export async function extractDropFileHandle(
  item: DataTransferItem | undefined
): Promise<FileSystemFileHandle | null> {
  if (!item) return null;
  const maybeItem = item as DataTransferItem & {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  };
  if (typeof maybeItem.getAsFileSystemHandle !== 'function') return null;
  try {
    const h = await maybeItem.getAsFileSystemHandle();
    if (h && h.kind === 'file') return h as FileSystemFileHandle;
    return null;
  } catch {
    return null;
  }
}

/**
 * Atomically overwrites the original PDF file using its FileSystemFileHandle
 * (FileSystemWritableFileStream stages a swap file and atomically commits on close()).
 */
export async function overwriteOriginalFile(
  handle: FileSystemFileHandle | null | undefined,
  bytes: Uint8Array
): Promise<Result<{ readonly byteLength: number; readonly fileName: string }, DomainError>> {
  if (!handle) {
    return err({
      code: 'OverwriteHandleUnavailable',
      message:
        'Aucun handle disque disponible pour écraser le fichier d’origine (utilisez "Enregistrer sous" ou ouvrez via "Fichier > Ouvrir").',
    });
  }

  try {
    const permHandle = handle as PermissionCapableHandle;
    if (typeof permHandle.queryPermission === 'function') {
      let state = await permHandle.queryPermission({ mode: 'readwrite' });
      if (state !== 'granted' && typeof permHandle.requestPermission === 'function') {
        state = await permHandle.requestPermission({ mode: 'readwrite' });
      }
      if (state !== 'granted') {
        return err({
          code: 'OverwritePermissionDenied',
          message: 'Autorisation d’écriture refusée sur le fichier d’origine.',
        });
      }
    }

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const writable = await handle.createWritable();
    await writable.write(copy);
    await writable.close();

    return ok({ byteLength: copy.byteLength, fileName: handle.name });
  } catch (e: unknown) {
    return err({
      code: 'OverwriteFailed',
      message: `Impossible d’écraser "${handle.name}".`,
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Saves bytes as a new file version using showSaveFilePicker when available,
 * falling back to browser download. Returns the new FileSystemFileHandle if created.
 */
export async function saveAsNewFileVersion(
  bytes: Uint8Array,
  suggestedName: string
): Promise<Result<{ readonly handle: FileSystemFileHandle | null; readonly fileName: string } | null, DomainError>> {
  const win = typeof window !== 'undefined' ? (window as unknown as FsPickerWindow) : null;
  if (win?.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const writable = await handle.createWritable();
      await writable.write(copy);
      await writable.close();
      return ok({ handle, fileName: handle.name });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return ok(null);
      }
      return err({
        code: 'OverwriteFailed',
        message: 'Échec de l’enregistrement de la nouvelle version.',
        cause: e instanceof Error ? e.message : String(e),
      });
    }
  }

  triggerBrowserDownload(bytes, suggestedName);
  return ok({ handle: null, fileName: suggestedName });
}

/**
 * Triggers a safe local download without mutating the source file on disk.
 */
export function triggerBrowserDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType: string = 'application/pdf'
): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Creates a clean blank 1-page A4 PDF document ("Fichier > Nouveau document vierge").
 */
export async function createBlankPdfBytes(
  widthPt: number = 595.28,
  heightPt: number = 841.89
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Nouveau document — OpenPDF');
  doc.setCreator('OpenPDF Local Studio');
  doc.addPage([widthPt, heightPt]);
  return doc.save();
}

/**
 * Generates a realistic 3-page sample PDF with an AcroForm and signature placeholder zone
 * so the user can immediately test Reading, Full Editing, Form Filling, and Signing.
 */
export async function createSamplePdfBytes(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Contrat de Prestation — Document de Démonstration OpenPDF');
  pdfDoc.setAuthor('OpenPDF Workspace');
  pdfDoc.setSubject('Validation Lecture, Édition complète, Formulaires & Signature PKCS#7');
  pdfDoc.setCreator('OpenPDF Local Studio');

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
  page1.drawRectangle({ x: 0, y: 760, width: 595.28, height: 81.89, color: rgb(0.11, 0.16, 0.25) });
  page1.drawText('OPENPDF — ACCORD DE PRESTATION & VALIDATION', {
    x: 42,
    y: 798,
    size: 15,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  page1.drawText('Document local-first de démonstration (Lecture · Modification complète · Formulaire · Signature)', {
    x: 42,
    y: 778,
    size: 10,
    font: helvetica,
    color: rgb(0.75, 0.83, 0.95),
  });

  page1.drawText('1. Objet du document', { x: 42, y: 715, size: 13, font: helveticaBold, color: rgb(0.1, 0.1, 0.14) });
  page1.drawText(
    'Ce document PDF A4 permet de tester immédiatement l’ensemble des capacités d’OpenPDF :',
    { x: 42, y: 693, size: 10.5, font: helvetica, color: rgb(0.2, 0.22, 0.26) }
  );
  page1.drawText('- Lecture haute fidélité, recherche plein texte, miniatures et rotation d’affichage.', {
    x: 54,
    y: 672,
    size: 10,
    font: helvetica,
    color: rgb(0.25, 0.27, 0.32),
  });
  page1.drawText('- Modification complète : cliquez sur n’importe quel texte existant ci-présent pour l’éditer.', {
    x: 54,
    y: 654,
    size: 10,
    font: helvetica,
    color: rgb(0.25, 0.27, 0.32),
  });
  page1.drawText('- Remplissage et création de formulaires AcroForm, filigrane, en-tête, biffure et signature PKCS#7.', {
    x: 54,
    y: 636,
    size: 10,
    font: helvetica,
    color: rgb(0.25, 0.27, 0.32),
  });

  page1.drawText('2. Formulaire AcroForm interactif', {
    x: 42,
    y: 590,
    size: 13,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.14),
  });

  const form = pdfDoc.getForm();
  page1.drawText('Nom du signataire :', { x: 42, y: 556, size: 10.5, font: helvetica, color: rgb(0.15, 0.15, 0.2) });
  const nameField = form.createTextField('signer_full_name');
  nameField.setText('Alexandre Martin');
  nameField.addToPage(page1, { x: 180, y: 546, width: 280, height: 24 });

  page1.drawText('Organisation :', { x: 42, y: 516, size: 10.5, font: helvetica, color: rgb(0.15, 0.15, 0.2) });
  const orgField = form.createTextField('organization');
  orgField.setText('OpenPDF Studio');
  orgField.addToPage(page1, { x: 180, y: 506, width: 280, height: 24 });

  page1.drawText('Bon pour accord :', { x: 42, y: 476, size: 10.5, font: helvetica, color: rgb(0.15, 0.15, 0.2) });
  const agreeCheck = form.createCheckBox('approved_terms');
  agreeCheck.check();
  agreeCheck.addToPage(page1, { x: 180, y: 472, width: 16, height: 16 });

  // Signature box guide
  page1.drawRectangle({
    x: 42,
    y: 120,
    width: 240,
    height: 105,
    borderColor: rgb(0.35, 0.45, 0.65),
    borderWidth: 1.2,
    color: rgb(0.96, 0.97, 0.99),
  });
  page1.drawText('Zone de Signature (Page 1)', {
    x: 54,
    y: 205,
    size: 9.5,
    font: helveticaBold,
    color: rgb(0.25, 0.35, 0.55),
  });
  page1.drawText('Utilisez l’atelier "Signer" pour déposer votre fichier signature.', {
    x: 54,
    y: 188,
    size: 8.5,
    font: helvetica,
    color: rgb(0.42, 0.46, 0.54),
  });

  // Page 2
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawText('Annexe A — Conditions Générales & Traçabilité REA', {
    x: 42,
    y: 785,
    size: 14,
    font: helveticaBold,
    color: rgb(0.11, 0.16, 0.25),
  });
  page2.drawText(
    'Toutes les opérations (lecture, édition complète, signature PKCS#7) sont exécutées localement sans transfert réseau.',
    { x: 42, y: 752, size: 10.5, font: helvetica, color: rgb(0.2, 0.22, 0.26) }
  );
  page2.drawText(
    'Vous pouvez réorganiser, pivoter, recadrer, insérer des pages vierges ou fusionner d’autres PDF.',
    { x: 42, y: 730, size: 10.5, font: helvetica, color: rgb(0.2, 0.22, 0.26) }
  );

  // Page 3
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  page3.drawText('Annexe B — Paraphe & Signature Finale', {
    x: 42,
    y: 785,
    size: 14,
    font: helveticaBold,
    color: rgb(0.11, 0.16, 0.25),
  });
  page3.drawText('Fait localement pour validation de bout en bout.', {
    x: 42,
    y: 752,
    size: 10.5,
    font: helvetica,
    color: rgb(0.2, 0.22, 0.26) }
  );

  return pdfDoc.save();
}
