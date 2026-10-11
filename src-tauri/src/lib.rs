use tauri::Manager;

pub mod commands;
pub mod db;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = db::default_path()?;
            let state = tauri::async_runtime::block_on(state::AppState::new(&path))?;
            tauri::async_runtime::block_on(db::seed(&state.pool()))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
