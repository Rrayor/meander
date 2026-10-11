use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::config::{self, Config};
use crate::state::AppState;

#[tauri::command]
pub fn current_db_path(state: State<'_, AppState>) -> String {
    state.path().to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn select_database_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let path = PathBuf::from(path);
    state.reconnect(&path).await.map_err(|e| e.to_string())?;
    let config = Config {
        database_path: Some(path.clone()),
    };
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    config::save(&dir, &config).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
