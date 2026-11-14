use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_PDF_BYTES_HARD_LIMIT: u64 = 100 * 1024 * 1024; // 100 MiB
pub const MAX_EXPORT_BYTES_HARD_LIMIT: usize = 256 * 1024 * 1024; // 256 MiB

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPdfFile {
    pub path: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrittenPdfResult {
    pub path: String,
    pub file_name: String,
    pub byte_length: usize,
}

fn has_pdf_magic_header(bytes: &[u8]) -> bool {
    let inspect_len = bytes.len().min(1024);
    bytes[..inspect_len].windows(5).any(|w| w == b"%PDF-")
}

/// Reads a local PDF file with pre-read size bounds and `%PDF-` magic header checks.
pub fn read_pdf_file_bounded_impl(path: &Path, max_bytes: u64) -> Result<LoadedPdfFile, String> {
    if !path.is_file() {
        return Err(format!("ReadFailed:Fichier PDF introuvable : {}", path.display()));
    }

    let meta = fs::metadata(path)
        .map_err(|e| format!("ReadFailed:Impossible de lire les métadonnées ({e})"))?;
    let effective_limit = max_bytes.min(MAX_PDF_BYTES_HARD_LIMIT).max(1024);

    if meta.len() == 0 {
        return Err("EmptyFile:Le fichier PDF sélectionné est vide (0 octet).".to_string());
    }
    if meta.len() > effective_limit {
        return Err(format!(
            "FileTooLarge:Fichier trop volumineux ({} octets, plafond {} octets).",
            meta.len(),
            effective_limit
        ));
    }

    let bytes =
        fs::read(path).map_err(|e| format!("ReadFailed:Erreur de lecture disque ({e})"))?;

    if !has_pdf_magic_header(&bytes) {
        return Err(
            "InvalidPdfHeader:En-tête %PDF- absent : le fichier n'est pas un PDF valide.".to_string(),
        );
    }

    let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let file_name = canonical
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    Ok(LoadedPdfFile {
        path: canonical.to_string_lossy().to_string(),
        file_name,
        bytes,
    })
}

/// Shared atomic staging write + sync_all + rename replacement for PDF and export artifacts.
fn write_bytes_atomic_inner(
    path: &Path,
    bytes: &[u8],
    default_file_name: &str,
) -> Result<WrittenPdfResult, String> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("OverwriteFailed:Répertoire cible inaccessible ({e})"))?;
    }

    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(default_file_name)
        .to_string();

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_path = parent.join(format!(
        ".{file_name}.openpdf.tmp.{}.{}",
        std::process::id(),
        nonce
    ));

    let write_res: Result<(), String> = (|| {
        let mut tmp_file = File::create(&tmp_path)
            .map_err(|e| format!("OverwriteFailed:Impossible de créer le fichier temporaire ({e})"))?;
        tmp_file
            .write_all(bytes)
            .map_err(|e| format!("OverwriteFailed:Échec d'écriture des octets ({e})"))?;
        tmp_file
            .sync_all()
            .map_err(|e| format!("OverwriteFailed:Échec de synchronisation disque ({e})"))?;
        Ok(())
    })();

    if let Err(err) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }

    if let Err(err) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "OverwriteFailed:Impossible de remplacer le fichier cible ({err})"
        ));
    }

    let final_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Ok(WrittenPdfResult {
        path: final_path.to_string_lossy().to_string(),
        file_name,
        byte_length: bytes.len(),
    })
}

/// Atomically writes validated PDF bytes via a flushed staging file + rename replacement.
pub fn write_pdf_atomic_impl(path: &Path, bytes: &[u8]) -> Result<WrittenPdfResult, String> {
    if bytes.is_empty() {
        return Err("EmptyFile:Impossible d'écrire un PDF vide (0 octet).".to_string());
    }
    if !has_pdf_magic_header(bytes) {
        return Err(
            "InvalidPdfHeader:En-tête %PDF- manquant dans le flux compilé : écriture refusée."
                .to_string(),
        );
    }
    write_bytes_atomic_inner(path, bytes, "document.pdf")
}

/// Atomically writes arbitrary non-empty export artifacts (.docx, .xlsx, .pptx, images, etc.).
pub fn write_binary_file_atomic_impl(
    path: &Path,
    bytes: &[u8],
) -> Result<WrittenPdfResult, String> {
    if bytes.is_empty() {
        return Err("ConversionFailed:Impossible d'écrire un fichier exporté vide (0 octet).".to_string());
    }
    if bytes.len() > MAX_EXPORT_BYTES_HARD_LIMIT {
        return Err(
            "ConversionFailed:Le fichier exporté dépasse la limite autorisée (256 Mio)."
                .to_string(),
        );
    }
    write_bytes_atomic_inner(path, bytes, "export.bin")
}

