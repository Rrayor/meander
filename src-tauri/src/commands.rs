use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub fn db_path(state: State<'_, AppState>) -> String {
    state.path().to_string_lossy().into_owned()
}
