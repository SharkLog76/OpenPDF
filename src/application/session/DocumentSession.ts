/**
 * DocumentSession Application Coordinator.
 * Owns the active document lifecycle, CommandLedger, AcroForm facts, outlines,
 * existing signature verification records, and safe resource disposal.
 */
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS, detectImageFormat } from '../../contracts/schemas.ts';
import type {
  AcroFormFieldDescriptor,
  EditCommand,
  EditorDocumentState,
} from '../../domain/editor.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type {
  CertificateMetadata,
  SignaturePlacement,
  SignatureVerificationRecord,
  VisualSignatureAsset,
} from '../../domain/signing.ts';
import type {
  DocumentIdentity,
  OutlineNode,
  PageMetrics,
  PdfMetadataFacts,
} from '../../domain/viewer.ts';
import {
  admitPdfBytes,
  createBlankPdfBytes,
  createSamplePdfBytes,
} from '../../providers/filesystem/boundedFileSystem.ts';
import {
  compileEditedPdf,
  extractPdfPageRange,
  insertPdfPagesAtIndex,
  inspectAcroFormFields,
  mergePdfDocuments,
} from '../../providers/mutator/pdfLibMutator.ts';
import { PdfJsDocumentHandle } from '../../providers/renderer/pdfJsRenderer.ts';
import {
  normalizeSignatureImageFile,
  signPdfWithPkcs12,
  verifyPdfSignatures,
} from '../../providers/crypto/signatureProvider.ts';
import {
  CommandLedger,
  createInitialEditorState,
  type CommandLedgerSnapshot,
} from '../ledger/CommandLedger.ts';

export interface OpenedSessionBundle {
  readonly identity: DocumentIdentity;
  readonly sourceBytes: Uint8Array;
  readonly renderer: PdfJsDocumentHandle;
  readonly pageMetrics: readonly PageMetrics[];
  readonly metadata: PdfMetadataFacts;
  readonly outlines: readonly OutlineNode[];
  readonly formFields: readonly AcroFormFieldDescriptor[];
  readonly signatureVerifications: readonly SignatureVerificationRecord[];
  readonly ledger: CommandLedger;
}

export class DocumentSessionService {
  private activeRenderer: PdfJsDocumentHandle | null = null;

  async openFromBytes(
    rawBytes: Uint8Array,
    displayName: string,
    password?: string,
    restoredSnapshot?: CommandLedgerSnapshot
  ): Promise<Result<OpenedSessionBundle, DomainError>> {
    const admitted = await admitPdfBytes(rawBytes, displayName);
    if (!admitted.ok) return err(admitted.error);

    const { identity, bytes } = admitted.value;
    const renderRes = await PdfJsDocumentHandle.open(bytes, identity.sha256, password);
    if (!renderRes.ok) return err(renderRes.error);

    // Dispose previous renderer safely before adopting the new one
    if (this.activeRenderer) {
      await this.activeRenderer.dispose();
    }
    this.activeRenderer = renderRes.value;

    const renderer = renderRes.value;
    const pageMetrics: PageMetrics[] = [];
    for (let i = 0; i < renderer.pageCount; i++) {
      pageMetrics.push(await renderer.getPageMetrics(i));
    }

    const formInspect = await inspectAcroFormFields(bytes);
    const formFields = formInspect.ok ? formInspect.value.fields : [];
    const hasExistingSignatures = formInspect.ok ? formInspect.value.hasExistingSignatures : false;

    const metadata = await renderer.getMetadataFacts(formFields.length > 0, hasExistingSignatures);
    const outlines = await renderer.getOutlines();
    const signatureVerifications = await verifyPdfSignatures(bytes);

    const initialFormValues: Record<string, string | boolean> = {};
    for (const f of formFields) {
      initialFormValues[f.name] = f.value;
    }

    const ledger = restoredSnapshot
      ? CommandLedger.fromSnapshot(restoredSnapshot)
      : new CommandLedger(createInitialEditorState(renderer.pageCount, initialFormValues));

    return ok({
      identity,
      sourceBytes: bytes,
      renderer,
      pageMetrics,
      metadata,
      outlines,
      formFields,
      signatureVerifications,
      ledger,
    });
  }

  async openSampleDocument(): Promise<Result<OpenedSessionBundle, DomainError>> {
    const bytes = await createSamplePdfBytes();
    return this.openFromBytes(bytes, 'Contrat_Demo_OpenPDF.pdf');
  }