/// Extracts existing `.pdf` file arguments passed on CLI launch (`Ouvrir avec`), resolving relative paths against optional `cwd`.
pub fn extract_launch_pdf_paths_with_cwd<I>(args: I, cwd: Option<&Path>) -> Vec<String>
where
    I: Iterator<Item = String>,
{
    args.skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|raw| {
            let candidate = Path::new(&raw);
            let resolved = if candidate.is_absolute() {
                candidate.to_path_buf()
            } else if let Some(base) = cwd {
                base.join(candidate)
            } else {
                candidate.to_path_buf()
            };
            let is_pdf = resolved
                .extension()
                .and_then(|e| e.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false);
            if is_pdf && resolved.is_file() {
                Some(
                    fs::canonicalize(&resolved)
                        .unwrap_or(resolved)
                        .to_string_lossy()
                        .to_string(),
                )
            } else {
                None
            }
        })
        .collect()
}

/// Extracts existing `.pdf` file arguments passed on CLI launch (`Ouvrir avec`).
pub fn extract_launch_pdf_paths<I>(args: I) -> Vec<String>
where
    I: Iterator<Item = String>,
{
    extract_launch_pdf_paths_with_cwd(args, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_test_dir(tag: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("openpdf_test_{tag}_{nonce}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_valid_pdf_and_rejects_empty_or_oversized_or_non_pdf() {
        let dir = temp_test_dir("read");
        let valid_path = dir.join("ok.pdf");
        fs::write(&valid_path, b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF").unwrap();

        let loaded = read_pdf_file_bounded_impl(&valid_path, 1024 * 1024).unwrap();
        assert_eq!(loaded.file_name, "ok.pdf");
        assert!(loaded.bytes.starts_with(b"%PDF-1.7"));

        let empty_path = dir.join("empty.pdf");
        fs::write(&empty_path, b"").unwrap();
        let err_empty = read_pdf_file_bounded_impl(&empty_path, 1024 * 1024).unwrap_err();
        assert!(err_empty.starts_with("EmptyFile:"));

        let err_large = read_pdf_file_bounded_impl(&valid_path, 1024);
        assert!(err_large.is_ok());
        // Larger than 1024 effective floor
        let big_path = dir.join("big.pdf");
        fs::write(&big_path, vec![b'%'; 2048]).unwrap();
        let err_too_big = read_pdf_file_bounded_impl(&big_path, 1024).unwrap_err();
        assert!(err_too_big.starts_with("FileTooLarge:"));

        let fake_path = dir.join("fake.pdf");
        fs::write(&fake_path, b"NOT A PDF DOCUMENT").unwrap();
        let err_fake = read_pdf_file_bounded_impl(&fake_path, 1024 * 1024).unwrap_err();
        assert!(err_fake.starts_with("InvalidPdfHeader:"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_atomically_and_preserves_target_on_invalid_payload() {
        let dir = temp_test_dir("write");
        let target = dir.join("contract.pdf");
        let v1 = b"%PDF-1.4\n%original\n%%EOF";
        let v2 = b"%PDF-1.7\n%updated\n%%EOF";

        let r1 = write_pdf_atomic_impl(&target, v1).unwrap();
        assert_eq!(r1.file_name, "contract.pdf");
        assert_eq!(fs::read(&target).unwrap(), v1);

        // Invalid payload must not touch v1 target
        let err_invalid = write_pdf_atomic_impl(&target, b"CORRUPTED").unwrap_err();
        assert!(err_invalid.starts_with("InvalidPdfHeader:"));
        assert_eq!(fs::read(&target).unwrap(), v1);

        // Atomic overwrite succeeds and leaves zero staging temp files
        let r2 = write_pdf_atomic_impl(&target, v2).unwrap();
        assert_eq!(r2.byte_length, v2.len());
        assert_eq!(fs::read(&target).unwrap(), v2);

        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("openpdf.tmp"))
            .collect();
        assert!(leftovers.is_empty());

        let export_target = dir.join("export.docx");
        let export_res = write_binary_file_atomic_impl(&export_target, b"PK\x03\x04mock-docx").unwrap();
        assert_eq!(export_res.file_name, "export.docx");
        assert_eq!(fs::read(&export_target).unwrap(), b"PK\x03\x04mock-docx");
        assert!(write_binary_file_atomic_impl(&export_target, b"").is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extracts_only_existing_pdf_launch_args() {
        let dir = temp_test_dir("args");
        let pdf_file = dir.join("doc.PDF");
        let txt_file = dir.join("note.txt");
        fs::write(&pdf_file, b"%PDF-1.7\n").unwrap();
        fs::write(&txt_file, b"hello").unwrap();

        let args = vec![
            "openpdf.exe".to_string(),
            "--flag".to_string(),
            txt_file.to_string_lossy().to_string(),
            dir.join("missing.pdf").to_string_lossy().to_string(),
            pdf_file.to_string_lossy().to_string(),
        ];
        let found = extract_launch_pdf_paths(args.into_iter());
        assert_eq!(found.len(), 1);
        assert!(found[0].to_lowercase().ends_with("doc.pdf"));

        let rel_found = extract_launch_pdf_paths_with_cwd(
            vec!["openpdf.exe".to_string(), "doc.PDF".to_string()].into_iter(),
            Some(&dir),
        );
        assert_eq!(rel_found.len(), 1);

        let _ = fs::remove_dir_all(&dir);
    }
}
