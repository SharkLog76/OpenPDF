import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileKey2,
  KeyRound,
  PenTool,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  ExistingTextEdit,
  HeaderFooterConfig,
  PageBackgroundConfig,
  PageCropConfig,
  TextOverlayItem,
  WatermarkConfig,
} from '../../../domain/editor.ts';
import type {
  CertificateMetadata,
  SignatureMetadataOverlay,
  SignatureVerificationRecord,
  VisualSignatureAsset,
} from '../../../domain/signing.ts';
import type { DocumentIdentity, PdfMetadataFacts } from '../../../domain/viewer.ts';
import { computeSha256Hex } from '../../../providers/filesystem/boundedFileSystem.ts';
import { FormatInspectorPanel } from './FormatInspectorPanel.tsx';

export type RightTabId = 'format' | 'signatures' | 'inspector';

interface SignatureVaultPanelProps {
  readonly activeTab: RightTabId;
  readonly onChangeTab: (tab: RightTabId) => void;
  // Format Inspector props
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
  // Signature Vault props
  readonly assets: readonly VisualSignatureAsset[];
  readonly selectedAssetId: string | null;
  readonly onSelectAsset: (id: string) => void;
  readonly onActivatePlacementTool: () => void;
  readonly onImportSignatureFile: (file: File, stripWhiteBg: boolean) => Promise<void>;
  readonly onSaveDrawnAsset: (asset: VisualSignatureAsset) => Promise<void>;
  readonly onCreateStamp: (name: string, subtitle: string) => Promise<void>;
  readonly onDeleteAsset: (id: string) => Promise<void>;
  readonly sigMeta: SignatureMetadataOverlay;
  readonly onChangeSigMeta: (next: SignatureMetadataOverlay) => void;
  readonly applyToAllPages: boolean;
  readonly onChangeApplyToAllPages: (val: boolean) => void;
  // PKCS#12 Cert state (passphrase & bytes live only in memory)
  readonly loadedP12Name: string | null;
  readonly loadedCertMeta: CertificateMetadata | null;
  readonly p12Passphrase: string;
  readonly onChangeP12Passphrase: (pass: string) => void;
  readonly onImportP12File: (file: File, passphrase: string) => Promise<void>;
  readonly onGenerateLocalP12: (cn: string, org: string, passphrase: string) => Promise<void>;
  readonly onRequestSaveDialog: () => void;
  readonly hasDocument: boolean;
  // REA Inspector
  readonly docIdentity: DocumentIdentity | null;
  readonly docMetadata: PdfMetadataFacts | null;
  readonly verifications: readonly SignatureVerificationRecord[];
  readonly ledgerRevision: number;
  readonly commandCount: number;
}

