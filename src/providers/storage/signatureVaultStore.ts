/**
 * Encrypted Local Signature Vault Provider (WebCrypto AES-GCM 256 + IndexedDB).
 * Stores imported visual signature assets across PDF sessions.
 * NEVER stores .pfx/.p12 passphrases or plaintext private keys.
 */
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS, detectImageFormat } from '../../contracts/schemas.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type { SignatureAssetKind, VisualSignatureAsset } from '../../domain/signing.ts';
import { computeSha256Hex } from '../filesystem/boundedFileSystem.ts';

const DB_NAME = 'openpdf_vault_v1';
const STORE_KEYS = 'vault_keys';
const STORE_ASSETS = 'signature_assets';
const MASTER_KEY_ID = 'aes_gcm_local_master';

interface SerializedSignatureAsset {
  readonly id: string;
  readonly label: string;
  readonly kind: SignatureAssetKind;
  readonly pngBase64: string;
  readonly sha256: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly createdAtIso: string;
}

interface EncryptedVaultRecord {
  readonly id: string;
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly updatedAtIso: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible dans cet environnement.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) db.createObjectStore(STORE_KEYS);
      if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erreur ouverture IndexedDB'));
  });
}

async function getOrCreateVaultKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readonly');
    const req = tx.objectStore(STORE_KEYS).get(MASTER_KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readwrite');
    tx.objectStore(STORE_KEYS).put(key, MASTER_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return key;
}

export async function encryptAssetPayload(
  asset: VisualSignatureAsset,
  key: CryptoKey
): Promise<EncryptedVaultRecord> {
  const payload: SerializedSignatureAsset = {
    id: asset.id,
    label: asset.label,
    kind: asset.kind,
    pngBase64: bytesToBase64(asset.pngBytes),
    sha256: asset.sha256,
    widthPx: asset.widthPx,
    heightPx: asset.heightPx,
    createdAtIso: asset.createdAtIso,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode(asset.id);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    encoded
  );
  return {
    id: asset.id,
    iv,
    ciphertext: new Uint8Array(cipherBuf),
    updatedAtIso: new Date().toISOString(),
  };
}

export async function decryptAssetPayload(
  record: EncryptedVaultRecord,
  key: CryptoKey
): Promise<VisualSignatureAsset> {
  const ivCopy = new Uint8Array(record.iv.byteLength);
  ivCopy.set(record.iv);
  const cipherCopy = new Uint8Array(record.ciphertext.byteLength);
  cipherCopy.set(record.ciphertext);
  const aad = new TextEncoder().encode(record.id);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy, additionalData: aad },
    key,
    cipherCopy.buffer
  );
  const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as SerializedSignatureAsset;
  if (parsed.id !== record.id) {
    throw new Error('Concordance d’identifiant du coffre invalide.');
  }
  const pngBytes = base64ToBytes(parsed.pngBase64);
  const fmtRes = detectImageFormat(pngBytes, ADMISSION_LIMITS.MAX_SIGNATURE_IMAGE_BYTES);
  if (!fmtRes.ok || fmtRes.value !== 'png') {
    throw new Error('Contenu PNG du coffre invalide.');
  }
  return {
    id: parsed.id,
    label: parsed.label,
    kind: parsed.kind,
    pngBytes,
    sha256: parsed.sha256 || (await computeSha256Hex(pngBytes)),
    widthPx: parsed.widthPx,
    heightPx: parsed.heightPx,
    createdAtIso: parsed.createdAtIso,
  };
}

export class SignatureVaultStore {
  async listAssets(): Promise<Result<VisualSignatureAsset[], DomainError>> {
    let db: IDBDatabase | null = null;
    try {
      db = await openVaultDb();
      const key = await getOrCreateVaultKey(db);
      const records = await new Promise<EncryptedVaultRecord[]>((resolve, reject) => {
        const tx = db!.transaction(STORE_ASSETS, 'readonly');
        const req = tx.objectStore(STORE_ASSETS).getAll();
        req.onsuccess = () => resolve((req.result as EncryptedVaultRecord[]) ?? []);
        req.onerror = () => reject(req.error);
      });

      const decrypted: VisualSignatureAsset[] = [];
      for (const rec of records) {
        try {
          decrypted.push(await decryptAssetPayload(rec, key));
        } catch {
          // Skip corrupted or mismatched-key entry safely
        }
      }
      decrypted.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      return ok(decrypted);
    } catch (e: unknown) {
      return err({
        code: 'VaultStorageUnavailable',
        message: 'Le coffre local chiffré est indisponible.',
        cause: e instanceof Error ? e.message : String(e),
      });
    } finally {
      db?.close();
    }
  }

  async saveAsset(asset: VisualSignatureAsset): Promise<Result<void, DomainError>> {
    let db: IDBDatabase | null = null;
    try {
      db = await openVaultDb();
      const key = await getOrCreateVaultKey(db);
      const record = await encryptAssetPayload(asset, key);
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(STORE_ASSETS, 'readwrite');
        tx.objectStore(STORE_ASSETS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err({
        code: 'VaultStorageUnavailable',
        message: 'Impossible d’enregistrer la signature dans le coffre chiffré.',
        cause: e instanceof Error ? e.message : String(e),
      });
    } finally {
      db?.close();
    }
  }

  async deleteAsset(id: string): Promise<Result<void, DomainError>> {
    let db: IDBDatabase | null = null;
    try {
      db = await openVaultDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(STORE_ASSETS, 'readwrite');
        tx.objectStore(STORE_ASSETS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err({
        code: 'VaultStorageUnavailable',
        message: 'Impossible de supprimer la signature du coffre.',
        cause: e instanceof Error ? e.message : String(e),
      });
    } finally {
      db?.close();
    }
  }
}
