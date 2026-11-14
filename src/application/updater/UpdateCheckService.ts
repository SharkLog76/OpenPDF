/**
 * Application Service for checking OpenPDF releases from GitHub.
 */
import type { DomainError } from '../../contracts/errors.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import { parseGitHubReleasePayload, type AppUpdateInfo } from '../../domain/updater.ts';

export const GITHUB_REPO_RELEASES_URL =
  'https://api.github.com/repos/SharkLog76/OpenPDF/releases/latest';

export interface UpdateCheckDeps {
  readonly fetchFn: typeof fetch;
  readonly getAppVersion: () => string;
  readonly now: () => number;
}

const DEFAULT_DEPS: UpdateCheckDeps = {
  fetchFn: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : async () => new Response(),
  getAppVersion: () => '0.1.2',
  now: () => Date.now(),
};

export class UpdateCheckService {
  private lastCheckMs = 0;
  private lastResult: AppUpdateInfo | null = null;
  private readonly minIntervalMs = 15 * 60 * 1000; // 15 minutes cooldown

  constructor(private readonly deps: UpdateCheckDeps = DEFAULT_DEPS) {}

  /**
   * Checks whether a newer release is published on GitHub.
   * @param force If true, bypasses the 15-minute cooldown cache.
   */
  async checkForUpdates(force = false): Promise<Result<AppUpdateInfo, DomainError>> {
    const now = this.deps.now();
    if (!force && this.lastResult && now - this.lastCheckMs < this.minIntervalMs) {
      return ok(this.lastResult);
    }

    const currentVersion = this.deps.getAppVersion();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await this.deps.fetchFn(GITHUB_REPO_RELEASES_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': `OpenPDF/${currentVersion}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 404) {
        // No release published yet
        const emptyInfo: AppUpdateInfo = {
          currentVersion,
          latestVersion: currentVersion,
          isAvailable: false,
          releaseName: `OpenPDF v${currentVersion}`,
          releaseNotes: '',
          releaseUrl: 'https://github.com/SharkLog76/OpenPDF/releases',
          publishedAt: new Date(now).toISOString(),
        };
        this.lastCheckMs = now;
        this.lastResult = emptyInfo;
        return ok(emptyInfo);
      }

      if (!response.ok) {
        return err({
          code: 'ConversionFailed',
          message: `Échec de vérification des mises à jour (HTTP ${response.status}).`,
        });
      }

      const json = await response.json();
      const parsed = parseGitHubReleasePayload(json, currentVersion);
      if (!parsed) {
        return err({
          code: 'ConversionFailed',
          message: 'Format de réponse GitHub Releases invalide ou manquant.',
        });
      }

      this.lastCheckMs = now;
      this.lastResult = parsed;
      return ok(parsed);
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      return err({
        code: 'ConversionFailed',
        message: isAbort
          ? 'Délai d’attente dépassé lors de la vérification des mises à jour.'
          : `Impossible de contacter le serveur de mise à jour (${e instanceof Error ? e.message : String(e)}).`,
      });
    }
  }
}
