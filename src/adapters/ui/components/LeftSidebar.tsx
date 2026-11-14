import React, { useEffect, useRef } from 'react';
import {
  Bookmark,
  Combine,
  Copy,
  Edit3,
  Eraser,
  FilePlus,
  FileText,
  FormInput,
  KeyRound,
  LayoutGrid,
  MessageSquarePlus,
  PenTool,
  RotateCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { AcroFormFieldDescriptor, CreatedFormFieldItem, PageTransformState } from '../../../domain/editor.ts';
import type { DisplayRotation, OutlineNode, SearchMatch } from '../../../domain/viewer.ts';
import type { PdfJsDocumentHandle } from '../../../providers/renderer/pdfJsRenderer.ts';
import type { AcrobatAtelierId } from './AcrobatMenuBar.tsx';

export type LeftTabId = 'all-tools' | 'thumbnails' | 'outlines' | 'search' | 'forms';

interface LeftSidebarProps {
  readonly activeTab: LeftTabId;
  readonly onChangeTab: (tab: LeftTabId) => void;
  readonly hasDocument: boolean;
  readonly renderer: PdfJsDocumentHandle | null;
  readonly pages: readonly PageTransformState[];
  readonly currentPage: number;
  readonly globalRotation: DisplayRotation;
  readonly outlines: readonly OutlineNode[];
  readonly searchQuery: string;
  readonly searchMatches: readonly SearchMatch[];
  readonly isSearching: boolean;
  readonly formFields: readonly AcroFormFieldDescriptor[];
  readonly createdFormFields: readonly CreatedFormFieldItem[];
  readonly formValues: Readonly<Record<string, string | boolean>>;
  readonly onSelectAtelier: (atelier: AcrobatAtelierId, tool?: string) => void;
  readonly onMergeFiles: () => void;
  readonly onOpenReaInspector: () => void;
  readonly onJumpToPage: (pageIndex: number) => void;
  readonly onRotatePage: (pageUid: string) => void;
  readonly onDuplicatePage: (pageUid: string) => void;
  readonly onDeletePage: (pageUid: string, index: number) => void;
  readonly onInsertBlankPage: (insertAtIndex: number) => void;
  readonly onInsertExternalPdf: () => void;
  readonly onSearchQueryChange: (q: string) => void;
  readonly onRunSearch: () => void;
  readonly onChangeFormValue: (fieldName: string, nextValue: string | boolean) => void;
}

const ThumbnailItem: React.FC<{
  renderer: PdfJsDocumentHandle | null;
  pageTransform: PageTransformState;
  displayIndex: number;
  isActive: boolean;
  globalRotation: DisplayRotation;
  canDelete: boolean;
  onJump: () => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({
  renderer,
  pageTransform,
  displayIndex,
  isActive,
  globalRotation,
  canDelete,
  onJump,
  onRotate,
  onDuplicate,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rot = (((globalRotation + pageTransform.addedRotation) % 360) as DisplayRotation);
  const isBlank = pageTransform.kind === 'blank' || pageTransform.sourcePageIndex < 0;

  useEffect(() => {
    if (!canvasRef.current) return;
    if (isBlank || !renderer) {
      const c = canvasRef.current;
      c.width = 136;
      c.height = 192;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText('Page vierge', 38, 98);
      }
      return;
    }
    void renderer.renderThumbnail(pageTransform.sourcePageIndex, canvasRef.current, rot);
  }, [renderer, pageTransform.sourcePageIndex, rot, isBlank]);

  return (
    <div className={`thumb-card ${isActive ? 'active' : ''}`} onClick={onJump}>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: 4, background: '#fff' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>Page {displayIndex + 1}</span>
        <div className="thumb-actions" onClick={(e) => e.stopPropagation()}>
          <button className="tool-btn" title="Pivoter 90°" onClick={onRotate} style={{ padding: 4 }}>
            <RotateCw size={12} />
          </button>
          <button className="tool-btn" title="Dupliquer" onClick={onDuplicate} style={{ padding: 4 }}>
            <Copy size={12} />
          </button>
          <button
            className="tool-btn danger"
            title="Supprimer"
            disabled={!canDelete}
            onClick={onDelete}
            style={{ padding: 4 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTab,
  onChangeTab,
  hasDocument,
  renderer,
  pages,
  currentPage,
  globalRotation,
  outlines,
  searchQuery,
  searchMatches,
  isSearching,
  formFields,
  createdFormFields,
  formValues,
  onSelectAtelier,
  onMergeFiles,
  onOpenReaInspector,
  onJumpToPage,
  onRotatePage,
  onDuplicatePage,
  onDeletePage,
  onInsertBlankPage,
  onInsertExternalPdf,
  onSearchQueryChange,
  onRunSearch,
  onChangeFormValue,
}) => {
  const renderOutlineTree = (nodes: readonly OutlineNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => (
      <div key={node.id} style={{ paddingLeft: `${depth * 12}px` }}>
        <button
          className="tool-btn"
          style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginBottom: 2 }}
          disabled={node.pageIndex === null}
          onClick={() => node.pageIndex !== null && onJumpToPage(node.pageIndex)}
        >
          <Bookmark size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.title}</span>
          {node.pageIndex !== null && (
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 10 }}>p.{node.pageIndex + 1}</span>
          )}
        </button>
        {node.children.length > 0 && renderOutlineTree(node.children, depth + 1)}
      </div>
    ));

  const acrobatTools = [
    {
      title: 'Modifier un PDF',
      sub: 'Éditer texte existant, images, liens, filigrane',
      icon: <Edit3 size={15} />,
      color: '#ec4899',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('edit', 'edit-pdf'),
    },
    {
      title: 'Gommer / Biffer',
      sub: 'Effacer ou masquer définitivement une zone',
      icon: <Eraser size={15} />,
      color: '#f43f5e',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('edit', 'whiteout'),
    },
    {
      title: 'Ajouter un commentaire',
      sub: 'Surligner, formes, dessin libre, notes',
      icon: <MessageSquarePlus size={15} />,
      color: '#f59e0b',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('comment', 'highlight'),
    },
    {
      title: 'Remplir et signer',
      sub: 'Fichier signature PNG/SVG, dessin, tampon',
      icon: <PenTool size={15} />,
      color: '#8b5cf6',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('sign', 'place-signature'),
    },
    {
      title: 'Utiliser un certificat',
      sub: 'Signature électronique PKCS#7 (.pfx / .p12)',
      icon: <KeyRound size={15} />,
      color: '#10b981',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('sign', 'read'),
    },
    {
      title: 'Organiser les pages',
      sub: 'Réordonner, pivoter, extraire, page vierge',
      icon: <LayoutGrid size={15} />,
      color: '#0ea5e9',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('organize'),
    },
    {
      title: 'Combiner des fichiers',
      sub: 'Fusionner plusieurs PDF locaux',
      icon: <Combine size={15} />,
      color: '#6366f1',
      disabled: !hasDocument,
      onClick: onMergeFiles,
    },
    {
      title: 'Préparer un formulaire',
      sub: 'Créer ou remplir des champs AcroForm',
      icon: <FormInput size={15} />,
      color: '#14b8a6',
      disabled: !hasDocument,
      onClick: () => onSelectAtelier('forms', 'add-form-text'),
    },
    {
      title: 'Vérifier les signatures',
      sub: 'Audit /ByteRange & Empreinte du Fichier',
      icon: <ShieldCheck size={15} />,
      color: '#22c55e',
      disabled: !hasDocument,
      onClick: onOpenReaInspector,
    },
  ];

  const allFormFields: AcroFormFieldDescriptor[] = [
    ...formFields,
    ...createdFormFields.map((cf) => ({
      name: cf.fieldName,
      kind: cf.kind,
      value: formValues[cf.fieldName] ?? cf.defaultValue,
      readOnly: false,
    })),
  ];

  return (
    <aside className="left-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'all-tools' ? 'active' : ''}`}
          onClick={() => onChangeTab('all-tools')}
        >
          Outils
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'thumbnails' ? 'active' : ''}`}
          onClick={() => onChangeTab('thumbnails')}
        >
          Pages
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'outlines' ? 'active' : ''}`}
          onClick={() => onChangeTab('outlines')}
        >
          Signets
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => onChangeTab('search')}
        >
          Chercher
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'forms' ? 'active' : ''}`}
          onClick={() => onChangeTab('forms')}
        >
          Champs
        </button>
      </div>

      <div className="sidebar-scroll">
        {activeTab === 'all-tools' && (
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
              Tous les outils (Studio PDF Professionnel)
            </div>
            {acrobatTools.map((t) => (
              <button
                key={t.title}
                className="acrobat-tool-card"
                disabled={t.disabled}
                onClick={t.onClick}
              >
                <div className="acrobat-tool-icon" style={{ background: t.color }}>
                  {t.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{t.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'thumbnails' && (
          <div>
            {hasDocument && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button
                  className="tool-btn"
                  style={{ flex: 1, border: '1px solid var(--border-color)', justifyContent: 'center', fontSize: 11 }}
                  onClick={() => onInsertBlankPage(currentPage + 1)}
                >
                  <FilePlus size={12} /> + Vierge
                </button>
                <button
                  className="tool-btn"
                  style={{ flex: 1, border: '1px solid var(--border-color)', justifyContent: 'center', fontSize: 11 }}
                  onClick={onInsertExternalPdf}
                >
                  <Combine size={12} /> + Insérer PDF
                </button>
              </div>
            )}
            {pages.map((p, idx) => (
              <ThumbnailItem
                key={p.uid}
                renderer={renderer}
                pageTransform={p}
                displayIndex={idx}
                isActive={currentPage === idx}
                globalRotation={globalRotation}
                canDelete={pages.length > 1}
                onJump={() => onJumpToPage(idx)}
                onRotate={() => onRotatePage(p.uid)}
                onDuplicate={() => onDuplicatePage(p.uid)}
                onDelete={() => onDeletePage(p.uid, idx)}
              />
            ))}
          </div>
        )}

        {activeTab === 'outlines' && (
          <div>
            {outlines.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Aucun signet (table des matières) détecté dans ce PDF.
              </p>
            ) : (
              renderOutlineTree(outlines)
            )}
          </div>
        )}

        {activeTab === 'search' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                className="text-input"
                style={{ marginBottom: 0 }}
                placeholder="Rechercher dans le PDF…"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRunSearch()}
              />
              <button className="tool-btn primary" onClick={onRunSearch} disabled={!hasDocument || isSearching}>
                <Search size={13} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {isSearching ? 'Recherche en cours…' : `${searchMatches.length} occurrence(s)`}
            </div>
            {searchMatches.map((m) => (
              <button
                key={m.id}
                className="panel-section"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)' }}
                onClick={() => onJumpToPage(m.pageIndex)}
              >
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Page {m.pageIndex + 1}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{m.snippet}</div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'forms' && (
          <div>
            {allFormFields.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <FileText size={16} style={{ marginBottom: 6 }} />
                <div>Aucun champ AcroForm détecté. Utilisez « Formulaire » pour en créer sur le PDF.</div>
              </div>
            ) : (
              allFormFields.map((field) => {
                const val = formValues[field.name] ?? field.value;
                return (
                  <div key={field.name} className="panel-section">
                    <label className="field-label">{field.name}</label>
                    {field.kind === 'checkbox' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          disabled={field.readOnly}
                          onChange={(e) => onChangeFormValue(field.name, e.target.checked)}
                        />
                        Coché
                      </label>
                    ) : field.kind === 'dropdown' && field.options ? (
                      <select
                        className="select-input"
                        value={String(val)}
                        disabled={field.readOnly}
                        onChange={(e) => onChangeFormValue(field.name, e.target.value)}
                      >
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="text-input"
                        style={{ marginBottom: 0 }}
                        value={String(val)}
                        disabled={field.readOnly}
                        onChange={(e) => onChangeFormValue(field.name, e.target.value)}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
