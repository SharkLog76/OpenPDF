import React from 'react';
import { Download, ExternalLink, Sparkles, X } from 'lucide-react';
import type { AppUpdateInfo } from '../../../domain/updater.ts';

interface UpdateNotificationModalProps {
  readonly updateInfo: AppUpdateInfo;
  readonly onClose: () => void;
  readonly onOpenUrl: (url: string) => void;
}

export const UpdateNotificationModal: React.FC<UpdateNotificationModalProps> = ({
  updateInfo,
  onClose,
  onOpenUrl,
}) => {
  const targetUrl = updateInfo.installerAsset?.downloadUrl || updateInfo.releaseUrl;

  const handleDownload = () => {
    onOpenUrl(targetUrl);
    onClose();
  };

  const handleOpenReleasePage = () => {
    onOpenUrl(updateInfo.releaseUrl);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Mise à jour disponible">
      <div className="modal-card" style={{ width: 560, maxWidth: '94vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(37, 99, 235, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Mise à jour disponible !</h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                OpenPDF <strong>v{updateInfo.latestVersion}</strong> (actuelle : v{updateInfo.currentVersion})
              </span>
            </div>
          </div>
          <button
            type="button"
            className="tool-btn"
            style={{ padding: 4 }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={15} />
          </button>
        </div>

        <div
          style={{
            marginTop: 8,
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-color)',
            maxHeight: 220,
            overflowY: 'auto',
            fontSize: 12.5,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
            {updateInfo.releaseName}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {updateInfo.releaseNotes}
          </div>
        </div>

        {updateInfo.installerAsset && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>Fichier prêt : <strong>{updateInfo.installerAsset.name}</strong></span>
            {updateInfo.installerAsset.sizeBytes > 0 && (
              <span>({(updateInfo.installerAsset.sizeBytes / (1024 * 1024)).toFixed(2)} Mo)</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="tool-btn"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleOpenReleasePage}
          >
            <ExternalLink size={13} />
            <span>Voir sur GitHub</span>
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="tool-btn"
              style={{ border: '1px solid var(--border-color)' }}
              onClick={onClose}
            >
              Plus tard
            </button>
            <button
              type="button"
              className="tool-btn primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleDownload}
            >
              <Download size={14} />
              <span>Télécharger et installer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
