use tauri::Manager;

pub mod commands;
pub mod config;
pub mod db;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = config::load(&app.path().app_config_dir()?);
            let state = tauri::async_runtime::block_on(state::AppState::from_config(
                &config,
                &db::default_path()?,
            ))?;
            tauri::async_runtime::block_on(db::seed(&state.pool()))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::current_db_path,
            commands::select_database_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
