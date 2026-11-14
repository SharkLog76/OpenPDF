/**
 * Desktop Host Bridge for Tauri v2 (Adapters Layer).
 * Encapsulates Tauri IPC commands and native dialogs behind typed Result<T, DomainError>,
 * keeping Domain/Application/Providers runtime-agnostic.
 */
import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS } from '../../contracts/schemas.ts';
import { err, ok, type Result } from '../../domain/result.ts';

export interface LoadedDesktopPdf {
  readonly path: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface WrittenDesktopPdf {
  readonly path: string;
  readonly fileName: string;
  readonly byteLength: number;
}

interface RawRustLoadedPdf {
  readonly path: string;
  readonly fileName: string;
  readonly bytes: number[];
}

export interface TauriBridgeDeps {
  readonly isTauri: () => boolean;
  readonly invokeFn: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  readonly openDialogFn: (options: Parameters<typeof open>[0]) => Promise<string | null>;
  readonly saveDialogFn: (options: Parameters<typeof save>[0]) => Promise<string | null>;
}

const DEFAULT_DEPS: TauriBridgeDeps = {
  isTauri: () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  invokeFn: <T>(cmd: string, args?: Record<string, unknown>) => invoke<T>(cmd, args),
  openDialogFn: async (options) => {
    const picked = await open(options);
    return typeof picked === 'string' ? picked : null;
  },
  saveDialogFn: async (options) => save(options),
};

export function isTauriRuntime(): boolean {
  return DEFAULT_DEPS.isTauri();
}

export function mapRustErrorToDomain(
  rawErr: unknown,
  fallbackCode: 'CorruptedPdf' | 'OverwriteFailed'
): DomainError {
  const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
  const sep = msg.indexOf(':');
  if (sep > 0) {
    const code = msg.slice(0, sep);
    const detail = msg.slice(sep + 1).trim();
    if (code === 'EmptyFile') {
      return { code: 'EmptyFile', message: detail };
    }
    if (code === 'InvalidPdfHeader') {
      return { code: 'InvalidPdfHeader', message: detail };
    }
    if (code === 'OverwriteFailed') {
      return { code: 'OverwriteFailed', message: detail };
    }
    if (code === 'ConversionFailed') {
      return { code: 'ConversionFailed', message: detail };
    }
    if (code === 'FileTooLarge') {
      const match = /(\d+)\s+octets,\s+plafond\s+(\d+)\s+octets/i.exec(detail);
      return {
        code: 'FileTooLarge',
        message: detail,
        byteLength: match ? Number(match[1]) : 0,
        maxBytes: match ? Number(match[2]) : ADMISSION_LIMITS.MAX_PDF_BYTES,
      };
    }
    if (code === 'ReadFailed') {
      return { code: fallbackCode, message: detail || msg };
    }
  }
  return { code: fallbackCode, message: msg };
}

export async function readPdfAtPathTauri(
  path: string,
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<LoadedDesktopPdf, DomainError>> {
  try {
    const res = await deps.invokeFn<RawRustLoadedPdf>('read_pdf_file_bounded', {
      path,
      maxBytes: ADMISSION_LIMITS.MAX_PDF_BYTES,
    });
    return ok({
      path: res.path,
      fileName: res.fileName,
      bytes: new Uint8Array(res.bytes),
    });
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'CorruptedPdf'));
  }
}

export async function pickOpenPdfTauri(
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<LoadedDesktopPdf | null, DomainError>> {
  try {
    const selected = await deps.openDialogFn({
      multiple: false,
      directory: false,
      title: 'Ouvrir un document PDF',
      filters: [{ name: 'Documents PDF', extensions: ['pdf'] }],
    });
    if (!selected) return ok(null);
    return readPdfAtPathTauri(selected, deps);
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'CorruptedPdf'));
  }
}

export async function overwritePdfAtPathTauri(
  path: string,
  bytes: Uint8Array,
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<WrittenDesktopPdf, DomainError>> {
  try {
    const res = await deps.invokeFn<WrittenDesktopPdf>('write_pdf_atomic', {
      path,
      bytes: Array.from(bytes),
    });
    return ok(res);
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'OverwriteFailed'));
  }
}

export async function saveAsPdfTauri(
  bytes: Uint8Array,
  suggestedName: string,
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<WrittenDesktopPdf | null, DomainError>> {
  try {
    const targetPath = await deps.saveDialogFn({
      title: 'Enregistrer sous / Nouvelle version',
      defaultPath: suggestedName,
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
    });
    if (!targetPath) return ok(null);
    return overwritePdfAtPathTauri(targetPath, bytes, deps);
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'OverwriteFailed'));
  }
}

export async function getLaunchPdfArgsTauri(deps: TauriBridgeDeps = DEFAULT_DEPS): Promise<string[]> {
  if (!deps.isTauri()) return [];
  try {
    return await deps.invokeFn<string[]>('get_launch_pdf_args');
  } catch {
    return [];
  }
}

export async function subscribeTauriDragDrop(
  onDropPdfPath: (path: string) => void
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  try {
    const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const pdfPath = event.payload.paths.find((p) => /\.pdf$/i.test(p));
        if (pdfPath) onDropPdfPath(pdfPath);
      }
    });
    return unlisten;
  } catch {
    return () => undefined;
  }
}

