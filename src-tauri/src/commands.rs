use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::config::{self, Config};
use crate::errors::ApiError;
use crate::profiles::{self, Profile};
use crate::series::Weekday;
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
pub async fn list_week_tasks(
    state: State<'_, AppState>,
    date: &str,
) -> Result<Vec<crate::tasks::Task>, ApiError> {
    crate::tasks::list_week(&state.pool(), state.active_profile_id(), date)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn global_threshold(
    state: State<'_, AppState>,
) -> Result<crate::profiles::GlobalThreshold, ApiError> {
    crate::profiles::global_threshold(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn set_global_threshold(
    state: State<'_, AppState>,
    minutes: Option<i64>,
    color: Option<String>,
    day_minutes: std::collections::BTreeMap<crate::series::Weekday, i64>,
) -> Result<(), ApiError> {
    crate::profiles::set_global_threshold(
        &state.pool(),
        state.active_profile_id(),
        minutes,
        color,
        day_minutes,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn set_category_thresholds(
    state: State<'_, AppState>,
    updates: Vec<(i64, Option<i64>, Option<String>)>,
) -> Result<(), ApiError> {
    crate::categories::set_thresholds(&state.pool(), state.active_profile_id(), &updates)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn set_category_threshold(
    state: State<'_, AppState>,
    category_id: i64,
    minutes: Option<i64>,
    color: Option<String>,
) -> Result<(), ApiError> {
    crate::categories::set_threshold(
        &state.pool(),
        state.active_profile_id(),
        category_id,
        minutes,
        color,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_pending_carry_over(
    state: State<'_, AppState>,
) -> Result<Vec<crate::tasks::Task>, ApiError> {
    crate::tasks::pending_carry_over(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn resolve_carry_over(
    state: State<'_, AppState>,
    task_id: i64,
    rule: crate::tasks::CarryOverRule,
) -> Result<(), ApiError> {
    crate::tasks::resolve_carry_over(&state.pool(), state.active_profile_id(), task_id, rule)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_categories(
    state: State<'_, AppState>,
) -> Result<Vec<crate::categories::Category>, ApiError> {
    crate::categories::list(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_category(
    input: crate::categories::NewCategory,
    state: State<'_, AppState>,
) -> Result<crate::categories::Category, ApiError> {
    crate::categories::create(&state.pool(), state.active_profile_id(), &input)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn update_category(
    category_id: i64,
    input: crate::categories::NewCategory,
    state: State<'_, AppState>,
) -> Result<crate::categories::Category, ApiError> {
    crate::categories::update(
        &state.pool(),
        state.active_profile_id(),
        category_id,
        &input,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn delete_category(category_id: i64, state: State<'_, AppState>) -> Result<(), ApiError> {
    crate::categories::delete(&state.pool(), state.active_profile_id(), category_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_task_categories(
    task_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::categories::Category>, ApiError> {
    crate::categories::for_task(&state.pool(), state.active_profile_id(), task_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn add_task_category(
    task_id: i64,
    category_id: i64,
    state: State<'_, AppState>,
) -> Result<(), ApiError> {
    crate::categories::add_to_task(
        &state.pool(),
        state.active_profile_id(),
        task_id,
        category_id,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn remove_task_category(
    task_id: i64,
    category_id: i64,
    state: State<'_, AppState>,
) -> Result<(), ApiError> {
    crate::categories::remove_from_task(
        &state.pool(),
        state.active_profile_id(),
        task_id,
        category_id,
    )
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
pub async fn update_task(
    task_id: i64,
    input: crate::tasks::UpdateTask,
    state: State<'_, AppState>,
) -> Result<crate::tasks::Task, ApiError> {
    crate::tasks::update(&state.pool(), state.active_profile_id(), task_id, &input)
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
pub async fn list_task_series(
    state: State<'_, AppState>,
) -> Result<Vec<crate::series::TaskSeries>, ApiError> {
    crate::series::list(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_series_instances(
    series_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::tasks::Task>, ApiError> {
    crate::tasks::list_instances(&state.pool(), state.active_profile_id(), series_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn get_or_create_instance(
    series_id: i64,
    date: String,
    state: State<'_, AppState>,
) -> Result<crate::tasks::Task, ApiError> {
    crate::tasks::get_or_create_instance(&state.pool(), state.active_profile_id(), series_id, &date)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn delete_task_series(
    series_id: i64,
    state: State<'_, AppState>,
) -> Result<(), ApiError> {
    crate::series::delete(&state.pool(), state.active_profile_id(), series_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn update_task_series(
    series_id: i64,
    input: crate::series::UpdateSeries,
    state: State<'_, AppState>,
) -> Result<crate::series::TaskSeries, ApiError> {
    crate::series::update(&state.pool(), state.active_profile_id(), series_id, &input)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn truncate_task_series(
    series_id: i64,
    from_date: String,
    state: State<'_, AppState>,
) -> Result<(), ApiError> {
    crate::series::truncate(
        &state.pool(),
        state.active_profile_id(),
        series_id,
        &from_date,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn update_task_series_from(
    series_id: i64,
    from_date: String,
    input: crate::series::UpdateSeries,
    state: State<'_, AppState>,
) -> Result<crate::series::TaskSeries, ApiError> {
    crate::series::update_from(
        &state.pool(),
        state.active_profile_id(),
        series_id,
        &from_date,
        &input,
    )
    .await
    .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_series_categories(
    series_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::categories::Category>, ApiError> {
    crate::series::list_categories(&state.pool(), state.active_profile_id(), series_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_task_notes(
    task_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::notes::Note>, ApiError> {
    crate::notes::list_for_task(&state.pool(), state.active_profile_id(), task_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn list_series_notes(
    series_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::notes::Note>, ApiError> {
    crate::notes::list_for_series(&state.pool(), state.active_profile_id(), series_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_task_note(
    task_id: i64,
    body: String,
    state: State<'_, AppState>,
) -> Result<crate::notes::Note, ApiError> {
    crate::notes::create_for_task(&state.pool(), state.active_profile_id(), task_id, &body)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_series_note(
    series_id: i64,
    body: String,
    state: State<'_, AppState>,
) -> Result<crate::notes::Note, ApiError> {
    crate::notes::create_for_series(&state.pool(), state.active_profile_id(), series_id, &body)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn update_note(
    note_id: i64,
    body: String,
    state: State<'_, AppState>,
) -> Result<crate::notes::Note, ApiError> {
    crate::notes::update(&state.pool(), state.active_profile_id(), note_id, &body)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn delete_note(note_id: i64, state: State<'_, AppState>) -> Result<(), ApiError> {
    crate::notes::delete(&state.pool(), state.active_profile_id(), note_id)
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

#[tauri::command]
pub async fn week_start(state: State<'_, AppState>) -> Result<Weekday, ApiError> {
    profiles::week_start(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn set_week_start(state: State<'_, AppState>, weekday: Weekday) -> Result<(), ApiError> {
    profiles::set_week_start(&state.pool(), state.active_profile_id(), weekday)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn work_days(state: State<'_, AppState>) -> Result<Vec<Weekday>, ApiError> {
    profiles::work_days(&state.pool(), state.active_profile_id())
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn set_work_days(state: State<'_, AppState>, days: Vec<Weekday>) -> Result<(), ApiError> {
    profiles::set_work_days(&state.pool(), state.active_profile_id(), &days)
        .await
        .map_err(ApiError::from)
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
    const TITLE_C: &str = "C";

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
    async fn list_categories_returns_the_active_profiles_categories() {
        const CATEGORY_TITLE: &str = "Errands";
        let app = test_app().await;
        let state = app.state::<AppState>();
        assert!(list_categories(state.clone()).await.unwrap().is_empty());
        sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
            .bind(state.active_profile_id())
            .bind(CATEGORY_TITLE)
            .execute(&state.pool())
            .await
            .unwrap();
        let categories = list_categories(state.clone()).await.unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].title, CATEGORY_TITLE);
    }

    #[tokio::test]
    async fn delete_category_removes_it_and_surfaces_errors() {
        let app = test_app().await;
        let state = app.state::<AppState>();
        let category_id: i64 = sqlx::query_scalar(
            "INSERT INTO categories (profile_id, title) VALUES (?, ?) RETURNING id",
        )
        .bind(state.active_profile_id())
        .bind("Errands")
        .fetch_one(&state.pool())
        .await
        .unwrap();

        delete_category(category_id, state.clone()).await.unwrap();
        assert!(list_categories(state.clone()).await.unwrap().is_empty());

        let err = delete_category(i64::MAX, state.clone()).await.unwrap_err();
        assert_eq!(err.code, crate::errors::ErrorCode::CategoryNotFound);
    }

    #[tokio::test]
    async fn update_category_changes_fields_and_surfaces_errors() {
        const RENAMED: &str = "Chores";
        let app = test_app().await;
        let state = app.state::<AppState>();
        let category_id: i64 = sqlx::query_scalar(
            "INSERT INTO categories (profile_id, title) VALUES (?, ?) RETURNING id",
        )
        .bind(state.active_profile_id())
        .bind("Errands")
        .fetch_one(&state.pool())
        .await
        .unwrap();

        let updated = update_category(
            category_id,
            crate::categories::NewCategory {
                title: RENAMED.into(),
                description: None,
                color: None,
            },
            state.clone(),
        )
        .await
        .unwrap();
        assert_eq!(updated.title, RENAMED);

        let err = update_category(
            i64::MAX,
            crate::categories::NewCategory {
                title: RENAMED.into(),
                description: None,
                color: None,
            },
            state.clone(),
        )
        .await
        .unwrap_err();
        assert_eq!(err.code, crate::errors::ErrorCode::CategoryNotFound);
    }

    #[tokio::test]
    async fn task_category_commands_cover_add_list_and_remove() {
        let app = test_app().await;
        let state = app.state::<AppState>();
        let category_id: i64 = sqlx::query_scalar(
            "INSERT INTO categories (profile_id, title) VALUES (?, ?) RETURNING id",
        )
        .bind(state.active_profile_id())
        .bind("Errands")
        .fetch_one(&state.pool())
        .await
        .unwrap();
        let task = create_task(
            crate::tasks::NewTask {
                title: TITLE_A.into(),
                description: None,
                estimated_minutes: None,
                carry_over_rule: None,
                series: None,
            },
            state.clone(),
        )
        .await
        .unwrap();

        assert!(
            list_task_categories(task.id, state.clone())
                .await
                .unwrap()
                .is_empty()
        );
        add_task_category(task.id, category_id, state.clone())
            .await
            .unwrap();
        assert_eq!(
            list_task_categories(task.id, state.clone())
                .await
                .unwrap()
                .len(),
            1
        );
        remove_task_category(task.id, category_id, state.clone())
            .await
            .unwrap();
        assert!(
            list_task_categories(task.id, state.clone())
                .await
                .unwrap()
                .is_empty()
        );
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

        let updated = update_task(
            ids[0],
            crate::tasks::UpdateTask {
                title: TITLE_C.into(),
                description: None,
                estimated_minutes: None,
                spent_minutes: Some(30),
                carry_over_rule: None,
                status: crate::tasks::TaskStatus::Done,
                series: None,
            },
            state.clone(),
        )
        .await
        .unwrap();
        assert_eq!(updated.title, TITLE_C);
        assert_eq!(updated.status, crate::tasks::TaskStatus::Done);

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
