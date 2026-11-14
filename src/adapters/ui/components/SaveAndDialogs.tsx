import React, { useState } from 'react';
import { CopyPlus, HardDrive, ShieldCheck } from 'lucide-react';
import type { DocumentIdentity, PdfMetadataFacts } from '../../../domain/viewer.ts';
import { deriveNextVersionFilename } from '../../../providers/filesystem/boundedFileSystem.ts';

interface SaveStrategyModalProps {
  readonly docName: string;
  readonly hasDiskHandle: boolean;
  readonly hasPkcs12Cert: boolean;
  readonly onCancel: () => void;
  readonly onConfirmOverwrite: (rememberForSession: boolean, withPkcs7: boolean) => void;
  readonly onConfirmNewVersion: (suggestedName: string, withPkcs7: boolean) => void;
}

export const SaveStrategyModal: React.FC<SaveStrategyModalProps> = ({
  docName,
  hasDiskHandle,
  hasPkcs12Cert,
  onCancel,
  onConfirmOverwrite,
  onConfirmNewVersion,
}) => {
  const [remember, setRemember] = useState(false);
  const [withPkcs7, setWithPkcs7] = useState(hasPkcs12Cert);
  const suggestedVersion = deriveNextVersionFilename(docName);

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Enregistrer le document PDF</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
          Choisissez si vous souhaitez <strong>écraser le fichier d’origine</strong> ou{' '}
          <strong>créer une nouvelle version</strong>.
        </p>

        {hasPkcs12Cert && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              padding: '8px 10px',
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              marginBottom: 12,
            }}
          >
            <input
              type="checkbox"
              checked={withPkcs7}
              onChange={(e) => setWithPkcs7(e.target.checked)}
            />
            <ShieldCheck size={14} color="var(--success)" />
            Inclure la signature cryptographique PKCS#7 (.p12 chargé)
          </label>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <button
            className="acrobat-tool-card"
            disabled={!hasDiskHandle}
            onClick={() => onConfirmOverwrite(remember, withPkcs7)}
            style={{ marginBottom: 0 }}
          >
            <div className="acrobat-tool-icon" style={{ background: hasDiskHandle ? '#dc2626' : '#64748b' }}>
              <HardDrive size={16} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Écraser le fichier d’origine</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {hasDiskHandle
                  ? `Mettre à jour directement « ${docName} » sur le disque`
                  : 'Indisponible (document ouvert sans handle disque ; utilisez Nouvelle version)'}
              </div>
            </div>
          </button>

          <button
            className="acrobat-tool-card"
            onClick={() => onConfirmNewVersion(suggestedVersion, withPkcs7)}
            style={{ marginBottom: 0 }}
          >
            <div className="acrobat-tool-icon" style={{ background: '#2563eb' }}>
              <CopyPlus size={16} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Créer une nouvelle version</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Enregistrer sous « {suggestedVersion} » (préserve l’original intact)
              </div>
            </div>
          </button>
        </div>

        {hasDiskHandle && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginBottom: 12 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Ne plus demander pendant cette session (Ctrl+S écrasera directement ce fichier)
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="tool-btn" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};

export const DocumentPropertiesModal: React.FC<{
  identity: DocumentIdentity;
  metadata: PdfMetadataFacts;
  onClose: () => void;
}> = ({ identity, metadata, onClose }) => (
  <div className="modal-backdrop">
    <div className="modal-card">
      <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>Propriétés du document (Ctrl+D)</h3>
      <div style={{ fontSize: 12, lineHeight: 1.65 }}>
        <div><strong>Fichier :</strong> {identity.displayName}</div>
        <div><strong>Titre :</strong> {metadata.title ?? '—'}</div>
        <div><strong>Auteur :</strong> {metadata.author ?? '—'}</div>
        <div><strong>Objet :</strong> {metadata.subject ?? '—'}</div>
        <div><strong>Créateur :</strong> {metadata.creator ?? '—'}</div>
        <div><strong>Producteur :</strong> {metadata.producer ?? '—'}</div>
        <div><strong>Version PDF :</strong> {metadata.pdfFormatVersion ?? identity.headerVersion ?? '—'}</div>
        <div><strong>Nombre de pages :</strong> {metadata.pageCount}</div>
        <div><strong>Taille :</strong> {(identity.byteLength / 1024).toFixed(1)} Ko ({identity.byteLength} octets)</div>
        <div>
          <strong>SHA-256 :</strong>{' '}
          <code style={{ fontSize: 10.5, wordBreak: 'break-all' }}>{identity.sha256}</code>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="tool-btn primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  </div>
);

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="modal-backdrop">
    <div className="modal-card">
      <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>Raccourcis clavier OpenPDF</h3>
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        <div><strong>Ctrl+O</strong> : Ouvrir un PDF</div>
        <div><strong>Ctrl+S</strong> : Enregistrer (écraser l’original / choisir)</div>
        <div><strong>Ctrl+Shift+S</strong> : Enregistrer sous (nouvelle version)</div>
        <div><strong>Ctrl+Z / Ctrl+Y</strong> : Annuler / Rétablir</div>
        <div><strong>Ctrl+F</strong> : Rechercher dans le PDF</div>
        <div><strong>Ctrl+D</strong> : Propriétés du document</div>
        <div><strong>Ctrl++ / Ctrl+-</strong> : Zoom avant / arrière</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="tool-btn primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  </div>
);

