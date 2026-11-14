import React, { useRef, useState } from 'react';
import { ExternalLink, FilePlus2, FileText, Plus, X } from 'lucide-react';
import { isDragDetachTriggered } from '../../../domain/workspaceTabs.ts';

export interface DocumentTabItem {
  readonly id: string;
  readonly fileName: string;
  readonly originPath: string | null;
  readonly isDirty: boolean;
  readonly pageCount: number;
}

interface DocumentTabBarProps {
  readonly tabs: readonly DocumentTabItem[];
  readonly activeTabId: string | null;
  readonly canDetachInCurrentHost: boolean;
  readonly onSelectTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
  readonly onReorderTab: (sourceId: string, targetIndex: number) => void;
  readonly onDetachTab: (tabId: string, screenX?: number, screenY?: number) => void;
  readonly onOpenFilePicker: () => void;
  readonly onCreateBlankTab: () => void;
}

interface DragState {
  readonly tabId: string;
  readonly fileName: string;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly active: boolean;
  readonly targetIndex: number;
  readonly detachIntent: boolean;
}

export const DocumentTabBar: React.FC<DocumentTabBarProps> = ({
  tabs,
  activeTabId,
  canDetachInCurrentHost,
  onSelectTab,
  onCloseTab,
  onReorderTab,
  onDetachTab,
  onOpenFilePicker,
  onCreateBlankTab,
}) => {
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);

  const computeDropIndex = (clientX: number): number => {
    for (let i = 0; i < tabs.length; i++) {
      const el = tabRefs.current.get(tabs[i].id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (clientX < mid) {
        return i;
      }
    }
    return Math.max(0, tabs.length - 1);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, tab: DocumentTabItem, idx: number) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-tab-action="true"]')) return;

    onSelectTab(tab.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      tabId: tab.id,
      fileName: tab.fileName,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      active: false,
      targetIndex: idx,
      detachIntent: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const movedEnough = drag.active || Math.hypot(dx, dy) >= 7;
    if (!movedEnough) return;

    const detachIntent =
      canDetachInCurrentHost &&
      isDragDetachTriggered({
        tabsCount: tabs.length,
        clientX: e.clientX,
        clientY: e.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pullOutYThreshold: 135,
      });

    const targetIndex = computeDropIndex(e.clientX);
    setDrag({
      ...drag,
      active: true,
      currentX: e.clientX,
      currentY: e.clientY,
      targetIndex,
      detachIntent,
    });
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>, cancel: boolean) => {
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalDrag = drag;
    setDrag(null);
    if (cancel || !finalDrag.active) return;

    if (finalDrag.detachIntent && canDetachInCurrentHost && tabs.length > 1) {
      onDetachTab(finalDrag.tabId, e.screenX, e.screenY);
      return;
    }
    onReorderTab(finalDrag.tabId, finalDrag.targetIndex);
  };

  return (
    <div className="doc-tabbar" role="tablist" aria-label="Documents ouverts">
      <div className="doc-tabbar-scroll">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDraggingThis = drag?.active && drag.tabId === tab.id;
          const isDropTarget =
            drag?.active && drag.tabId !== tab.id && !drag.detachIntent && drag.targetIndex === idx;

          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              title={tab.originPath ? `${tab.fileName}\n${tab.originPath}` : tab.fileName}
              className={`doc-tab ${isActive ? 'active' : ''} ${isDraggingThis ? 'dragging' : ''} ${isDropTarget ? 'drop-before' : ''}`}
              onPointerDown={(e) => handlePointerDown(e, tab, idx)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => finishDrag(e, false)}
              onPointerCancel={(e) => finishDrag(e, true)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
            >
              <FileText size={13} style={{ flexShrink: 0, color: isActive ? '#3b82f6' : 'var(--text-secondary)' }} />
              <span className="doc-tab-name">{tab.fileName}</span>
              {tab.pageCount > 0 && (
                <span className="doc-tab-pages">{tab.pageCount}p</span>
              )}
              {tab.isDirty && (
                <span
                  className="doc-tab-dirty"
                  title="Modifications non enregistrées"
                  aria-label="Modifications non enregistrées"
                />
              )}

              {canDetachInCurrentHost && tabs.length > 1 && (
                <button
                  type="button"
                  data-tab-action="true"
                  className="doc-tab-icon-btn"
                  title="Détacher dans une nouvelle fenêtre"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetachTab(tab.id);
                  }}
                >
                  <ExternalLink size={11} />
                </button>
              )}

              <button
                type="button"
                data-tab-action="true"
                className="doc-tab-icon-btn close"
                title="Fermer l’onglet"
                aria-label={`Fermer ${tab.fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        <div className="doc-tabbar-actions">
          <button
            type="button"
            className="doc-tab-add-btn"
            title="Ouvrir un autre PDF dans un nouvel onglet (Ctrl+O)"
            onClick={onOpenFilePicker}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            className="doc-tab-add-btn"
            title="Nouveau PDF vierge dans un onglet"
            onClick={onCreateBlankTab}
          >
            <FilePlus2 size={13} />
          </button>
        </div>
      </div>

      {drag?.active && drag.detachIntent && (
        <div
          className="tab-detach-ghost"
          style={{ left: drag.currentX + 14, top: Math.max(8, drag.currentY + 14) }}
        >
          <ExternalLink size={13} />
          <span>Relâcher pour détacher « {drag.fileName} » dans une nouvelle fenêtre</span>
        </div>
      )}
    </div>
  );
};
