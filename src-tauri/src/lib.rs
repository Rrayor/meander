use tauri::Manager;

pub mod bindings;
pub mod categories;
pub mod commands;
pub mod config;
pub mod db;
pub mod errors;
pub mod notes;
pub mod profiles;
pub mod series;
pub mod state;
pub mod tasks;

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
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::current_db_path,
            commands::select_database_file,
            commands::list_profiles,
            commands::list_tasks,
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::list_task_categories,
            commands::add_task_category,
            commands::remove_task_category,
            commands::create_task,
            commands::move_task,
            commands::delete_task,
            commands::update_task,
            commands::list_task_series,
            commands::list_series_instances,
            commands::get_or_create_instance,
            commands::delete_task_series,
            commands::update_task_series,
            commands::truncate_task_series,
            commands::update_task_series_from,
            commands::list_series_categories,
            commands::list_task_notes,
            commands::list_series_notes,
            commands::create_task_note,
            commands::create_series_note,
            commands::update_note,
            commands::delete_note,
            commands::current_profile,
            commands::week_start,
            commands::set_week_start,
            commands::work_days,
            commands::set_work_days,
            commands::create_profile,
            commands::rename_profile,
            commands::switch_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
