/**
 * Pure Domain models and SemVer comparison algorithms for App Updates.
 */

export interface UpdateReleaseAsset {
  readonly name: string;
  readonly downloadUrl: string;
  readonly sizeBytes: number;
  readonly isInstaller: boolean;
}

export interface AppUpdateInfo {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly isAvailable: boolean;
  readonly releaseName: string;
  readonly releaseNotes: string;
  readonly releaseUrl: string;
  readonly publishedAt: string;
  readonly installerAsset?: UpdateReleaseAsset;
}

/**
 * Normalizes version string by removing leading 'v' or 'V' and trimming whitespace.
 */
export function normalizeVersionString(version: string): string {
  return version.trim().replace(/^[vV]/, '');
}

/**
 * Compares two semantic version strings (X.Y.Z).
 * Returns:
 *  > 0 if vA > vB
 *  < 0 if vA < vB
 *    0 if vA == vB
 */
export function compareSemver(vA: string, vB: string): number {
  const normA = normalizeVersionString(vA);
  const normB = normalizeVersionString(vB);

  const partsA = normA.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = normB.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(3, partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = partsA[i] ?? 0;
    const b = partsB[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Checks whether latestVersion is strictly strictly newer than currentVersion.
 */
export function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareSemver(latestVersion, currentVersion) > 0;
}

interface RawGitHubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface RawGitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: RawGitHubAsset[];
}

/**
 * Deterministically parses a GitHub Release API payload against the running application version.
 */
export function parseGitHubReleasePayload(
  payload: unknown,
  currentVersion: string
): AppUpdateInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rel = payload as RawGitHubRelease;
  const tagName = rel.tag_name;
  if (!tagName || typeof tagName !== 'string') {
    return null;
  }

  const latestVersion = normalizeVersionString(tagName);
  const isAvailable = isUpdateAvailable(currentVersion, latestVersion);

  const assets: UpdateReleaseAsset[] = Array.isArray(rel.assets)
    ? rel.assets
        .filter((a): a is RawGitHubAsset => Boolean(a && typeof a.browser_download_url === 'string'))
        .map((a) => {
          const name = String(a.name || 'installer');
          const isInstaller = name.endsWith('.exe') || name.endsWith('.msi');
          return {
            name,
            downloadUrl: String(a.browser_download_url),
            sizeBytes: Number(a.size || 0),
            isInstaller,
          };
        })
    : [];

  // Prefer Windows setup.exe, then .msi, then any installer
  const installerAsset =
    assets.find((a) => a.name.endsWith('-setup.exe')) ??
    assets.find((a) => a.name.endsWith('.exe')) ??
    assets.find((a) => a.name.endsWith('.msi')) ??
    assets.find((a) => a.isInstaller);

  return {
    currentVersion: normalizeVersionString(currentVersion),
    latestVersion,
    isAvailable,
    releaseName: rel.name || `OpenPDF v${latestVersion}`,
    releaseNotes: rel.body || 'Mise à jour d’OpenPDF avec nouvelles améliorations et correctifs.',
    releaseUrl: rel.html_url || `https://github.com/SharkLog76/OpenPDF/releases/tag/${tagName}`,
    publishedAt: rel.published_at || new Date().toISOString(),
    installerAsset,
  };
}
