/**
 * Tagged error algebra shared across Contracts, Providers, Application, and UI Adapters.
 * Every boundary failure maps to an explicit code and actionable user message.
 */

export type DomainError =
  // Viewer & Admission errors
  | { readonly code: 'InvalidPdfHeader'; readonly message: string }
  | { readonly code: 'FileTooLarge'; readonly message: string; readonly byteLength: number; readonly maxBytes: number }
  | { readonly code: 'EmptyFile'; readonly message: string }
  | { readonly code: 'PasswordRequired'; readonly message: string }
  | { readonly code: 'IncorrectPassword'; readonly message: string }
  | { readonly code: 'CorruptedPdf'; readonly message: string; readonly cause?: string }
  | { readonly code: 'RenderCancelled'; readonly message: string }
  // Editor & Mutation errors
  | { readonly code: 'CannotDeleteLastPage'; readonly message: string }
  | { readonly code: 'InvalidPageRange'; readonly message: string }
  | { readonly code: 'ImageDecodeFailed'; readonly message: string }
  | { readonly code: 'UnsafeUrl'; readonly message: string }
  | { readonly code: 'MergeBudgetExceeded'; readonly message: string; readonly totalBytes: number; readonly maxBytes: number }
  | { readonly code: 'ExportSerializationFailed'; readonly message: string; readonly cause?: string }
  // Save / Overwrite errors
  | { readonly code: 'OverwriteHandleUnavailable'; readonly message: string }
  | { readonly code: 'OverwritePermissionDenied'; readonly message: string }
  | { readonly code: 'OverwriteFailed'; readonly message: string; readonly cause?: string }
  // Signing & Vault errors
  | { readonly code: 'UnsupportedSignatureFileFormat'; readonly message: string }
  | { readonly code: 'SignatureImageTooLarge'; readonly message: string; readonly byteLength: number; readonly maxBytes: number }
  | { readonly code: 'InvalidPkcs12Passphrase'; readonly message: string }
  | { readonly code: 'InvalidPkcs12Container'; readonly message: string; readonly cause?: string }
  | { readonly code: 'CertificateTooLarge'; readonly message: string; readonly byteLength: number; readonly maxBytes: number }
  | { readonly code: 'ByteRangeComputationFailed'; readonly message: string; readonly cause?: string }
  | { readonly code: 'VaultStorageUnavailable'; readonly message: string; readonly cause?: string }
  // Converter / Multi-format Export errors
  | { readonly code: 'ConversionFailed'; readonly message: string; readonly cause?: string };

export function formatDomainError(error: DomainError): string {
  return `[${error.code}] ${error.message}`;
}