  async openBlankDocument(): Promise<Result<OpenedSessionBundle, DomainError>> {
    const bytes = await createBlankPdfBytes();
    return this.openFromBytes(bytes, 'Nouveau_Document.pdf');
  }

  async insertExternalPdfAt(
    currentCompiledBytes: Uint8Array,
    extraPdfBytes: Uint8Array,
    insertAtIndex: number
  ): Promise<Result<Uint8Array, DomainError>> {
    const check = await admitPdfBytes(extraPdfBytes, 'insertion.pdf');
    if (!check.ok) return err(check.error);
    return insertPdfPagesAtIndex(currentCompiledBytes, check.value.bytes, insertAtIndex);
  }

  async exportCompiledPdf(
    sourceBytes: Uint8Array,
    editorState: EditorDocumentState,
    visualSignatures: readonly { readonly placement: SignaturePlacement; readonly asset: VisualSignatureAsset }[],
    flattenForms: boolean = false
  ): Promise<Result<Uint8Array, DomainError>> {
    return compileEditedPdf(sourceBytes, editorState, {
      flattenForms,
      visualSignatures,
    });
  }

  async exportSignedPdf(
    sourceBytes: Uint8Array,
    editorState: EditorDocumentState,
    visualSignatures: readonly { readonly placement: SignaturePlacement; readonly asset: VisualSignatureAsset }[],
    pkcs12Options?: {
      readonly p12Bytes: Uint8Array;
      readonly passphrase: string;
      readonly signerName?: string;
      readonly reason?: string;
      readonly location?: string;
    },
    flattenForms: boolean = false
  ): Promise<Result<{ readonly pdfBytes: Uint8Array; readonly certificate: CertificateMetadata | null }, DomainError>> {
    const compiled = await compileEditedPdf(sourceBytes, editorState, {
      flattenForms,
      visualSignatures,
    });
    if (!compiled.ok) return err(compiled.error);

    if (!pkcs12Options) {
      return ok({ pdfBytes: compiled.value, certificate: null });
    }

    const signed = await signPdfWithPkcs12(
      compiled.value,
      pkcs12Options.p12Bytes,
      pkcs12Options.passphrase,
      {
        signerName: pkcs12Options.signerName,
        reason: pkcs12Options.reason,
        location: pkcs12Options.location,
      }
    );
    if (!signed.ok) return err(signed.error);

    return ok({
      pdfBytes: signed.value.signedBytes,
      certificate: signed.value.certificate,
    });
  }

  async mergeWithAdditionalPdfs(
    currentCompiledBytes: Uint8Array,
    additionalPdfFiles: readonly Uint8Array[]
  ): Promise<Result<Uint8Array, DomainError>> {
    for (const extra of additionalPdfFiles) {
      const check = await admitPdfBytes(extra, 'import.pdf');
      if (!check.ok) return err(check.error);
    }
    return mergePdfDocuments([currentCompiledBytes, ...additionalPdfFiles]);
  }

  async extractPages(sourceBytes: Uint8Array, rangeExpr: string): Promise<Result<Uint8Array, DomainError>> {
    return extractPdfPageRange(sourceBytes, rangeExpr);
  }

  async prepareOverlayImage(
    rawBytes: Uint8Array,
    label: string = 'image'
  ): Promise<Result<{ readonly bytes: Uint8Array; readonly mimeType: 'image/png' | 'image/jpeg' }, DomainError>> {
    const fmt = detectImageFormat(rawBytes, ADMISSION_LIMITS.MAX_EMBED_IMAGE_BYTES);
    if (!fmt.ok) return err(fmt.error);
    if (fmt.value === 'png' || fmt.value === 'jpeg') {
      return ok({ bytes: rawBytes, mimeType: fmt.value === 'png' ? 'image/png' : 'image/jpeg' });
    }
    // Automatically convert SVG / WebP to PNG so any image format embeds cleanly into PDF
    const converted = await normalizeSignatureImageFile(rawBytes, label, false);
    if (!converted.ok) return err(converted.error);
    return ok({ bytes: converted.value.pngBytes, mimeType: 'image/png' });
  }

  applyEdit(ledger: CommandLedger, cmd: EditCommand): Result<EditorDocumentState, DomainError> {
    return ledger.apply(cmd);
  }

  async dispose(): Promise<void> {
    if (this.activeRenderer) {
      await this.activeRenderer.dispose();
      this.activeRenderer = null;
    }
  }
}
