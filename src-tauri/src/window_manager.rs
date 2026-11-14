use crate::pdf_io::extract_launch_pdf_paths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const MAX_DETACHED_BYTES_LIMIT: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WindowLaunchPayload {
    CliArgs {
        paths: Vec<String>,
    },
    OpenPath {
        path: String,
    },
    DetachedTab {
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "originPath")]
        origin_path: Option<String>,
        bytes: Vec<u8>,
        #[serde(rename = "stateJson")]
        state_json: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachTabRequest {
    pub file_name: String,
    pub origin_path: Option<String>,
    pub bytes: Vec<u8>,
    pub state_json: Option<String>,
    pub screen_x: Option<f64>,
    pub screen_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPdfRequestEvent {
    pub paths: Vec<String>,
}

pub struct WindowRouterState {
    pending_payloads: Mutex<HashMap<String, WindowLaunchPayload>>,
    cli_consumed: AtomicBool,
    next_window_id: AtomicU64,
}

impl Default for WindowRouterState {
    fn default() -> Self {
        Self {
            pending_payloads: Mutex::new(HashMap::new()),
            cli_consumed: AtomicBool::new(false),
            next_window_id: AtomicU64::new(2),
        }
    }
}

impl WindowRouterState {
    pub fn store_pending_payload(&self, label: String, payload: WindowLaunchPayload) -> Result<(), String> {
        let mut guard = self
            .pending_payloads
            .lock()
            .map_err(|_| "Echec de verrouillage du routeur de fenetres.".to_string())?;
        guard.insert(label, payload);
        Ok(())
    }

    pub fn take_payload_for_label(&self, label: &str) -> Option<WindowLaunchPayload> {
        let Ok(mut guard) = self.pending_payloads.lock() else {
            return None;
        };
        guard.remove(label)
    }

    pub fn next_label(&self) -> String {
        let id = self.next_window_id.fetch_add(1, Ordering::Relaxed);
        format!("openpdf-win-{}", id)
    }

    pub fn try_consume_cli_once(&self) -> bool {
        !self.cli_consumed.swap(true, Ordering::AcqRel)
    }
}

pub fn sanitize_window_title(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|ch| !ch.is_control())
        .take(96)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "OpenPDF".to_string()
    } else {
        format!("{} — OpenPDF", trimmed)
    }
}

pub fn clamp_spawn_position(screen_x: Option<f64>, screen_y: Option<f64>) -> Option<(f64, f64)> {
    match (screen_x, screen_y) {
        (Some(x), Some(y)) if x.is_finite() && y.is_finite() => {
            let clamped_x = (x - 140.0).clamp(-3200.0, 6400.0);
            let clamped_y = if y < -8.0 {
                (y - 24.0).clamp(-2160.0, -32.0)
            } else {
                (y - 24.0).clamp(0.0, 3600.0)
            };
            Some((clamped_x, clamped_y))
        }
        _ => None,
    }
}

async fn spawn_openpdf_window(
    app: AppHandle,
    state: &WindowRouterState,
    title_source: String,
    payload: WindowLaunchPayload,
    position: Option<(f64, f64)>,
) -> Result<String, String> {
    let label = state.next_label();
    state.store_pending_payload(label.clone(), payload)?;

    // Build WebView2 windows off the synchronous IPC/main UI thread to avoid COM STA deadlocks on Windows.
    let build_label = label.clone();
    let build_title = sanitize_window_title(&title_source);
    let build_result = tauri::async_runtime::spawn_blocking(move || {
        let mut builder =
            WebviewWindowBuilder::new(&app, &build_label, WebviewUrl::App("index.html".into()))
                .title(build_title)
                .inner_size(1320.0, 840.0)
                .min_inner_size(900.0, 620.0)
                .resizable(true);

        if let Some((x, y)) = position {
            builder = builder.position(x, y);
        } else {
            builder = builder.center();
        }

        builder
            .build()
            .map(|win| {
                let _ = win.set_focus();
            })
            .map_err(|err| format!("Impossible de creer la nouvelle fenetre OpenPDF : {}", err))
    })
    .await
    .map_err(|err| format!("Echec de tache fenetre OpenPDF : {}", err));

    match build_result {
        Ok(Ok(())) => Ok(label),
        Ok(Err(err)) | Err(err) => {
            let _ = state.take_payload_for_label(&label);
            Err(err)
        }
    }
}

