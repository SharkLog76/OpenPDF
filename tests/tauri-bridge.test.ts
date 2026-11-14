import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkDefaultPdfStatusTauri,
  detachTabToNewWindowTauri,
  getLaunchPdfArgsTauri,
  isTauriRuntime,
  mapRustErrorToDomain,
  openPathInNewWindowTauri,
  overwritePdfAtPathTauri,
  pickOpenPdfTauri,
  readPdfAtPathTauri,
  registerAndOpenDefaultPdfSettingsTauri,
  saveAsPdfTauri,
  saveExportFileTauri,
  type TauriBridgeDeps,
} from '../src/adapters/host/tauriBridge.ts';
import { ADMISSION_LIMITS } from '../src/contracts/schemas.ts';
import { hasWritableDiskOrigin, type FileOriginHandle } from '../src/providers/filesystem/boundedFileSystem.ts';

function createMockDeps(overrides: Partial<TauriBridgeDeps> = {}): TauriBridgeDeps {
  return {
    isTauri: () => true,
    invokeFn: vi.fn(),
    openDialogFn: vi.fn().mockResolvedValue(null),
    saveDialogFn: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('host/tauri-v2-desktop — Bridge & Disk Origin Contracts', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('détecte le runtime Tauri uniquement via __TAURI_INTERNALS__', () => {
    expect(isTauriRuntime()).toBe(false);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(true);
  });

  it('reconnaît tauri-path et fs-handle comme origines disque modifiables', () => {
    const tauriOrigin: FileOriginHandle = {
      kind: 'tauri-path',
      path: 'C:\\docs\\contrat.pdf',
      displayName: 'contrat.pdf',
    };
    const fsOrigin: FileOriginHandle = {
      kind: 'fs-handle',
      handle: {} as FileSystemFileHandle,
      displayName: 'contrat.pdf',
    };
    const memoryOrigin: FileOriginHandle = { kind: 'memory', displayName: 'contrat.pdf' };
    const sampleOrigin: FileOriginHandle = { kind: 'sample', displayName: 'sample.pdf' };

    expect(hasWritableDiskOrigin(tauriOrigin)).toBe(true);
    expect(hasWritableDiskOrigin(fsOrigin)).toBe(true);
    expect(hasWritableDiskOrigin(memoryOrigin)).toBe(false);
    expect(hasWritableDiskOrigin(sampleOrigin)).toBe(false);
    expect(hasWritableDiskOrigin(null)).toBe(false);
    expect(hasWritableDiskOrigin(undefined)).toBe(false);
  });

  it('mappe les erreurs taggées Rust vers le catalogue DomainError', () => {
    expect(mapRustErrorToDomain('EmptyFile: Le fichier est vide.', 'CorruptedPdf')).toEqual({
      code: 'EmptyFile',
      message: 'Le fichier est vide.',
    });
    expect(
      mapRustErrorToDomain(
        'FileTooLarge:Fichier trop volumineux (150000000 octets, plafond 104857600 octets).',
        'CorruptedPdf'
      )
    ).toEqual({
      code: 'FileTooLarge',
      message: 'Fichier trop volumineux (150000000 octets, plafond 104857600 octets).',
      byteLength: 150000000,
      maxBytes: 104857600,
    });
    expect(mapRustErrorToDomain('ReadFailed:Fichier PDF introuvable : x.pdf', 'CorruptedPdf')).toEqual({
      code: 'CorruptedPdf',
      message: 'Fichier PDF introuvable : x.pdf',
    });
    expect(mapRustErrorToDomain('InvalidPdfHeader: Signature %PDF- absente', 'CorruptedPdf')).toEqual({
      code: 'InvalidPdfHeader',
      message: 'Signature %PDF- absente',
    });
    expect(mapRustErrorToDomain('OverwriteFailed: Verrouillé', 'CorruptedPdf')).toEqual({
      code: 'OverwriteFailed',
      message: 'Verrouillé',
    });
    expect(mapRustErrorToDomain(new Error('I/O generic failure'), 'CorruptedPdf')).toEqual({
      code: 'CorruptedPdf',
      message: 'I/O generic failure',
    });
  });

  it('lit un PDF borné via IPC Tauri et convertit les octets en Uint8Array', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      path: 'C:\\docs\\devis.pdf',
      fileName: 'devis.pdf',
      bytes: [37, 80, 68, 70, 45, 49, 46, 55],
    });
    const deps = createMockDeps({ invokeFn });

    const res = await readPdfAtPathTauri('C:\\docs\\devis.pdf', deps);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.path).toBe('C:\\docs\\devis.pdf');
      expect(res.value.fileName).toBe('devis.pdf');
      expect(res.value.bytes).toBeInstanceOf(Uint8Array);
      expect(Array.from(res.value.bytes)).toEqual([37, 80, 68, 70, 45, 49, 46, 55]);
    }
    expect(invokeFn).toHaveBeenCalledWith('read_pdf_file_bounded', {
      path: 'C:\\docs\\devis.pdf',
      maxBytes: ADMISSION_LIMITS.MAX_PDF_BYTES,
    });
  });

  it('pickOpenPdfTauri retourne null si l’utilisateur annule le dialogue natif', async () => {
    const invokeFn = vi.fn();
    const deps = createMockDeps({
      invokeFn,
      openDialogFn: vi.fn().mockResolvedValue(null),
    });

    const res = await pickOpenPdfTauri(deps);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBeNull();
    expect(invokeFn).not.toHaveBeenCalled();
  });

  it('pickOpenPdfTauri charge le fichier quand un chemin est sélectionné', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      path: 'D:\\facture.pdf',
      fileName: 'facture.pdf',
      bytes: [37, 80, 68, 70, 45],
    });
    const deps = createMockDeps({
      invokeFn,
      openDialogFn: vi.fn().mockResolvedValue('D:\\facture.pdf'),
    });

    const res = await pickOpenPdfTauri(deps);
    expect(res.ok).toBe(true);
    if (res.ok && res.value) {
      expect(res.value.path).toBe('D:\\facture.pdf');
      expect(res.value.fileName).toBe('facture.pdf');
    }
  });

  it('écrase atomiquement un fichier PDF par chemin disque et remonte les erreurs OverwriteFailed', async () => {
    const okInvoke = vi.fn().mockResolvedValue({
      path: 'C:\\docs\\contrat.pdf',
      fileName: 'contrat.pdf',
      byteLength: 5,
    });
    const okDeps = createMockDeps({ invokeFn: okInvoke });
    const wrOk = await overwritePdfAtPathTauri(
      'C:\\docs\\contrat.pdf',
      new Uint8Array([37, 80, 68, 70, 45]),
      okDeps
    );
    expect(wrOk.ok).toBe(true);
    if (wrOk.ok) {
      expect(wrOk.value.byteLength).toBe(5);
      expect(wrOk.value.fileName).toBe('contrat.pdf');
    }
    expect(okInvoke).toHaveBeenCalledWith('write_pdf_atomic', {
      path: 'C:\\docs\\contrat.pdf',
      bytes: [37, 80, 68, 70, 45],
    });

    const errDeps = createMockDeps({
      invokeFn: vi.fn().mockRejectedValue('OverwriteFailed: Permission refusée'),
    });
    const wrErr = await overwritePdfAtPathTauri('C:\\readonly.pdf', new Uint8Array([1]), errDeps);
    expect(wrErr.ok).toBe(false);
    if (!wrErr.ok) {
      expect(wrErr.error.code).toBe('OverwriteFailed');
      expect(wrErr.error.message).toBe('Permission refusée');
    }
  });

  it('saveAsPdfTauri écrit sur la destination choisie ou retourne null si annulé', async () => {
    const cancelInvoke = vi.fn();
    const cancelRes = await saveAsPdfTauri(
      new Uint8Array([37, 80, 68, 70]),
      'contrat_v2.pdf',
      createMockDeps({ invokeFn: cancelInvoke, saveDialogFn: vi.fn().mockResolvedValue(null) })
    );
    expect(cancelRes.ok).toBe(true);
    if (cancelRes.ok) expect(cancelRes.value).toBeNull();
    expect(cancelInvoke).not.toHaveBeenCalled();

    const saveInvoke = vi.fn().mockResolvedValue({
      path: 'C:\\docs\\contrat_v2.pdf',
      fileName: 'contrat_v2.pdf',
      byteLength: 4,
    });
    const saveDialogFn = vi.fn().mockResolvedValue('C:\\docs\\contrat_v2.pdf');
    const savedRes = await saveAsPdfTauri(
      new Uint8Array([37, 80, 68, 70]),
      'contrat_v2.pdf',
      createMockDeps({ invokeFn: saveInvoke, saveDialogFn })
    );
    expect(saveDialogFn).toHaveBeenCalledWith({
      title: 'Enregistrer sous / Nouvelle version',
      defaultPath: 'contrat_v2.pdf',
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
    });
    expect(savedRes.ok).toBe(true);
    if (savedRes.ok && savedRes.value) {
      expect(savedRes.value.path).toBe('C:\\docs\\contrat_v2.pdf');
      expect(savedRes.value.byteLength).toBe(4);
    }
  });

  it('getLaunchPdfArgsTauri retourne [] hors Tauri et les chemins CLI sous Tauri', async () => {
    const browserInvoke = vi.fn();
    expect(
      await getLaunchPdfArgsTauri(createMockDeps({ isTauri: () => false, invokeFn: browserInvoke }))
    ).toEqual([]);
    expect(browserInvoke).not.toHaveBeenCalled();

    const tauriInvoke = vi.fn().mockResolvedValue(['C:\\incoming\\scan.pdf']);
    expect(
      await getLaunchPdfArgsTauri(createMockDeps({ isTauri: () => true, invokeFn: tauriInvoke }))
    ).toEqual(['C:\\incoming\\scan.pdf']);

    const failingInvoke = vi.fn().mockRejectedValue(new Error('IPC error'));
    expect(
      await getLaunchPdfArgsTauri(createMockDeps({ isTauri: () => true, invokeFn: failingInvoke }))
    ).toEqual([]);
  });

  it('saveExportFileTauri écrit atomiquement les exports Word/Excel/Image ou mappe ConversionFailed', async () => {
    const saveDialogFn = vi.fn().mockResolvedValue('C:\\exports\\rapport.docx');
    const invokeFn = vi.fn().mockResolvedValue({
      path: 'C:\\exports\\rapport.docx',
      fileName: 'rapport.docx',
      byteLength: 4,
    });
    const okRes = await saveExportFileTauri(
      new Uint8Array([80, 75, 3, 4]),
      'rapport.docx',
      'Document Word',
      ['docx'],
      createMockDeps({ saveDialogFn, invokeFn })
    );
    expect(okRes.ok).toBe(true);
    expect(invokeFn).toHaveBeenCalledWith('write_binary_file_atomic', {
      path: 'C:\\exports\\rapport.docx',
      bytes: [80, 75, 3, 4],
    });

    const errRes = await saveExportFileTauri(
      new Uint8Array([1]),
      'x.xlsx',
      'Excel',
      ['xlsx'],
      createMockDeps({
        saveDialogFn: vi.fn().mockResolvedValue('C:\\exports\\x.xlsx'),
        invokeFn: vi.fn().mockRejectedValue('ConversionFailed: Flux vide'),
      })
    );
    expect(errRes.ok).toBe(false);
    if (!errRes.ok) {
      expect(errRes.error.code).toBe('ConversionFailed');
    }
  });

  it('gère le détachement d’onglet, l’ouverture nouvelle fenêtre et la vérification PDF par défaut', async () => {
    const invokeFn = vi
      .fn()
      .mockResolvedValueOnce('openpdf-win-2')
      .mockResolvedValueOnce('openpdf-win-3')
      .mockResolvedValueOnce({
        platform: 'windows',
        isDefault: false,
        currentProgId: 'MSEdgePDF',
        registeredForUser: true,
        canOpenSystemSettings: true,
      })
      .mockResolvedValueOnce({
        platform: 'windows',
        isDefault: false,
        currentProgId: 'MSEdgePDF',
        registeredForUser: true,
        canOpenSystemSettings: true,
      });

    const deps = createMockDeps({ invokeFn });
    const detachRes = await detachTabToNewWindowTauri(
      {
        fileName: 'Contrat.pdf',
        originPath: 'C:\\docs\\Contrat.pdf',
        bytes: new Uint8Array([37, 80, 68, 70]),
        stateJson: '{"zoom":1.2}',
        screenX: 400,
        screenY: 120,
      },
      deps
    );
    expect(detachRes).toEqual({ ok: true, value: 'openpdf-win-2' });

    const newWinRes = await openPathInNewWindowTauri('C:\\docs\\Annexe.pdf', deps);
    expect(newWinRes).toEqual({ ok: true, value: 'openpdf-win-3' });

    const status = await checkDefaultPdfStatusTauri(deps);
    expect(status?.isDefault).toBe(false);

    const openSettings = await registerAndOpenDefaultPdfSettingsTauri(deps);
    expect(openSettings.ok).toBe(true);
  });
});
