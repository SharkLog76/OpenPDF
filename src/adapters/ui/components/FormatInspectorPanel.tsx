import React, { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Crop,
  Droplets,
  Italic,
  LayoutTemplate,
  PaintBucket,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  ExistingTextEdit,
  HeaderFooterConfig,
  PageBackgroundConfig,
  PageCropConfig,
  PdfStandardFamily,
  TextOverlayItem,
  WatermarkConfig,
} from '../../../domain/editor.ts';

interface FormatInspectorPanelProps {
  readonly selectedAddedText: TextOverlayItem | null;
  readonly selectedExistingEdit: ExistingTextEdit | null;
  readonly onUpdateAddedText: (prev: TextOverlayItem, next: TextOverlayItem) => void;
  readonly onDeleteAddedText: (item: TextOverlayItem) => void;
  readonly onUpdateExistingText: (next: ExistingTextEdit) => void;
  readonly watermark: WatermarkConfig | null;
  readonly onApplyWatermark: (next: WatermarkConfig | null) => void;
  readonly headerFooter: HeaderFooterConfig | null;
  readonly onApplyHeaderFooter: (next: HeaderFooterConfig | null) => void;
  readonly pageCrop: PageCropConfig | null;
  readonly onApplyPageCrop: (next: PageCropConfig | null) => void;
  readonly pageBackground: PageBackgroundConfig | null;
  readonly onApplyPageBackground: (next: PageBackgroundConfig | null) => void;
}

