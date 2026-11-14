import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Combine, Copy, FilePlus, RotateCw, Scissors, Trash2 } from 'lucide-react';
import type { PageTransformState } from '../../../domain/editor.ts';
import type { DisplayRotation } from '../../../domain/viewer.ts';
import type { PdfJsDocumentHandle } from '../../../providers/renderer/pdfJsRenderer.ts';

interface PageOrganizerGridProps {
  readonly renderer: PdfJsDocumentHandle;
  readonly pages: readonly PageTransformState[];
  readonly globalRotation: DisplayRotation;
  readonly onRotatePage: (pageUid: string) => void;
  readonly onDuplicatePage: (pageUid: string) => void;
  readonly onDeletePage: (pageUid: string, index: number) => void;
  readonly onMovePage: (fromIndex: number, toIndex: number) => void;
  readonly onInsertBlankPage: (insertAtIndex: number) => void;
  readonly onInsertExternalPdf: () => void;
  readonly onExtractRange: (rangeExpr: string) => Promise<void>;
}

const OrganizerThumb: React.FC<{
  renderer: PdfJsDocumentHandle;
  pageTransform: PageTransformState;
  rotation: DisplayRotation;
}> = ({ renderer, pageTransform, rotation }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const isBlank = pageTransform.kind === 'blank' || pageTransform.sourcePageIndex < 0;

  useEffect(() => {
    if (!ref.current) return;
    if (isBlank) {
      const c = ref.current;
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
    void renderer.renderThumbnail(pageTransform.sourcePageIndex, ref.current, rotation);
  }, [renderer, pageTransform.sourcePageIndex, rotation, isBlank]);

  return <canvas ref={ref} style={{ maxWidth: '100%', borderRadius: 6, background: '#fff' }} />;
};

export const PageOrganizerGrid: React.FC<PageOrganizerGridProps> = ({
  renderer,
  pages,
  globalRotation,
  onRotatePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  onInsertBlankPage,
  onInsertExternalPdf,
  onExtractRange,
}) => {
  const [rangeExpr, setRangeExpr] = useState(`1-${pages.length}`);

  return (
    <div style={{ width: '100%', maxWidth: 1120 }}>
      <div
        className="panel-section"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}
      >
        <div>
          <strong>Organiser les pages ({pages.length} page(s))</strong>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            Insérez des pages vierges ou d’autres PDF, réorganisez, pivotez, dupliquez ou extrayez une plage.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)' }}
            onClick={() => onInsertBlankPage(pages.length)}
          >
            <FilePlus size={13} /> + Page vierge
          </button>
          <button
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)' }}
            onClick={onInsertExternalPdf}
          >
            <Combine size={13} /> + Insérer un PDF
          </button>
          <input
            className="text-input"
            style={{ width: 130, marginBottom: 0 }}
            value={rangeExpr}
            onChange={(e) => setRangeExpr(e.target.value)}
            placeholder="ex: 1-2, 4"
          />
          <button className="tool-btn primary" onClick={() => void onExtractRange(rangeExpr)}>
            <Scissors size={13} /> Extraire (.pdf)
          </button>
        </div>
      </div>

      <div className="organizer-grid">
        {pages.map((p, idx) => {
          const rot = (((globalRotation + p.addedRotation) % 360) as DisplayRotation);
          return (
            <div key={p.uid} className="organizer-card">
              <OrganizerThumb renderer={renderer} pageTransform={p} rotation={rot} />
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                Page {idx + 1}{' '}
                <span style={{ opacity: 0.6 }}>
                  {p.kind === 'blank' ? '(vierge)' : `(src #${p.sourcePageIndex + 1})`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="tool-btn"
                  disabled={idx === 0}
                  title="Déplacer avant"
                  onClick={() => onMovePage(idx, idx - 1)}
                  style={{ padding: 5 }}
                >
                  <ArrowLeft size={13} />
                </button>
                <button
                  className="tool-btn"
                  disabled={idx === pages.length - 1}
                  title="Déplacer après"
                  onClick={() => onMovePage(idx, idx + 1)}
                  style={{ padding: 5 }}
                >
                  <ArrowRight size={13} />
                </button>
                <button className="tool-btn" title="Pivoter 90°" onClick={() => onRotatePage(p.uid)} style={{ padding: 5 }}>
                  <RotateCw size={13} />
                </button>
                <button className="tool-btn" title="Dupliquer" onClick={() => onDuplicatePage(p.uid)} style={{ padding: 5 }}>
                  <Copy size={13} />
                </button>
                <button
                  className="tool-btn danger"
                  disabled={pages.length <= 1}
                  title="Supprimer"
                  onClick={() => onDeletePage(p.uid, idx)}
                  style={{ padding: 5 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
