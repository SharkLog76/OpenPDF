/**
 * PDF-Lib Structural Mutator Provider (Encapsulates pdf-lib behind Domain & Contracts).
 * Compiles full non-destructive EditorDocumentState + Visual Signatures into validated PDF bytes.
 */
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { ADMISSION_LIMITS, parsePageRangeExpression } from '../../contracts/schemas.ts';
import type { DomainError } from '../../contracts/errors.ts';
import {
  normalizedRectToPdfPoints,
  type AcroFormFieldDescriptor,
  type EditorDocumentState,
  type PageTransformState,
  type PdfStandardFamily,
} from '../../domain/editor.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type { SignaturePlacement, VisualSignatureAsset } from '../../domain/signing.ts';

function hexToRgbColor(hex: string) {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return rgb(0.1, 0.1, 0.12);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function resolveStandardFontEnum(family: PdfStandardFamily, bold: boolean, italic: boolean): StandardFonts {
  if (family === 'TimesRoman') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (family === 'Courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Reads AcroForm fields from PDF bytes without mutating them.
 */
export async function inspectAcroFormFields(
  pdfBytes: Uint8Array
): Promise<Result<{ readonly fields: AcroFormFieldDescriptor[]; readonly hasExistingSignatures: boolean }, DomainError>> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const form = doc.getForm();
    const rawFields = form.getFields();
    const fields: AcroFormFieldDescriptor[] = [];
    let hasExistingSignatures = false;

    for (const f of rawFields) {
      const ctorName = f.constructor.name;
      const name = f.getName();
      if (ctorName === 'PDFSignature') {
        hasExistingSignatures = true;
      }

      if (ctorName === 'PDFTextField') {
        const tf = form.getTextField(name);
        fields.push({
          name,
          kind: 'text',
          value: tf.getText() ?? '',
          readOnly: tf.isReadOnly(),
        });
      } else if (ctorName === 'PDFCheckBox') {
        const cb = form.getCheckBox(name);
        fields.push({
          name,
          kind: 'checkbox',
          value: cb.isChecked(),
          readOnly: cb.isReadOnly(),
        });
      } else if (ctorName === 'PDFDropdown') {
        const dd = form.getDropdown(name);
        const sel = dd.getSelected();
        fields.push({
          name,
          kind: 'dropdown',
          value: sel[0] ?? '',
          options: dd.getOptions(),
          readOnly: dd.isReadOnly(),
        });
      } else if (ctorName === 'PDFRadioGroup') {
        const rg = form.getRadioGroup(name);
        fields.push({
          name,
          kind: 'radio',
          value: rg.getSelected() ?? '',
          options: rg.getOptions(),
          readOnly: rg.isReadOnly(),
        });
      } else if (ctorName !== 'PDFSignature') {
        fields.push({ name, kind: 'unknown', value: '', readOnly: f.isReadOnly() });
      }
    }

    if (!hasExistingSignatures) {
      const textView = new TextDecoder('latin1').decode(pdfBytes);
      if (textView.includes('/Type /Sig') || textView.includes('/Type/Sig') || textView.includes('/ByteRange')) {
        hasExistingSignatures = true;
      }
    }

    return ok({ fields, hasExistingSignatures });
  } catch (e: unknown) {
    return err({
      code: 'CorruptedPdf',
      message: 'Impossible de lire les champs de formulaire du PDF.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Merges multiple admitted PDF byte arrays into a single PDF document.
 */
export async function mergePdfDocuments(sources: readonly Uint8Array[]): Promise<Result<Uint8Array, DomainError>> {
  const totalBytes = sources.reduce((acc, s) => acc + s.byteLength, 0);
  if (totalBytes > ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES) {
    return err({
      code: 'MergeBudgetExceeded',
      message: `La somme des fichiers à fusionner dépasse ${Math.round(ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES / (1024 * 1024))} Mo.`,
      totalBytes,
      maxBytes: ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES,
    });
  }

  try {
    const merged = await PDFDocument.create();
    for (const srcBytes of sources) {
      const srcDoc = await PDFDocument.load(srcBytes);
      const indices = srcDoc.getPageIndices();
      const copied = await merged.copyPages(srcDoc, indices);
      for (const p of copied) merged.addPage(p);
    }
    return ok(await merged.save());
  } catch (e: unknown) {
    return err({
      code: 'ExportSerializationFailed',
      message: 'Échec lors de la fusion des documents PDF.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Inserts pages from another PDF at a specific 0-based page index inside baseBytes.
 */
export async function insertPdfPagesAtIndex(
  baseBytes: Uint8Array,
  extraBytes: Uint8Array,
  insertAtIndex: number
): Promise<Result<Uint8Array, DomainError>> {
  if (baseBytes.byteLength + extraBytes.byteLength > ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES) {
    return err({
      code: 'MergeBudgetExceeded',
      message: `La taille totale dépasse le budget autorisé (${Math.round(ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES / (1024 * 1024))} Mo).`,
      totalBytes: baseBytes.byteLength + extraBytes.byteLength,
      maxBytes: ADMISSION_LIMITS.MAX_MERGE_TOTAL_BYTES,
    });
  }
  try {
    const baseDoc = await PDFDocument.load(baseBytes);
    const extraDoc = await PDFDocument.load(extraBytes);
    const copied = await baseDoc.copyPages(extraDoc, extraDoc.getPageIndices());
    const clampedIdx = Math.min(Math.max(0, insertAtIndex), baseDoc.getPageCount());
    copied.forEach((p, offset) => baseDoc.insertPage(clampedIdx + offset, p));
    return ok(await baseDoc.save());
  } catch (e: unknown) {
    return err({
      code: 'ExportSerializationFailed',
      message: 'Impossible d’insérer les pages du PDF externe.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Extracts a 1-based page range expression (e.g. "1-2, 4") into a new PDF.
 */
export async function extractPdfPageRange(
  sourceBytes: Uint8Array,
  rangeExpr: string
): Promise<Result<Uint8Array, DomainError>> {
  try {
    const srcDoc = await PDFDocument.load(sourceBytes);
    const parsed = parsePageRangeExpression(rangeExpr, srcDoc.getPageCount());
    if (!parsed.ok) return err(parsed.error);

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, parsed.value);
    for (const p of copied) outDoc.addPage(p);
    return ok(await outDoc.save());
  } catch (e: unknown) {
    return err({
      code: 'ExportSerializationFailed',
      message: 'Échec lors de l’extraction des pages.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

export interface CompileExportOptions {
  readonly flattenForms?: boolean;
  readonly visualSignatures?: readonly {
    readonly placement: SignaturePlacement;
    readonly asset: VisualSignatureAsset;
  }[];
}

/**
 * Compiles source PDF bytes + full EditorDocumentState + visual signatures into a fresh PDF Uint8Array.
 * Never mutates the caller's source bytes in place.
 */
export async function compileEditedPdf(
  sourceBytes: Uint8Array,
  editorState: EditorDocumentState,
  options: CompileExportOptions = {}
): Promise<Result<Uint8Array, DomainError>> {
  try {
    if (editorState.pages.length === 0) {
      return err({
        code: 'CannotDeleteLastPage',
        message: 'Un document PDF doit contenir au moins une page.',
      });
    }

    const originalDoc = await PDFDocument.load(sourceBytes);
    const targetDoc = originalDoc;

    const isIdentityPageOrder =
      editorState.pages.length === originalDoc.getPageCount() &&
      editorState.pages.every(
        (p, idx) => (p.kind ?? 'source') === 'source' && p.sourceDocIndex === 0 && p.sourcePageIndex === idx
      );

    if (!isIdentityPageOrder) {
      const seenSourceIndices = new Set<number>();
      const resolvedPages: PDFPage[] = [];

      for (const pState of editorState.pages) {
        if (pState.kind === 'blank' || pState.sourcePageIndex < 0) {
          const w = pState.blankSizePt?.widthPt ?? 595.28;
          const h = pState.blankSizePt?.heightPt ?? 841.89;
          const blank = originalDoc.addPage([w, h]);
          resolvedPages.push(blank);
        } else if (!seenSourceIndices.has(pState.sourcePageIndex)) {
          seenSourceIndices.add(pState.sourcePageIndex);
          resolvedPages.push(originalDoc.getPage(pState.sourcePageIndex));
        } else {
          const [cloned] = await originalDoc.copyPages(originalDoc, [pState.sourcePageIndex]);
          resolvedPages.push(cloned);
        }
      }

      for (let i = originalDoc.getPageCount() - 1; i >= 0; i--) {
        originalDoc.removePage(i);
      }
      for (const page of resolvedPages) {
        originalDoc.addPage(page);
      }
    }

    for (let i = 0; i < editorState.pages.length; i++) {
      const st: PageTransformState = editorState.pages[i];
      if (st.addedRotation !== 0) {
        const page = targetDoc.getPage(i);
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + st.addedRotation) % 360));
      }
    }

    const pages = targetDoc.getPages();

    // Create newly added AcroForm fields before setting formValues
    const form = targetDoc.getForm();
    for (const cf of editorState.createdFormFields ?? []) {
      const page = pages[cf.pageIndex];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(cf.rect, pw, ph);
      if (cf.kind === 'checkbox') {
        const cb = form.createCheckBox(cf.fieldName);
        if (Boolean(cf.defaultValue)) cb.check();
        cb.addToPage(page, { x: box.x, y: box.y, width: Math.max(14, Math.min(box.width, box.height)), height: Math.max(14, Math.min(box.width, box.height)) });
      } else {
        const tf = form.createTextField(cf.fieldName);
        if (typeof cf.defaultValue === 'string' && cf.defaultValue) tf.setText(cf.defaultValue);
        tf.addToPage(page, { x: box.x, y: box.y, width: Math.max(40, box.width), height: Math.max(18, box.height) });
      }
    }

    // Apply AcroForm values if present
    try {
      for (const [fieldName, value] of Object.entries(editorState.formValues)) {
        try {
          const field = form.getField(fieldName);
          const ctorName = field.constructor.name;
          if (ctorName === 'PDFTextField' && typeof value === 'string') {
            form.getTextField(fieldName).setText(value);
          } else if (ctorName === 'PDFCheckBox' && typeof value === 'boolean') {
            const cb = form.getCheckBox(fieldName);
            if (value) cb.check();
            else cb.uncheck();
          } else if (ctorName === 'PDFDropdown' && typeof value === 'string') {
            form.getDropdown(fieldName).select(value);
          } else if (ctorName === 'PDFRadioGroup' && typeof value === 'string') {
            form.getRadioGroup(fieldName).select(value);
          }
        } catch {
          // Ignore fields absent after page deletion
        }
      }
      if (options.flattenForms) {
        form.flatten();
      }
    } catch {
      // Document may not have an AcroForm
    }

    const fontCache = new Map<string, PDFFont>();
    const getFont = async (
      family: PdfStandardFamily,
      bold: boolean = false,
      italic: boolean = false
    ): Promise<PDFFont> => {
      const key = `${family}:${bold ? 'B' : ''}${italic ? 'I' : ''}`;
      const existing = fontCache.get(key);
      if (existing) return existing;
      const embedded = await targetDoc.embedFont(resolveStandardFontEnum(family, bold, italic));
      fontCache.set(key, embedded);
      return embedded;
    };

    // 1. Optional Page Background tint (semi-transparent overlay or solid on blank pages)
    if (editorState.pageBackground?.enabled) {
      const bgColor = hexToRgbColor(editorState.pageBackground.colorHex);
      pages.forEach((page, idx) => {
        const { width: pw, height: ph } = page.getSize();
        const isBlank = editorState.pages[idx]?.kind === 'blank';
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pw,
          height: ph,
          color: bgColor,
          opacity: isBlank ? 1 : 0.18,
        });
      });
    }

    // 2. Existing PDF text edits (cover original bbox with sampled background color + redraw edited text)
    for (let pIdx = 0; pIdx < editorState.pages.length; pIdx++) {
      const pageState = editorState.pages[pIdx];
      const page = pages[pIdx];
      if (!page || !pageState) continue;
      const { width: pw, height: ph } = page.getSize();

      const pageEdits = Object.values(editorState.existingTextEdits ?? {}).filter(
        (ed) => ed.pageUid === pageState.uid
      );
      for (const ed of pageEdits) {
        const origBox = normalizedRectToPdfPoints(ed.originalRect, pw, ph);
        page.drawRectangle({
          x: origBox.x - 1,
          y: origBox.y - 1,
          width: origBox.width + 2,
          height: origBox.height + 2,
          color: hexToRgbColor(ed.backgroundHex),
        });
        if (!ed.deleted && ed.currentText.length > 0) {
          const nextBox = normalizedRectToPdfPoints(ed.currentRect, pw, ph);
          const font = await getFont(ed.fontFamily, ed.bold, ed.italic);
          page.drawText(ed.currentText, {
            x: nextBox.x,
            y: Math.max(4, nextBox.y + nextBox.height - ed.fontSizePt),
            size: ed.fontSizePt,
            font,
            color: hexToRgbColor(ed.colorHex),
            maxWidth: Math.max(30, nextBox.width + 8),
            lineHeight: ed.fontSizePt * 1.25,
          });
        }
      }
    }

    // 3. Whiteout / Redaction rectangles
    for (const wo of editorState.whiteouts ?? []) {
      const page = pages[wo.pageIndex];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(wo.rect, pw, ph);
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: hexToRgbColor(wo.fillHex),
      });
    }

    // 4. Annotations
    for (const ann of editorState.annotations) {
      const page: PDFPage | undefined = pages[ann.pageIndex];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(ann.rect, pw, ph);
      const color = hexToRgbColor(ann.colorHex);

      if (ann.kind === 'highlight') {
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          color,
          opacity: ann.opacity ?? 0.35,
        });
      } else if (ann.kind === 'underline') {
        page.drawLine({
          start: { x: box.x, y: box.y + 2 },
          end: { x: box.x + box.width, y: box.y + 2 },
          thickness: Math.max(1.5, ann.strokeWidthPt),
          color,
        });
      } else if (ann.kind === 'strikeout') {
        page.drawLine({
          start: { x: box.x, y: box.y + box.height / 2 },
          end: { x: box.x + box.width, y: box.y + box.height / 2 },
          thickness: Math.max(1.5, ann.strokeWidthPt),
          color,
        });
      } else if (ann.kind === 'rect') {
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderColor: color,
          borderWidth: Math.max(1.5, ann.strokeWidthPt),
          opacity: ann.opacity ?? 0.9,
        });
      } else if (ann.kind === 'ellipse') {
        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: box.width / 2,
          yScale: box.height / 2,
          borderColor: color,
          borderWidth: Math.max(1.5, ann.strokeWidthPt),
        });
      } else if (ann.kind === 'note') {
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: Math.max(140, box.width),
          height: Math.max(48, box.height),
          color: rgb(1, 0.96, 0.72),
          borderColor: color,
          borderWidth: 1,
        });
        if (ann.noteText) {
          const font = await getFont('Helvetica');
          page.drawText(ann.noteText, {
            x: box.x + 6,
            y: box.y + Math.max(48, box.height) - 16,
            size: 9.5,
            font,
            color: rgb(0.15, 0.15, 0.15),
            maxWidth: Math.max(128, box.width - 12),
          });
        }
      } else if (ann.kind === 'freehand' && ann.points && ann.points.length >= 2) {
        for (let i = 1; i < ann.points.length; i++) {
          const prev = ann.points[i - 1];
          const curr = ann.points[i];
          page.drawLine({
            start: { x: prev.x * pw, y: ph - prev.y * ph },
            end: { x: curr.x * pw, y: ph - curr.y * ph },
            thickness: Math.max(1.5, ann.strokeWidthPt),
            color,
            opacity: ann.opacity ?? 0.95,
          });
        }
      }
    }

    // 5. Added text blocks
    for (const txt of editorState.texts) {
      const page = pages[txt.pageIndex];
      if (!page || !txt.text) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(txt.rect, pw, ph);
      const font = await getFont(txt.fontFamily, Boolean(txt.bold), Boolean(txt.italic));
      const lines = txt.text.split('\n');
      let cursorY = box.y + box.height - txt.fontSizePt;
      for (const line of lines) {
        const lineW = font.widthOfTextAtSize(line, txt.fontSizePt);
        let drawX = box.x;
        if (txt.align === 'center') drawX = box.x + Math.max(0, (box.width - lineW) / 2);
        else if (txt.align === 'right') drawX = box.x + Math.max(0, box.width - lineW);

        page.drawText(line, {
          x: drawX,
          y: cursorY,
          size: txt.fontSizePt,
          font,
          color: hexToRgbColor(txt.colorHex),
          maxWidth: Math.max(40, box.width),
        });
        cursorY -= txt.fontSizePt * 1.25;
      }
    }

    // 6. Inserted images
    for (const img of editorState.images) {
      const page = pages[img.pageIndex];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(img.rect, pw, ph);
      const embedded =
        img.mimeType === 'image/png'
          ? await targetDoc.embedPng(img.imageBytes)
          : await targetDoc.embedJpg(img.imageBytes);
      page.drawImage(embedded, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }

    // 7. Hyperlink annotations (/Subtype /Link)
    for (const link of editorState.links ?? []) {
      const page = pages[link.pageIndex];
      if (!page || !link.url.trim()) continue;
      const { width: pw, height: ph } = page.getSize();
      const box = normalizedRectToPdfPoints(link.rect, pw, ph);
      const linkAnnot = targetDoc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
        Border: [0, 0, 1],
        C: [0.15, 0.39, 0.92],
        A: {
          Type: PDFName.of('Action'),
          S: PDFName.of('URI'),
          URI: PDFString.of(link.url.trim()),
        },
      });
      const annotRef = targetDoc.context.register(linkAnnot);
      page.node.addAnnot(annotRef);
    }

    // 8. Watermark across all pages
    if (editorState.watermark?.enabled && editorState.watermark.text.trim()) {
      const wm = editorState.watermark;
      const font = await getFont('Helvetica', true, false);
      const color = hexToRgbColor(wm.colorHex);
      for (const page of pages) {
        const { width: pw, height: ph } = page.getSize();
        const textW = font.widthOfTextAtSize(wm.text, wm.fontSizePt);
        page.drawText(wm.text, {
          x: Math.max(20, (pw - textW * Math.cos((wm.angleDeg * Math.PI) / 180)) / 2),
          y: ph / 2,
          size: wm.fontSizePt,
          font,
          color,
          opacity: Math.min(1, Math.max(0.05, wm.opacity)),
          rotate: degrees(wm.angleDeg),
        });
      }
    }

    // 9. Headers & Footers across all pages ({page}, {total}, {date})
    if (editorState.headerFooter?.enabled) {
      const hf = editorState.headerFooter;
      const font = await getFont('Helvetica');
      const color = hexToRgbColor(hf.colorHex);
      const todayStr = new Date().toISOString().slice(0, 10);
      const total = pages.length;

      const formatToken = (tpl: string, pNum: number) =>
        tpl
          .replace(/\{page\}/gi, String(pNum))
          .replace(/\{total\}/gi, String(total))
          .replace(/\{date\}/gi, todayStr);

      pages.forEach((page, idx) => {
        const { width: pw, height: ph } = page.getSize();
        const pNum = idx + 1;
        const marginX = 32;

        const drawSlot = (raw: string, y: number, align: 'left' | 'center' | 'right') => {
          const txt = formatToken(raw, pNum).trim();
          if (!txt) return;
          const tw = font.widthOfTextAtSize(txt, hf.fontSizePt);
          const x =
            align === 'left'
              ? marginX
              : align === 'center'
                ? Math.max(marginX, (pw - tw) / 2)
                : Math.max(marginX, pw - marginX - tw);
          page.drawText(txt, { x, y, size: hf.fontSizePt, font, color });
        };

        drawSlot(hf.headerLeft, ph - 24, 'left');
        drawSlot(hf.headerCenter, ph - 24, 'center');
        drawSlot(hf.headerRight, ph - 24, 'right');
        drawSlot(hf.footerLeft, 16, 'left');
        drawSlot(hf.footerCenter, 16, 'center');
        drawSlot(hf.footerRight, 16, 'right');
      });
    }

    // 10. Visual signature placements
    if (options.visualSignatures && options.visualSignatures.length > 0) {
      const helvetica = await getFont('Helvetica');
      for (const { placement, asset } of options.visualSignatures) {
        const embeddedSig = await targetDoc.embedPng(asset.pngBytes);
        const targetPageIndices = placement.applyToAllPages
          ? pages.map((_, i) => i)
          : [placement.pageIndex];

        for (const pIdx of targetPageIndices) {
          const page = pages[pIdx];
          if (!page) continue;
          const { width: pw, height: ph } = page.getSize();
          const box = normalizedRectToPdfPoints(placement.rect, pw, ph);

          if (placement.metadata.showMetadataBox) {
            page.drawRectangle({
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              borderColor: rgb(0.24, 0.42, 0.72),
              borderWidth: 0.9,
              color: rgb(0.98, 0.99, 1),
              opacity: 0.92,
            });
            const metaHeight = Math.min(26, box.height * 0.35);
            page.drawImage(embeddedSig, {
              x: box.x + 4,
              y: box.y + metaHeight + 2,
              width: Math.max(10, box.width - 8),
              height: Math.max(10, box.height - metaHeight - 6),
            });
            const labelText = `Signé par ${placement.metadata.signerName || 'Signataire'} · ${placement.metadata.signedAtIso.slice(0, 10)}`;
            page.drawText(labelText, {
              x: box.x + 4,
              y: box.y + 13,
              size: 6.5,
              font: helvetica,
              color: rgb(0.18, 0.24, 0.34),
              maxWidth: Math.max(20, box.width - 8),
            });
            if (placement.metadata.reason) {
              page.drawText(placement.metadata.reason, {
                x: box.x + 4,
                y: box.y + 4,
                size: 6,
                font: helvetica,
                color: rgb(0.35, 0.4, 0.48),
                maxWidth: Math.max(20, box.width - 8),
              });
            }
          } else {
            page.drawImage(embeddedSig, {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            });
          }
        }
      }
    }

    // 11. Page CropBox
    if (editorState.pageCrop?.enabled) {
      const crop = editorState.pageCrop;
      for (const page of pages) {
        const { width: pw, height: ph } = page.getSize();
        const left = Math.max(0, crop.marginLeftPt);
        const bottom = Math.max(0, crop.marginBottomPt);
        const cropW = Math.max(72, pw - left - Math.max(0, crop.marginRightPt));
        const cropH = Math.max(72, ph - bottom - Math.max(0, crop.marginTopPt));
        page.setCropBox(left, bottom, cropW, cropH);
      }
    }

    const outBytes = await targetDoc.save({ useObjectStreams: false });
    return ok(outBytes);
  } catch (e: unknown) {
    return err({
      code: 'ExportSerializationFailed',
      message: 'Échec de compilation du document PDF modifié.',
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}