export async function syncDesktopWindowTitle(docName: string | null, isDirty: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const title = docName
    ? `${docName}${isDirty ? ' *' : ''} — OpenPDF`
    : 'OpenPDF — Studio PDF Local-First';
  await getCurrentWindow().setTitle(title).catch(() => undefined);
}

export type WindowLaunchPayload =
  | { readonly kind: 'cliArgs'; readonly paths: readonly string[] }
  | { readonly kind: 'openPath'; readonly path: string }
  | {
      readonly kind: 'detachedTab';
      readonly fileName: string;
      readonly originPath: string | null;
      readonly bytes: readonly number[];
      readonly stateJson: string | null;
    };

export interface DetachTabTauriParams {
  readonly fileName: string;
  readonly originPath: string | null;
  readonly bytes: Uint8Array;
  readonly stateJson: string | null;
  readonly screenX?: number;
  readonly screenY?: number;
}

export interface DefaultPdfStatus {
  readonly platform: string;
  readonly isDefault: boolean;
  readonly currentProgId: string | null;
  readonly registeredForUser: boolean;
  readonly canOpenSystemSettings: boolean;
}

export async function saveExportFileTauri(
  bytes: Uint8Array,
  suggestedFileName: string,
  filterName: string,
  extensions: readonly string[],
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<WrittenDesktopPdf | null, DomainError>> {
  try {
    const targetPath = await deps.saveDialogFn({
      title: 'Exporter le document',
      defaultPath: suggestedFileName,
      filters: [{ name: filterName, extensions: [...extensions] }],
    });
    if (!targetPath) return ok(null);
    const res = await deps.invokeFn<WrittenDesktopPdf>('write_binary_file_atomic', {
      path: targetPath,
      bytes: Array.from(bytes),
    });
    return ok(res);
  } catch (e: unknown) {
    const mapped = mapRustErrorToDomain(e, 'OverwriteFailed');
    if (mapped.code === 'OverwriteFailed') {
      return err({ code: 'ConversionFailed', message: mapped.message });
    }
    return err(mapped);
  }
}

export async function takeWindowLaunchPayloadTauri(
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<WindowLaunchPayload | null> {
  if (!deps.isTauri()) return null;
  try {
    return await deps.invokeFn<WindowLaunchPayload | null>('take_window_launch_payload');
  } catch {
    return null;
  }
}

export async function detachTabToNewWindowTauri(
  params: DetachTabTauriParams,
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<string, DomainError>> {
  if (!deps.isTauri()) {
    return err({
      code: 'OverwriteHandleUnavailable',
      message: 'Le détachement en nouvelle fenêtre OS nécessite le runtime Desktop OpenPDF.',
    });
  }
  try {
    const label = await deps.invokeFn<string>('detach_tab_to_new_window', {
      request: {
        fileName: params.fileName,
        originPath: params.originPath,
        bytes: Array.from(params.bytes),
        stateJson: params.stateJson,
        screenX: params.screenX ?? null,
        screenY: params.screenY ?? null,
      },
    });
    return ok(label);
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'OverwriteFailed'));
  }
}

export async function openPathInNewWindowTauri(
  path: string,
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<string, DomainError>> {
  if (!deps.isTauri()) {
    return err({
      code: 'OverwriteHandleUnavailable',
      message: 'L’ouverture dans une nouvelle fenêtre nécessite le runtime Desktop OpenPDF.',
    });
  }
  try {
    const label = await deps.invokeFn<string>('open_path_in_new_window', { path });
    return ok(label);
  } catch (e: unknown) {
    return err(mapRustErrorToDomain(e, 'CorruptedPdf'));
  }
}

export async function subscribeExternalOpenPdfRequests(
  onOpenRequest: (paths: readonly string[]) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  try {
    return await getCurrentWindow().listen<{ paths?: string[] }>('open-pdf-request', (event) => {
      const paths = event.payload?.paths;
      if (Array.isArray(paths) && paths.length > 0) {
        onOpenRequest(paths);
      }
    });
  } catch {
    return () => undefined;
  }
}

export async function subscribeWindowCloseRequested(
  shouldInterceptClose: () => boolean,
  onIntercepted: () => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  try {
    return await getCurrentWindow().onCloseRequested((event) => {
      if (shouldInterceptClose()) {
        event.preventDefault();
        onIntercepted();
      }
    });
  } catch {
    return () => undefined;
  }
}

export async function forceCloseCurrentWindowTauri(
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<void> {
  if (!deps.isTauri()) {
    window.close();
    return;
  }
  await deps.invokeFn<void>('close_window_unconditionally').catch(() => {
    window.close();
  });
}

export async function checkDefaultPdfStatusTauri(
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<DefaultPdfStatus | null> {
  if (!deps.isTauri()) return null;
  try {
    return await deps.invokeFn<DefaultPdfStatus>('check_pdf_default_status');
  } catch {
    return null;
  }
}

export async function registerAndOpenDefaultPdfSettingsTauri(
  deps: TauriBridgeDeps = DEFAULT_DEPS
): Promise<Result<DefaultPdfStatus, DomainError>> {
  if (!deps.isTauri()) {
    return err({
      code: 'OverwriteHandleUnavailable',
      message: 'La définition comme lecteur PDF par défaut nécessite l’application Desktop OpenPDF.',
    });
  }
  try {
    const status = await deps.invokeFn<DefaultPdfStatus>('register_and_open_default_pdf_settings');
    return ok(status);
  } catch (e: unknown) {
    return err({
      code: 'OverwriteFailed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
