use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::config::{self, Config};
use crate::profiles::{self, Profile};
use crate::state::AppState;

#[tauri::command]
pub fn current_db_path(state: State<'_, AppState>) -> String {
    state.path().to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<Profile>, String> {
    profiles::list(&state.pool())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_profile(name: String, state: State<'_, AppState>) -> Result<Profile, String> {
    profiles::create(&state.pool(), &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_profile(
    id: i64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.switch_profile(id).await.map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut config = config::load(&dir);
    config.last_profile_id = Some(id);
    config::save(&dir, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn current_profile(state: State<'_, AppState>) -> Result<Profile, String> {
    profiles::get(&state.pool(), state.active_profile_id())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_database_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let path = PathBuf::from(path);
    state.reconnect(&path).await.map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    // Switching database files switches the profile universe, so the
    // persisted last-profile selection is reset for the new file.
    let config = Config {
        database_path: Some(path.clone()),
        last_profile_id: Some(state.active_profile_id()),
    };
    config::save(&dir, &config).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