export const CloseConfirmModal: React.FC<{
  readonly mode: 'single-tab' | 'window-close';
  readonly tabCount: number;
  readonly dirtyTabs: readonly { readonly id: string; readonly fileName: string }[];
  readonly isSaving: boolean;
  readonly onSaveAndConfirm: () => void;
  readonly onDiscardAndConfirm: () => void;
  readonly onCancel: () => void;
}> = ({ mode, tabCount, dirtyTabs, isSaving, onSaveAndConfirm, onDiscardAndConfirm, onCancel }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmation de fermeture">
    <div className="modal-card" style={{ width: 490 }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>
        {dirtyTabs.length > 0
          ? 'Modifications non enregistrées'
          : `Fermer la fenêtre (${tabCount} onglets ouverts) ?`}
      </h3>

      {mode === 'window-close' && tabCount > 1 && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(245, 158, 11, 0.14)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            fontSize: 12,
            color: '#f59e0b',
          }}
        >
          Attention : <strong>{tabCount} onglets</strong> sont actuellement ouverts dans cette fenêtre OpenPDF.
        </div>
      )}

      {dirtyTabs.length > 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 6px 0' }}>
            {dirtyTabs.length === 1
              ? `Le document « ${dirtyTabs[0].fileName} » contient des modifications non enregistrées.`
              : `${dirtyTabs.length} documents contiennent des modifications non enregistrées :`}
          </p>
          {dirtyTabs.length > 1 && (
            <ul style={{ margin: '4px 0 8px 18px', padding: 0, color: 'var(--text-primary)' }}>
              {dirtyTabs.map((t) => (
                <li key={t.id}>{t.fileName}</li>
              ))}
            </ul>
          )}
          <p style={{ margin: 0 }}>
            Voulez-vous enregistrer vos modifications avant de fermer ?
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Tous les onglets de cette fenêtre vont être fermés. Confirmez-vous la fermeture ?
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="tool-btn"
          style={{ border: '1px solid var(--border-color)' }}
          onClick={onCancel}
          disabled={isSaving}
        >
          Annuler
        </button>
        <button
          type="button"
          className="tool-btn danger"
          onClick={onDiscardAndConfirm}
          disabled={isSaving}
        >
          {dirtyTabs.length > 0
            ? 'Ne pas enregistrer et fermer'
            : `Fermer les ${tabCount} onglets`}
        </button>
        {dirtyTabs.length > 0 && (
          <button
            type="button"
            className="tool-btn primary"
            onClick={onSaveAndConfirm}
            disabled={isSaving}
          >
            {isSaving
              ? 'Enregistrement…'
              : dirtyTabs.length > 1
                ? `Tout enregistrer (${dirtyTabs.length}) & Fermer`
                : 'Enregistrer & Fermer'}
          </button>
        )}
      </div>
    </div>
  </div>
);

export const ExternalOpenChoiceModal: React.FC<{
  readonly paths: readonly string[];
  readonly onOpenInCurrentWindow: (rememberChoice: boolean) => void;
  readonly onOpenInNewWindow: (rememberChoice: boolean) => void;
  readonly onDismiss: () => void;
}> = ({ paths, onOpenInCurrentWindow, onOpenInNewWindow, onDismiss }) => {
  const [rememberChoice, setRememberChoice] = useState(false);
  const displayNames = paths.map((p) => p.split(/[\\/]/).pop() ?? p);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ouverture de fichier PDF">
      <div className="modal-card" style={{ width: 500 }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Ouvrir dans OpenPDF</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 8px 0' }}>
          {displayNames.length === 1
            ? `Vous avez ouvert « ${displayNames[0]} ». Comment souhaitez-vous l’ouvrir ?`
            : `${displayNames.length} fichiers PDF sélectionnés. Comment souhaitez-vous les ouvrir ?`}
        </p>
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-color)',
            fontSize: 11.5,
            maxHeight: 96,
            overflowY: 'auto',
            marginBottom: 10,
          }}
        >
          {paths.map((p) => (
            <div key={p} style={{ wordBreak: 'break-all' }}>{p}</div>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          <span>Mémoriser mon choix pour les prochains fichiers ouverts</span>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="tool-btn primary"
            style={{ justifyContent: 'center' }}
            onClick={() => onOpenInCurrentWindow(rememberChoice)}
          >
            Ouvrir dans cette instance (nouvel onglet)
          </button>
          <button
            type="button"
            className="tool-btn"
            style={{ border: '1px solid var(--border-color)', justifyContent: 'center' }}
            onClick={() => onOpenInNewWindow(rememberChoice)}
          >
            Ouvrir dans une nouvelle instance / fenêtre séparée
          </button>
          <button
            type="button"
            className="tool-btn"
            style={{ justifyContent: 'center' }}
            onClick={onDismiss}
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  );
};
