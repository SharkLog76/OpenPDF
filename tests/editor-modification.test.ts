import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { CommandLedger, createInitialEditorState } from '../src/application/ledger/CommandLedger.ts';
import { parsePageRangeExpression } from '../src/contracts/schemas.ts';
import { groupTextRunsIntoBlocks, type RawTextRun } from '../src/domain/editor.ts';
import {
  createBlankPdfBytes,
  createSamplePdfBytes,
} from '../src/providers/filesystem/boundedFileSystem.ts';
import {
  compileEditedPdf,
  extractPdfPageRange,
  insertPdfPagesAtIndex,
  inspectAcroFormFields,
  mergePdfDocuments,
} from '../src/providers/mutator/pdfLibMutator.ts';

describe('editor/pdf-modification — CommandLedger, Round-Trip & Page Ops', () => {
  it('respecte Apply -> Undo -> Redo et interdit la suppression de la dernière page', () => {
    const ledger = new CommandLedger(createInitialEditorState(2));

    const addRes = ledger.apply({
      type: 'ADD_TEXT',
      item: {
        id: 't1',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 },
        text: 'Clause ajoutée',
        fontSizePt: 12,
        colorHex: '#000000',
        fontFamily: 'Helvetica',
      },
    });
    expect(addRes.ok).toBe(true);
    expect(ledger.currentState.texts).toHaveLength(1);

    const undone = ledger.undo();
    expect(undone?.texts).toHaveLength(0);

    const redone = ledger.redo();
    expect(redone?.texts).toHaveLength(1);

    // Delete page 2 -> 1 page left
    const del1 = ledger.apply({
      type: 'DELETE_PAGE',
      pageUid: 'p-orig-1',
      removedIndex: 1,
      snapshot: ledger.currentState.pages[1],
    });
    expect(del1.ok).toBe(true);
    expect(ledger.currentState.pages).toHaveLength(1);

    // Deleting the last remaining page must fail with CannotDeleteLastPage
    const delLast = ledger.apply({
      type: 'DELETE_PAGE',
      pageUid: 'p-orig-0',
      removedIndex: 0,
      snapshot: ledger.currentState.pages[0],
    });
    expect(delLast.ok).toBe(false);
    if (!delLast.ok) expect(delLast.error.code).toBe('CannotDeleteLastPage');

    // Undo restores page 2
    const restored = ledger.undo();
    expect(restored?.pages).toHaveLength(2);
  });

  it('compile un PDF modifié (texte, annotation, rotation, suppression page, formulaire AcroForm) et permet sa réouverture valide', async () => {
    const sampleBytes = await createSamplePdfBytes();
    const ledger = new CommandLedger(
      createInitialEditorState(3, { signer_full_name: 'Alexandre Martin', approved_terms: true })
    );

    ledger.apply({
      type: 'ADD_TEXT',
      item: {
        id: 't-note',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.05 },
        text: 'Annotation validée REA',
        fontSizePt: 12,
        colorHex: '#1d4ed8',
        fontFamily: 'Helvetica',
      },
    });
    ledger.apply({
      type: 'ADD_ANNOTATION',
      item: {
        id: 'ann-hl',
        pageIndex: 0,
        kind: 'highlight',
        rect: { x: 0.1, y: 0.3, width: 0.4, height: 0.04 },
        colorHex: '#facc15',
        opacity: 0.35,
        strokeWidthPt: 1,
      },
    });
    ledger.apply({
      type: 'SET_FORM_FIELD',
      fieldName: 'signer_full_name',
      previousValue: 'Alexandre Martin',
      nextValue: 'Alexandre M. (Validé)',
    });
    ledger.apply({
      type: 'ROTATE_PAGE',
      pageUid: 'p-orig-0',
      delta: 90,
    });
    ledger.apply({
      type: 'DELETE_PAGE',
      pageUid: 'p-orig-2',
      removedIndex: 2,
      snapshot: ledger.currentState.pages[2],
    });

    const compiled = await compileEditedPdf(sampleBytes, ledger.currentState);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const reopened = await PDFDocument.load(compiled.value);
    expect(reopened.getPageCount()).toBe(2);
    expect(reopened.getPage(0).getRotation().angle).toBe(90);

    const formCheck = await inspectAcroFormFields(compiled.value);
    expect(formCheck.ok).toBe(true);
    if (!formCheck.ok) return;
    const signerField = formCheck.value.fields.find((f) => f.name === 'signer_full_name');
    expect(signerField?.value).toBe('Alexandre M. (Validé)');
  });

  it('fusionne deux PDF et extrait une plage de pages valide', async () => {
    const pdfA = await createSamplePdfBytes(); // 3 pages
    const pdfB = await createSamplePdfBytes(); // 3 pages

    const merged = await mergePdfDocuments([pdfA, pdfB]);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    const mergedDoc = await PDFDocument.load(merged.value);
    expect(mergedDoc.getPageCount()).toBe(6);

    const extracted = await extractPdfPageRange(merged.value, '1-2, 6');
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const extDoc = await PDFDocument.load(extracted.value);
    expect(extDoc.getPageCount()).toBe(3);

    const badRange = parsePageRangeExpression('1-99', 6);
    expect(badRange.ok).toBe(false);
    if (!badRange.ok) expect(badRange.error.code).toBe('InvalidPageRange');
  });

  it('regroupe les runs de texte en blocs éditables via groupTextRunsIntoBlocks()', () => {
    const runs: RawTextRun[] = [
      {
        text: 'Bonjour',
        leftPt: 50,
        topPt: 100,
        baselineYPt: 110,
        widthPt: 45,
        heightPt: 14,
        fontSizePt: 12,
        fontFamily: 'Helvetica',
        bold: true,
        italic: false,
      },
      {
        text: 'le monde',
        leftPt: 100,
        topPt: 100,
        baselineYPt: 110,
        widthPt: 55,
        heightPt: 14,
        fontSizePt: 12,
        fontFamily: 'Helvetica',
        bold: true,
        italic: false,
      },
      {
        text: 'Deuxième paragraphe éloigné',
        leftPt: 50,
        topPt: 220,
        baselineYPt: 230,
        widthPt: 160,
        heightPt: 14,
        fontSizePt: 12,
        fontFamily: 'TimesRoman',
        bold: false,
        italic: false,
      },
    ];

    const blocks = groupTextRunsIntoBlocks(runs, 0, 595.28, 841.89);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain('Bonjour');
    expect(blocks[0].text).toContain('le monde');
    expect(blocks[0].bold).toBe(true);
    expect(blocks[1].text).toContain('Deuxième paragraphe');
    expect(blocks[1].fontFamily).toBe('TimesRoman');
  });

  it('applique, annule, rétablit et compile l’édition complète du PDF (texte existant, correcteur, lien, champ AcroForm, filigrane, en-tête, rognage, fond, page blanche)', async () => {
    const sampleBytes = await createSamplePdfBytes(); // 3 pages
    const ledger = new CommandLedger(createInitialEditorState(3));

    const firstEdit = {
      key: 'p-orig-0:blk-0',
      pageUid: 'p-orig-0',
      blockId: 'blk-0',
      originalRect: { x: 0.08, y: 0.06, width: 0.4, height: 0.04 },
      currentRect: { x: 0.08, y: 0.06, width: 0.45, height: 0.05 },
      originalText: 'Contrat Local',
      currentText: 'Contrat Modifié v2',
      fontSizePt: 14,
      fontFamily: 'Helvetica' as const,
      bold: true,
      italic: false,
      colorHex: '#ffffff',
      backgroundHex: '#1e3a8a',
      deleted: false,
    };

    expect(ledger.apply({ type: 'UPSERT_EXISTING_TEXT_EDIT', previous: null, next: firstEdit }).ok).toBe(true);
    expect(ledger.currentState.existingTextEdits['p-orig-0:blk-0']?.currentText).toBe('Contrat Modifié v2');

    // Undo / Redo check on existing text edit
    expect(ledger.undo()?.existingTextEdits['p-orig-0:blk-0']).toBeUndefined();
    expect(ledger.redo()?.existingTextEdits['p-orig-0:blk-0']?.currentText).toBe('Contrat Modifié v2');

    ledger.apply({
      type: 'ADD_WHITEOUT',
      item: {
        id: 'wo-1',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.45, width: 0.2, height: 0.05 },
        fillHex: '#ffffff',
        mode: 'whiteout',
      },
    });

    ledger.apply({
      type: 'ADD_LINK',
      item: {
        id: 'lnk-1',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.55, width: 0.25, height: 0.04 },
        url: 'https://example.org/spec',
      },
    });

    ledger.apply({
      type: 'CREATE_FORM_FIELD',
      item: {
        id: 'fld-custom-1',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.62, width: 0.3, height: 0.04 },
        kind: 'text',
        fieldName: 'custom_iban_field',
        defaultValue: 'FR76',
      },
    });

    ledger.apply({
      type: 'SET_WATERMARK',
      previous: null,
      next: {
        enabled: true,
        text: 'CONFIDENTIEL',
        fontSizePt: 42,
        colorHex: '#64748b',
        opacity: 0.25,
        angleDeg: 35,
      },
    });

    ledger.apply({
      type: 'SET_HEADER_FOOTER',
      previous: null,
      next: {
        enabled: true,
        headerLeft: 'OpenPDF',
        headerCenter: '',
        headerRight: '{date}',
        footerLeft: 'Confidentiel',
        footerCenter: 'Page {page} / {total}',
        footerRight: '',
        fontSizePt: 9,
        colorHex: '#334155',
      },
    });

    ledger.apply({
      type: 'SET_PAGE_CROP',
      previous: null,
      next: {
        enabled: true,
        marginTopPt: 20,
        marginRightPt: 15,
        marginBottomPt: 20,
        marginLeftPt: 15,
      },
    });

    ledger.apply({
      type: 'SET_PAGE_BACKGROUND',
      previous: null,
      next: {
        enabled: true,
        colorHex: '#fefce8',
      },
    });

    ledger.apply({
      type: 'INSERT_BLANK_PAGE',
      insertAtIndex: 1,
      created: {
        uid: 'p-blank-test',
        kind: 'blank',
        sourceDocIndex: 0,
        sourcePageIndex: -1,
        addedRotation: 0,
        blankSizePt: { widthPt: 595.28, heightPt: 841.89 },
      },
    });

    const compiled = await compileEditedPdf(sampleBytes, ledger.currentState);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const reopened = await PDFDocument.load(compiled.value);
    expect(reopened.getPageCount()).toBe(4);

    // Check CropBox shrunk by (15 + 15) width and (20 + 20) height
    const mediaBox = reopened.getPage(0).getMediaBox();
    const cropBox = reopened.getPage(0).getCropBox();
    expect(cropBox.width).toBeCloseTo(mediaBox.width - 30, 1);
    expect(cropBox.height).toBeCloseTo(mediaBox.height - 40, 1);

    // Check created AcroForm field exists in exported PDF
    const formCheck = await inspectAcroFormFields(compiled.value);
    expect(formCheck.ok).toBe(true);
    if (!formCheck.ok) return;
    expect(formCheck.value.fields.some((f) => f.name === 'custom_iban_field')).toBe(true);
  });

  it('insère un PDF externe à une position arbitraire via insertPdfPagesAtIndex()', async () => {
    const base = await createSamplePdfBytes(); // 3 pages
    const blank = await createBlankPdfBytes(); // 1 page

    const inserted = await insertPdfPagesAtIndex(base, blank, 1);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const doc = await PDFDocument.load(inserted.value);
    expect(doc.getPageCount()).toBe(4);
  });
});
