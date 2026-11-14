import React, { useEffect, useRef, useState } from 'react';
import {
  Edit3,
  FileCheck2,
  FormInput,
  HardDrive,
  LayoutGrid,
  MessageSquarePlus,
  Moon,
  PenTool,
  Redo2,
  RotateCw,
  Save,
  Sparkles,
  Sun,
  Undo2,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AppUpdateInfo } from '../../../domain/updater.ts';
import type { DisplayRotation, ViewMode } from '../../../domain/viewer.ts';
import { openExternalUrl } from '../../../adapters/host/tauriBridge.ts';
import { hasWritableDiskOrigin, type FileOriginHandle } from '../../../providers/filesystem/boundedFileSystem.ts';

export type AcrobatAtelierId =
  | 'all-tools'
  | 'edit'
  | 'comment'
  | 'sign'
  | 'organize'
  | 'forms';

interface MenuEntry {
  readonly label?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly separator?: boolean;
  readonly onClick?: () => void;
}

interface AcrobatMenuBarProps {
  readonly hasDocument: boolean;
  readonly docName: string | null;
  readonly originHandle: FileOriginHandle | null;
  readonly isDirty: boolean;
  readonly activeAtelier: AcrobatAtelierId;
  readonly onSelectAtelier: (atelier: AcrobatAtelierId) => void;
  readonly theme: 'dark' | 'light';
  readonly onToggleTheme: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly zoom: number;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly viewMode: ViewMode;
  readonly globalRotation: DisplayRotation;
  // File Actions
  readonly onOpenFile: () => void;
  readonly onNewBlank: () => void;
  readonly onOpenDemo: () => void;
  readonly onSaveOverwriteOrPrompt: () => void;
  readonly onSaveAsNewVersion: () => void;
  readonly onReloadOriginal: () => void;
  readonly onMergeFiles: () => void;
  readonly onOpenProperties: () => void;
  readonly onOpenExportModal?: () => void;
  readonly onConfigureDefaultPdf?: () => void;
  readonly onDetachActiveTab?: () => void;
  readonly canDetachActiveTab?: boolean;
  readonly onCloseDocument: () => void;
  readonly onRequestExitApp?: () => void;
  // Edit Actions
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onOpenSearch: () => void;
  readonly onSelectTool: (tool: string) => void;
  readonly onInsertImage: () => void;
  // View Actions
  readonly onChangeZoom: (nextZoom: number) => void;
  readonly onRotateCW: () => void;
  readonly onChangeViewMode: (mode: ViewMode) => void;
  readonly onToggleLeftPanel: () => void;
  readonly onToggleRightPanel: () => void;
  readonly onResetLayout: () => void;
  readonly onOpenShortcuts: () => void;
  readonly onOpenReaInspector: () => void;
  readonly onJumpPage: (pageIndex: number) => void;
  readonly onCheckUpdates?: () => void;
  readonly updateInfo?: AppUpdateInfo | null;
  readonly onOpenUpdateModal?: () => void;
}