export const FormatInspectorPanel: React.FC<FormatInspectorPanelProps> = ({
  selectedAddedText,
  selectedExistingEdit,
  onUpdateAddedText,
  onDeleteAddedText,
  onUpdateExistingText,
  watermark,
  onApplyWatermark,
  headerFooter,
  onApplyHeaderFooter,
  pageCrop,
  onApplyPageCrop,
  pageBackground,
  onApplyPageBackground,
}) => {
  const [wmText, setWmText] = useState(watermark?.text ?? 'CONFIDENTIEL');
  const [wmOpacity, setWmOpacity] = useState(watermark?.opacity ?? 0.22);
  const [wmAngle, setWmAngle] = useState(watermark?.angleDeg ?? 35);
  const [wmColor, setWmColor] = useState(watermark?.colorHex ?? '#dc2626');

  const [hfHeaderRight, setHfHeaderRight] = useState(headerFooter?.headerRight ?? 'Date : {date}');
  const [hfFooterCenter, setHfFooterCenter] = useState(headerFooter?.footerCenter ?? 'Page {page} / {total}');
  const [hfFooterLeft, setHfFooterLeft] = useState(headerFooter?.footerLeft ?? '');

  const [cropMargin, setCropMargin] = useState(pageCrop?.marginTopPt ?? 24);
  const [bgColor, setBgColor] = useState(pageBackground?.colorHex ?? '#fefce8');

  const activeText = selectedExistingEdit ?? selectedAddedText;

  return (
    <div>
      {/* 1. Acrobat Pro Text Format Controls */}
      <div className="panel-section">
        <div className="panel-title">Format du texte sélectionné</div>
        {!activeText ? (
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Cliquez sur <strong>n’importe quel texte existant du PDF</strong> ou ajoutez un bloc de texte pour
            modifier son contenu, sa police, sa taille, sa couleur ou le supprimer.
          </p>
        ) : (
          <div>
            <label className="field-label">Contenu</label>
            <textarea
              className="text-input"
              rows={3}
              value={selectedExistingEdit ? selectedExistingEdit.currentText : selectedAddedText!.text}
              onChange={(e) => {
                if (selectedExistingEdit) {
                  onUpdateExistingText({ ...selectedExistingEdit, currentText: e.target.value, deleted: false });
                } else if (selectedAddedText) {
                  onUpdateAddedText(selectedAddedText, { ...selectedAddedText, text: e.target.value });
                }
              }}
            />

            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 2 }}>
                <label className="field-label">Police</label>
                <select
                  className="select-input"
                  value={activeText.fontFamily}
                  onChange={(e) => {
                    const family = e.target.value as PdfStandardFamily;
                    if (selectedExistingEdit) onUpdateExistingText({ ...selectedExistingEdit, fontFamily: family });
                    else if (selectedAddedText) onUpdateAddedText(selectedAddedText, { ...selectedAddedText, fontFamily: family });
                  }}
                >
                  <option value="Helvetica">Helvetica (Sans)</option>
                  <option value="TimesRoman">Times (Serif)</option>
                  <option value="Courier">Courier (Mono)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Taille (pt)</label>
                <input
                  type="number"
                  min={6}
                  max={72}
                  className="text-input"
                  value={Math.round(activeText.fontSizePt)}
                  onChange={(e) => {
                    const sz = Math.min(72, Math.max(6, Number(e.target.value) || 12));
                    if (selectedExistingEdit) onUpdateExistingText({ ...selectedExistingEdit, fontSizePt: sz });
                    else if (selectedAddedText) onUpdateAddedText(selectedAddedText, { ...selectedAddedText, fontSizePt: sz });
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <button
                className={`tool-btn ${activeText.bold ? 'active' : ''}`}
                title="Gras"
                onClick={() => {
                  if (selectedExistingEdit) {
                    onUpdateExistingText({ ...selectedExistingEdit, bold: !selectedExistingEdit.bold });
                  } else if (selectedAddedText) {
                    onUpdateAddedText(selectedAddedText, { ...selectedAddedText, bold: !selectedAddedText.bold });
                  }
                }}
              >
                <Bold size={13} />
              </button>
              <button
                className={`tool-btn ${activeText.italic ? 'active' : ''}`}
                title="Italique"
                onClick={() => {
                  if (selectedExistingEdit) {
                    onUpdateExistingText({ ...selectedExistingEdit, italic: !selectedExistingEdit.italic });
                  } else if (selectedAddedText) {
                    onUpdateAddedText(selectedAddedText, { ...selectedAddedText, italic: !selectedAddedText.italic });
                  }
                }}
              >
                <Italic size={13} />
              </button>

              {selectedAddedText && (
                <>
                  <button
                    className={`tool-btn ${(selectedAddedText.align ?? 'left') === 'left' ? 'active' : ''}`}
                    onClick={() => onUpdateAddedText(selectedAddedText, { ...selectedAddedText, align: 'left' })}
                  >
                    <AlignLeft size={13} />
                  </button>
                  <button
                    className={`tool-btn ${selectedAddedText.align === 'center' ? 'active' : ''}`}
                    onClick={() => onUpdateAddedText(selectedAddedText, { ...selectedAddedText, align: 'center' })}
                  >
                    <AlignCenter size={13} />
                  </button>
                  <button
                    className={`tool-btn ${selectedAddedText.align === 'right' ? 'active' : ''}`}
                    onClick={() => onUpdateAddedText(selectedAddedText, { ...selectedAddedText, align: 'right' })}
                  >
                    <AlignRight size={13} />
                  </button>
                </>
              )}

              <input
                type="color"
                title="Couleur du texte"
                value={activeText.colorHex}
                onChange={(e) => {
                  if (selectedExistingEdit) onUpdateExistingText({ ...selectedExistingEdit, colorHex: e.target.value });
                  else if (selectedAddedText) onUpdateAddedText(selectedAddedText, { ...selectedAddedText, colorHex: e.target.value });
                }}
                style={{ width: 28, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}
              />
            </div>

            {selectedExistingEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Fond de masquage :</span>
                <input
                  type="color"
                  value={selectedExistingEdit.backgroundHex}
                  onChange={(e) =>
                    onUpdateExistingText({ ...selectedExistingEdit, backgroundHex: e.target.value })
                  }
                  style={{ width: 28, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              {selectedExistingEdit ? (
                <>
                  <button
                    className="tool-btn"
                    style={{ flex: 1, border: '1px solid var(--border-color)', justifyContent: 'center' }}
                    onClick={() =>
                      onUpdateExistingText({
                        ...selectedExistingEdit,
                        currentText: selectedExistingEdit.originalText,
                        currentRect: selectedExistingEdit.originalRect,
                        deleted: false,
                      })
                    }
                  >
                    <RotateCcw size={12} /> Rétablir
                  </button>
                  <button
                    className="tool-btn danger"
                    style={{ flex: 1, border: '1px solid var(--border-color)', justifyContent: 'center' }}
                    onClick={() => onUpdateExistingText({ ...selectedExistingEdit, deleted: true })}
                  >
                    <Trash2 size={12} /> Supprimer
                  </button>
                </>
              ) : (
                <button
                  className="tool-btn danger"
                  style={{ width: '100%', border: '1px solid var(--border-color)', justifyContent: 'center' }}
                  onClick={() => selectedAddedText && onDeleteAddedText(selectedAddedText)}
                >
                  <Trash2 size={12} /> Supprimer ce bloc
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Filigrane (Watermark) */}
      <div className="panel-section">
        <div className="panel-title">
          <span><Droplets size={13} style={{ verticalAlign: -2 }} /> Filigrane</span>
          {watermark?.enabled && <span style={{ fontSize: 10, color: 'var(--success)' }}>Actif</span>}
        </div>
        <input
          className="text-input"
          placeholder="Texte du filigrane"
          value={wmText}
          onChange={(e) => setWmText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11 }}>Opacité {Math.round(wmOpacity * 100)}%</span>
          <input
            type="range"
            min={0.08}
            max={0.8}
            step={0.05}
            value={wmOpacity}
            onChange={(e) => setWmOpacity(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            className="text-input"
            style={{ width: 52, marginBottom: 0 }}
            value={wmAngle}
            onChange={(e) => setWmAngle(Number(e.target.value) || 0)}
            title="Angle (°)"
          />
          <input type="color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="tool-btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() =>
              onApplyWatermark({
                enabled: true,
                text: wmText,
                fontSizePt: 48,
                colorHex: wmColor,
                opacity: wmOpacity,
                angleDeg: wmAngle,
              })
            }
          >
            Appliquer
          </button>
          {watermark?.enabled && (
            <button className="tool-btn danger" onClick={() => onApplyWatermark(null)}>
              Retirer
            </button>
          )}
        </div>
      </div>

      {/* 3. En-tête & Pied de page */}
      <div className="panel-section">
        <div className="panel-title">
          <span><LayoutTemplate size={13} style={{ verticalAlign: -2 }} /> En-tête &amp; Pied de page</span>
          {headerFooter?.enabled && <span style={{ fontSize: 10, color: 'var(--success)' }}>Actif</span>}
        </div>
        <label className="field-label">En-tête droit ({'{date}'})</label>
        <input className="text-input" value={hfHeaderRight} onChange={(e) => setHfHeaderRight(e.target.value)} />
        <label className="field-label">Pied gauche / centre ({'{page}'}, {'{total}'})</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="text-input"
            placeholder="Pied gauche"
            value={hfFooterLeft}
            onChange={(e) => setHfFooterLeft(e.target.value)}
          />
          <input
            className="text-input"
            placeholder="Page {page} / {total}"
            value={hfFooterCenter}
            onChange={(e) => setHfFooterCenter(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="tool-btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() =>
              onApplyHeaderFooter({
                enabled: true,
                headerLeft: '',
                headerCenter: '',
                headerRight: hfHeaderRight,
                footerLeft: hfFooterLeft,
                footerCenter: hfFooterCenter,
                footerRight: '',
                fontSizePt: 9,
                colorHex: '#475569',
              })
            }
          >
            Appliquer
          </button>
          {headerFooter?.enabled && (
            <button className="tool-btn danger" onClick={() => onApplyHeaderFooter(null)}>
              Retirer
            </button>
          )}
        </div>
      </div>

      {/* 4. Recadrage & Arrière-plan */}
      <div className="panel-section">
        <div className="panel-title">
          <span><Crop size={13} style={{ verticalAlign: -2 }} /> Recadrage &amp; Fond</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11 }}>Marges recadrage (pt) :</span>
          <input
            type="number"
            min={0}
            max={200}
            className="text-input"
            style={{ width: 64, marginBottom: 0 }}
            value={cropMargin}
            onChange={(e) => setCropMargin(Math.max(0, Number(e.target.value) || 0))}
          />
          <button
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)' }}
            onClick={() =>
              onApplyPageCrop({
                enabled: cropMargin > 0,
                marginTopPt: cropMargin,
                marginRightPt: cropMargin,
                marginBottomPt: cropMargin,
                marginLeftPt: cropMargin,
              })
            }
          >
            Recadrer
          </button>
          {pageCrop?.enabled && (
            <button className="tool-btn danger" onClick={() => onApplyPageCrop(null)}>
              Reset
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PaintBucket size={13} />
          <span style={{ fontSize: 11 }}>Teinte fond :</span>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
          <button
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)' }}
            onClick={() => onApplyPageBackground({ enabled: true, colorHex: bgColor })}
          >
            Appliquer
          </button>
          {pageBackground?.enabled && (
            <button className="tool-btn danger" onClick={() => onApplyPageBackground(null)}>
              Retirer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
