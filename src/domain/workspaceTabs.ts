export const MAX_OPEN_TABS_PER_WINDOW = 12;

export const EXTERNAL_OPEN_PREF_STORAGE_KEY = 'openpdf.externalOpenPreference';
export const DEFAULT_PDF_BANNER_DISMISSED_KEY = 'openpdf.defaultPdfPromptDismissed';

export type ExternalOpenPreference = 'ask' | 'current-window' | 'new-window';

export interface TabIdentity {
  readonly id: string;
  readonly fileName: string;
  readonly isDirty: boolean;
}

export interface TabClosePolicyDecision {
  readonly action: 'close-immediately' | 'prompt-save';
  readonly dirtyTabs: readonly TabIdentity[];
}

export interface WindowClosePolicyDecision {
  readonly shouldIntercept: boolean;
  readonly hasDirtyTabs: boolean;
  readonly isMultiTab: boolean;
  readonly tabCount: number;
  readonly dirtyTabs: readonly TabIdentity[];
}

export interface DragDetachEvaluationInput {
  readonly tabsCount: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pullOutYThreshold?: number;
  readonly outsideMarginPx?: number;
}

/**
 * Reorders a tab list immutably by moving `sourceId` to `targetIndex`.
 */
export function reorderTabs<T extends { readonly id: string }>(
  tabs: readonly T[],
  sourceId: string,
  targetIndex: number
): T[] {
  const fromIndex = tabs.findIndex((t) => t.id === sourceId);
  if (fromIndex < 0 || tabs.length < 2) {
    return [...tabs];
  }
  const boundedTarget = Math.max(0, Math.min(tabs.length - 1, targetIndex));
  if (fromIndex === boundedTarget) {
    return [...tabs];
  }
  const next = [...tabs];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return [...tabs];
  next.splice(boundedTarget, 0, moved);
  return next;
}

/**
 * Selects the fallback active tab ID after closing `closedTabId`.
 */
export function computeNextActiveTabAfterClose<T extends { readonly id: string }>(
  tabs: readonly T[],
  closedTabId: string,
  currentActiveId: string | null
): string | null {
  const closedIdx = tabs.findIndex((t) => t.id === closedTabId);
  const remaining = tabs.filter((t) => t.id !== closedTabId);
  if (remaining.length === 0) return null;
  if (currentActiveId && currentActiveId !== closedTabId) {
    return remaining.some((t) => t.id === currentActiveId)
      ? currentActiveId
      : remaining[0].id;
  }
  const nextIdx = Math.min(Math.max(0, closedIdx), remaining.length - 1);
  return remaining[nextIdx].id;
}

/**
 * Evaluates whether closing a single tab must prompt the user to save unsaved edits.
 */
export function evaluateTabClosePolicy(tab: TabIdentity): TabClosePolicyDecision {
  if (tab.isDirty) {
    return {
      action: 'prompt-save',
      dirtyTabs: [tab],
    };
  }
  return {
    action: 'close-immediately',
    dirtyTabs: [],
  };
}

/**
 * Evaluates whether closing an OpenPDF window must intercept for unsaved work or multi-tab warning.
 */
export function evaluateWindowClosePolicy(
  tabs: readonly TabIdentity[]
): WindowClosePolicyDecision {
  const dirtyTabs = tabs.filter((t) => t.isDirty);
  const isMultiTab = tabs.length > 1;
  return {
    shouldIntercept: dirtyTabs.length > 0 || isMultiTab,
    hasDirtyTabs: dirtyTabs.length > 0,
    isMultiTab,
    tabCount: tabs.length,
    dirtyTabs,
  };
}

/**
 * Determines whether a dragged tab pointer coordinate indicates tearing out into a new OS window.
 */
export function isDragDetachTriggered(input: DragDetachEvaluationInput): boolean {
  if (input.tabsCount <= 1) return false;
  const margin = input.outsideMarginPx ?? 24;
  const pullY = input.pullOutYThreshold ?? 140;

  const outsideLeft = input.clientX < -margin;
  const outsideRight = input.clientX > input.viewportWidth + margin;
  const outsideTop = input.clientY < -margin;
  const outsideBottom = input.clientY > input.viewportHeight + margin;
  const tornDownwardOutOfBar = input.clientY > pullY;

  return outsideLeft || outsideRight || outsideTop || outsideBottom || tornDownwardOutOfBar;
}

/**
 * Parses stored external PDF open preference safely.
 */
export function parseExternalOpenPreference(raw: string | null | undefined): ExternalOpenPreference {
  if (raw === 'current-window' || raw === 'new-window' || raw === 'ask') {
    return raw;
  }
  return 'ask';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Losslessly serializes tab state (including embedded Uint8Array image payloads) to JSON.
 */
export function serializeDetachedTabState(payload: unknown): string {
  return JSON.stringify(payload, (_key, value: unknown) => {
    if (value instanceof Uint8Array) {
      return { __openpdf_u8b64: uint8ToBase64(value) };
    }
    return value;
  });
}

/**
 * Deserializes detached tab state JSON back with restored Uint8Array buffers.
 */
export function deserializeDetachedTabState<T>(json: string): T | null {
  try {
    return JSON.parse(json, (key, value: unknown) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        '__openpdf_u8b64' in value &&
        typeof (value as { __openpdf_u8b64: unknown }).__openpdf_u8b64 === 'string'
      ) {
        return base64ToUint8((value as { __openpdf_u8b64: string }).__openpdf_u8b64);
      }
      return value;
    }) as T;
  } catch {
    return null;
  }
}
