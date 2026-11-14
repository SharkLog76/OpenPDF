import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrixStub {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      multiply() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
    }
    (globalThis as unknown as { DOMMatrix: typeof DOMMatrixStub }).DOMMatrix = DOMMatrixStub;
  }
});

import { App } from '../src/adapters/ui/App.tsx';
import { AcrobatMenuBar } from '../src/adapters/ui/components/AcrobatMenuBar.tsx';
import { PdfPageCanvas } from '../src/adapters/ui/components/PdfPageCanvas.tsx';
import type { ExistingTextBlock, ExistingTextEdit, PageTransformState } from '../src/domain/editor.ts';
import { ok } from '../src/domain/result.ts';
import { clampZoom } from '../src/domain/viewer.ts';
import type { PdfJsDocumentHandle } from '../src/providers/renderer/pdfJsRenderer.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fireInputChange(el: HTMLTextAreaElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('UI interactions — Édition texte PDF & Zoom document sans zoom navigateur', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('ouvre directement la zone de texte éditable au clic sur un texte existant du PDF et met à jour le texte', async () => {
    const sampleBlock: ExistingTextBlock = {
      id: 'blk-0',
      sourcePageIndex: 0,
      rect: { x: 0.1, y: 0.1, width: 0.35, height: 0.04 },
      text: 'Contrat Initial',
      fontSizePt: 14,
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      textColorHex: '#0f172a',
      backgroundHex: '#ffffff',
    };

    const mockRenderer = {
      renderPageToCanvas: vi.fn().mockResolvedValue(ok({ cacheKey: 'k', pageIndex: 0, widthPx: 595, heightPx: 842 })),
      getPageTextLayerSpans: vi.fn().mockResolvedValue([]),
      extractEditableTextBlocks: vi.fn().mockResolvedValue([sampleBlock]),
      sampleAreaBackgroundColor: vi.fn().mockResolvedValue('#ffffff'),
    } as unknown as PdfJsDocumentHandle;

    const pageTransform: PageTransformState = {
      uid: 'p-orig-0',
      kind: 'source',
      sourceDocIndex: 0,
      sourcePageIndex: 0,
      addedRotation: 0,
    };

    let latestEdits: Readonly<Record<string, ExistingTextEdit>> = {};

    const Harness: React.FC = () => {
      const [edits, setEdits] = useState<Record<string, ExistingTextEdit>>({});
      const [selectedId, setSelectedId] = useState<string | null>(null);
      latestEdits = edits;

      return (
        <PdfPageCanvas
          renderer={mockRenderer}
          pageTransform={pageTransform}
          displayPageIndex={0}
          totalPages={1}
          metrics={{ pageIndex: 0, widthPt: 595.28, heightPt: 841.89, inherentRotation: 0 }}
          zoom={1}
          globalRotation={0}
          activeTool="edit-pdf"
          texts={[]}
          existingTextEdits={edits}
          annotations={[]}
          images={[]}
          whiteouts={[]}
          links={[]}
          createdFormFields={[]}
          watermark={null}
          headerFooter={null}
          pageCrop={null}
          pageBackground={null}
          signaturePlacements={[]}
          signatureAssetsById={new Map()}
          selectedOverlayId={selectedId}
          onSelectOverlay={setSelectedId}
          onCreateTextAt={vi.fn()}
          onUpdateText={vi.fn()}
          onDeleteText={vi.fn()}
          onUpsertExistingTextEdit={(_prev, next) =>
            setEdits((cur) => ({ ...cur, [next.key]: next }))
          }
          onCreateAnnotation={vi.fn()}
          onDeleteAnnotation={vi.fn()}
          onCreateWhiteout={vi.fn()}
          onDeleteWhiteout={vi.fn()}
          onCreateLink={vi.fn()}
          onDeleteLink={vi.fn()}
          onCreateFormField={vi.fn()}
          onDeleteFormField={vi.fn()}
          onUpdateImageRect={vi.fn()}
          onDeleteImage={vi.fn()}
          onPlaceSignatureAt={vi.fn()}
          onUpdateSignaturePlacementRect={vi.fn()}
          onDeleteSignaturePlacement={vi.fn()}
        />
      );
    };

    const root = createRoot(host);
    await act(async () => {
      root.render(<Harness />);
    });
    // Flush async extractEditableTextBlocks promise
    await act(async () => {
      await Promise.resolve();
    });

    const pageFrame = host.querySelector('.page-frame') as HTMLDivElement;
    expect(pageFrame).not.toBeNull();
    pageFrame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 595, height: 842, right: 595, bottom: 842, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const textBox = host.querySelector('.interactive-layer .existing-text-box') as HTMLDivElement | null;
    expect(textBox).not.toBeNull();

    // Pointer down + pointer up without drag (< 4px) -> enters textarea immediately without getting blocked behind interactive-layer
    const PtrEvent = globalThis.PointerEvent ?? window.MouseEvent;
    await act(async () => {
      textBox!.dispatchEvent(new PtrEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 90 }));
    });
    await act(async () => {
      window.dispatchEvent(new PtrEvent('pointerup', { bubbles: true, clientX: 80, clientY: 90 }));
    });

    const textarea = host.querySelector('.interactive-layer .existing-text-box textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe('Contrat Initial');

    await act(async () => {
      fireInputChange(textarea!, 'Contrat Corrigé Final');
    });

    expect(latestEdits['p-orig-0:blk-0']?.currentText).toBe('Contrat Corrigé Final');

    await act(async () => {
      root.unmount();
    });
  });

  it('applique exactement les valeurs Zoom avant/arrière d’AcrobatMenuBar (sans cumuler nextZoom)', async () => {
    const ZoomHarness: React.FC = () => {
      const [z, setZ] = useState(1.0);
      return (
        <div>
          <span data-testid="zoom-readout">{Math.round(z * 100)}%</span>
          <AcrobatMenuBar
            hasDocument
            docName="contrat.pdf"
            originHandle={null}
            isDirty={false}
            activeAtelier="all-tools"
            onSelectAtelier={vi.fn()}
            theme="dark"
            onToggleTheme={vi.fn()}
            canUndo={false}
            canRedo={false}
            zoom={z}
            currentPage={0}
            totalPages={2}
            viewMode="continuous"
            globalRotation={0}
            onOpenFile={vi.fn()}
            onNewBlank={vi.fn()}
            onOpenDemo={vi.fn()}
            onSaveOverwriteOrPrompt={vi.fn()}
            onSaveAsNewVersion={vi.fn()}
            onReloadOriginal={vi.fn()}
            onMergeFiles={vi.fn()}
            onOpenProperties={vi.fn()}
            onCloseDocument={vi.fn()}
            onUndo={vi.fn()}
            onRedo={vi.fn()}
            onOpenSearch={vi.fn()}
            onSelectTool={vi.fn()}
            onInsertImage={vi.fn()}
            onChangeZoom={(nextZoom) => setZ(clampZoom(nextZoom))}
            onRotateCW={vi.fn()}
            onChangeViewMode={vi.fn()}
            onToggleLeftPanel={vi.fn()}
            onToggleRightPanel={vi.fn()}
            onResetLayout={vi.fn()}
            onOpenShortcuts={vi.fn()}
            onOpenReaInspector={vi.fn()}
            onJumpPage={vi.fn()}
          />
        </div>
      );
    };

    const root = createRoot(host);
    await act(async () => {
      root.render(<ZoomHarness />);
    });

    const zoomReadout = host.querySelector('[data-testid="zoom-readout"]')!;
    expect(zoomReadout.textContent).toBe('100%');

    const buttons = Array.from(host.querySelectorAll('.atelier-strip button'));
    // ZoomOut button precedes the percentage label, ZoomIn follows it
    const pctSpan = Array.from(host.querySelectorAll('.atelier-strip span')).find((s) => s.textContent?.includes('%'))!;
    const zoomOutBtn = pctSpan.previousElementSibling as HTMLButtonElement;
    const zoomInBtn = pctSpan.nextElementSibling as HTMLButtonElement;
    expect(buttons.length).toBeGreaterThan(2);

    await act(async () => {
      zoomInBtn.click();
    });
    expect(zoomReadout.textContent).toBe('115%');

    await act(async () => {
      zoomOutBtn.click();
    });
    expect(zoomReadout.textContent).toBe('100%');

    await act(async () => {
      zoomOutBtn.click();
    });
    expect(zoomReadout.textContent).toBe('85%');

    await act(async () => {
      root.unmount();
    });
  });

  it('intercepte Ctrl+Molette et Ctrl+Raccourcis pour empêcher le zoom du navigateur', async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<App />);
    });

    const wheelEvt = new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, cancelable: true, bubbles: true });
    window.dispatchEvent(wheelEvt);
    expect(wheelEvt.defaultPrevented).toBe(true);

    const azertyMinusEvt = new KeyboardEvent('keydown', {
      ctrlKey: true,
      code: 'Minus',
      key: ')',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(azertyMinusEvt);
    expect(azertyMinusEvt.defaultPrevented).toBe(true);

    const plusEvt = new KeyboardEvent('keydown', {
      ctrlKey: true,
      code: 'Equal',
      key: '=',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(plusEvt);
    expect(plusEvt.defaultPrevented).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
