import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Circle,
  CopyPlus,
  Crop,
  Droplets,
  Eraser,
  FileInput,
  FileOutput,
  FilePlus2,
  FolderOpen,
  FormInput,
  Highlighter,
  ImagePlus,
  LayoutGrid,
  Link2,
  MousePointer,
  PenLine,
  PenTool,
  Redo2,
  RotateCw,
  Save,
  ShieldAlert,
  Square,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DocumentExportService } from '../../application/converter/DocumentExportService.ts';
import type { CommandLedgerSnapshot } from '../../application/ledger/CommandLedger.ts';
import { DocumentSessionService, type OpenedSessionBundle } from '../../application/session/DocumentSession.ts';
import { formatDomainError } from '../../contracts/errors.ts';
import type { ConversionAuditReport, ExportRequestOptions } from '../../domain/converter.ts';
import type {
  AnnotationOverlayItem,
  CreatedFormFieldItem,
  EditCommand,
  EditorDocumentState,
  HeaderFooterConfig,
  ImageOverlayItem,
  LinkAnnotationItem,
  NormalizedRect,
  PageBackgroundConfig,
  PageCropConfig,
  TextOverlayItem,
  WatermarkConfig,
  WhiteoutRectItem,
} from '../../domain/editor.ts';
import type {
  CertificateMetadata,
  SignatureMetadataOverlay,
  SignaturePlacement,
  VisualSignatureAsset,
} from '../../domain/signing.ts';
import { clampZoom, rotateDisplayCW, type DisplayRotation, type SearchMatch, type ViewMode } from '../../domain/viewer.ts';
import {
  DEFAULT_PDF_BANNER_DISMISSED_KEY,
  EXTERNAL_OPEN_PREF_STORAGE_KEY,
  MAX_OPEN_TABS_PER_WINDOW,
  computeNextActiveTabAfterClose,
  deserializeDetachedTabState,
  evaluateTabClosePolicy,
  evaluateWindowClosePolicy,
  parseExternalOpenPreference,
  reorderTabs,
  serializeDetachedTabState,
} from '../../domain/workspaceTabs.ts';
import {
  createTypographicStampAsset,
  generateSelfSignedPkcs12,
  normalizeSignatureImageFile,
  parsePkcs12Container,
} from '../../providers/crypto/signatureProvider.ts';
import {
  admitPdfFile,
  deriveNextVersionFilename,
  extractDropFileHandle,
  hasWritableDiskOrigin,
  openPdfWithNativePicker,
  overwriteOriginalFile,
  saveAsNewFileVersion,
  supportsNativeFileSystemAccess,
  triggerBrowserDownload,
  type FileOriginHandle,
} from '../../providers/filesystem/boundedFileSystem.ts';
import { SignatureVaultStore } from '../../providers/storage/signatureVaultStore.ts';
import {
  checkDefaultPdfStatusTauri,
  detachTabToNewWindowTauri,
  forceCloseCurrentWindowTauri,
  isTauriRuntime,
  openPathInNewWindowTauri,
  overwritePdfAtPathTauri,
  pickOpenPdfTauri,
  readPdfAtPathTauri,
  registerAndOpenDefaultPdfSettingsTauri,
  saveAsPdfTauri,
  saveExportFileTauri,
  subscribeExternalOpenPdfRequests,
  subscribeTauriDragDrop,
  subscribeWindowCloseRequested,
  syncDesktopWindowTitle,
  takeWindowLaunchPayloadTauri,
} from '../host/tauriBridge.ts';
import { AcrobatMenuBar, type AcrobatAtelierId } from './components/AcrobatMenuBar.tsx';
import { DocumentTabBar, type DocumentTabItem } from './components/DocumentTabBar.tsx';
import { ExportFormatsModal } from './components/ExportFormatsModal.tsx';
import { LeftSidebar, type LeftTabId } from './components/LeftSidebar.tsx';
import { PageOrganizerGrid } from './components/PageOrganizerGrid.tsx';
import { PdfPageCanvas, type EditorToolMode } from './components/PdfPageCanvas.tsx';
import {
  CloseConfirmModal,
  DocumentPropertiesModal,
  ExternalOpenChoiceModal,
  SaveStrategyModal,
  ShortcutsModal,
} from './components/SaveAndDialogs.tsx';
import { SignatureVaultPanel, type RightTabId } from './components/SignatureVaultPanel.tsx';

interface WorkspaceTab {
  readonly id: string;
  readonly sessionService: DocumentSessionService;
  readonly bundle: OpenedSessionBundle;
  readonly editorState: EditorDocumentState;
  readonly originHandle: FileOriginHandle | null;
  readonly ledgerTick: number;
  readonly savedRevision: number;
  readonly rememberOverwrite: boolean;
  readonly currentPage: number;
  readonly zoom: number;
  readonly globalRotation: DisplayRotation;
  readonly viewMode: ViewMode;
  readonly showOrganizer: boolean;
  readonly activeTool: EditorToolMode;
  readonly selectedOverlayId: string | null;
  readonly searchQuery: string;
  readonly searchMatches: readonly SearchMatch[];
  readonly signaturePlacements: readonly SignaturePlacement[];
}

interface SerializedDetachedState {
  readonly ledgerSnapshot: CommandLedgerSnapshot;
  readonly savedRevision: number;
  readonly rememberOverwrite: boolean;
  readonly currentPage: number;
  readonly zoom: number;
  readonly globalRotation: DisplayRotation;
  readonly viewMode: ViewMode;
  readonly signaturePlacements: readonly SignaturePlacement[];
}

interface PendingCloseModalState {
  readonly mode: 'single-tab' | 'window-close';
  readonly targetTabId?: string;
  readonly tabCount: number;
  readonly dirtyTabs: readonly { readonly id: string; readonly fileName: string }[];
}

function isTabDirty(tab: WorkspaceTab): boolean {
  return (
    tab.bundle.ledger.currentRevision !== tab.savedRevision ||
    tab.signaturePlacements.length > 0
  );
}

function nextTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const App: React.FC = () => {
  const exportService = useMemo(() => new DocumentExportService(), []);
  const vaultStore = useMemo(() => new SignatureVaultStore(), []);

  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeFileInputRef = useRef<HTMLInputElement | null>(null);
  const insertPdfInputRef = useRef<HTMLInputElement | null>(null);
  const insertImageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingInsertPdfIndexRef = useRef<number>(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const detachingTabIdsRef = useRef<Set<string>>(new Set());
  const bypassCloseInterceptRef = useRef<boolean>(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const tabsRef = useRef<WorkspaceTab[]>([]);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTabId;

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // Shared studio layout state
  const [activeAtelier, setActiveAtelier] = useState<AcrobatAtelierId>('all-tools');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTabId>('all-tools');
  const [rightTab, setRightTab] = useState<RightTabId>('format');

  // Dialogs & Desktop Integration UI state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportAudit, setLastExportAudit] = useState<ConversionAuditReport | null>(null);
  const [lastExportSavedLabel, setLastExportSavedLabel] = useState<string | null>(null);
  const [pendingCloseModal, setPendingCloseModal] = useState<PendingCloseModalState | null>(null);
  const [isClosingSaving, setIsClosingSaving] = useState(false);
  const [pendingExternalOpenPaths, setPendingExternalOpenPaths] = useState<readonly string[] | null>(null);
  const [showDefaultPdfBanner, setShowDefaultPdfBanner] = useState(false);

  const [isSearching, setIsSearching] = useState(false);

  // Password prompt modal
  const [pendingEncryptedBytes, setPendingEncryptedBytes] = useState<{
    bytes: Uint8Array;
    name: string;
    origin: FileOriginHandle;
    targetTabId?: string;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  // Status / Error banner
  const [banner, setBanner] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // Signature Vault & Global P12 identity
  const [vaultAssets, setVaultAssets] = useState<VisualSignatureAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [applyToAllPages, setApplyToAllPages] = useState(false);
  const [sigMeta, setSigMeta] = useState<SignatureMetadataOverlay>({
    signerName: 'Alexandre Martin',
    reason: 'Bon pour accord',
    location: 'Local',
    signedAtIso: new Date().toISOString(),
    showMetadataBox: true,
  });

  // PKCS#12 in-memory state (never persisted to disk or IndexedDB)
  const [loadedP12Bytes, setLoadedP12Bytes] = useState<Uint8Array | null>(null);
  const [loadedP12Name, setLoadedP12Name] = useState<string | null>(null);
  const [loadedCertMeta, setLoadedCertMeta] = useState<CertificateMetadata | null>(null);
  const [p12Passphrase, setP12Passphrase] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load encrypted vault on startup
  useEffect(() => {
    void vaultStore.listAssets().then((res) => {
      if (res.ok) {
        setVaultAssets(res.value);
        if (res.value.length > 0) setSelectedAssetId(res.value[0].id);
      }
    });
  }, [vaultStore]);

  // Dispose every open PDF.js handle on window unmount
  useEffect(() => {
    return () => {
      for (const tab of tabsRef.current) {
        void tab.sessionService.dispose();
      }
    };
  }, []);

  const assetsMap = useMemo(() => {
    const m = new Map<string, VisualSignatureAsset>();
    for (const a of vaultAssets) m.set(a.id, a);
    return m;
  }, [vaultAssets]);

  const updateTab = useCallback(
    (tabId: string, updater: (prev: WorkspaceTab) => WorkspaceTab) => {
      setTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
    },
    []
  );

  const openFromBytes = useCallback(
    async (
      rawBytes: Uint8Array,
      displayName: string,
      nextOrigin: FileOriginHandle,
      options?: {
        readonly password?: string;
        readonly targetTabId?: string;
        readonly resetOverwritePref?: boolean;
        readonly restored?: SerializedDetachedState;
        readonly allowDuplicatePath?: boolean;
      }
    ): Promise<string | null> => {
      // Focus existing tab if this disk path is already open in this window
      if (!options?.targetTabId && !options?.allowDuplicatePath && nextOrigin.kind === 'tauri-path') {
        const existing = tabsRef.current.find(
          (t) => t.originHandle?.kind === 'tauri-path' && t.originHandle.path === nextOrigin.path
        );
        if (existing) {
          setActiveTabId(existing.id);
          setBanner({
            kind: 'info',
            text: `Document déjà ouvert dans l’onglet « ${existing.bundle.identity.displayName} ».`,
          });
          return existing.id;
        }
      }

      if (!options?.targetTabId && tabsRef.current.length >= MAX_OPEN_TABS_PER_WINDOW) {
        setBanner({
          kind: 'error',
          text: `Limite de ${MAX_OPEN_TABS_PER_WINDOW} onglets atteinte dans cette fenêtre. Détachez un onglet dans une nouvelle fenêtre ou fermez-en un.`,
        });
        return null;
      }

      const existingTarget = options?.targetTabId
        ? tabsRef.current.find((t) => t.id === options.targetTabId)
        : undefined;
      const service = existingTarget?.sessionService ?? new DocumentSessionService();

      const res = await service.openFromBytes(
        rawBytes,
        displayName,
        options?.password,
        options?.restored?.ledgerSnapshot
      );
      if (!res.ok) {
        if (!existingTarget) void service.dispose();
        if (res.error.code === 'PasswordRequired' || res.error.code === 'IncorrectPassword') {
          setPendingEncryptedBytes({
            bytes: rawBytes,
            name: displayName,
            origin: nextOrigin,
            targetTabId: options?.targetTabId,
          });
          setBanner({ kind: 'error', text: formatDomainError(res.error) });
          return null;
        }
        setBanner({ kind: 'error', text: formatDomainError(res.error) });
        return null;
      }

      setPendingEncryptedBytes(null);
      setPasswordInput('');

      const opened = res.value;
      const restored = options?.restored;
      const tabId = existingTarget?.id ?? nextTabId();

      const nextTab: WorkspaceTab = {
        id: tabId,
        sessionService: service,
        bundle: opened,
        editorState: opened.ledger.currentState,
        originHandle: nextOrigin,
        ledgerTick: opened.ledger.currentRevision,
        savedRevision: restored?.savedRevision ?? opened.ledger.currentRevision,
        rememberOverwrite:
          restored?.rememberOverwrite ??
          (options?.resetOverwritePref === false ? existingTarget?.rememberOverwrite ?? false : false),
        currentPage: restored?.currentPage ?? 0,
        zoom: restored?.zoom ?? 1.05,
        globalRotation: restored?.globalRotation ?? 0,
        viewMode: restored?.viewMode ?? 'continuous',
        showOrganizer: false,
        activeTool: existingTarget?.activeTool ?? 'read',
        selectedOverlayId: null,
        searchQuery: '',
        searchMatches: [],
        signaturePlacements: restored?.signaturePlacements ?? [],
      };

      if (existingTarget) {
        setTabs((prev) => prev.map((t) => (t.id === tabId ? nextTab : t)));
      } else {
        setTabs((prev) => [...prev, nextTab]);
      }
      setActiveTabId(tabId);
      setBanner({
        kind: 'info',
        text: `Document chargé : ${opened.identity.displayName} (${opened.metadata.pageCount} page(s), SHA-256 ${opened.identity.sha256.slice(0, 12)}…)`,
      });
      return tabId;
    },
    []
  );

  const handleOpenTauriPath = useCallback(
    async (path: string, targetTabId?: string) => {
      const loaded = await readPdfAtPathTauri(path);
      if (!loaded.ok) {
        setBanner({ kind: 'error', text: formatDomainError(loaded.error) });
        return null;
      }
      return openFromBytes(
        loaded.value.bytes,
        loaded.value.fileName,
        {
          kind: 'tauri-path',
          path: loaded.value.path,
          displayName: loaded.value.fileName,
        },
        { targetTabId }
      );
    },
    [openFromBytes]
  );

  const activeDirty = activeTab ? isTabDirty(activeTab) : false;

  // Sync Tauri window title with active tab
  useEffect(() => {
    void syncDesktopWindowTitle(activeTab?.bundle.identity.displayName ?? null, activeDirty);
  }, [activeTab?.bundle.identity.displayName, activeDirty]);

  // Startup Desktop payload (CLI PDF args, new-instance path, or torn-off tab hydration) & Default PDF prompt
  const launchPayloadConsumedRef = useRef(false);
  useEffect(() => {
    if (!isTauriRuntime() || launchPayloadConsumedRef.current) return;
    launchPayloadConsumedRef.current = true;

    void takeWindowLaunchPayloadTauri().then(async (payload) => {
      if (!payload) return;
      if (payload.kind === 'cliArgs') {
        for (const p of payload.paths) {
          await handleOpenTauriPath(p);
        }
      } else if (payload.kind === 'openPath') {
        await handleOpenTauriPath(payload.path);
      } else if (payload.kind === 'detachedTab') {
        const parsed = payload.stateJson
          ? deserializeDetachedTabState<SerializedDetachedState>(payload.stateJson)
          : null;
        const origin: FileOriginHandle = payload.originPath
          ? { kind: 'tauri-path', path: payload.originPath, displayName: payload.fileName }
          : { kind: 'memory', displayName: payload.fileName };
        await openFromBytes(new Uint8Array(payload.bytes), payload.fileName, origin, {
          restored: parsed ?? undefined,
          allowDuplicatePath: true,
        });
      }
    });

    if (localStorage.getItem(DEFAULT_PDF_BANNER_DISMISSED_KEY) !== '1') {
      void checkDefaultPdfStatusTauri().then((status) => {
        if (status && !status.isDefault && status.canOpenSystemSettings) {
          setShowDefaultPdfBanner(true);
        }
      });
    }
  }, [handleOpenTauriPath, openFromBytes]);

  // Listen for OS Explorer drag-and-drop & secondary single-instance open requests
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    let unlistenDrop: (() => void) | null = null;
    let unlistenExt: (() => void) | null = null;

    void subscribeTauriDragDrop((path) => {
      if (!active) return;
      void handleOpenTauriPath(path);
    }).then((fn) => {
      if (active) unlistenDrop = fn;
      else fn();
    });

    void subscribeExternalOpenPdfRequests((paths) => {
      if (!active || paths.length === 0) return;
      const pref = parseExternalOpenPreference(
        localStorage.getItem(EXTERNAL_OPEN_PREF_STORAGE_KEY)
      );
      if (pref === 'current-window') {
        void (async () => {
          for (const p of paths) {
            await handleOpenTauriPath(p);
          }
        })();
        return;
      }
      if (pref === 'new-window') {
        void (async () => {
          for (const p of paths) {
            await openPathInNewWindowTauri(p);
          }
        })();
        return;
      }
      setPendingExternalOpenPaths(paths);
    }).then((fn) => {
      if (active) unlistenExt = fn;
      else fn();
    });

    return () => {
      active = false;
      unlistenDrop?.();
      unlistenExt?.();
    };
  }, [handleOpenTauriPath]);

  // Intercept OS window close button (X / Alt+F4) whenever any tab is dirty or > 1 tabs are open
  useEffect(() => {
    if (!isTauriRuntime()) {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (tabsRef.current.some(isTabDirty)) {
          e.preventDefault();
          e.returnValue = '';
        }
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }

    let active = true;
    let unlistenClose: (() => void) | null = null;
    void subscribeWindowCloseRequested(
      () => {
        if (bypassCloseInterceptRef.current) return false;
        const summary = evaluateWindowClosePolicy(
          tabsRef.current.map((t) => ({
            id: t.id,
            fileName: t.bundle.identity.displayName,
            isDirty: isTabDirty(t),
          }))
        );
        return summary.shouldIntercept;
      },
      () => {
        if (!active) return;
        const summary = evaluateWindowClosePolicy(
          tabsRef.current.map((t) => ({
            id: t.id,
            fileName: t.bundle.identity.displayName,
            isDirty: isTabDirty(t),
          }))
        );
        setPendingCloseModal({
          mode: 'window-close',
          tabCount: summary.tabCount,
          dirtyTabs: summary.dirtyTabs,
        });
      }
    ).then((fn) => {
      if (active) unlistenClose = fn;
      else fn();
    });

    return () => {
      active = false;
      unlistenClose?.();
    };
  }, []);

  const handleConfigureDefaultPdf = useCallback(async () => {
    const res = await registerAndOpenDefaultPdfSettingsTauri();
    if (!res.ok) {
      setBanner({ kind: 'error', text: formatDomainError(res.error) });
      return;
    }
    setShowDefaultPdfBanner(false);
    setBanner({
      kind: 'info',
      text: 'OpenPDF est inscrit pour votre session Windows. Dans la fenêtre Paramètres qui vient de s’ouvrir, choisissez « Définir par défaut » pour .pdf.',
    });
  }, []);

  const handleTriggerOpenFile = useCallback(async () => {
    if (isTauriRuntime()) {
      const picked = await pickOpenPdfTauri();
      if (!picked.ok) {
        setBanner({ kind: 'error', text: formatDomainError(picked.error) });
        return;
      }
      if (!picked.value) return;
      await openFromBytes(picked.value.bytes, picked.value.fileName, {
        kind: 'tauri-path',
        path: picked.value.path,
        displayName: picked.value.fileName,
      });
      return;
    }
    if (supportsNativeFileSystemAccess()) {
      const picked = await openPdfWithNativePicker();
      if (!picked.ok) {
        setBanner({ kind: 'error', text: formatDomainError(picked.error) });
        return;
      }
      if (!picked.value) return;
      const buf = new Uint8Array(await picked.value.file.arrayBuffer());
      await openFromBytes(buf, picked.value.file.name, {
        kind: 'fs-handle',
        handle: picked.value.handle,
        displayName: picked.value.file.name,
      });
      return;
    }
    openFileInputRef.current?.click();
  }, [openFromBytes]);

  const handleOpenSample = useCallback(async () => {
    const tempService = new DocumentSessionService();
    const res = await tempService.openSampleDocument();
    if (!res.ok) {
      await tempService.dispose();
      setBanner({ kind: 'error', text: formatDomainError(res.error) });
      return;
    }
    // Adopt the created session service directly into a new tab
    if (tabsRef.current.length >= MAX_OPEN_TABS_PER_WINDOW) {
      await tempService.dispose();
      setBanner({
        kind: 'error',
        text: `Limite de ${MAX_OPEN_TABS_PER_WINDOW} onglets atteinte dans cette fenêtre.`,
      });
      return;
    }
    const opened = res.value;
    const id = nextTabId();
    const nextTab: WorkspaceTab = {
      id,
      sessionService: tempService,
      bundle: opened,
      editorState: opened.ledger.currentState,
      originHandle: { kind: 'sample', displayName: opened.identity.displayName },
      ledgerTick: opened.ledger.currentRevision,
      savedRevision: opened.ledger.currentRevision,
      rememberOverwrite: false,
      currentPage: 0,
      zoom: 1.05,
      globalRotation: 0,
      viewMode: 'continuous',
      showOrganizer: false,
      activeTool: 'read',
      selectedOverlayId: null,
      searchQuery: '',
      searchMatches: [],
      signaturePlacements: [],
    };
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(id);
    setBanner({
      kind: 'info',
      text: `Document de démonstration chargé : ${opened.identity.displayName}.`,
    });
  }, []);

  const handleNewBlankDocument = useCallback(async () => {
    const tempService = new DocumentSessionService();
    const res = await tempService.openBlankDocument();
    if (!res.ok) {
      await tempService.dispose();
      setBanner({ kind: 'error', text: formatDomainError(res.error) });
      return;
    }
    if (tabsRef.current.length >= MAX_OPEN_TABS_PER_WINDOW) {
      await tempService.dispose();
      setBanner({
        kind: 'error',
        text: `Limite de ${MAX_OPEN_TABS_PER_WINDOW} onglets atteinte dans cette fenêtre.`,
      });
      return;
    }
    const opened = res.value;
    const id = nextTabId();
    const nextTab: WorkspaceTab = {
      id,
      sessionService: tempService,
      bundle: opened,
      editorState: opened.ledger.currentState,
      originHandle: { kind: 'memory', displayName: opened.identity.displayName },
      ledgerTick: opened.ledger.currentRevision,
      savedRevision: opened.ledger.currentRevision,
      rememberOverwrite: false,
      currentPage: 0,
      zoom: 1.05,
      globalRotation: 0,
      viewMode: 'continuous',
      showOrganizer: false,
      activeTool: 'add-text',
      selectedOverlayId: null,
      searchQuery: '',
      searchMatches: [],
      signaturePlacements: [],
    };
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(id);
    setActiveAtelier('edit');
    setRightTab('format');
  }, []);

  const closeTabImmediately = useCallback((tabId: string) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target) return;
    const nextActive = computeNextActiveTabAfterClose(
      tabsRef.current,
      tabId,
      activeTabIdRef.current
    );
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId(nextActive);
    void target.sessionService.dispose();
  }, []);

  const handleRequestCloseTab = useCallback(
    (tabId: string) => {
      const target = tabsRef.current.find((t) => t.id === tabId);
      if (!target) return;
      const decision = evaluateTabClosePolicy({
        id: target.id,
        fileName: target.bundle.identity.displayName,
        isDirty: isTabDirty(target),
      });
      if (decision.action === 'close-immediately') {
        closeTabImmediately(tabId);
        return;
      }
      setPendingCloseModal({
        mode: 'single-tab',
        targetTabId: tabId,
        tabCount: 1,
        dirtyTabs: decision.dirtyTabs,
      });
    },
    [closeTabImmediately]
  );

  const handleRequestWindowClose = useCallback(() => {
    const summary = evaluateWindowClosePolicy(
      tabsRef.current.map((t) => ({
        id: t.id,
        fileName: t.bundle.identity.displayName,
        isDirty: isTabDirty(t),
      }))
    );
    if (!summary.shouldIntercept) {
      bypassCloseInterceptRef.current = true;
      void forceCloseCurrentWindowTauri();
      return;
    }
    setPendingCloseModal({
      mode: 'window-close',
      tabCount: summary.tabCount,
      dirtyTabs: summary.dirtyTabs,
    });
  }, []);

  const handleDetachTab = useCallback(
    async (tabId: string, screenX?: number, screenY?: number) => {
      const target = tabsRef.current.find((t) => t.id === tabId);
      if (!target || tabsRef.current.length <= 1 || detachingTabIdsRef.current.has(tabId)) return;

      detachingTabIdsRef.current.add(tabId);
      try {
        const snapshotState: SerializedDetachedState = {
          ledgerSnapshot: target.bundle.ledger.exportSnapshot(),
          savedRevision: target.savedRevision,
          rememberOverwrite: target.rememberOverwrite,
          currentPage: target.currentPage,
          zoom: target.zoom,
          globalRotation: target.globalRotation,
          viewMode: target.viewMode,
          signaturePlacements: target.signaturePlacements,
        };
        const stateJson = serializeDetachedTabState(snapshotState);

        const res = await detachTabToNewWindowTauri({
          fileName: target.bundle.identity.displayName,
          originPath: target.originHandle?.kind === 'tauri-path' ? target.originHandle.path : null,
          bytes: target.bundle.sourceBytes,
          stateJson,
          screenX,
          screenY,
        });
        if (!res.ok) {
          setBanner({ kind: 'error', text: formatDomainError(res.error) });
          return;
        }
        closeTabImmediately(tabId);
        setBanner({
          kind: 'info',
          text: `Onglet « ${target.bundle.identity.displayName} » détaché dans une nouvelle fenêtre.`,
        });
      } finally {
        detachingTabIdsRef.current.delete(tabId);
      }
    },
    [closeTabImmediately]
  );

  const handleReloadOriginal = useCallback(async () => {
    if (!activeTab) return;
    if (activeTab.originHandle?.kind === 'tauri-path') {
      const reloaded = await readPdfAtPathTauri(activeTab.originHandle.path);
      if (reloaded.ok) {
        await openFromBytes(reloaded.value.bytes, reloaded.value.fileName, activeTab.originHandle, {
          targetTabId: activeTab.id,
        });
        return;
      }
    }
    if (activeTab.originHandle?.kind === 'fs-handle') {
      try {
        const diskFile = await activeTab.originHandle.handle.getFile();
        const bytes = new Uint8Array(await diskFile.arrayBuffer());
        await openFromBytes(bytes, diskFile.name, activeTab.originHandle, {
          targetTabId: activeTab.id,
        });
        return;
      } catch {
        // Fallback to cached sourceBytes
      }
    }
    await openFromBytes(
      activeTab.bundle.sourceBytes,
      activeTab.bundle.identity.displayName,
      activeTab.originHandle ?? { kind: 'memory', displayName: activeTab.bundle.identity.displayName },
      { targetTabId: activeTab.id }
    );
  }, [activeTab, openFromBytes]);

  const applyCommand = useCallback(
    (cmd: EditCommand) => {
      if (!activeTab) return;
      const res = activeTab.sessionService.applyEdit(activeTab.bundle.ledger, cmd);
      if (!res.ok) {
        setBanner({ kind: 'error', text: formatDomainError(res.error) });
        return;
      }
      const nextState = res.value;
      const nextRev = activeTab.bundle.ledger.currentRevision;
      updateTab(activeTab.id, (prev) => ({
        ...prev,
        editorState: nextState,
        ledgerTick: nextRev,
      }));
    },
    [activeTab, updateTab]
  );

  const handleUndo = useCallback(() => {
    if (!activeTab) return;
    const prevState = activeTab.bundle.ledger.undo();
    if (prevState) {
      const rev = activeTab.bundle.ledger.currentRevision;
      updateTab(activeTab.id, (prev) => ({
        ...prev,
        editorState: prevState,
        ledgerTick: rev,
      }));
    }
  }, [activeTab, updateTab]);

  const handleRedo = useCallback(() => {
    if (!activeTab) return;
    const nextState = activeTab.bundle.ledger.redo();
    if (nextState) {
      const rev = activeTab.bundle.ledger.currentRevision;
      updateTab(activeTab.id, (prev) => ({
        ...prev,
        editorState: nextState,
        ledgerTick: rev,
      }));
    }
  }, [activeTab, updateTab]);

  const jumpToPage = useCallback(
    (pageIdx: number) => {
      if (!activeTab) return;
      updateTab(activeTab.id, (prev) => ({
        ...prev,
        currentPage: pageIdx,
        showOrganizer: false,
      }));
      const el = viewportRef.current?.querySelector(`[data-page-index="${pageIdx}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [activeTab, updateTab]
  );

  const handleRunSearch = async () => {
    if (!activeTab || !activeTab.searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const matches = await activeTab.bundle.renderer.searchText(activeTab.searchQuery, false);
      updateTab(activeTab.id, (prev) => ({ ...prev, searchMatches: matches }));
      if (matches.length > 0) jumpToPage(matches[0].pageIndex);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectAtelier = useCallback(
    (atelier: AcrobatAtelierId) => {
      setActiveAtelier(atelier);
      const tid = activeTabIdRef.current;
      if (atelier === 'organize') {
        if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: true }));
        setLeftTab('thumbnails');
      } else {
        if (atelier === 'edit') {
          if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: 'edit-pdf' }));
          setRightTab('format');
          setShowRightPanel(true);
        } else if (atelier === 'comment') {
          if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: 'highlight' }));
          setRightTab('format');
        } else if (atelier === 'sign') {
          if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: 'place-signature' }));
          setRightTab('signatures');
          setShowRightPanel(true);
        } else if (atelier === 'forms') {
          if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: 'add-form-text' }));
          setLeftTab('forms');
          setShowLeftPanel(true);
        } else {
          if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: 'read' }));
          setLeftTab('all-tools');
        }
      }
    },
    [updateTab]
  );

  const handleSelectToolAction = useCallback(
    (toolName: string) => {
      const tid = activeTabIdRef.current;
      if (toolName === 'organize') {
        setActiveAtelier('organize');
        if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: true }));
        return;
      }
      const mode = toolName as EditorToolMode;
      if (tid) updateTab(tid, (prev) => ({ ...prev, showOrganizer: false, activeTool: mode }));
      if (mode === 'edit-pdf' || mode === 'add-text') {
        setActiveAtelier('edit');
        setRightTab('format');
        setShowRightPanel(true);
      } else if (
        mode === 'highlight' ||
        mode === 'underline' ||
        mode === 'strikeout' ||
        mode === 'rect' ||
        mode === 'ellipse' ||
        mode === 'note' ||
        mode === 'freehand'
      ) {
        setActiveAtelier('comment');
      } else if (mode === 'place-signature') {
        setActiveAtelier('sign');
        setRightTab('signatures');
        setShowRightPanel(true);
      } else if (mode === 'add-form-text' || mode === 'add-form-check') {
        setActiveAtelier('forms');
        setLeftTab('forms');
        setShowLeftPanel(true);
      }
    },
    [updateTab]
  );

  const handleSelectOverlay = useCallback(
    (id: string | null) => {
      if (!activeTab) return;
      updateTab(activeTab.id, (prev) => ({ ...prev, selectedOverlayId: id }));
      if (!id) return;
      if (
        id.includes(':') ||
        activeTab.editorState.existingTextEdits[id] ||
        activeTab.editorState.texts.some((t) => t.id === id)
      ) {
        setRightTab('format');
        setShowRightPanel(true);
      }
    },
    [activeTab, updateTab]
  );

  const handleInsertBlankPage = useCallback(
    (insertAtIndex: number) => {
      if (!activeTab) return;
      applyCommand({
        type: 'INSERT_BLANK_PAGE',
        insertAtIndex,
        created: {
          uid: `p-blank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'blank',
          sourceDocIndex: 0,
          sourcePageIndex: -1,
          addedRotation: 0,
          blankSizePt: { widthPt: 595.28, heightPt: 841.89 },
        },
      });
      setBanner({ kind: 'info', text: `Page blanche insérée à la position ${insertAtIndex + 1}.` });
    },
    [activeTab, applyCommand]
  );

  const handleRequestInsertExternalPdf = useCallback((insertAtIndex: number) => {
    pendingInsertPdfIndexRef.current = insertAtIndex;
    insertPdfInputRef.current?.click();
  }, []);

  const compileTabOutput = useCallback(
    async (tab: WorkspaceTab, withCryptoPkcs7: boolean, flattenForms = false) => {
      const visualPairs = tab.signaturePlacements
        .map((placement) => {
          const asset = assetsMap.get(placement.assetId);
          return asset ? { placement, asset } : null;
        })
        .filter((x): x is { placement: SignaturePlacement; asset: VisualSignatureAsset } => Boolean(x));

      const res = await tab.sessionService.exportSignedPdf(
        tab.bundle.sourceBytes,
        tab.editorState,
        visualPairs,
        withCryptoPkcs7 && loadedP12Bytes
          ? {
              p12Bytes: loadedP12Bytes,
              passphrase: p12Passphrase,
              signerName: sigMeta.signerName,
              reason: sigMeta.reason,
              location: sigMeta.location,
            }
          : undefined,
        flattenForms
      );

      if (!res.ok) {
        setBanner({ kind: 'error', text: formatDomainError(res.error) });
        return null;
      }
      return res.value.pdfBytes;
    },
    [assetsMap, loadedP12Bytes, p12Passphrase, sigMeta]
  );

  const handleInsertExternalPdfFile = async (file: File) => {
    if (!activeTab) return;
    const compiled = await activeTab.sessionService.exportCompiledPdf(
      activeTab.bundle.sourceBytes,
      activeTab.editorState,
      []
    );
    if (!compiled.ok) {
      setBanner({ kind: 'error', text: formatDomainError(compiled.error) });
      return;
    }
    const admitted = await admitPdfFile(file);
    if (!admitted.ok) {
      setBanner({ kind: 'error', text: formatDomainError(admitted.error) });
      return;
    }
    const nextRes = await activeTab.sessionService.insertExternalPdfAt(
      compiled.value,
      admitted.value.bytes,
      pendingInsertPdfIndexRef.current
    );
    if (!nextRes.ok) {
      setBanner({ kind: 'error', text: formatDomainError(nextRes.error) });
      return;
    }
    await openFromBytes(
      nextRes.value,
      activeTab.bundle.identity.displayName,
      activeTab.originHandle ?? { kind: 'memory', displayName: activeTab.bundle.identity.displayName },
      { targetTabId: activeTab.id, resetOverwritePref: false }
    );
  };

  const handleInsertImageFile = async (file: File) => {
    if (!activeTab) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const prep = await activeTab.sessionService.prepareOverlayImage(buf, file.name);
    if (!prep.ok) {
      setBanner({ kind: 'error', text: formatDomainError(prep.error) });
      return;
    }
    const item: ImageOverlayItem = {
      id: `img-${Date.now()}`,
      pageIndex: activeTab.currentPage,
      rect: { x: 0.15, y: 0.18, width: 0.28, height: 0.18 },
      imageBytes: prep.value.bytes,
      mimeType: prep.value.mimeType,
      label: file.name,
    };
    applyCommand({ type: 'INSERT_IMAGE', item });
    updateTab(activeTab.id, (prev) => ({ ...prev, selectedOverlayId: item.id }));
    setBanner({
      kind: 'info',
      text: `Image "${file.name}" insérée sur la page ${activeTab.currentPage + 1}.`,
    });
  };

  const handleMergeFiles = async (files: FileList) => {
    if (!activeTab) return;
    const compiled = await activeTab.sessionService.exportCompiledPdf(
      activeTab.bundle.sourceBytes,
      activeTab.editorState,
      []
    );
    if (!compiled.ok) {
      setBanner({ kind: 'error', text: formatDomainError(compiled.error) });
      return;
    }

    const extraBytes: Uint8Array[] = [];
    for (const file of Array.from(files)) {
      const admitted = await admitPdfFile(file);
      if (!admitted.ok) {
        setBanner({ kind: 'error', text: formatDomainError(admitted.error) });
        return;
      }
      extraBytes.push(admitted.value.bytes);
    }

    const merged = await activeTab.sessionService.mergeWithAdditionalPdfs(compiled.value, extraBytes);
    if (!merged.ok) {
      setBanner({ kind: 'error', text: formatDomainError(merged.error) });
      return;
    }
    const name = `Fusion_${activeTab.bundle.identity.displayName}`;
    await openFromBytes(merged.value, name, { kind: 'memory', displayName: name });
  };

  const handleExtractRange = async (rangeExpr: string) => {
    if (!activeTab) return;
    const compiled = await activeTab.sessionService.exportCompiledPdf(
      activeTab.bundle.sourceBytes,
      activeTab.editorState,
      []
    );
    if (!compiled.ok) {
      setBanner({ kind: 'error', text: formatDomainError(compiled.error) });
      return;
    }
    const extracted = await activeTab.sessionService.extractPages(compiled.value, rangeExpr);
    if (!extracted.ok) {
      setBanner({ kind: 'error', text: formatDomainError(extracted.error) });
      return;
    }
    triggerBrowserDownload(extracted.value, `Extrait_${activeTab.bundle.identity.displayName}`);
    setBanner({ kind: 'info', text: `Pages "${rangeExpr}" extraites et téléchargées.` });
  };

  // Vault handlers
  const persistVaultAsset = async (asset: VisualSignatureAsset) => {
    const saveRes = await vaultStore.saveAsset(asset);
    if (!saveRes.ok) {
      setBanner({ kind: 'error', text: formatDomainError(saveRes.error) });
      return;
    }
    setVaultAssets((prev) => [asset, ...prev]);
    setSelectedAssetId(asset.id);
    setBanner({
      kind: 'info',
      text: `Signature "${asset.label}" enregistrée dans votre coffre local chiffré.`,
    });
  };

  const handleImportSignatureFile = async (file: File, stripWhiteBg: boolean) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const norm = await normalizeSignatureImageFile(bytes, file.name, stripWhiteBg);
    if (!norm.ok) {
      setBanner({ kind: 'error', text: formatDomainError(norm.error) });
      return;
    }
    await persistVaultAsset(norm.value);
  };

  const handleCreateStamp = async (name: string, subtitle: string) => {
    const stamp = await createTypographicStampAsset(name, subtitle);
    if (!stamp.ok) {
      setBanner({ kind: 'error', text: formatDomainError(stamp.error) });
      return;
    }
    await persistVaultAsset(stamp.value);
  };

  const handleDeleteVaultAsset = async (id: string) => {
    await vaultStore.deleteAsset(id);
    setVaultAssets((prev) => prev.filter((a) => a.id !== id));
    if (selectedAssetId === id) setSelectedAssetId(null);
  };

  const handlePlaceSignatureAt = (pageIndex: number, rect: NormalizedRect) => {
    if (!activeTab) return;
    if (!selectedAssetId) {
      setBanner({
        kind: 'error',
        text: 'Sélectionnez ou importez d’abord une signature dans le panneau droit.',
      });
      setRightTab('signatures');
      setShowRightPanel(true);
      return;
    }
    const id = `sig-place-${Date.now()}`;
    updateTab(activeTab.id, (prev) => ({
      ...prev,
      signaturePlacements: [
        ...prev.signaturePlacements,
        {
          id,
          assetId: selectedAssetId,
          pageIndex,
          rect,
          applyToAllPages,
          metadata: { ...sigMeta, signedAtIso: new Date().toISOString() },
        },
      ],
      selectedOverlayId: id,
      activeTool: 'read',
    }));
  };

  const handleImportP12 = async (file: File, passphrase: string) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parsePkcs12Container(bytes, passphrase);
    if (!parsed.ok) {
      setBanner({ kind: 'error', text: formatDomainError(parsed.error) });
      return;
    }
    setLoadedP12Bytes(bytes);
    setLoadedP12Name(file.name);
    setLoadedCertMeta(parsed.value.metadata);
    setBanner({
      kind: 'info',
      text: `Certificat "${parsed.value.metadata.subjectCommonName}" chargé en mémoire vive.`,
    });
  };

  const handleGenerateLocalP12 = async (cn: string, org: string, passphrase: string) => {
    const p12Bytes = generateSelfSignedPkcs12(cn, org, passphrase);
    const parsed = parsePkcs12Container(p12Bytes, passphrase);
    if (!parsed.ok) {
      setBanner({ kind: 'error', text: formatDomainError(parsed.error) });
      return;
    }
    setLoadedP12Bytes(p12Bytes);
    setLoadedP12Name(`${cn.replace(/\s+/g, '_') || 'local'}_cert.p12`);
    setLoadedCertMeta(parsed.value.metadata);
    setP12Passphrase(passphrase);

    const copy = new Uint8Array(p12Bytes.byteLength);
    copy.set(p12Bytes);
    const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/x-pkcs12' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cn.replace(/\s+/g, '_') || 'signer'}.p12`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    setBanner({
      kind: 'info',
      text: `Certificat .p12 généré, téléchargé et prêt (mot de passe : "${passphrase}").`,
    });
  };

  const handleConfirmOverwrite = useCallback(
    async (rememberForSession: boolean, withPkcs7: boolean, tabOverride?: WorkspaceTab): Promise<boolean> => {
      const targetTab = tabOverride ?? activeTab;
      if (!targetTab || !hasWritableDiskOrigin(targetTab.originHandle) || !targetTab.originHandle) {
        return false;
      }
      const bytes = await compileTabOutput(targetTab, withPkcs7, false);
      if (!bytes) return false;

      const wr =
        targetTab.originHandle.kind === 'tauri-path'
          ? await overwritePdfAtPathTauri(targetTab.originHandle.path, bytes)
          : targetTab.originHandle.kind === 'fs-handle'
            ? await overwriteOriginalFile(targetTab.originHandle.handle, bytes)
            : null;
      if (!wr) return false;
      if (!wr.ok) {
        setBanner({ kind: 'error', text: formatDomainError(wr.error) });
        return false;
      }
      if (rememberForSession) {
        updateTab(targetTab.id, (prev) => ({ ...prev, rememberOverwrite: true }));
      }
      setShowSaveModal(false);
      await openFromBytes(bytes, wr.value.fileName, targetTab.originHandle, {
        targetTabId: targetTab.id,
        resetOverwritePref: false,
      });
      if (withPkcs7) setRightTab('inspector');
      setBanner({
        kind: 'info',
        text: `Fichier original écrasé atomiquement : ${wr.value.fileName} (${Math.round(wr.value.byteLength / 1024)} Ko).`,
      });
      return true;
    },
    [activeTab, compileTabOutput, openFromBytes, updateTab]
  );

  const handleConfirmNewVersion = useCallback(
    async (suggestedName: string, withPkcs7: boolean, tabOverride?: WorkspaceTab): Promise<boolean> => {
      const targetTab = tabOverride ?? activeTab;
      if (!targetTab) return false;
      const bytes = await compileTabOutput(targetTab, withPkcs7, false);
      if (!bytes) return false;

      if (isTauriRuntime()) {
        const svTauri = await saveAsPdfTauri(bytes, suggestedName);
        if (!svTauri.ok) {
          setBanner({ kind: 'error', text: formatDomainError(svTauri.error) });
          return false;
        }
        if (!svTauri.value) return false;
        setShowSaveModal(false);
        const nextOrigin: FileOriginHandle = {
          kind: 'tauri-path',
          path: svTauri.value.path,
          displayName: svTauri.value.fileName,
        };
        await openFromBytes(bytes, svTauri.value.fileName, nextOrigin, {
          targetTabId: targetTab.id,
        });
        if (withPkcs7) setRightTab('inspector');
        setBanner({
          kind: 'info',
          text: `Nouvelle version enregistrée : ${svTauri.value.fileName}.`,
        });
        return true;
      }

      const sv = await saveAsNewFileVersion(bytes, suggestedName);
      if (!sv.ok) {
        setBanner({ kind: 'error', text: formatDomainError(sv.error) });
        return false;
      }
      if (!sv.value) return false;
      setShowSaveModal(false);
      const nextOrigin: FileOriginHandle = sv.value.handle
        ? { kind: 'fs-handle', handle: sv.value.handle, displayName: sv.value.fileName }
        : { kind: 'memory', displayName: sv.value.fileName };
      await openFromBytes(bytes, sv.value.fileName, nextOrigin, {
        targetTabId: targetTab.id,
      });
      if (withPkcs7) setRightTab('inspector');
      setBanner({
        kind: 'info',
        text: `Nouvelle version enregistrée : ${sv.value.fileName}.`,
      });
      return true;
    },
    [activeTab, compileTabOutput, openFromBytes]
  );

  const handleRequestSaveOverwriteOrPrompt = useCallback(() => {
    if (!activeTab) return;
    if (activeTab.rememberOverwrite && hasWritableDiskOrigin(activeTab.originHandle)) {
      void handleConfirmOverwrite(true, false, activeTab);
      return;
    }
    setShowSaveModal(true);
  }, [activeTab, handleConfirmOverwrite]);

  const handleQuickSaveAsNewVersion = useCallback(() => {
    if (!activeTab) return;
    const suggested = deriveNextVersionFilename(activeTab.bundle.identity.displayName);
    void handleConfirmNewVersion(suggested, false, activeTab);
  }, [activeTab, handleConfirmNewVersion]);

  const handleConfirmSaveAndClose = useCallback(async () => {
    if (!pendingCloseModal) return;
    setIsClosingSaving(true);
    try {
      for (const dirtyInfo of pendingCloseModal.dirtyTabs) {
        const tab = tabsRef.current.find((t) => t.id === dirtyInfo.id);
        if (!tab) continue;
        setActiveTabId(tab.id);
        const saved =
          tab.rememberOverwrite && hasWritableDiskOrigin(tab.originHandle)
            ? await handleConfirmOverwrite(true, false, tab)
            : await handleConfirmNewVersion(
                deriveNextVersionFilename(tab.bundle.identity.displayName),
                false,
                tab
              );
        if (!saved) {
          // User cancelled Save As dialog or write failed -> keep workspace open safely
          return;
        }
      }

      const mode = pendingCloseModal.mode;
      const targetTabId = pendingCloseModal.targetTabId;
      setPendingCloseModal(null);

      if (mode === 'single-tab' && targetTabId) {
        closeTabImmediately(targetTabId);
      } else {
        bypassCloseInterceptRef.current = true;
        for (const t of tabsRef.current) {
          void t.sessionService.dispose();
        }
        await forceCloseCurrentWindowTauri();
      }
    } finally {
      setIsClosingSaving(false);
    }
  }, [pendingCloseModal, handleConfirmOverwrite, handleConfirmNewVersion, closeTabImmediately]);

  const handleDiscardAndConfirmClose = useCallback(async () => {
    if (!pendingCloseModal) return;
    const mode = pendingCloseModal.mode;
    const targetTabId = pendingCloseModal.targetTabId;
    setPendingCloseModal(null);
    if (mode === 'single-tab' && targetTabId) {
      closeTabImmediately(targetTabId);
      return;
    }
    bypassCloseInterceptRef.current = true;
    for (const t of tabsRef.current) {
      void t.sessionService.dispose();
    }
    await forceCloseCurrentWindowTauri();
  }, [pendingCloseModal, closeTabImmediately]);

  const handleExportPdf = async (withCryptoPkcs7: boolean, flattenForms: boolean) => {
    if (!activeTab) return;
    const bytes = await compileTabOutput(activeTab, withCryptoPkcs7, flattenForms);
    if (!bytes) return;

    const baseName = activeTab.bundle.identity.displayName.replace(/\.pdf$/i, '');
    const outName = withCryptoPkcs7 ? `${baseName}_signe_pkcs7.pdf` : `${baseName}_modifie.pdf`;

    if (isTauriRuntime()) {
      const sv = await saveAsPdfTauri(bytes, outName);
      if (!sv.ok) {
        setBanner({ kind: 'error', text: formatDomainError(sv.error) });
        return;
      }
      if (!sv.value) return;
      await openFromBytes(
        bytes,
        sv.value.fileName,
        {
          kind: 'tauri-path',
          path: sv.value.path,
          displayName: sv.value.fileName,
        },
        { targetTabId: activeTab.id }
      );
      if (withCryptoPkcs7) setRightTab('inspector');
      return;
    }

    triggerBrowserDownload(bytes, outName);
    await openFromBytes(bytes, outName, { kind: 'memory', displayName: outName }, { targetTabId: activeTab.id });
    if (withCryptoPkcs7) setRightTab('inspector');
  };

  const handleRunFormatExport = useCallback(
    async (options: ExportRequestOptions) => {
      if (!activeTab) return;
      setIsExporting(true);
      setLastExportSavedLabel(null);
      try {
        const compiledBytes = await compileTabOutput(activeTab, false, false);
        if (!compiledBytes) return;

        const converted = await exportService.convertPdfBytes(
          compiledBytes,
          activeTab.bundle.identity.displayName,
          options
        );
        if (!converted.ok) {
          setBanner({ kind: 'error', text: formatDomainError(converted.error) });
          return;
        }

        const out = converted.value;
        setLastExportAudit(out.audit);

        if (isTauriRuntime()) {
          const saved = await saveExportFileTauri(
            out.bytes,
            out.suggestedFileName,
            out.filterName,
            out.extensions
          );
          if (!saved.ok) {
            setBanner({ kind: 'error', text: formatDomainError(saved.error) });
            return;
          }
          if (!saved.value) {
            setLastExportSavedLabel('Annulé');
            return;
          }
          setLastExportSavedLabel(saved.value.fileName);
          setBanner({
            kind: 'info',
            text: `Export réussi : ${saved.value.fileName} (${Math.max(1, Math.round(saved.value.byteLength / 1024))} Ko).`,
          });
          return;
        }

        triggerBrowserDownload(out.bytes, out.suggestedFileName, out.mimeType);
        setLastExportSavedLabel(out.suggestedFileName);
        setBanner({
          kind: 'info',
          text: `Export généré localement : ${out.suggestedFileName}.`,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [activeTab, compileTabOutput, exportService]
  );

  // Global Acrobat / Multi-Tab keyboard shortcuts & Ctrl+Wheel PDF zoom
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handleTriggerOpenFile();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleQuickSaveAsNewVersion();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleRequestSaveOverwriteOrPrompt();
        return;
      }
      if (isTauriRuntime() && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabIdRef.current) {
          handleRequestCloseTab(activeTabIdRef.current);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowLeftPanel(true);
        setLeftTab('search');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activeTabIdRef.current) setShowPropertiesModal(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.code === 'Equal')) {
        e.preventDefault();
        if (activeTabIdRef.current) {
          updateTab(activeTabIdRef.current, (prev) => ({
            ...prev,
            zoom: clampZoom(prev.zoom + 0.15),
          }));
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.code === 'NumpadSubtract' || e.code === 'Minus')) {
        e.preventDefault();
        if (activeTabIdRef.current) {
          updateTab(activeTabIdRef.current, (prev) => ({
            ...prev,
            zoom: clampZoom(prev.zoom - 0.15),
          }));
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.code === 'Numpad0' || e.code === 'Digit0')) {
        e.preventDefault();
        if (activeTabIdRef.current) {
          updateTab(activeTabIdRef.current, (prev) => ({ ...prev, zoom: 1 }));
        }
        return;
      }
      if (!inEditable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (!inEditable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Prevent browser viewport zoom on Ctrl+Wheel / trackpad pinch and zoom the active PDF tab instead
      e.preventDefault();
      if (!activeTabIdRef.current) return;
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      updateTab(activeTabIdRef.current, (prev) => ({
        ...prev,
        zoom: clampZoom(prev.zoom + step),
      }));
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('wheel', onWheel);
    };
  }, [
    updateTab,
    handleTriggerOpenFile,
    handleRequestSaveOverwriteOrPrompt,
    handleQuickSaveAsNewVersion,
    handleRequestCloseTab,
    handleUndo,
    handleRedo,
  ]);

  const bundle = activeTab?.bundle ?? null;
  const editorState = activeTab?.editorState ?? null;
  const originHandle = activeTab?.originHandle ?? null;
  const currentPage = activeTab?.currentPage ?? 0;
  const zoom = activeTab?.zoom ?? 1.05;
  const globalRotation = activeTab?.globalRotation ?? 0;
  const viewMode = activeTab?.viewMode ?? 'continuous';
  const showOrganizer = activeTab?.showOrganizer ?? false;
  const activeTool = activeTab?.activeTool ?? 'read';
  const selectedOverlayId = activeTab?.selectedOverlayId ?? null;
  const searchQuery = activeTab?.searchQuery ?? '';
  const searchMatches = activeTab?.searchMatches ?? [];
  const signaturePlacements = activeTab?.signaturePlacements ?? [];
  const ledgerTick = activeTab?.ledgerTick ?? 0;

  const pages = editorState?.pages ?? [];
  const visiblePages = useMemo(() => {
    if (!bundle || !editorState) return [];
    if (viewMode === 'single') {
      const p = pages[currentPage];
      return p ? [{ pageTransform: p, displayIndex: currentPage }] : [];
    }
    if (viewMode === 'double') {
      const pairStart = Math.floor(currentPage / 2) * 2;
      return pages
        .slice(pairStart, pairStart + 2)
        .map((p, idx) => ({ pageTransform: p, displayIndex: pairStart + idx }));
    }
    return pages.map((p, idx) => ({ pageTransform: p, displayIndex: idx }));
  }, [bundle, editorState, pages, viewMode, currentPage]);

  const selectedAddedText = useMemo(
    () => editorState?.texts.find((t) => t.id === selectedOverlayId) ?? null,
    [editorState, selectedOverlayId]
  );

  const selectedExistingEdit = useMemo(
    () => (selectedOverlayId && editorState ? editorState.existingTextEdits[selectedOverlayId] ?? null : null),
    [editorState, selectedOverlayId]
  );

  const tabBarItems: DocumentTabItem[] = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        fileName: t.bundle.identity.displayName,
        originPath: t.originHandle?.kind === 'tauri-path' ? t.originHandle.path : null,
        isDirty: isTabDirty(t),
        pageCount: t.editorState.pages.length,
      })),
    [tabs]
  );

  return (
    <div className="app-shell">
      {/* Hidden File Inputs */}
      <input
        ref={openFileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            void f.arrayBuffer().then((buf) =>
              openFromBytes(new Uint8Array(buf), f.name, { kind: 'memory', displayName: f.name })
            );
          }
          e.target.value = '';
        }}
      />
      <input
        ref={mergeFileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleMergeFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={insertPdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleInsertExternalPdfFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={insertImageInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleInsertImageFile(f);
          e.target.value = '';
        }}
      />

      {/* Top Menu Bar + Atelier Tabs */}
      <AcrobatMenuBar
        hasDocument={Boolean(bundle)}
        docName={bundle?.identity.displayName ?? null}
        originHandle={originHandle}
        isDirty={activeDirty}
        activeAtelier={activeAtelier}
        onSelectAtelier={handleSelectAtelier}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        canUndo={Boolean(bundle?.ledger.canUndo)}
        canRedo={Boolean(bundle?.ledger.canRedo)}
        zoom={zoom}
        currentPage={currentPage}
        totalPages={pages.length}
        viewMode={viewMode}
        globalRotation={globalRotation}
        onOpenFile={() => void handleTriggerOpenFile()}
        onNewBlank={() => void handleNewBlankDocument()}
        onOpenDemo={() => void handleOpenSample()}
        onSaveOverwriteOrPrompt={handleRequestSaveOverwriteOrPrompt}
        onSaveAsNewVersion={handleQuickSaveAsNewVersion}
        onReloadOriginal={() => void handleReloadOriginal()}
        onMergeFiles={() => mergeFileInputRef.current?.click()}
        onOpenExportModal={() => {
          setLastExportAudit(null);
          setLastExportSavedLabel(null);
          setShowExportModal(true);
        }}
        onConfigureDefaultPdf={isTauriRuntime() ? () => void handleConfigureDefaultPdf() : undefined}
        canDetachActiveTab={isTauriRuntime() && tabs.length > 1}
        onDetachActiveTab={() => {
          if (activeTab) void handleDetachTab(activeTab.id);
        }}
        onOpenProperties={() => setShowPropertiesModal(true)}
        onCloseDocument={() => {
          if (activeTab) handleRequestCloseTab(activeTab.id);
        }}
        onRequestExitApp={handleRequestWindowClose}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSearch={() => {
          setShowLeftPanel(true);
          setLeftTab('search');
        }}
        onSelectTool={handleSelectToolAction}
        onInsertImage={() => insertImageInputRef.current?.click()}
        onChangeZoom={(nextZoom) => {
          if (activeTab) {
            updateTab(activeTab.id, (prev) => ({ ...prev, zoom: clampZoom(nextZoom) }));
          }
        }}
        onRotateCW={() => {
          if (activeTab) {
            updateTab(activeTab.id, (prev) => ({
              ...prev,
              globalRotation: rotateDisplayCW(prev.globalRotation),
            }));
          }
        }}
        onChangeViewMode={(mode) => {
          if (activeTab) updateTab(activeTab.id, (prev) => ({ ...prev, viewMode: mode }));
        }}
        onToggleLeftPanel={() => setShowLeftPanel((v) => !v)}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
        onResetLayout={() => {
          setShowLeftPanel(true);
          setShowRightPanel(true);
          setLeftTab('all-tools');
          setRightTab('format');
          setActiveAtelier('all-tools');
          if (activeTab) {
            updateTab(activeTab.id, (prev) => ({
              ...prev,
              showOrganizer: false,
              activeTool: 'read',
            }));
          }
        }}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        onOpenReaInspector={() => {
          setShowRightPanel(true);
          setRightTab('inspector');
        }}
        onJumpPage={jumpToPage}
      />

      {/* Integrated Multi-Tab Document Bar */}
      {tabs.length > 0 && (
        <DocumentTabBar
          tabs={tabBarItems}
          activeTabId={activeTabId}
          canDetachInCurrentHost={isTauriRuntime()}
          onSelectTab={(id) => setActiveTabId(id)}
          onCloseTab={handleRequestCloseTab}
          onReorderTab={(srcId, targetIndex) =>
            setTabs((prev) => reorderTabs(prev, srcId, targetIndex))
          }
          onDetachTab={(id, sx, sy) => void handleDetachTab(id, sx, sy)}
          onOpenFilePicker={() => void handleTriggerOpenFile()}
          onCreateBlankTab={() => void handleNewBlankDocument()}
        />
      )}

      {/* Windows Default PDF Prompt Strip */}
      {showDefaultPdfBanner && (
        <div className="default-pdf-banner">
          <span>
            <strong>OpenPDF</strong> n’est pas encore défini comme lecteur PDF par défaut sous Windows.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="tool-btn primary"
              style={{ padding: '3px 9px', fontSize: 11.5 }}
              onClick={() => void handleConfigureDefaultPdf()}
            >
              Définir par défaut
            </button>
            <button
              type="button"
              className="tool-btn"
              style={{ padding: '3px 9px', fontSize: 11.5 }}
              onClick={() => setShowDefaultPdfBanner(false)}
            >
              Plus tard
            </button>
            <button
              type="button"
              className="tool-btn"
              style={{ padding: '3px 9px', fontSize: 11.5 }}
              onClick={() => {
                localStorage.setItem(DEFAULT_PDF_BANNER_DISMISSED_KEY, '1');
                setShowDefaultPdfBanner(false);
              }}
            >
              Ne plus demander
            </button>
          </div>
        </div>
      )}

      {/* Contextual Acrobat Sub-Toolbar Strip */}
      <div className="ribbon-bar">
        <div className="ribbon-group">
          <button className="tool-btn" onClick={() => void handleTriggerOpenFile()} title="Ouvrir (Ctrl+O)">
            <FolderOpen size={13} /> Ouvrir
          </button>
          <button
            className="tool-btn primary"
            disabled={!bundle}
            onClick={handleRequestSaveOverwriteOrPrompt}
            title="Enregistrer (Écraser l'original ou créer une nouvelle version — Ctrl+S)"
          >
            <Save size={13} /> Enregistrer
          </button>
          <button
            className="tool-btn"
            disabled={!bundle}
            onClick={handleQuickSaveAsNewVersion}
            title="Créer une nouvelle version (_v2.pdf — Ctrl+Shift+S)"
          >
            <CopyPlus size={13} /> Nouvelle version
          </button>
          <button
            className="tool-btn"
            disabled={!bundle}
            onClick={() => {
              setLastExportAudit(null);
              setLastExportSavedLabel(null);
              setShowExportModal(true);
            }}
            title="Exporter vers Word, Excel, PowerPoint, Images, HTML ou Texte"
          >
            <FileOutput size={13} /> Exporter
          </button>
          <button
            className="tool-btn"
            disabled={!bundle?.ledger.canUndo}
            title="Annuler (Ctrl+Z)"
            onClick={handleUndo}
          >
            <Undo2 size={13} />
          </button>
          <button
            className="tool-btn"
            disabled={!bundle?.ledger.canRedo}
            title="Rétablir (Ctrl+Y)"
            onClick={handleRedo}
          >
            <Redo2 size={13} />
          </button>
        </div>

        {/* Dynamic Atelier Action Strip */}
        <div className="ribbon-group" style={{ flexWrap: 'wrap' }}>
          <button
            className={`tool-btn ${activeTool === 'read' && !showOrganizer ? 'active' : ''}`}
            disabled={!bundle}
            onClick={() => handleSelectToolAction('read')}
          >
            <MousePointer size={13} /> Sélection / Lire
          </button>

          {(activeAtelier === 'edit' || activeAtelier === 'all-tools') && (
            <>
              <button
                className={`tool-btn ${activeTool === 'edit-pdf' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('edit-pdf')}
                title="Modifier directement le texte et la mise en page existante du PDF"
              >
                <TextCursorInput size={13} /> Modifier texte PDF
              </button>
              <button
                className={`tool-btn ${activeTool === 'add-text' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('add-text')}
              >
                <Type size={13} /> Ajouter texte
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => insertImageInputRef.current?.click()}
              >
                <ImagePlus size={13} /> Image
              </button>
              <button
                className={`tool-btn ${activeTool === 'whiteout' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('whiteout')}
              >
                <Eraser size={13} /> Correcteur
              </button>
              <button
                className={`tool-btn ${activeTool === 'redact' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('redact')}
              >
                <ShieldAlert size={13} /> Caviarder
              </button>
              <button
                className={`tool-btn ${activeTool === 'add-link' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('add-link')}
              >
                <Link2 size={13} /> Lien
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => {
                  setShowRightPanel(true);
                  setRightTab('format');
                }}
                title="Filigrane, En-tête/Pied de page, Rogner et Fond"
              >
                <Droplets size={13} /> Mise en page
              </button>
            </>
          )}

          {(activeAtelier === 'comment' || activeAtelier === 'all-tools') && (
            <>
              <button
                className={`tool-btn ${activeTool === 'highlight' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('highlight')}
              >
                <Highlighter size={13} /> Surligner
              </button>
              <button
                className={`tool-btn ${activeTool === 'underline' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('underline')}
              >
                <Underline size={13} /> Souligner
              </button>
              <button
                className={`tool-btn ${activeTool === 'strikeout' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('strikeout')}
              >
                <Strikethrough size={13} /> Barrer
              </button>
              <button
                className={`tool-btn ${activeTool === 'freehand' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('freehand')}
              >
                <PenLine size={13} /> Dessin
              </button>
              <button
                className={`tool-btn ${activeTool === 'rect' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('rect')}
              >
                <Square size={13} /> Rectangle
              </button>
              <button
                className={`tool-btn ${activeTool === 'ellipse' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('ellipse')}
              >
                <Circle size={13} /> Ellipse
              </button>
              <button
                className={`tool-btn ${activeTool === 'note' && !showOrganizer ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('note')}
              >
                <StickyNote size={13} /> Note
              </button>
            </>
          )}

          {activeAtelier === 'forms' && (
            <>
              <button
                className={`tool-btn ${activeTool === 'add-form-text' ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('add-form-text')}
              >
                <FormInput size={13} /> Créer champ texte
              </button>
              <button
                className={`tool-btn ${activeTool === 'add-form-check' ? 'active' : ''}`}
                disabled={!bundle}
                onClick={() => handleSelectToolAction('add-form-check')}
              >
                <CheckSquare size={13} /> Créer case à cocher
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                title="Exporter et figer (aplatir) les champs de formulaire"
                onClick={() => void handleExportPdf(false, true)}
              >
                <Save size={13} /> Aplatir & Télécharger
              </button>
            </>
          )}

          {activeAtelier === 'sign' && (
            <button
              className="tool-btn"
              disabled={!bundle || !loadedP12Bytes}
              title={
                loadedP12Bytes
                  ? 'Télécharger une copie signée cryptographiquement (PKCS#7)'
                  : 'Chargez ou générez un certificat .p12 dans le panneau Signatures'
              }
              onClick={() => void handleExportPdf(true, false)}
            >
              <PenTool size={13} /> Signer PKCS#7 & Télécharger
            </button>
          )}

          {activeAtelier === 'organize' && (
            <>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => handleInsertBlankPage(pages.length)}
              >
                <FilePlus2 size={13} /> + Page blanche
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => handleRequestInsertExternalPdf(pages.length)}
              >
                <FileInput size={13} /> Insérer un PDF
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => mergeFileInputRef.current?.click()}
              >
                <CopyPlus size={13} /> Combiner PDF
              </button>
              <button
                className="tool-btn"
                disabled={!bundle}
                onClick={() => {
                  if (activeTab) updateTab(activeTab.id, (prev) => ({ ...prev, showOrganizer: false }));
                  setShowRightPanel(true);
                  setRightTab('format');
                }}
              >
                <Crop size={13} /> Rogner pages
              </button>
            </>
          )}

          <button
            className={`tool-btn ${showOrganizer ? 'active' : ''}`}
            disabled={!bundle}
            onClick={() => {
              if (activeTab) {
                updateTab(activeTab.id, (prev) => ({ ...prev, showOrganizer: !prev.showOrganizer }));
              }
            }}
          >
            <LayoutGrid size={13} /> Pages
          </button>
          <button
            className={`tool-btn ${activeTool === 'place-signature' && !showOrganizer ? 'active' : ''}`}
            disabled={!bundle}
            onClick={() => handleSelectToolAction('place-signature')}
          >
            <PenTool size={13} /> Signer
          </button>
        </div>

        <div className="ribbon-group">
          <button
            className="tool-btn"
            disabled={!bundle}
            onClick={() => {
              if (activeTab) updateTab(activeTab.id, (prev) => ({ ...prev, zoom: clampZoom(prev.zoom - 0.15) }));
            }}
          >
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: 12, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button
            className="tool-btn"
            disabled={!bundle}
            onClick={() => {
              if (activeTab) updateTab(activeTab.id, (prev) => ({ ...prev, zoom: clampZoom(prev.zoom + 0.15) }));
            }}
          >
            <ZoomIn size={13} />
          </button>
          <button
            className="tool-btn"
            disabled={!bundle}
            title="Rotation affichage"
            onClick={() => {
              if (activeTab) {
                updateTab(activeTab.id, (prev) => ({
                  ...prev,
                  globalRotation: rotateDisplayCW(prev.globalRotation),
                }));
              }
            }}
          >
            <RotateCw size={13} />
          </button>
          <select
            className="select-input"
            style={{ width: 'auto', marginBottom: 0, padding: '4px 6px' }}
            value={viewMode}
            onChange={(e) => {
              if (activeTab) {
                updateTab(activeTab.id, (prev) => ({
                  ...prev,
                  viewMode: e.target.value as ViewMode,
                }));
              }
            }}
          >
            <option value="continuous">Continu</option>
            <option value="single">Page unique</option>
            <option value="double">Double page</option>
          </select>
        </div>
      </div>

      {/* Status / Error Banner */}
      {banner && (
        <div className={`status-banner ${banner.kind === 'info' ? 'info' : ''}`}>
          <span>{banner.text}</span>
          <button className="tool-btn" onClick={() => setBanner(null)} style={{ padding: '2px 6px' }}>
            Fermer
          </button>
        </div>
      )}

      {/* Main 3-Pane Acrobat Pro Workspace */}
      <div className="workspace-body">
        {showLeftPanel && (
          <LeftSidebar
            activeTab={leftTab}
            onChangeTab={setLeftTab}
            hasDocument={Boolean(bundle)}
            renderer={bundle?.renderer ?? null}
            pages={pages}
            currentPage={currentPage}
            globalRotation={globalRotation}
            outlines={bundle?.outlines ?? []}
            searchQuery={searchQuery}
            searchMatches={searchMatches}
            isSearching={isSearching}
            formFields={bundle?.formFields ?? []}
            createdFormFields={editorState?.createdFormFields ?? []}
            formValues={editorState?.formValues ?? {}}
            onSelectAtelier={handleSelectAtelier}
            onMergeFiles={() => mergeFileInputRef.current?.click()}
            onOpenReaInspector={() => {
              setShowRightPanel(true);
              setRightTab('inspector');
            }}
            onInsertBlankPage={handleInsertBlankPage}
            onInsertExternalPdf={() => handleRequestInsertExternalPdf(pages.length)}
            onJumpToPage={jumpToPage}
            onRotatePage={(uid) => applyCommand({ type: 'ROTATE_PAGE', pageUid: uid, delta: 90 })}
            onDuplicatePage={(uid) => {
              const src = pages.find((p) => p.uid === uid);
              if (!src) return;
              applyCommand({
                type: 'DUPLICATE_PAGE',
                afterPageUid: uid,
                created: { ...src, uid: `p-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
              });
            }}
            onDeletePage={(uid, idx) => {
              const snap = pages[idx];
              if (!snap) return;
              applyCommand({ type: 'DELETE_PAGE', pageUid: uid, removedIndex: idx, snapshot: snap });
            }}
            onSearchQueryChange={(q) => {
              if (activeTab) updateTab(activeTab.id, (prev) => ({ ...prev, searchQuery: q }));
            }}
            onRunSearch={() => void handleRunSearch()}
            onChangeFormValue={(fieldName, nextValue) =>
              applyCommand({
                type: 'SET_FORM_FIELD',
                fieldName,
                previousValue: editorState?.formValues[fieldName] ?? '',
                nextValue,
              })
            }
          />
        )}

        {/* Central Viewport */}
        <main
          ref={viewportRef}
          className="viewport-area"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const firstItem = e.dataTransfer.items?.[0];
            const file = e.dataTransfer.files[0];
            if (!file) return;
            void Promise.all([file.arrayBuffer(), extractDropFileHandle(firstItem)]).then(([buf, handle]) => {
              const nextOrigin: FileOriginHandle = handle
                ? { kind: 'fs-handle', handle, displayName: file.name }
                : { kind: 'memory', displayName: file.name };
              return openFromBytes(new Uint8Array(buf), file.name, nextOrigin);
            });
          }}
        >
          {!bundle || !editorState ? (
            <div className="dropzone-hero">
              <div className="brand-dot" style={{ width: 44, height: 44, fontSize: 20, margin: '0 auto 14px' }}>
                O
              </div>
              <h2 style={{ margin: '0 0 8px 0' }}>OpenPDF — Studio PDF Professionnel</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
                Lecture haute fidélité par onglets, modification complète du texte et des objets PDF,
                conversion vers Word / Excel / PowerPoint / Images, enregistrement avec écrasement ou nouvelle version,
                et signature PKCS#7 / coffre local chiffré.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="tool-btn primary" onClick={() => void handleTriggerOpenFile()}>
                  <FolderOpen size={15} /> Ouvrir un PDF local
                </button>
                <button
                  className="tool-btn"
                  style={{ border: '1px solid var(--border-color)' }}
                  onClick={() => void handleNewBlankDocument()}
                >
                  <FilePlus2 size={15} /> Nouveau PDF vierge
                </button>
                <button
                  className="tool-btn"
                  style={{ border: '1px solid var(--border-color)' }}
                  onClick={() => void handleOpenSample()}
                >
                  <FilePlus2 size={15} /> Charger le PDF de démonstration
                </button>
              </div>
            </div>
          ) : showOrganizer ? (
            <PageOrganizerGrid
              renderer={bundle.renderer}
              pages={pages}
              globalRotation={globalRotation}
              onRotatePage={(uid) => applyCommand({ type: 'ROTATE_PAGE', pageUid: uid, delta: 90 })}
              onDuplicatePage={(uid) => {
                const src = pages.find((p) => p.uid === uid);
                if (!src) return;
                applyCommand({
                  type: 'DUPLICATE_PAGE',
                  afterPageUid: uid,
                  created: { ...src, uid: `p-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
                });
              }}
              onDeletePage={(uid, idx) => {
                const snap = pages[idx];
                if (!snap) return;
                applyCommand({ type: 'DELETE_PAGE', pageUid: uid, removedIndex: idx, snapshot: snap });
              }}
              onMovePage={(fromIdx, toIdx) => {
                const next = [...pages];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, moved);
                applyCommand({ type: 'REORDER_PAGES', previousOrder: pages, nextOrder: next });
              }}
              onExtractRange={handleExtractRange}
              onInsertBlankPage={handleInsertBlankPage}
              onInsertExternalPdf={() => handleRequestInsertExternalPdf(pages.length)}
            />
          ) : (
            <div
              className={viewMode === 'double' ? 'viewport-double-grid' : undefined}
              style={
                viewMode !== 'double'
                  ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, margin: '0 auto' }
                  : { margin: '0 auto' }
              }
            >
              {visiblePages.map(({ pageTransform, displayIndex }) => {
                const metrics =
                  pageTransform.kind === 'blank' || pageTransform.sourcePageIndex < 0
                    ? {
                        pageIndex: displayIndex,
                        widthPt: pageTransform.blankSizePt?.widthPt ?? 595.28,
                        heightPt: pageTransform.blankSizePt?.heightPt ?? 841.89,
                        inherentRotation: 0 as DisplayRotation,
                      }
                    : bundle.pageMetrics[pageTransform.sourcePageIndex] ?? bundle.pageMetrics[0];

                return (
                  <PdfPageCanvas
                    key={pageTransform.uid}
                    renderer={bundle.renderer}
                    pageTransform={pageTransform}
                    displayPageIndex={displayIndex}
                    totalPages={pages.length}
                    metrics={metrics}
                    zoom={zoom}
                    globalRotation={globalRotation}
                    activeTool={activeTool}
                    texts={editorState.texts.filter((t) => t.pageIndex === displayIndex)}
                    existingTextEdits={editorState.existingTextEdits}
                    annotations={editorState.annotations.filter((a) => a.pageIndex === displayIndex)}
                    images={editorState.images.filter((im) => im.pageIndex === displayIndex)}
                    whiteouts={editorState.whiteouts.filter((w) => w.pageIndex === displayIndex)}
                    links={editorState.links.filter((l) => l.pageIndex === displayIndex)}
                    createdFormFields={editorState.createdFormFields.filter((f) => f.pageIndex === displayIndex)}
                    watermark={editorState.watermark}
                    headerFooter={editorState.headerFooter}
                    pageCrop={editorState.pageCrop}
                    pageBackground={editorState.pageBackground}
                    signaturePlacements={signaturePlacements}
                    signatureAssetsById={assetsMap}
                    selectedOverlayId={selectedOverlayId}
                    onSelectOverlay={handleSelectOverlay}
                    onCreateTextAt={(pageIndex, rect) => {
                      const item: TextOverlayItem = {
                        id: `txt-${Date.now()}`,
                        pageIndex,
                        rect,
                        text: 'Double-cliquez pour éditer',
                        fontSizePt: 13,
                        colorHex: '#0f172a',
                        fontFamily: 'Helvetica',
                        bold: false,
                        italic: false,
                        align: 'left',
                      };
                      applyCommand({ type: 'ADD_TEXT', item });
                      if (activeTab) {
                        updateTab(activeTab.id, (prev) => ({ ...prev, selectedOverlayId: item.id }));
                      }
                      setRightTab('format');
                      setShowRightPanel(true);
                    }}
                    onUpdateText={(previous, next) =>
                      applyCommand({ type: 'UPDATE_TEXT', id: previous.id, previous, next })
                    }
                    onDeleteText={(item) => applyCommand({ type: 'DELETE_TEXT', item })}
                    onUpsertExistingTextEdit={(previous, next) =>
                      applyCommand({ type: 'UPSERT_EXISTING_TEXT_EDIT', previous, next })
                    }
                    onCreateAnnotation={(item: AnnotationOverlayItem) =>
                      applyCommand({ type: 'ADD_ANNOTATION', item })
                    }
                    onDeleteAnnotation={(item) => applyCommand({ type: 'DELETE_ANNOTATION', item })}
                    onCreateWhiteout={(item: WhiteoutRectItem) =>
                      applyCommand({ type: 'ADD_WHITEOUT', item })
                    }
                    onDeleteWhiteout={(item) => applyCommand({ type: 'DELETE_WHITEOUT', item })}
                    onCreateLink={(item: LinkAnnotationItem) => applyCommand({ type: 'ADD_LINK', item })}
                    onDeleteLink={(item) => applyCommand({ type: 'DELETE_LINK', item })}
                    onCreateFormField={(item: CreatedFormFieldItem) =>
                      applyCommand({ type: 'CREATE_FORM_FIELD', item })
                    }
                    onDeleteFormField={(item) => applyCommand({ type: 'DELETE_FORM_FIELD', item })}
                    onUpdateImageRect={(id, previousRect, nextRect) =>
                      applyCommand({ type: 'UPDATE_IMAGE_RECT', id, previousRect, nextRect })
                    }
                    onDeleteImage={(item) => applyCommand({ type: 'DELETE_IMAGE', item })}
                    onPlaceSignatureAt={handlePlaceSignatureAt}
                    onUpdateSignaturePlacementRect={(id, nextRect) => {
                      if (!activeTab) return;
                      updateTab(activeTab.id, (prev) => ({
                        ...prev,
                        signaturePlacements: prev.signaturePlacements.map((sp) =>
                          sp.id === id ? { ...sp, rect: nextRect } : sp
                        ),
                      }));
                    }}
                    onDeleteSignaturePlacement={(id) => {
                      if (!activeTab) return;
                      updateTab(activeTab.id, (prev) => ({
                        ...prev,
                        signaturePlacements: prev.signaturePlacements.filter((sp) => sp.id !== id),
                      }));
                    }}
                    onPageBecomeVisible={(pIdx) => {
                      if (activeTab && activeTab.currentPage !== pIdx) {
                        updateTab(activeTab.id, (prev) => ({ ...prev, currentPage: pIdx }));
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </main>

        {showRightPanel && (
          <SignatureVaultPanel
            activeTab={rightTab}
            onChangeTab={setRightTab}
            selectedAddedText={selectedAddedText}
            selectedExistingEdit={selectedExistingEdit}
            onUpdateAddedText={(prev, next) =>
              applyCommand({ type: 'UPDATE_TEXT', id: prev.id, previous: prev, next })
            }
            onDeleteAddedText={(item) => applyCommand({ type: 'DELETE_TEXT', item })}
            onUpdateExistingText={(next) =>
              applyCommand({ type: 'UPSERT_EXISTING_TEXT_EDIT', previous: selectedExistingEdit, next })
            }
            watermark={editorState?.watermark ?? null}
            onApplyWatermark={(next: WatermarkConfig | null) =>
              applyCommand({ type: 'SET_WATERMARK', previous: editorState?.watermark ?? null, next })
            }
            headerFooter={editorState?.headerFooter ?? null}
            onApplyHeaderFooter={(next: HeaderFooterConfig | null) =>
              applyCommand({ type: 'SET_HEADER_FOOTER', previous: editorState?.headerFooter ?? null, next })
            }
            pageCrop={editorState?.pageCrop ?? null}
            onApplyPageCrop={(next: PageCropConfig | null) =>
              applyCommand({ type: 'SET_PAGE_CROP', previous: editorState?.pageCrop ?? null, next })
            }
            pageBackground={editorState?.pageBackground ?? null}
            onApplyPageBackground={(next: PageBackgroundConfig | null) =>
              applyCommand({ type: 'SET_PAGE_BACKGROUND', previous: editorState?.pageBackground ?? null, next })
            }
            assets={vaultAssets}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onActivatePlacementTool={() => {
              if (activeTab) {
                updateTab(activeTab.id, (prev) => ({
                  ...prev,
                  showOrganizer: false,
                  activeTool: 'place-signature',
                }));
              }
            }}
            onImportSignatureFile={handleImportSignatureFile}
            onSaveDrawnAsset={persistVaultAsset}
            onCreateStamp={handleCreateStamp}
            onDeleteAsset={handleDeleteVaultAsset}
            sigMeta={sigMeta}
            onChangeSigMeta={setSigMeta}
            applyToAllPages={applyToAllPages}
            onChangeApplyToAllPages={setApplyToAllPages}
            loadedP12Name={loadedP12Name}
            loadedCertMeta={loadedCertMeta}
            p12Passphrase={p12Passphrase}
            onChangeP12Passphrase={setP12Passphrase}
            onImportP12File={handleImportP12}
            onGenerateLocalP12={handleGenerateLocalP12}
            onRequestSaveDialog={handleRequestSaveOverwriteOrPrompt}
            hasDocument={Boolean(bundle)}
            docIdentity={bundle?.identity ?? null}
            docMetadata={bundle?.metadata ?? null}
            verifications={bundle?.signatureVerifications ?? []}
            ledgerRevision={ledgerTick}
            commandCount={bundle?.ledger.commandCount ?? 0}
          />
        )}
      </div>

      {/* Save Strategy Modal: Overwrite Original vs Create New Version */}
      {showSaveModal && bundle && (
        <SaveStrategyModal
          docName={bundle.identity.displayName}
          hasDiskHandle={hasWritableDiskOrigin(originHandle)}
          hasPkcs12Cert={Boolean(loadedP12Bytes)}
          onCancel={() => setShowSaveModal(false)}
          onConfirmOverwrite={(remember, withPkcs7) => void handleConfirmOverwrite(remember, withPkcs7)}
          onConfirmNewVersion={(suggestedName, withPkcs7) => void handleConfirmNewVersion(suggestedName, withPkcs7)}
        />
      )}

      {/* Multi-Format Export Modal (Word / Excel / PowerPoint / CSV / Images / HTML / TXT) */}
      {showExportModal && bundle && activeTab && (
        <ExportFormatsModal
          fileName={bundle.identity.displayName}
          totalPages={pages.length}
          currentPageIndex={currentPage}
          hasPendingEdits={isTabDirty(activeTab)}
          isExporting={isExporting}
          lastAuditReport={lastExportAudit}
          lastSavedLabel={lastExportSavedLabel}
          onRunExport={handleRunFormatExport}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Close Confirmation / Unsaved Edits & Multi-Tab Warning Modal */}
      {pendingCloseModal && (
        <CloseConfirmModal
          mode={pendingCloseModal.mode}
          tabCount={pendingCloseModal.tabCount}
          dirtyTabs={pendingCloseModal.dirtyTabs}
          isSaving={isClosingSaving}
          onSaveAndConfirm={() => void handleConfirmSaveAndClose()}
          onDiscardAndConfirm={() => void handleDiscardAndConfirmClose()}
          onCancel={() => setPendingCloseModal(null)}
        />
      )}

      {/* External PDF Open Routing Choice (Current Window Tab vs New Instance/Window) */}
      {pendingExternalOpenPaths && (
        <ExternalOpenChoiceModal
          paths={pendingExternalOpenPaths}
          onOpenInCurrentWindow={(rememberChoice) => {
            const incoming = pendingExternalOpenPaths;
            setPendingExternalOpenPaths(null);
            if (rememberChoice) {
              localStorage.setItem(EXTERNAL_OPEN_PREF_STORAGE_KEY, 'current-window');
            }
            void (async () => {
              for (const p of incoming) {
                await handleOpenTauriPath(p);
              }
            })();
          }}
          onOpenInNewWindow={(rememberChoice) => {
            const incoming = pendingExternalOpenPaths;
            setPendingExternalOpenPaths(null);
            if (rememberChoice) {
              localStorage.setItem(EXTERNAL_OPEN_PREF_STORAGE_KEY, 'new-window');
            }
            void (async () => {
              for (const p of incoming) {
                const res = await openPathInNewWindowTauri(p);
                if (!res.ok) {
                  setBanner({ kind: 'error', text: formatDomainError(res.error) });
                }
              }
            })();
          }}
          onDismiss={() => setPendingExternalOpenPaths(null)}
        />
      )}

      {/* Document Properties Modal */}
      {showPropertiesModal && bundle && (
        <DocumentPropertiesModal
          identity={bundle.identity}
          metadata={bundle.metadata}
          onClose={() => setShowPropertiesModal(false)}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />}

      {/* Password Modal for Encrypted PDFs */}
      {pendingEncryptedBytes && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>PDF protégé par mot de passe</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Le fichier <strong>{pendingEncryptedBytes.name}</strong> nécessite un mot de passe d’ouverture.
            </p>
            <input
              type="password"
              autoFocus
              className="text-input"
              placeholder="Mot de passe du PDF"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void openFromBytes(
                    pendingEncryptedBytes.bytes,
                    pendingEncryptedBytes.name,
                    pendingEncryptedBytes.origin,
                    {
                      password: passwordInput,
                      targetTabId: pendingEncryptedBytes.targetTabId,
                    }
                  );
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="tool-btn"
                onClick={() => {
                  setPendingEncryptedBytes(null);
                  setPasswordInput('');
                }}
              >
                Annuler
              </button>
              <button
                className="tool-btn primary"
                onClick={() =>
                  void openFromBytes(
                    pendingEncryptedBytes.bytes,
                    pendingEncryptedBytes.name,
                    pendingEncryptedBytes.origin,
                    {
                      password: passwordInput,
                      targetTabId: pendingEncryptedBytes.targetTabId,
                    }
                  )
                }
              >
                Déverrouiller
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
