import { describe, expect, it, vi } from 'vitest';
import {
  compareSemver,
  isUpdateAvailable,
  normalizeVersionString,
  parseGitHubReleasePayload,
} from '../src/domain/updater.ts';
import { UpdateCheckService } from '../src/application/updater/UpdateCheckService.ts';

describe('updater/version-check — Détection et comparaison sémantique des mises à jour', () => {
  it('normalise les chaînes de version et nettoie les préfixes "v"', () => {
    expect(normalizeVersionString('v0.1.2')).toBe('0.1.2');
    expect(normalizeVersionString('V1.0.0 ')).toBe('1.0.0');
    expect(normalizeVersionString('2.3.4')).toBe('2.3.4');
  });

  it('compare correctement les numéros de version SemVer (major.minor.patch)', () => {
    expect(compareSemver('0.1.2', '0.1.1')).toBeGreaterThan(0);
    expect(compareSemver('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareSemver('0.1.1', '0.1.1')).toBe(0);
    expect(compareSemver('v0.1.1', '0.1.1')).toBe(0);
    expect(compareSemver('0.1.0', '0.1.1')).toBeLessThan(0);
  });

  it('détermine avec certitude si une mise à jour est disponible', () => {
    expect(isUpdateAvailable('0.1.1', '0.1.2')).toBe(true);
    expect(isUpdateAvailable('0.1.1', 'v0.1.2')).toBe(true);
    expect(isUpdateAvailable('0.1.2', '0.1.2')).toBe(false);
    expect(isUpdateAvailable('0.2.0', '0.1.9')).toBe(false);
  });

  it('analyse un payload GitHub Releases et extrait les installateurs prioritaires', () => {
    const rawPayload = {
      tag_name: 'v0.1.2',
      name: 'OpenPDF v0.1.2 — Refonte haute fidélité & Sécurité',
      body: 'Notes de version détaillées avec liste des améliorations.',
      html_url: 'https://github.com/SharkLog76/OpenPDF/releases/tag/v0.1.2',
      published_at: '2026-11-14T07:15:00Z',
      assets: [
        {
          name: 'OpenPDF_0.1.2_x64_en-US.msi',
          browser_download_url: 'https://github.com/SharkLog76/OpenPDF/releases/download/v0.1.2/OpenPDF_0.1.2_x64_en-US.msi',
          size: 3860000,
        },
        {
          name: 'OpenPDF_0.1.2_x64-setup.exe',
          browser_download_url: 'https://github.com/SharkLog76/OpenPDF/releases/download/v0.1.2/OpenPDF_0.1.2_x64-setup.exe',
          size: 2980000,
        },
      ],
    };

    const parsed = parseGitHubReleasePayload(rawPayload, '0.1.1');
    expect(parsed).not.toBeNull();
    expect(parsed!.isAvailable).toBe(true);
    expect(parsed!.latestVersion).toBe('0.1.2');
    expect(parsed!.installerAsset?.name).toBe('OpenPDF_0.1.2_x64-setup.exe');
    expect(parsed!.installerAsset?.downloadUrl).toContain('setup.exe');

    const parsedSame = parseGitHubReleasePayload(rawPayload, '0.1.2');
    expect(parsedSame!.isAvailable).toBe(false);
  });

  it('le service UpdateCheckService interroge GitHub Releases avec gestion du cache et erreurs', async () => {
    const mockPayload = {
      tag_name: 'v0.1.2',
      name: 'OpenPDF v0.1.2',
      body: 'Nouveautés',
      html_url: 'https://github.com/SharkLog76/OpenPDF/releases/tag/v0.1.2',
      published_at: '2026-11-14T07:15:00Z',
      assets: [],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    } as unknown as Response);

    let mockTime = 1000000;
    const service = new UpdateCheckService({
      fetchFn: mockFetch as unknown as typeof fetch,
      getAppVersion: () => '0.1.1',
      now: () => mockTime,
    });

    const res1 = await service.checkForUpdates();
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.value.isAvailable).toBe(true);
      expect(res1.value.latestVersion).toBe('0.1.2');
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Call within cooldown returns cached result without refetching
    const resCached = await service.checkForUpdates(false);
    expect(resCached.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Force check ignores cooldown and refetches
    await service.checkForUpdates(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Test offline/HTTP error handling
    const failFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
    const failingService = new UpdateCheckService({
      fetchFn: failFetch as unknown as typeof fetch,
      getAppVersion: () => '0.1.1',
      now: () => mockTime,
    });

    const resFail = failingService.checkForUpdates(true);
    await expect(resFail).resolves.toMatchObject({
      ok: false,
      error: { code: 'ConversionFailed' },
    });
  });
});