export const SignatureVaultPanel: React.FC<SignatureVaultPanelProps> = ({
  activeTab,
  onChangeTab,
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
  assets,
  selectedAssetId,
  onSelectAsset,
  onActivatePlacementTool,
  onImportSignatureFile,
  onSaveDrawnAsset,
  onCreateStamp,
  onDeleteAsset,
  sigMeta,
  onChangeSigMeta,
  applyToAllPages,
  onChangeApplyToAllPages,
  loadedP12Name,
  loadedCertMeta,
  p12Passphrase,
  onChangeP12Passphrase,
  onImportP12File,
  onGenerateLocalP12,
  onRequestSaveDialog,
  hasDocument,
  docIdentity,
  docMetadata,
  verifications,
  ledgerRevision,
  commandCount,
}) => {
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const p12FileInputRef = useRef<HTMLInputElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stripWhiteBg, setStripWhiteBg] = useState(true);
  const [showDrawPad, setShowDrawPad] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [stampName, setStampName] = useState('Alexandre Martin');
  const [stampSub, setStampSub] = useState('Bon pour accord');

  const [genCn, setGenCn] = useState('Alexandre Martin');
  const [genOrg, setGenOrg] = useState('OpenPDF Studio');

  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assets) {
      const copy = new Uint8Array(asset.pngBytes.byteLength);
      copy.set(asset.pngBytes);
      map.set(asset.id, URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' })));
    }
    return map;
  }, [assets]);

  const handlePadPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const handlePadPointerUp = () => {
    setIsDrawing(false);
  };

  const clearPad = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const savePad = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await computeSha256Hex(pngBytes);
    await onSaveDrawnAsset({
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `Signature manuscrite (${new Date().toLocaleTimeString()})`,
      kind: 'handwritten',
      pngBytes,
      sha256,
      widthPx: canvas.width,
      heightPx: canvas.height,
      createdAtIso: new Date().toISOString(),
    });
    setShowDrawPad(false);
  };

  return (
    <aside className="right-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'format' ? 'active' : ''}`}
          onClick={() => onChangeTab('format')}
        >
          <Sliders size={12} /> Format &amp; Page
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'signatures' ? 'active' : ''}`}
          onClick={() => onChangeTab('signatures')}
        >
          <PenTool size={12} /> Signatures
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => onChangeTab('inspector')}
        >
          <ShieldCheck size={12} /> Empreinte du Fichier
        </button>
      </div>

      <div className="sidebar-scroll">
        {activeTab === 'format' && (
          <FormatInspectorPanel
            selectedAddedText={selectedAddedText}
            selectedExistingEdit={selectedExistingEdit}
            onUpdateAddedText={onUpdateAddedText}
            onDeleteAddedText={onDeleteAddedText}
            onUpdateExistingText={onUpdateExistingText}
            watermark={watermark}
            onApplyWatermark={onApplyWatermark}
            headerFooter={headerFooter}
            onApplyHeaderFooter={onApplyHeaderFooter}
            pageCrop={pageCrop}
            onApplyPageCrop={onApplyPageCrop}
            pageBackground={pageBackground}
            onApplyPageBackground={onApplyPageBackground}
          />
        )}

        {activeTab === 'signatures' && (
          <>
            <div className="panel-section">
              <div className="panel-title">
                <span>Coffre de signatures (AES-GCM)</span>
                <span style={{ fontSize: 10, color: 'var(--success)' }}>Chiffré local</span>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={stripWhiteBg}
                  onChange={(e) => setStripWhiteBg(e.target.checked)}
                />
                Détourer automatiquement le fond blanc
              </label>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <input
                  ref={sigFileInputRef}
                  type="file"
                  accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onImportSignatureFile(f, stripWhiteBg);
                    e.target.value = '';
                  }}
                />
                <button
                  className="tool-btn primary"
                  onClick={() => sigFileInputRef.current?.click()}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Upload size={13} /> Importer fichier
                </button>
                <button
                  className="tool-btn"
                  style={{ border: '1px solid var(--border-color)' }}
                  onClick={() => setShowDrawPad((v) => !v)}
                >
                  <PenTool size={13} /> Dessiner
                </button>
              </div>

              {showDrawPad && (
                <div style={{ marginBottom: 10 }}>
                  <canvas
                    ref={drawCanvasRef}
                    width={280}
                    height={110}
                    style={{
                      width: '100%',
                      height: 110,
                      background: '#ffffff',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      touchAction: 'none',
                      cursor: 'crosshair',
                    }}
                    onPointerDown={handlePadPointerDown}
                    onPointerMove={handlePadPointerMove}
                    onPointerUp={handlePadPointerUp}
                    onPointerLeave={handlePadPointerUp}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button className="tool-btn" onClick={clearPad}>
                      Effacer
                    </button>
                    <button className="tool-btn primary" onClick={() => void savePad()} style={{ marginLeft: 'auto' }}>
                      Enregistrer au coffre
                    </button>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="text-input"
                    placeholder="Nom du tampon"
                    value={stampName}
                    onChange={(e) => setStampName(e.target.value)}
                  />
                  <input
                    className="text-input"
                    placeholder="Mention"
                    value={stampSub}
                    onChange={(e) => setStampSub(e.target.value)}
                  />
                </div>
                <button
                  className="tool-btn"
                  style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--border-color)' }}
                  onClick={() => void onCreateStamp(stampName, stampSub)}
                >
                  <Stamp size={13} /> Créer un tampon typographique
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {assets.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0 }}>
                    Importez un fichier signature (.png, .svg, .jpg) ou créez un tracé pour le réutiliser sur tous vos PDF.
                  </p>
                ) : (
                  assets.map((asset) => {
                    const isSel = selectedAssetId === asset.id;
                    const url = previewUrls.get(asset.id);
                    return (
                      <div
                        key={asset.id}
                        className="sig-card"
                        style={{ borderColor: isSel ? 'var(--accent)' : undefined }}
                      >
                        <div className="sig-preview-box">
                          {url && <img src={url} alt={asset.label} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {asset.label}
                          </span>
                          <button
                            className={`tool-btn ${isSel ? 'primary' : ''}`}
                            style={{ padding: '4px 8px' }}
                            disabled={!hasDocument}
                            onClick={() => {
                              onSelectAsset(asset.id);
                              onActivatePlacementTool();
                            }}
                          >
                            {isSel ? 'Cliquer sur page' : 'Placer'}
                          </button>
                          <button
                            className="tool-btn danger"
                            style={{ padding: 4 }}
                            title="Supprimer du coffre"
                            onClick={() => void onDeleteAsset(asset.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-title">Options du bloc signature</div>
              <label className="field-label">Nom affiché</label>
              <input
                className="text-input"
                value={sigMeta.signerName}
                onChange={(e) => onChangeSigMeta({ ...sigMeta, signerName: e.target.value })}
              />
              <label className="field-label">Motif</label>
              <input
                className="text-input"
                value={sigMeta.reason}
                onChange={(e) => onChangeSigMeta({ ...sigMeta, reason: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={sigMeta.showMetadataBox}
                  onChange={(e) => onChangeSigMeta({ ...sigMeta, showMetadataBox: e.target.checked })}
                />
                Afficher cartouche (nom, date, motif)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <input
                  type="checkbox"
                  checked={applyToAllPages}
                  onChange={(e) => onChangeApplyToAllPages(e.target.checked)}
                />
                Parapher sur toutes les pages
              </label>
            </div>

            <div className="panel-section">
              <div className="panel-title">
                <span>Certificat numérique (.pfx / .p12)</span>
                <KeyRound size={13} />
              </div>

              <label className="field-label">Phrase secrète du certificat (RAM uniquement)</label>
              <input
                type="password"
                className="text-input"
                placeholder="Mot de passe .pfx / .p12"
                value={p12Passphrase}
                onChange={(e) => onChangeP12Passphrase(e.target.value)}
              />

              <input
                ref={p12FileInputRef}
                type="file"
                accept=".pfx,.p12"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImportP12File(f, p12Passphrase);
                  e.target.value = '';
                }}
              />

              <button
                className="tool-btn"
                style={{ width: '100%', border: '1px solid var(--border-color)', justifyContent: 'center', marginBottom: 8 }}
                onClick={() => p12FileInputRef.current?.click()}
              >
                <FileKey2 size={13} /> Importer .pfx/.p12
              </button>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Ou générer un certificat local de test (.p12) :
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="text-input"
                    placeholder="CN (Nom)"
                    value={genCn}
                    onChange={(e) => setGenCn(e.target.value)}
                  />
                  <input
                    className="text-input"
                    placeholder="Organisation"
                    value={genOrg}
                    onChange={(e) => setGenOrg(e.target.value)}
                  />
                </div>
                <button
                  className="tool-btn"
                  style={{ width: '100%', border: '1px solid var(--border-color)', justifyContent: 'center' }}
                  onClick={() => void onGenerateLocalP12(genCn, genOrg, p12Passphrase || 'openpdf')}
                >
                  <Sparkles size={13} /> Générer &amp; Charger un .p12 local
                </button>
              </div>

              {loadedCertMeta && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} color="var(--success)" /> {loadedP12Name}
                  </div>
                  <div>CN : {loadedCertMeta.subjectCommonName}</div>
                  <div>Émetteur : {loadedCertMeta.issuerCommonName}</div>
                  <div>Valide jusqu’au : {loadedCertMeta.notAfterIso.slice(0, 10)}</div>
                </div>
              )}

              <button
                className="tool-btn primary"
                disabled={!hasDocument}
                onClick={onRequestSaveDialog}
                style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              >
                <ShieldCheck size={14} /> Enregistrer / Signer le PDF…
              </button>
            </div>
          </>
        )}

        {activeTab === 'inspector' && (
          <>
            <div className="panel-section">
              <div className="panel-title">Identité &amp; Empreinte du Fichier</div>
              {!docIdentity ? (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aucun document ouvert.</p>
              ) : (
                <div style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                  <div>
                    <strong>Nom affiché :</strong> {docIdentity.displayName}
                  </div>
                  <div>
                    <strong>SHA-256 :</strong>{' '}
                    <code style={{ fontSize: 10.5, wordBreak: 'break-all' }}>{docIdentity.sha256}</code>
                  </div>
                  <div>
                    <strong>Taille admise :</strong> {(docIdentity.byteLength / 1024).toFixed(1)} Ko
                  </div>
                  <div>
                    <strong>Version PDF :</strong> {docMetadata?.pdfFormatVersion ?? docIdentity.headerVersion ?? 'Inconnue'}
                  </div>
                  <div>
                    <strong>Pages :</strong> {docMetadata?.pageCount ?? '—'} · <strong>Révision Ledger :</strong> #{ledgerRevision} ({commandCount} cmd)
                  </div>
                </div>
              )}
            </div>

            <div className="panel-section">
              <div className="panel-title">Vérification des signatures (/ByteRange)</div>
              {verifications.length === 0 ? (
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0 }}>
                  Aucune signature cryptographique `/ByteRange` PKCS#7 détectée dans ce document source.
                </p>
              ) : (
                verifications.map((v, i) => (
                  <div key={i} className="sig-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 12 }}>{v.fieldName}</strong>
                      <span className={`badge ${v.status}`}>
                        {v.status === 'intact' && <CheckCircle2 size={11} />}
                        {v.status === 'tampered' && <ShieldAlert size={11} />}
                        {v.status === 'intact'
                          ? 'Intègre'
                          : v.status === 'tampered'
                            ? 'Falsifié'
                            : 'Inconnu'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <strong>Observations :</strong>
                      <ul style={{ margin: '3px 0 6px 16px', padding: 0 }}>
                        {v.observations.map((o, idx) => (
                          <li key={idx}>{o}</li>
                        ))}
                      </ul>
                      {v.derivations.length > 0 && (
                        <>
                          <strong>Dérivations :</strong>
                          <ul style={{ margin: '3px 0 6px 16px', padding: 0 }}>
                            {v.derivations.map((d, idx) => (
                              <li key={idx}>{d}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <strong>Inconnues (Unknowns) :</strong>
                      <ul style={{ margin: '3px 0 0 16px', padding: 0, color: 'var(--warning)' }}>
                        {v.unknowns.map((u, idx) => (
                          <li key={idx}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
