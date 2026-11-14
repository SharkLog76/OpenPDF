import React, { useState } from 'react';
import {
  AlignLeft,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Presentation,
  Table,
  X,
} from 'lucide-react';
import {
  EXPORT_FORMAT_CATALOG,
  type ConversionAuditReport,
  type DocxExportMode,
  type ExportFormatId,
  type ExportPageScope,
  type ExportRequestOptions,
  type PptxExportMode,
} from '../../../domain/converter.ts';

interface ExportFormatsModalProps {
  readonly fileName: string;
  readonly totalPages: number;
  readonly currentPageIndex: number;
  readonly hasPendingEdits: boolean;
  readonly isExporting: boolean;
  readonly lastAuditReport: ConversionAuditReport | null;
  readonly lastSavedLabel: string | null;
  readonly onRunExport: (options: ExportRequestOptions) => Promise<void>;
  readonly onClose: () => void;
}

const FORMAT_ICONS: Record<ExportFormatId, React.ReactNode> = {
  docx: <FileText size={18} color="#2563eb" />,
  xlsx: <FileSpreadsheet size={18} color="#16a34a" />,
  pptx: <Presentation size={18} color="#ea580c" />,
  csv: <Table size={18} color="#0d9488" />,
  png: <ImageIcon size={18} color="#7c3aed" />,
  jpeg: <ImageIcon size={18} color="#db2777" />,
  html: <Globe size={18} color="#0284c7" />,
  txt: <AlignLeft size={18} color="#64748b" />,
};

export const ExportFormatsModal: React.FC<ExportFormatsModalProps> = ({
  fileName,
  totalPages,
  currentPageIndex,
  hasPendingEdits,
  isExporting,
  lastAuditReport,
  lastSavedLabel,
  onRunExport,
  onClose,
}) => {
  const [format, setFormat] = useState<ExportFormatId>('docx');
  const [docxMode, setDocxMode] = useState<DocxExportMode>('exact-layout');
  const [pptxMode, setPptxMode] = useState<PptxExportMode>('exact-slides');
  const [rasterDpi, setRasterDpi] = useState<150 | 300>(150);
  const [pageScope, setPageScope] = useState<ExportPageScope>('all');

  const selectedDescriptor =
    EXPORT_FORMAT_CATALOG.find((item) => item.id === format) ?? EXPORT_FORMAT_CATALOG[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onRunExport({
      format,
      docxMode,
      pptxMode,
      includeVisualPagesInWord: docxMode === 'exact-layout',
      rasterDpi,
      pageScope,
      currentPageIndex,
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Exporter le PDF">
      <form className="modal-card" style={{ width: 680, maxWidth: '94vw' }} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Exporter « {fileName} »</h3>
          <button
            type="button"
            className="tool-btn"
            style={{ padding: 4 }}
            onClick={onClose}
            disabled={isExporting}
          >
            <X size={15} />
          </button>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Conversion 100% locale sur votre poste (aucun envoi cloud).{' '}
          {hasPendingEdits
            ? 'Les modifications et signatures non encore enregistrées seront incluses dans l’export sans altérer le PDF d’origine.'
            : 'Le contenu du document actif sera converti au format choisi avec préservation maximale de la mise en page.'}
        </p>

        <div className="export-format-grid">
          {EXPORT_FORMAT_CATALOG.map((item) => {
            const active = item.id === format;
            return (
              <button
                key={item.id}
                type="button"
                className={`export-format-card ${active ? 'active' : ''}`}
                onClick={() => setFormat(item.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {FORMAT_ICONS[item.id]}
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left', lineHeight: 1.35 }}>
                  {item.summary}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 6,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Étendue :</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="pageScope"
                checked={pageScope === 'all'}
                onChange={() => setPageScope('all')}
              />
              Toutes les pages ({totalPages})
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="pageScope"
                checked={pageScope === 'current'}
                onChange={() => setPageScope('current')}
              />
              Page active ({currentPageIndex + 1} / {totalPages})
            </label>
          </div>

          {format === 'docx' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Mode de rendu Word :</span>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="docxMode"
                  checked={docxMode === 'exact-layout'}
                  onChange={() => setDocxMode('exact-layout')}
                />
                <div>
                  <strong>Mise en page exacte & fidélité 100% (Recommandé)</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Reproduction exacte du PDF (géométrie, arrière-plans, images, vectoriels) avec zones de texte éditables superposées à leurs positions d'origine.
                  </div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="docxMode"
                  checked={docxMode === 'flowing-text'}
                  onChange={() => setDocxMode('flowing-text')}
                />
                <div>
                  <strong>Texte continu reflowable</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Conversion en flux documentaire standard (titres Word, paragraphes fluides et tableaux détectés).
                  </div>
                </div>
              </label>
            </div>
          )}

          {format === 'pptx' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Mode PowerPoint :</span>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pptxMode"
                  checked={pptxMode === 'exact-slides'}
                  onChange={() => setPptxMode('exact-slides')}
                />
                <div>
                  <strong>Diapositives fidèles & texte éditable (Recommandé)</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Arrière-plan HD plein format + boîtes de texte éditables positionnées au millimètre.
                  </div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pptxMode"
                  checked={pptxMode === 'editable-text'}
                  onChange={() => setPptxMode('editable-text')}
                />
                <div>
                  <strong>Texte seul sans arrière-plan</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Boîtes de texte éditables repositionnées sans éléments graphiques de fond.
                  </div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pptxMode"
                  checked={pptxMode === 'visual-slides'}
                  onChange={() => setPptxMode('visual-slides')}
                />
                <div>
                  <strong>Diapositives visuelles HD intégrales</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Rendu visuel exact par capture HD avec transcription du texte en notes de présentation.
                  </div>
                </div>
              </label>
            </div>
          )}

          {(format === 'png' || format === 'jpeg') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontWeight: 600 }}>Résolution :</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="rasterDpi"
                  checked={rasterDpi === 150}
                  onChange={() => setRasterDpi(150)}
                />
                150 DPI (standard)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="rasterDpi"
                  checked={rasterDpi === 300}
                  onChange={() => setRasterDpi(300)}
                />
                300 DPI (très haute netteté)
              </label>
            </div>
          )}
        </div>

        {lastAuditReport && lastAuditReport.format === format && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#10b981', marginBottom: 6 }}>
              <CheckCircle2 size={14} />
              <span>Export terminé{lastSavedLabel ? ` — ${lastSavedLabel}` : ''}</span>
            </div>
            {lastAuditReport.observations.map((obs, i) => (
              <div key={`obs-${i}`}>• Observation : {obs}</div>
            ))}
            {lastAuditReport.derivations.map((der, i) => (
              <div key={`der-${i}`}>• Dérivation : {der}</div>
            ))}
            {lastAuditReport.unknowns.length > 0 && (
              <div style={{ color: '#f59e0b', marginTop: 4 }}>
                • Limites constatées : {lastAuditReport.unknowns.join(' | ')}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)' }}
            onClick={onClose}
            disabled={isExporting}
          >
            Fermer
          </button>
          <button type="submit" className="tool-btn primary" disabled={isExporting}>
            {isExporting
              ? 'Conversion locale en cours…'
              : `Exporter en ${selectedDescriptor.extension.toUpperCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
};
