use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultPdfStatus {
    pub platform: String,
    pub is_default: bool,
    pub current_prog_id: Option<String>,
    pub registered_for_user: bool,
    pub can_open_system_settings: bool,
}

pub const OPENPDF_PROG_ID: &str = "OpenPDF.Document";

pub fn is_openpdf_prog_id(prog_id: Option<&str>) -> bool {
    match prog_id {
        Some(value) => {
            let trimmed = value.trim();
            trimmed.eq_ignore_ascii_case(OPENPDF_PROG_ID)
                || trimmed.to_ascii_lowercase().contains("openpdf")
        }
        None => false,
    }
}

pub fn format_open_command(exe_path: &Path) -> String {
    format!("\"{}\" \"%1\"", exe_path.display())
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::process::Command;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const USER_CHOICE_SUBKEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice";
    const PROGID_SUBKEY: &str = r"Software\Classes\OpenPDF.Document";
    const OPEN_WITH_PROGIDS_SUBKEY: &str = r"Software\Classes\.pdf\OpenWithProgids";
    const APP_REG_SUBKEY: &str = r"Software\Classes\Applications\openpdf.exe";
    const CAPABILITIES_SUBKEY: &str = r"Software\OpenPDF\Capabilities";
    const REGISTERED_APPS_SUBKEY: &str = r"Software\RegisteredApplications";

    pub fn read_status() -> DefaultPdfStatus {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let current_prog_id = hkcu
            .open_subkey_with_flags(USER_CHOICE_SUBKEY, KEY_READ)
            .ok()
            .and_then(|key| key.get_value::<String, _>("ProgId").ok());

        let registered_for_user = hkcu
            .open_subkey_with_flags(
                &format!(r"{}\shell\open\command", PROGID_SUBKEY),
                KEY_READ,
            )
            .and_then(|k| k.get_value::<String, _>(""))
            .is_ok();

        let is_default = is_openpdf_prog_id(current_prog_id.as_deref());

        DefaultPdfStatus {
            platform: "windows".to_string(),
            is_default,
            current_prog_id,
            registered_for_user,
            can_open_system_settings: true,
        }
    }

    pub fn register_hkcu_associations(exe_path: &Path) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let command_str = format_open_command(exe_path);
        let icon_str = format!("{},0", exe_path.display());

        let (progid_key, _) = hkcu
            .create_subkey_with_flags(PROGID_SUBKEY, KEY_WRITE)
            .map_err(|e| format!("Registre HKCU OpenPDF.Document : {}", e))?;
        progid_key
            .set_value("", &"Document PDF OpenPDF")
            .map_err(|e| format!("Valeur OpenPDF.Document : {}", e))?;
        let _ = progid_key.set_value("FriendlyTypeName", &"Document PDF (OpenPDF)");

        if let Ok((icon_key, _)) = progid_key.create_subkey("DefaultIcon") {
            let _ = icon_key.set_value("", &icon_str);
        }
        let (cmd_key, _) = progid_key
            .create_subkey(r"shell\open\command")
            .map_err(|e| format!("Registre commande open : {}", e))?;
        cmd_key
            .set_value("", &command_str)
            .map_err(|e| format!("Valeur commande open : {}", e))?;

        if let Ok((owp_key, _)) = hkcu.create_subkey_with_flags(OPEN_WITH_PROGIDS_SUBKEY, KEY_WRITE)
        {
            let _ = owp_key.set_value(OPENPDF_PROG_ID, &"");
        }

        if let Ok((app_key, _)) = hkcu.create_subkey_with_flags(APP_REG_SUBKEY, KEY_WRITE) {
            if let Ok((app_cmd, _)) = app_key.create_subkey(r"shell\open\command") {
                let _ = app_cmd.set_value("", &command_str);
            }
            if let Ok((supp, _)) = app_key.create_subkey("SupportedTypes") {
                let _ = supp.set_value(".pdf", &"");
            }
        }

        let (cap_key, _) = hkcu
            .create_subkey_with_flags(CAPABILITIES_SUBKEY, KEY_WRITE)
            .map_err(|e| format!("Registre Capabilities OpenPDF : {}", e))?;
        let _ = cap_key.set_value("ApplicationName", &"OpenPDF");
        let _ = cap_key.set_value(
            "ApplicationDescription",
            &"OpenPDF — Lecteur, éditeur, convertisseur et signataire PDF local-first",
        );
        if let Ok((fa_key, _)) = cap_key.create_subkey("FileAssociations") {
            let _ = fa_key.set_value(".pdf", &OPENPDF_PROG_ID);
        }

        let (reg_apps, _) = hkcu
            .create_subkey_with_flags(REGISTERED_APPS_SUBKEY, KEY_WRITE)
            .map_err(|e| format!("Registre RegisteredApplications : {}", e))?;
        reg_apps
            .set_value("OpenPDF", &CAPABILITIES_SUBKEY)
            .map_err(|e| format!("Inscription RegisteredApplications : {}", e))?;

        Ok(())
    }

    pub fn open_default_apps_settings(registered_ok: bool) -> Result<(), String> {
        let target_uri = if registered_ok {
            "ms-settings:defaultapps?registeredAppUser=OpenPDF"
        } else {
            "ms-settings:defaultapps"
        };
        let system_root = std::env::var_os("SystemRoot")
            .unwrap_or_else(|| std::ffi::OsString::from(r"C:\Windows"));
        let explorer_exe = std::path::Path::new(&system_root).join("explorer.exe");
        let cmd_path = if explorer_exe.is_file() {
            explorer_exe
        } else {
            std::path::PathBuf::from(r"C:\Windows\explorer.exe")
        };
        Command::new(cmd_path)
            .arg(target_uri)
            .spawn()
            .map_err(|e| format!("Impossible d'ouvrir les paramètres Windows : {}", e))?;
        Ok(())
    }
}

#[tauri::command]
pub fn check_pdf_default_status() -> DefaultPdfStatus {
    #[cfg(windows)]
    {
        platform::read_status()
    }
    #[cfg(not(windows))]
    {
        DefaultPdfStatus {
            platform: std::env::consts::OS.to_string(),
            is_default: false,
            current_prog_id: None,
            registered_for_user: false,
            can_open_system_settings: false,
        }
    }
}

#[tauri::command]
pub async fn register_and_open_default_pdf_settings() -> Result<DefaultPdfStatus, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Impossible de localiser openpdf.exe : {}", e))?;
            let registered = platform::register_hkcu_associations(&exe_path).is_ok();
            platform::open_default_apps_settings(registered)?;
            Ok(platform::read_status())
        })
        .await
        .map_err(|e| format!("Echec parametrage PDF par defaut : {}", e))?
    }
    #[cfg(not(windows))]
    {
        Err("La configuration d'application PDF par défaut est prise en charge sous Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn detects_openpdf_prog_ids_case_insensitively() {
        assert!(is_openpdf_prog_id(Some("OpenPDF.Document")));
        assert!(is_openpdf_prog_id(Some("openpdf.document")));
        assert!(!is_openpdf_prog_id(Some("MSEdgePDF")));
        assert!(!is_openpdf_prog_id(None));
    }

    #[test]
    fn formats_open_command_with_quotes() {
        let cmd = format_open_command(&PathBuf::from(r"C:\Users\Alice\AppData\Local\OpenPDF\openpdf.exe"));
        assert_eq!(
            cmd,
            r#""C:\Users\Alice\AppData\Local\OpenPDF\openpdf.exe" "%1""#
        );
    }
}
