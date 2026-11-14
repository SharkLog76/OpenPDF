import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  createBlankPdfBytes,
  deriveNextVersionFilename,
  overwriteOriginalFile,
} from '../src/providers/filesystem/boundedFileSystem.ts';

describe('shell/acrobat-menus-and-save-lifecycle — Save, Versioning & Overwrite Safety', () => {
  it('dérive correctement les noms de nouvelles versions *_vN.pdf', () => {
    expect(deriveNextVersionFilename('contrat.pdf')).toBe('contrat_v2.pdf');
    expect(deriveNextVersionFilename('contrat_v2.pdf')).toBe('contrat_v3.pdf');
    expect(deriveNextVersionFilename('RAPPORT_V9.PDF')).toBe('RAPPORT_v10.pdf');
    expect(deriveNextVersionFilename('sans_extension')).toBe('sans_extension_v2.pdf');
  });

  it('génère un PDF vierge A4 valide avec createBlankPdfBytes()', async () => {
    const bytes = await createBlankPdfBytes();
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it('refuse l’écrasement (fail-closed) si aucun FileSystemFileHandle natif n’est disponible', async () => {
    const res = await overwriteOriginalFile(null, new Uint8Array([1, 2, 3]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OverwriteHandleUnavailable');
  });

  it('refuse l’écrasement si l’utilisateur décline la permission d’écriture', async () => {
    const mockHandle = {
      name: 'contrat.pdf',
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied'),
      createWritable: vi.fn(),
    } as unknown as FileSystemFileHandle;

    const res = await overwriteOriginalFile(mockHandle, new Uint8Array([37, 80, 68, 70]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OverwritePermissionDenied');
    expect((mockHandle as unknown as { createWritable: ReturnType<typeof vi.fn> }).createWritable).not.toHaveBeenCalled();
  });

  it('écrase atomiquement via FileSystemWritableFileStream (createWritable -> write -> close)', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const mockHandle = {
      name: 'contrat_final.pdf',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn(),
      createWritable: vi.fn().mockResolvedValue({
        write: writeMock,
        close: closeMock,
      }),
    } as unknown as FileSystemFileHandle;

    const payload = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const res = await overwriteOriginalFile(mockHandle, payload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.fileName).toBe('contrat_final.pdf');
    expect(res.value.byteLength).toBe(payload.byteLength);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('retourne OverwriteFailed proprement si writable.write échoue', async () => {
    const mockHandle = {
      name: 'readonly.pdf',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockRejectedValue(new Error('Disk locked')),
        close: vi.fn(),
      }),
    } as unknown as FileSystemFileHandle;

    const res = await overwriteOriginalFile(mockHandle, new Uint8Array([1, 2, 3]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OverwriteFailed');
  });
});
