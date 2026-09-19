// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Use our own WebView2 profile folder. v0.1.0 used the default one and registered a service worker
            // there that serves stale files forever (WebView2 can't update it through Tauri's protocol).
            // Built in Rust because Tauri ignores `dataDirectory` from tauri.conf.json (2.11).
            let dir = app.path().app_local_data_dir()?;
            let _ = std::fs::remove_dir_all(dir.join("EBWebView"));
            let config = app.config().app.windows[0].clone();
            WebviewWindowBuilder::from_config(app, &config)?.data_directory(dir.join("profile")).build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