export const AcrobatMenuBar: React.FC<AcrobatMenuBarProps> = ({
  hasDocument,
  docName,
  originHandle,
  isDirty,
  activeAtelier,
  onSelectAtelier,
  theme,
  onToggleTheme,
  canUndo,
  canRedo,
  zoom,
  currentPage,
  totalPages,
  viewMode,
  onCheckUpdates,
  updateInfo,
  onOpenUpdateModal,
  onOpenFile,
  onNewBlank,
  onOpenDemo,
  onSaveOverwriteOrPrompt,
  onSaveAsNewVersion,
  onReloadOriginal,
  onMergeFiles,
  onOpenProperties,
  onOpenExportModal,
  onConfigureDefaultPdf,
  onDetachActiveTab,
  canDetachActiveTab,
  onCloseDocument,
  onRequestExitApp,
  onUndo,
  onRedo,
  onOpenSearch,
  onSelectTool,
  onInsertImage,
  onChangeZoom,
  onRotateCW,
  onChangeViewMode,
  onToggleLeftPanel,
  onToggleRightPanel,
  onResetLayout,
  onOpenShortcuts,
  onOpenReaInspector,
  onJumpPage,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const menus: Record<string, MenuEntry[]> = {
    Fichier: [
      { label: 'Ouvrir…', shortcut: 'Ctrl+O', onClick: onOpenFile },
      { label: 'Nouveau document vierge', onClick: onNewBlank },
      { label: 'Ouvrir le PDF de démonstration', onClick: onOpenDemo },
      { separator: true },
      {
        label:
          hasWritableDiskOrigin(originHandle)
            ? 'Enregistrer (écraser l’original)…'
            : 'Enregistrer…',
        shortcut: 'Ctrl+S',
        disabled: !hasDocument,
        onClick: onSaveOverwriteOrPrompt,
      },
      {
        label: 'Enregistrer sous / Nouvelle version…',
        shortcut: 'Ctrl+Shift+S',
        disabled: !hasDocument,
        onClick: onSaveAsNewVersion,
      },
      {
        label: 'Rétablir l’original (annuler modifications)',
        disabled: !hasDocument || !isDirty,
        onClick: onReloadOriginal,
      },
      { separator: true },
      { label: 'Combiner des fichiers PDF…', disabled: !hasDocument, onClick: onMergeFiles },
      {
        label: 'Exporter vers Word / Excel / PowerPoint / Image…',
        disabled: !hasDocument || !onOpenExportModal,
        onClick: () => onOpenExportModal?.(),
      },
      {
        label: 'Organiser & Extraire des pages…',
        disabled: !hasDocument,
        onClick: () => onSelectAtelier('organize'),
      },
      { separator: true },
      ...(onConfigureDefaultPdf
        ? [{ label: 'Définir OpenPDF par défaut (.pdf)…', onClick: onConfigureDefaultPdf }]
        : []),
      { label: 'Propriétés du document…', shortcut: 'Ctrl+D', disabled: !hasDocument, onClick: onOpenProperties },
      { label: 'Fermer l’onglet actif', disabled: !hasDocument, onClick: onCloseDocument },
      ...(onRequestExitApp
        ? [{ label: 'Quitter OpenPDF', shortcut: 'Alt+F4', onClick: onRequestExitApp }]
        : []),
    ],
    Édition: [
      { label: 'Annuler', shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: onUndo },
      { label: 'Rétablir', shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: onRedo },
      { separator: true },
      {
        label: 'Modifier le texte et les objets',
        disabled: !hasDocument,
        onClick: () => {
          onSelectAtelier('edit');
          onSelectTool('edit-pdf');
        },
      },
      {
        label: 'Ajouter du texte',
        disabled: !hasDocument,
        onClick: () => {
          onSelectAtelier('edit');
          onSelectTool('add-text');
        },
      },
      { label: 'Ajouter une image…', disabled: !hasDocument, onClick: onInsertImage },
      {
        label: 'Gommer / Biffer une zone',
        disabled: !hasDocument,
        onClick: () => {
          onSelectAtelier('edit');
          onSelectTool('whiteout');
        },
      },
      { separator: true },
      { label: 'Rechercher dans le document', shortcut: 'Ctrl+F', disabled: !hasDocument, onClick: onOpenSearch },
    ],
    Affichage: [
      { label: 'Zoom avant', shortcut: 'Ctrl++', disabled: !hasDocument, onClick: () => onChangeZoom(zoom + 0.15) },
      { label: 'Zoom arrière', shortcut: 'Ctrl+-', disabled: !hasDocument, onClick: () => onChangeZoom(zoom - 0.15) },
      { label: 'Taille réelle (100 %)', disabled: !hasDocument, onClick: () => onChangeZoom(1) },
      { separator: true },
      {
        label: 'Page unique',
        disabled: !hasDocument,
        onClick: () => onChangeViewMode('single'),
      },
      {
        label: 'Défilement continu',
        disabled: !hasDocument,
        onClick: () => onChangeViewMode('continuous'),
      },
      {
        label: 'Vue deux pages',
        disabled: !hasDocument,
        onClick: () => onChangeViewMode('double'),
      },
      { separator: true },
      { label: 'Rotation horaire (90°)', disabled: !hasDocument, onClick: onRotateCW },
      { label: 'Afficher / Masquer panneau gauche', onClick: onToggleLeftPanel },
      { label: 'Afficher / Masquer panneau droit', onClick: onToggleRightPanel },
      {
        label: theme === 'dark' ? 'Passer au thème Clair' : 'Passer au thème Sombre',
        onClick: onToggleTheme,
      },
    ],
    Outils: [
      { label: 'Tous les outils', onClick: () => onSelectAtelier('all-tools') },
      { label: 'Modifier un PDF (texte existant, images, mise en page)', disabled: !hasDocument, onClick: () => onSelectAtelier('edit') },
      { label: 'Commentaire (surligner, formes, dessin, notes)', disabled: !hasDocument, onClick: () => onSelectAtelier('comment') },
      { label: 'Remplir et signer (fichiers signatures & .p12)', disabled: !hasDocument, onClick: () => onSelectAtelier('sign') },
      { label: 'Organiser les pages (insérer, fusionner, extraire)', disabled: !hasDocument, onClick: () => onSelectAtelier('organize') },
      { label: 'Préparer un formulaire (AcroForm)', disabled: !hasDocument, onClick: () => onSelectAtelier('forms') },
      { separator: true },
      { label: 'Vérifier les signatures & Empreinte du Fichier', disabled: !hasDocument, onClick: onOpenReaInspector },
    ],
    Fenêtre: [
      {
        label: 'Détacher l’onglet dans une nouvelle fenêtre',
        disabled: !canDetachActiveTab || !onDetachActiveTab,
        onClick: () => onDetachActiveTab?.(),
      },
      { label: 'Réinitialiser la disposition des volets', onClick: onResetLayout },
      {
        label: 'Basculer plein écran',
        onClick: () => {
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
          else void document.exitFullscreen().catch(() => undefined);
        },
      },
    ],
    Aide: [
      { label: 'Raccourcis clavier', onClick: onOpenShortcuts },
      { label: 'Empreinte du Fichier & Propriétés', disabled: !hasDocument, onClick: onOpenReaInspector },
      { separator: true },
      { label: 'Vérifier les mises à jour…', onClick: onCheckUpdates },
      {
        label: 'Historique des releases (GitHub)',
        onClick: () => void openExternalUrl('https://github.com/SharkLog76/OpenPDF/releases'),
      },
    ],
  };

  return (
    <div ref={barRef}>
      {/* Row 1: Classic Acrobat Menu Bar + Active Document Pill */}
      <div className="menubar-strip">
        <div className="menubar-left">
          <div className="brand-badge">
            <div className="brand-dot">O</div>
            <span>OpenPDF</span>
          </div>

          {Object.entries(menus).map(([menuName, entries]) => (
            <div key={menuName} className="menu-root-wrapper">
              <button
                className={`menu-root-btn ${openMenu === menuName ? 'open' : ''}`}
                onClick={() => setOpenMenu((prev) => (prev === menuName ? null : menuName))}
                onMouseEnter={() => {
                  if (openMenu !== null) setOpenMenu(menuName);
                }}
              >
                {menuName}
              </button>

              {openMenu === menuName && (
                <div className="menu-dropdown">
                  {entries.map((entry, idx) =>
                    entry.separator ? (
                      <div key={idx} className="menu-separator" />
                    ) : (
                      <button
                        key={idx}
                        className="menu-item-btn"
                        disabled={entry.disabled}
                        onClick={() => {
                          setOpenMenu(null);
                          entry.onClick?.();
                        }}
                      >
                        <span>{entry.label}</span>
                        {entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="menubar-right">
          {updateInfo && updateInfo.isAvailable && onOpenUpdateModal && (
            <button
              type="button"
              className="update-badge-btn"
              title={`Nouvelle version ${updateInfo.latestVersion} disponible ! Cliquez pour mettre à jour.`}
              onClick={onOpenUpdateModal}
            >
              <Sparkles size={12} />
              <span>v{updateInfo.latestVersion} disponible</span>
            </button>
          )}

          {hasDocument && docName && (
            <div
              className="doc-pill"
              title={
                hasWritableDiskOrigin(originHandle)
                  ? 'Chemin/handle disque actif : écrasement direct possible'
                  : 'Copie mémoire : enregistrement en nouvelle version'
              }
            >
              {hasWritableDiskOrigin(originHandle) && <HardDrive size={12} color="var(--success)" />}
              <span className="doc-pill-name">{docName}</span>
              {isDirty && (
                <span className="dirty-dot" title="Modifications non enregistrées">
                  *
                </span>
              )}
            </div>
          )}

          <button
            className="tool-btn primary"
            disabled={!hasDocument}
            title="Enregistrer (écraser l'original ou choisir une version)"
            onClick={onSaveOverwriteOrPrompt}
            style={{ padding: '3px 9px', fontSize: 11.5 }}
          >
            <Save size={12} /> Enregistrer
          </button>

          <button
            className="tool-btn"
            disabled={!hasDocument}
            title="Enregistrer sous / Nouvelle version"
            onClick={onSaveAsNewVersion}
            style={{ padding: '3px 8px', fontSize: 11.5, border: '1px solid var(--border-color)' }}
          >
            Nouvelle version
          </button>

          <button
            className="tool-btn"
            title="Thème Sombre / Clair"
            onClick={onToggleTheme}
            style={{ padding: 4 }}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* Row 2: New Acrobat Pro Atelier Tabs + Page/Zoom Controls */}
      <div className="atelier-strip">
        <div className="atelier-tabs">
          <button
            className={`atelier-tab ${activeAtelier === 'all-tools' ? 'active' : ''}`}
            onClick={() => onSelectAtelier('all-tools')}
          >
            <Wrench size={13} /> Tous les outils
          </button>
          <button
            className={`atelier-tab ${activeAtelier === 'edit' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onSelectAtelier('edit')}
          >
            <Edit3 size={13} /> Modifier
          </button>
          <button
            className={`atelier-tab ${activeAtelier === 'comment' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onSelectAtelier('comment')}
          >
            <MessageSquarePlus size={13} /> Commenter
          </button>
          <button
            className={`atelier-tab ${activeAtelier === 'sign' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onSelectAtelier('sign')}
          >
            <PenTool size={13} /> Signer
          </button>
          <button
            className={`atelier-tab ${activeAtelier === 'organize' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onSelectAtelier('organize')}
          >
            <LayoutGrid size={13} /> Organiser les pages
          </button>
          <button
            className={`atelier-tab ${activeAtelier === 'forms' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onSelectAtelier('forms')}
          >
            <FormInput size={13} /> Formulaire
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="tool-btn" disabled={!canUndo} title="Annuler (Ctrl+Z)" onClick={onUndo} style={{ padding: 4 }}>
            <Undo2 size={14} />
          </button>
          <button className="tool-btn" disabled={!canRedo} title="Rétablir (Ctrl+Y)" onClick={onRedo} style={{ padding: 4 }}>
            <Redo2 size={14} />
          </button>

          {hasDocument && (
            <>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 4px' }}>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, totalPages)}
                  value={currentPage + 1}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    if (Number.isFinite(p) && p >= 1 && p <= totalPages) onJumpPage(p - 1);
                  }}
                  style={{
                    width: 38,
                    textAlign: 'center',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 11.5,
                  }}
                />{' '}
                / {totalPages}
              </span>

              <button className="tool-btn" onClick={() => onChangeZoom(zoom - 0.15)} style={{ padding: 4 }}>
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: 11.5, minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button className="tool-btn" onClick={() => onChangeZoom(zoom + 0.15)} style={{ padding: 4 }}>
                <ZoomIn size={13} />
              </button>
              <button className="tool-btn" title="Rotation affichage" onClick={onRotateCW} style={{ padding: 4 }}>
                <RotateCw size={13} />
              </button>
              <select
                className="select-input"
                style={{ width: 'auto', marginBottom: 0, padding: '3px 6px', fontSize: 11.5 }}
                value={viewMode}
                onChange={(e) => onChangeViewMode(e.target.value as ViewMode)}
              >
                <option value="continuous">Continu</option>
                <option value="single">Page unique</option>
                <option value="double">Deux pages</option>
              </select>
            </>
          )}

          <button
            className="tool-btn"
            disabled={!hasDocument}
            title="Empreinte du Fichier & Vérification Signatures"
            onClick={onOpenReaInspector}
            style={{ padding: '4px 7px' }}
          >
            <FileCheck2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
