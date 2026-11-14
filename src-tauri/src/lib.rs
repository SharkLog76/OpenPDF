mod default_pdf;
mod pdf_io;
mod window_manager;

use pdf_io::{
    extract_launch_pdf_paths, extract_launch_pdf_paths_with_cwd, read_pdf_file_bounded_impl,
    write_binary_file_atomic_impl, write_pdf_atomic_impl, LoadedPdfFile, WrittenPdfResult,
};
use std::path::Path;
use tauri::Emitter;
use window_manager::WindowRouterState;

#[tauri::command]
fn get_launch_pdf_args() -> Vec<String> {
    extract_launch_pdf_paths(std::env::args())
}

#[tauri::command]
async fn read_pdf_file_bounded(path: String, max_bytes: u64) -> Result<LoadedPdfFile, String> {
    tauri::async_runtime::spawn_blocking(move || read_pdf_file_bounded_impl(Path::new(&path), max_bytes))
        .await
        .map_err(|e| format!("ReadFailed: Echec lecture PDF ({})", e))?
}

#[tauri::command]
async fn write_pdf_atomic(path: String, bytes: Vec<u8>) -> Result<WrittenPdfResult, String> {
    tauri::async_runtime::spawn_blocking(move || write_pdf_atomic_impl(Path::new(&path), &bytes))
        .await
        .map_err(|e| format!("OverwriteFailed: Echec ecriture PDF ({})", e))?
}

#[tauri::command]
async fn write_binary_file_atomic(path: String, bytes: Vec<u8>) -> Result<WrittenPdfResult, String> {
    tauri::async_runtime::spawn_blocking(move || write_binary_file_atomic_impl(Path::new(&path), &bytes))
        .await
        .map_err(|e| format!("ConversionFailed: Echec ecriture export ({})", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowRouterState::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let cwd_path = Path::new(&cwd);
            let paths = extract_launch_pdf_paths_with_cwd(
                argv.into_iter(),
                if cwd.trim().is_empty() {
                    None
                } else {
                    Some(cwd_path)
                },
            );
            if let Some(target) = window_manager::pick_target_window(app) {
                let _ = target.unminimize();
                let _ = target.set_focus();
                if !paths.is_empty() {
                    let _ = app.emit_to(
                        target.label(),
                        "open-pdf-request",
                        window_manager::OpenPdfRequestEvent { paths },
                    );
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_launch_pdf_args,
            read_pdf_file_bounded,
            write_pdf_atomic,
            write_binary_file_atomic,
            window_manager::take_window_launch_payload,
            window_manager::detach_tab_to_new_window,
            window_manager::open_path_in_new_window,
            window_manager::close_window_unconditionally,
            default_pdf::check_pdf_default_status,
            default_pdf::register_and_open_default_pdf_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPDF Tauri application");
}