pub fn pick_target_window(app: &AppHandle) -> Option<WebviewWindow> {
    let windows = app.webview_windows();
    if let Some(focused) = windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
    {
        return Some(focused.clone());
    }
    if let Some(main_win) = app.get_webview_window("main") {
        return Some(main_win);
    }
    windows.values().next().cloned()
}

#[tauri::command]
pub fn take_window_launch_payload(
    window: WebviewWindow,
    state: tauri::State<'_, WindowRouterState>,
) -> Option<WindowLaunchPayload> {
    if let Some(payload) = state.take_payload_for_label(window.label()) {
        return Some(payload);
    }
    if window.label() == "main" && state.try_consume_cli_once() {
        let paths = extract_launch_pdf_paths(std::env::args());
        if !paths.is_empty() {
            return Some(WindowLaunchPayload::CliArgs { paths });
        }
    }
    None
}

#[tauri::command]
pub async fn detach_tab_to_new_window(
    app: AppHandle,
    state: tauri::State<'_, WindowRouterState>,
    request: DetachTabRequest,
) -> Result<String, String> {
    if request.bytes.is_empty() {
        return Err("Impossible de detacher un onglet vide.".to_string());
    }
    if request.bytes.len() > MAX_DETACHED_BYTES_LIMIT {
        return Err("Le document depasse la limite memoire pour le detachement d'onglet (64 Mio).".to_string());
    }
    let pos = clamp_spawn_position(request.screen_x, request.screen_y);
    let title = request.file_name.clone();
    spawn_openpdf_window(
        app,
        &state,
        title,
        WindowLaunchPayload::DetachedTab {
            file_name: request.file_name,
            origin_path: request.origin_path,
            bytes: request.bytes,
            state_json: request.state_json,
        },
        pos,
    )
    .await
}

#[tauri::command]
pub async fn open_path_in_new_window(
    app: AppHandle,
    state: tauri::State<'_, WindowRouterState>,
    path: String,
) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("Chemin PDF vide pour l'ouverture dans une nouvelle fenetre.".to_string());
    }
    let file_name = Path::new(&trimmed)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Document.pdf")
        .to_string();
    spawn_openpdf_window(
        app,
        &state,
        file_name,
        WindowLaunchPayload::OpenPath { path: trimmed },
        None,
    )
    .await
}

#[tauri::command]
pub async fn close_window_unconditionally(window: WebviewWindow) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        window
            .destroy()
            .map_err(|err| format!("Impossible de fermer la fenetre : {}", err))
    })
    .await
    .map_err(|err| format!("Echec fermeture fenetre : {}", err))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn router_stores_and_consumes_payload_once() {
        let state = WindowRouterState::default();
        let label = state.next_label();
        assert_eq!(label, "openpdf-win-2");
        state
            .store_pending_payload(
                label.clone(),
                WindowLaunchPayload::OpenPath {
                    path: "C:\\Docs\\test.pdf".to_string(),
                },
            )
            .expect("store works");
        assert!(state.take_payload_for_label(&label).is_some());
        assert!(state.take_payload_for_label(&label).is_none());
    }

    #[test]
    fn sanitize_window_title_strips_controls_and_appends_brand() {
        assert_eq!(
            sanitize_window_title("Contrat\nSigné.pdf"),
            "ContratSigné.pdf — OpenPDF"
        );
        assert_eq!(sanitize_window_title("   "), "OpenPDF");
    }

    #[test]
    fn clamp_spawn_position_handles_invalid_and_valid_coords() {
        assert_eq!(clamp_spawn_position(Some(f64::NAN), Some(100.0)), None);
        assert_eq!(clamp_spawn_position(Some(500.0), Some(10.0)), Some((360.0, 0.0)));
        assert_eq!(clamp_spawn_position(Some(200.0), Some(-400.0)), Some((60.0, -424.0)));
    }
}
