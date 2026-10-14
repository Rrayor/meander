use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::config::{self, Config};
use crate::errors::ApiError;
use crate::profiles::{self, Profile};
use crate::state::AppState;

#[tauri::command]
pub fn current_db_path(state: State<'_, AppState>) -> String {
    state.path().to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<Profile>, ApiError> {
    profiles::list(&state.pool()).await.map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<crate::tasks::Task>, ApiError> {
    crate::tasks::list(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_task(
    input: crate::tasks::NewTask,
    state: State<'_, AppState>,
) -> Result<crate::tasks::Task, ApiError> {
    crate::tasks::create(&state.pool(), state.active_profile_id(), &input)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn move_task(
    task_id: i64,
    before_id: Option<i64>,
    after_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<(), ApiError> {
    crate::tasks::move_task(
        &state.pool(),
        state.active_profile_id(),
        task_id,
        before_id,
        after_id,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn delete_task(task_id: i64, state: State<'_, AppState>) -> Result<(), ApiError> {
    crate::tasks::delete(&state.pool(), state.active_profile_id(), task_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_profile(name: String, state: State<'_, AppState>) -> Result<Profile, ApiError> {
    profiles::create(&state.pool(), &name)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn rename_profile(
    id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<Profile, ApiError> {
    profiles::rename(&state.pool(), id, &name)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn switch_profile<R: Runtime>(
    id: i64,
    state: State<'_, AppState>,
    app: AppHandle<R>,
) -> Result<(), ApiError> {
    state.switch_profile(id).await.map_err(ApiError::from)?;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let mut config = config::load(&dir);
    config.last_profile_id = Some(id);
    config::save(&dir, &config).map_err(|e| ApiError::internal(e.to_string()))
}

#[tauri::command]
pub async fn current_profile(state: State<'_, AppState>) -> Result<Profile, ApiError> {
    profiles::get(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn select_database_file<R: Runtime>(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle<R>,
) -> Result<String, ApiError> {
    let path = PathBuf::from(path);
    state.reconnect(&path).await.map_err(ApiError::from)?;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ApiError::internal(e.to_string()))?;
    // Switching database files switches the profile universe, so the
    // persisted last-profile selection is reset for the new file.
    let config = Config {
        database_path: Some(path.clone()),
        last_profile_id: Some(state.active_profile_id()),
    };
    config::save(&dir, &config).map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{MockRuntime, mock_app};

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "meander-commands-test-{}-{name}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    async fn test_app() -> tauri::App<MockRuntime> {
        // A configured path is only honored when the file already exists —
        // pre-create it so tests never touch the real XDG database.
        let db = temp_path("app.db");
        std::fs::write(&db, b"").unwrap();
        let config = Config {
            database_path: Some(db),
            ..Default::default()
        };
        let state = AppState::from_config(&config, &temp_path("app.db"))
            .await
            .expect("app state connects");
        let app = mock_app();
        app.manage(state);
        app
    }

    // The config-dir commands resolve paths through env (XDG_DATA_HOME), which
    // is process-global — serialize those tests on a shared lock.
    static ENV_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[tokio::test]
    async fn current_db_path_reports_the_state_path() {
        let app = test_app().await;
        let state = app.state::<AppState>();
        let expected = state.path().to_string_lossy().into_owned();
        assert_eq!(current_db_path(state), expected);
    }

    const NEW_PROFILE_NAME: &str = "Work";
    const RENAMED_PROFILE_NAME: &str = "Play";
    const TITLE_A: &str = "A";
    const TITLE_B: &str = "B";

    #[tokio::test]
    async fn profile_commands_cover_list_create_rename_current_and_switch() {
        let _guard = ENV_LOCK.lock().await;
        let xdg = temp_path("xdg-switch");
        unsafe {
            std::env::set_var("XDG_DATA_HOME", &xdg);
        }
        let app = test_app().await;
        let state = app.state::<AppState>();
        let handle = app.handle().clone();

        assert_eq!(list_profiles(state.clone()).await.unwrap().len(), 1);
        let created = create_profile(NEW_PROFILE_NAME.into(), state.clone())
            .await
            .unwrap();
        assert_eq!(created.name, NEW_PROFILE_NAME);
        let renamed = rename_profile(created.id, RENAMED_PROFILE_NAME.into(), state.clone())
            .await
            .unwrap();
        assert_eq!(renamed.name, RENAMED_PROFILE_NAME);

        switch_profile(created.id, state.clone(), handle.clone())
            .await
            .unwrap();
        assert_eq!(state.active_profile_id(), created.id);
        assert_eq!(
            config::load(&handle.path().app_config_dir().unwrap()).last_profile_id,
            Some(created.id)
        );

        let current = current_profile(state).await.unwrap();
        assert_eq!(current.id, created.id);
    }

    #[tokio::test]
    async fn select_database_file_swaps_the_pool_and_persists_config() {
        let _guard = ENV_LOCK.lock().await;
        let xdg = temp_path("xdg-select");
        unsafe {
            std::env::set_var("XDG_DATA_HOME", &xdg);
        }
        let app = test_app().await;
        let state = app.state::<AppState>();
        let handle = app.handle().clone();

        // The candidate must pass the compatibility check: build it through
        // the real connect + seed path.
        let other = temp_path("other.db");
        let pool = crate::db::connect(&other).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        pool.close().await;

        let reported = select_database_file(
            other.to_string_lossy().into_owned(),
            state.clone(),
            handle.clone(),
        )
        .await
        .unwrap();
        assert_eq!(reported, other.to_string_lossy());
        assert_eq!(state.path(), other);

        let saved = config::load(&handle.path().app_config_dir().unwrap());
        assert_eq!(saved.database_path, Some(other));
        assert!(saved.last_profile_id.is_some());
    }

    #[tokio::test]
    async fn task_commands_cover_list_create_move_and_delete() {
        let app = test_app().await;
        let state = app.state::<AppState>();

        assert!(list_tasks(state.clone()).await.unwrap().is_empty());
        create_task(
            crate::tasks::NewTask {
                title: TITLE_A.into(),
                ..Default::default()
            },
            state.clone(),
        )
        .await
        .unwrap();
        create_task(
            crate::tasks::NewTask {
                title: TITLE_B.into(),
                ..Default::default()
            },
            state.clone(),
        )
        .await
        .unwrap();

        let ids: Vec<i64> = list_tasks(state.clone())
            .await
            .unwrap()
            .iter()
            .map(|t| t.id)
            .collect();
        move_task(ids[1], None, Some(ids[0]), state.clone())
            .await
            .unwrap();

        let titles: Vec<String> = list_tasks(state.clone())
            .await
            .unwrap()
            .iter()
            .map(|t| t.title.clone())
            .collect();
        assert_eq!(titles, vec![TITLE_B, TITLE_A]);

        delete_task(ids[0], state.clone()).await.unwrap();
        let remaining: Vec<String> = list_tasks(state.clone())
            .await
            .unwrap()
            .iter()
            .map(|t| t.title.clone())
            .collect();
        assert_eq!(remaining, vec![TITLE_B]);

        let err = delete_task(ids[0], state.clone()).await.unwrap_err();
        assert_eq!(err.code, crate::errors::ErrorCode::TaskNotFound);
    }
}
