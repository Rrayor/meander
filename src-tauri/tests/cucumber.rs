use cucumber::{World, given, then, when};

mod support;

#[derive(Debug, Default, World)]
struct MeanderWorld {
    runtime: Option<tokio::runtime::Runtime>,
    db_path: Option<std::path::PathBuf>,
    pool: Option<sqlx::SqlitePool>,
    state: Option<meander_lib::state::AppState>,
    candidate: Option<std::path::PathBuf>,
    profile_id: Option<i64>,
    previous_active: Option<i64>,
    task_id: Option<i64>,
    remembered_updated_at: Option<String>,
    error: Option<String>,
}

impl MeanderWorld {
    fn rt(&mut self) -> &tokio::runtime::Runtime {
        self.runtime
            .get_or_insert_with(|| tokio::runtime::Runtime::new().expect("tokio runtime"))
    }
}

#[given("a temporary database path")]
fn temp_path(world: &mut MeanderWorld) {
    world.db_path = Some(support::temp_db_path());
}

#[when("I connect the persistence layer")]
fn connect(world: &mut MeanderWorld) {
    let path = world.db_path.clone().expect("no db path in world");
    match world.rt().block_on(meander_lib::db::connect(&path)) {
        Ok(pool) => world.pool = Some(pool),
        Err(e) => world.error = Some(e.to_string()),
    }
}

#[then("all migrations are applied")]
fn migrations_applied(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let applied: i64 = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&pool),
        )
        .expect("migration count query failed");
    assert_eq!(applied as usize, support::migration_count());
}

#[when("I seed the database")]
fn seed(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    if let Err(e) = world.rt().block_on(meander_lib::db::seed(&pool)) {
        world.error = Some(e.to_string());
    }
}

#[then("the database records that it was seeded")]
fn seeded(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let value: String = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT value FROM meander_meta WHERE key = 'schema_seeded'")
                .fetch_one(&pool),
        )
        .expect("seed marker query failed");
    assert_eq!(value, "1");
}

#[given("an application state on a temporary seeded database")]
fn app_state(world: &mut MeanderWorld) {
    let path = support::temp_db_path();
    let state = world
        .rt()
        .block_on(meander_lib::state::AppState::new(&path))
        .expect("app state failed to connect");
    world
        .rt()
        .block_on(meander_lib::db::seed(&state.pool()))
        .expect("seed failed");
    // Mirror AppState::from_config: resolve the active profile after seeding.
    let first = world
        .rt()
        .block_on(meander_lib::profiles::list(&state.pool()))
        .expect("profile list failed")
        .first()
        .expect("seeded profile missing")
        .id;
    state.set_active_profile(first);
    let pool = state.pool();
    world
        .rt()
        .block_on(
            sqlx::query("INSERT INTO meander_meta VALUES ('origin', 'original')").execute(&pool),
        )
        .expect("origin marker failed");
    world.db_path = Some(path);
    world.state = Some(state);
}

#[given("a compatible seeded database as the candidate")]
fn compatible_candidate(world: &mut MeanderWorld) {
    let path = support::temp_db_path();
    let pool = world
        .rt()
        .block_on(meander_lib::db::connect(&path))
        .expect("candidate connect failed");
    world
        .rt()
        .block_on(meander_lib::db::seed(&pool))
        .expect("candidate seed failed");
    world
        .rt()
        .block_on(
            sqlx::query("INSERT INTO meander_meta VALUES ('origin', 'candidate')").execute(&pool),
        )
        .expect("origin marker failed");
    world.candidate = Some(path);
}

#[given("a file that is not a SQLite database as the candidate")]
fn non_sqlite_candidate(world: &mut MeanderWorld) {
    let path = support::temp_db_path();
    std::fs::write(&path, b"not a sqlite database").expect("write failed");
    world.candidate = Some(path);
}

#[given("a SQLite database without Meander metadata as the candidate")]
fn sqlite_without_meta(world: &mut MeanderWorld) {
    let path = support::temp_db_path();
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let pool = world
        .rt()
        .block_on(sqlx::SqlitePool::connect_with(options))
        .expect("candidate connect failed");
    world
        .rt()
        .block_on(sqlx::query("CREATE TABLE unrelated (id INTEGER)").execute(&pool))
        .expect("create table failed");
    world.candidate = Some(path);
}

#[when("the application switches to the candidate")]
fn switch(world: &mut MeanderWorld) {
    let rt = world
        .runtime
        .get_or_insert_with(|| tokio::runtime::Runtime::new().expect("tokio runtime"));
    let state = world.state.as_ref().expect("no app state in world");
    let candidate = world.candidate.clone().expect("no candidate in world");
    if let Err(e) = rt.block_on(state.reconnect(&candidate)) {
        world.error = Some(e.to_string());
    }
}

#[then("the switch succeeds")]
fn switch_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "switch failed: {:?}", world.error);
}

#[then("the switch fails")]
fn switch_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "switch unexpectedly succeeded");
}

#[then("the active pool reads from the candidate database")]
fn reads_candidate(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state").pool();
    let origin: String = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT value FROM meander_meta WHERE key = 'origin'")
                .fetch_one(&pool),
        )
        .expect("origin query failed");
    assert_eq!(origin, "candidate");
}

#[then("the active pool still reads from the original database")]
fn reads_original(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state").pool();
    let origin: String = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT value FROM meander_meta WHERE key = 'origin'")
                .fetch_one(&pool),
        )
        .expect("origin query failed");
    assert_eq!(origin, "original");
}

#[then("the profile list contains exactly the default profile")]
fn profile_list(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    assert_eq!(profiles.len(), 1, "expected exactly one profile");
    assert_eq!(profiles[0].name, "Default");
}

#[then("the default profile has audit timestamps")]
fn profile_audit(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    let profile = profiles.first().expect("no profile");
    assert!(!profile.created_at.is_empty());
    assert!(!profile.updated_at.is_empty());
}

#[when("I create a profile with surrounding whitespace")]
fn create_whitespace(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "  Work  "))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I create a profile with a blank name")]
fn create_blank(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "   "))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I create a profile with a 101-character name")]
fn create_too_long(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let name = "a".repeat(101);
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, &name))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I create a profile with a newline in the name")]
fn create_control_char(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    world.error = None;
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "two\nlines"))
    {
        world.error = Some(e.to_string());
    }
}

#[then("the creation succeeds")]
fn creation_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "creation failed: {:?}", world.error);
}

#[then("the creation fails")]
fn creation_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "creation unexpectedly succeeded");
}

#[then("a profile named Work exists in the list")]
fn work_profile_exists(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    assert!(
        profiles.iter().any(|p| p.name == "Work"),
        "no profile named Work in {profiles:?}"
    );
}

#[then("the profile list contains only the default profile")]
fn only_default(world: &mut MeanderWorld) {
    let pool = world.pool.clone().expect("no pool in world");
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0].name, "Default");
}

#[given("a second profile exists")]
fn second_profile(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let profile = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "Work"))
        .expect("create profile failed");
    world.profile_id = Some(profile.id);
}

#[when("the application switches to the second profile")]
fn switch_to_second(world: &mut MeanderWorld) {
    let id = world.profile_id.expect("no second profile");
    let rt = world
        .runtime
        .get_or_insert_with(|| tokio::runtime::Runtime::new().expect("tokio runtime"));
    let state = world.state.as_ref().expect("no app state in world");
    if let Err(e) = rt.block_on(state.switch_profile(id)) {
        world.error = Some(e.to_string());
    }
}

#[when("the application switches to an unknown profile")]
fn switch_to_unknown(world: &mut MeanderWorld) {
    let rt = world
        .runtime
        .get_or_insert_with(|| tokio::runtime::Runtime::new().expect("tokio runtime"));
    let state = world.state.as_ref().expect("no app state in world");
    world.previous_active = Some(state.active_profile_id());
    if let Err(e) = rt.block_on(state.switch_profile(999_999)) {
        world.error = Some(e.to_string());
    }
}

#[then("the active profile is the second profile")]
fn active_is_second(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    assert_eq!(state.active_profile_id(), world.profile_id.unwrap());
}

#[then("the active profile is unchanged")]
fn active_unchanged(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    assert_eq!(state.active_profile_id(), world.previous_active.unwrap());
}

fn rename_default(world: &mut MeanderWorld, name: &str) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let before = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    world.remembered_updated_at = Some(before[0].updated_at.clone());
    // CURRENT_TIMESTAMP has one-second resolution; ensure the bump is visible.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::rename(&pool, before[0].id, name))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I rename the default profile to Personal")]
fn rename_default_personal(world: &mut MeanderWorld) {
    rename_default(world, "Personal");
}

#[when("I rename the default profile to a blank name")]
fn rename_default_blank(world: &mut MeanderWorld) {
    rename_default(world, "   ");
}

#[when("I rename an unknown profile")]
fn rename_unknown(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::profiles::rename(&pool, 999_999, "Ghost"))
    {
        world.error = Some(e.to_string());
    }
}

#[then("the rename succeeds")]
fn rename_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "rename failed: {:?}", world.error);
}

#[then("the rename fails")]
fn rename_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "rename unexpectedly succeeded");
}

#[then("the default profile is named Personal")]
fn default_named_personal(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    assert_eq!(profiles[0].name, "Personal");
}

#[then("the default profile is still named Default")]
fn default_still_default(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    assert_eq!(profiles[0].name, "Default");
}

#[then("the profile updated timestamp changed")]
fn updated_at_changed(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let profiles = world
        .rt()
        .block_on(meander_lib::profiles::list(&pool))
        .expect("profile list failed");
    let before = world
        .remembered_updated_at
        .take()
        .expect("no prior timestamp");
    assert_ne!(profiles[0].updated_at, before, "updated_at did not change");
}

#[given("a task exists on a second profile")]
fn task_on_second_profile(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let other = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "Work"))
        .expect("create profile failed");
    world.profile_id = Some(other.id);
    world
        .rt()
        .block_on(
            sqlx::query("INSERT INTO tasks (profile_id, title) VALUES (?, 'Other task')")
                .bind(other.id)
                .execute(&pool),
        )
        .expect("insert task failed");
}

fn insert_category(world: &mut MeanderWorld, title: &str, profile_id: i64) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    world
        .rt()
        .block_on(
            sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
                .bind(profile_id)
                .bind(title)
                .execute(&pool),
        )
        .expect("insert category failed");
}

#[given(expr = "a category named {word} exists on the active profile")]
fn category_on_active_profile(world: &mut MeanderWorld, title: String) {
    let profile_id = world
        .state
        .as_ref()
        .expect("no app state")
        .active_profile_id();
    insert_category(world, &title, profile_id);
}

#[given(expr = "a category named {word} exists on a second profile")]
fn category_on_second_profile(world: &mut MeanderWorld, title: String) {
    const SECOND_PROFILE_NAME: &str = "Work";
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let other = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, SECOND_PROFILE_NAME))
        .expect("create profile failed");
    world.profile_id = Some(other.id);
    insert_category(world, &title, other.id);
}

fn category_titles(world: &mut MeanderWorld, profile_id: i64) -> Vec<String> {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    world
        .rt()
        .block_on(meander_lib::categories::list(&pool, profile_id))
        .expect("category list failed")
        .into_iter()
        .map(|c| c.title)
        .collect()
}

#[then("the category list is empty")]
fn category_list_empty(world: &mut MeanderWorld) {
    let profile_id = world
        .state
        .as_ref()
        .expect("no app state in world")
        .active_profile_id();
    let titles = category_titles(world, profile_id);
    assert!(
        titles.is_empty(),
        "expected empty category list, got {titles:?}"
    );
}

#[then(expr = "the category list is {string}")]
fn category_list_is(world: &mut MeanderWorld, expected: String) {
    let profile_id = world
        .state
        .as_ref()
        .expect("no app state in world")
        .active_profile_id();
    let titles = category_titles(world, profile_id);
    let expected: Vec<String> = expected.split(", ").map(str::to_owned).collect();
    assert_eq!(titles, expected);
}

#[then(expr = "the second profile's category list is {string}")]
fn second_profile_category_list_is(world: &mut MeanderWorld, expected: String) {
    let profile_id = world.profile_id.expect("no second profile in world");
    let titles = category_titles(world, profile_id);
    let expected: Vec<String> = expected.split(", ").map(str::to_owned).collect();
    assert_eq!(titles, expected);
}

fn task_id_by_title(world: &mut MeanderWorld, title: &str) -> i64 {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, profile_id))
        .expect("task list failed");
    tasks
        .iter()
        .find(|t| t.title == title)
        .expect("task missing")
        .id
}

// Resolves a category id by title across all profiles — scoping is the
// API's job, so foreign-category scenarios must resolve here.
fn category_id_by_title(world: &mut MeanderWorld, title: &str) -> i64 {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT id FROM categories WHERE title = ?")
                .bind(title)
                .fetch_one(&pool),
        )
        .expect("category missing")
}

fn associate(world: &mut MeanderWorld, category_title: &str, task_id: i64) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let category_id = category_id_by_title(world, category_title);
    if let Err(e) = world.rt().block_on(meander_lib::categories::add_to_task(
        &pool,
        active,
        task_id,
        category_id,
    )) {
        world.error = Some(e.to_string());
    }
}

#[given(expr = "I associate {word} with {word}")]
#[when(expr = "I associate {word} with {word}")]
fn associate_category(world: &mut MeanderWorld, category: String, task: String) {
    let task_id = task_id_by_title(world, &task);
    associate(world, &category, task_id);
}

#[when(expr = "I associate {word} with the foreign task")]
fn associate_foreign_task(world: &mut MeanderWorld, category: String) {
    let foreign_profile = world.profile_id.expect("no second profile");
    let pool = world.state.as_ref().expect("no app state").pool();
    let foreign_task_id: i64 = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT id FROM tasks WHERE profile_id = ?")
                .bind(foreign_profile)
                .fetch_one(&pool),
        )
        .expect("foreign task missing");
    associate(world, &category, foreign_task_id);
}

#[when(expr = "I remove {word} from {word}")]
fn remove_category(world: &mut MeanderWorld, category: String, task: String) {
    let task_id = task_id_by_title(world, &task);
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let category_id = category_id_by_title(world, &category);
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::categories::remove_from_task(
            &pool,
            active,
            task_id,
            category_id,
        ))
    {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "the category {word} is deleted")]
fn delete_category(world: &mut MeanderWorld, title: String) {
    let category_id = category_id_by_title(world, &title);
    let state = world.state.as_ref().expect("no app state");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::categories::delete(
        &pool,
        profile_id,
        category_id,
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "the category {word} is renamed to {string}")]
fn rename_category(world: &mut MeanderWorld, title: String, new_title: String) {
    let category_id = category_id_by_title(world, &title);
    let state = world.state.as_ref().expect("no app state");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    // Like the edit dialog: submit the new title alongside the stored
    // description and color.
    let existing: (Option<String>, Option<String>) = world
        .rt()
        .block_on(
            sqlx::query_as("SELECT description, color FROM categories WHERE id = ?")
                .bind(category_id)
                .fetch_one(&pool),
        )
        .expect("category missing");
    let input = meander_lib::categories::NewCategory {
        title: new_title,
        description: existing.0,
        color: existing.1,
    };
    if let Err(e) = world.rt().block_on(meander_lib::categories::update(
        &pool,
        profile_id,
        category_id,
        &input,
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("a category that does not exist is updated")]
fn update_missing_category(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    let input = meander_lib::categories::NewCategory {
        title: "Ghost".into(),
        description: None,
        color: None,
    };
    if let Err(e) = world.rt().block_on(meander_lib::categories::update(
        &pool,
        profile_id,
        i64::MAX,
        &input,
    )) {
        world.error = Some(e.to_string());
    }
}

#[then("the update succeeds")]
fn update_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "update failed: {:?}", world.error);
}

#[then("the update fails")]
fn update_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "update unexpectedly succeeded");
}

#[when("a category that does not exist is deleted")]
fn delete_missing_category(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    if let Err(e) =
        world
            .rt()
            .block_on(meander_lib::categories::delete(&pool, profile_id, i64::MAX))
    {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "the categories of {word} are {string}")]
fn task_categories_are(world: &mut MeanderWorld, task: String, expected: String) {
    let task_id = task_id_by_title(world, &task);
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    let titles: Vec<String> = world
        .rt()
        .block_on(meander_lib::categories::for_task(
            &pool, profile_id, task_id,
        ))
        .expect("task category list failed")
        .into_iter()
        .map(|c| c.title)
        .collect();
    let expected: Vec<String> = expected
        .split(", ")
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    assert_eq!(titles, expected);
}

fn create_category_input(world: &mut MeanderWorld, input: meander_lib::categories::NewCategory) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    match world
        .rt()
        .block_on(meander_lib::categories::create(&pool, profile_id, &input))
    {
        Ok(_) => world.error = None,
        Err(e) => world.error = Some(e.to_string()),
    }
}

#[when("I create a category with surrounding whitespace")]
fn create_padded_category(world: &mut MeanderWorld) {
    create_category_input(
        world,
        meander_lib::categories::NewCategory {
            title: "  Errands  ".into(),
            description: None,
            color: None,
        },
    );
}

#[when(expr = "I create a category titled {word} with color {string}")]
fn create_category_with_color(world: &mut MeanderWorld, title: String, color: String) {
    create_category_input(
        world,
        meander_lib::categories::NewCategory {
            title,
            description: None,
            color: Some(color),
        },
    );
}

#[when("I create a category with an overlong description")]
fn create_category_with_overlong_description(world: &mut MeanderWorld) {
    create_category_input(
        world,
        meander_lib::categories::NewCategory {
            title: "Errands".into(),
            description: Some(
                "x".repeat(meander_lib::categories::CATEGORY_DESCRIPTION_MAX_LEN + 1),
            ),
            color: None,
        },
    );
}

#[when("I create a category with a blank title")]
fn create_blank_category(world: &mut MeanderWorld) {
    create_category_input(
        world,
        meander_lib::categories::NewCategory {
            title: "   ".into(),
            description: None,
            color: None,
        },
    );
}

#[then("the category creation succeeds")]
fn category_creation_succeeds(world: &mut MeanderWorld) {
    assert!(
        world.error.is_none(),
        "category creation failed: {:?}",
        world.error
    );
}

#[then("the category creation fails")]
fn category_creation_fails(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "expected category creation to fail");
    world.error = None;
}

#[then(expr = "a category named {word} exists in the list")]
fn category_exists_in_list(world: &mut MeanderWorld, title: String) {
    category_id_by_title(world, &title);
}

#[then(expr = "the category {word} has the default color")]
fn category_has_default_color(world: &mut MeanderWorld, title: String) {
    let pool = world.state.as_ref().expect("no app state").pool();
    let color: String = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT color FROM categories WHERE title = ?")
                .bind(&title)
                .fetch_one(&pool),
        )
        .expect("category missing");
    assert_eq!(color, meander_lib::categories::DEFAULT_CATEGORY_COLOR);
}

#[then(expr = "the category {word} has color {string}")]
fn category_has_color(world: &mut MeanderWorld, title: String, expected: String) {
    let pool = world.state.as_ref().expect("no app state").pool();
    let color: String = world
        .rt()
        .block_on(
            sqlx::query_scalar("SELECT color FROM categories WHERE title = ?")
                .bind(&title)
                .fetch_one(&pool),
        )
        .expect("category missing");
    assert_eq!(color, expected);
}

#[then("the association succeeds")]
fn association_succeeds(world: &mut MeanderWorld) {
    assert!(
        world.error.is_none(),
        "association failed: {:?}",
        world.error
    );
}

#[then("the association fails")]
fn association_fails(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "expected association to fail");
    world.error = None;
}

#[then("the removal succeeds")]
fn removal_succeeds(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "removal failed: {:?}", world.error);
}

#[then("the task list is empty")]
fn task_list_empty(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert!(tasks.is_empty(), "expected empty task list, got {tasks:?}");
}

#[then("the second profile's task list has one task")]
fn second_profile_has_task(world: &mut MeanderWorld) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let profile_id = world.profile_id.unwrap();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, profile_id))
        .expect("task list failed");
    assert_eq!(tasks.len(), 1);
}

fn create_task(world: &mut MeanderWorld, title: &str) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: title.to_string(),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("I create a task with surrounding whitespace")]
fn create_task_whitespace(world: &mut MeanderWorld) {
    create_task(world, "  Plan the week  ");
}

#[when("I create a task with a blank title")]
fn create_task_blank(world: &mut MeanderWorld) {
    create_task(world, "   ");
}

#[then("the task creation succeeds")]
fn task_creation_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "creation failed: {:?}", world.error);
}

#[then("the task creation fails")]
fn task_creation_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "creation unexpectedly succeeded");
}

#[then("a task titled Plan the week exists in the backlog")]
fn plan_task_in_backlog(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let task = tasks
        .iter()
        .find(|t| t.title == "Plan the week")
        .expect("task not found");
    assert_eq!(task.placement, meander_lib::tasks::TaskPlacement::Backlog);
}

#[then("the task belongs to the default profile")]
fn task_on_default_profile(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert_eq!(tasks[0].profile_id, active);
}

#[given(expr = "a backlog task titled {word}")]
fn backlog_task(world: &mut MeanderWorld, title: String) {
    create_task(world, &title);
    assert!(
        world.error.is_none(),
        "seed create failed: {:?}",
        world.error
    );
}

#[when(expr = "I move {word} before {word}")]
fn move_before(world: &mut MeanderWorld, moved: String, anchor: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let moved_id = tasks
        .iter()
        .find(|t| t.title == moved)
        .expect("moved task missing")
        .id;
    let anchor_index = tasks
        .iter()
        .position(|t| t.title == anchor)
        .expect("anchor task missing");
    let before_id = (anchor_index > 0 && tasks[anchor_index - 1].id != moved_id)
        .then(|| tasks[anchor_index - 1].id);
    let after_id = tasks[anchor_index].id;
    if let Err(e) = world.rt().block_on(meander_lib::tasks::move_task(
        &pool,
        active,
        moved_id,
        before_id,
        Some(after_id),
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("I move a task before the foreign task")]
fn move_before_foreign(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let foreign = world.profile_id.expect("no second profile");
    let moved_id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")[0]
        .id;
    let foreign_id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, foreign))
        .expect("foreign task list failed")[0]
        .id;
    if let Err(e) = world.rt().block_on(meander_lib::tasks::move_task(
        &pool,
        active,
        moved_id,
        None,
        Some(foreign_id),
    )) {
        world.error = Some(e.to_string());
    }
}

#[then("the reorder succeeds")]
fn reorder_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "reorder failed: {:?}", world.error);
}

#[then("the reorder fails")]
fn reorder_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "reorder unexpectedly succeeded");
}

#[then(expr = "the category {word} has audit timestamps")]
fn category_has_timestamps(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let profile_id = state.active_profile_id();
    let category = world
        .rt()
        .block_on(meander_lib::categories::list(&pool, profile_id))
        .expect("category list failed")
        .into_iter()
        .find(|c| c.title == title)
        .expect("category not found");
    assert!(!category.created_at.is_empty());
    assert!(!category.updated_at.is_empty());
}

#[when("I insert a category with a blank title")]
fn insert_blank_category(world: &mut MeanderWorld) {
    const BLANK_TITLE: &str = "   ";
    let state = world.state.as_ref().expect("no app state in world");
    let profile_id = state.active_profile_id();
    let pool = state.pool();
    let result = world.rt().block_on(
        sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
            .bind(profile_id)
            .bind(BLANK_TITLE)
            .execute(&pool),
    );
    world.error = result.err().map(|e| e.to_string());
}

#[then("the insertion fails")]
fn insertion_fails(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "expected insertion to fail");
}

#[then(expr = "the task list order is {string}")]
fn task_list_order(world: &mut MeanderWorld, titles: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let actual: Vec<&str> = tasks.iter().map(|t| t.title.as_str()).collect();
    let expected: Vec<&str> = titles.split(", ").collect();
    assert_eq!(actual, expected);
}

fn main() {
    futures::executor::block_on(MeanderWorld::run("tests/features"));
}

#[when(expr = "I create a task with an estimate of {int} minutes")]
fn create_task_with_estimate(world: &mut MeanderWorld, minutes: i64) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: "Timed".into(),
            estimated_minutes: Some(minutes),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("I create a task with an oversized description")]
fn create_task_oversized_description(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: "Verbose".into(),
            description: Some("x".repeat(20_001)),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I create a task with a title of {int} characters")]
fn create_task_title_length(world: &mut MeanderWorld, len: usize) {
    create_task(world, &"x".repeat(len));
}

#[when("I create a task with a control character in the title")]
fn create_task_control_character(world: &mut MeanderWorld) {
    create_task(world, "plan\nthe week");
}

#[when(expr = "I create a task titled {string}")]
fn create_task_titled(world: &mut MeanderWorld, title: String) {
    create_task(world, &title);
}

#[then(expr = "a task titled {string} exists in the backlog")]
fn task_titled_exists(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert!(
        tasks.iter().any(|t| t.title == title),
        "task {title:?} not in {tasks:?}"
    );
}

#[then(expr = "the task list has {int} task(s)")]
fn task_list_count(world: &mut MeanderWorld, count: usize) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert_eq!(tasks.len(), count);
}

#[when(expr = "I create a task with a description of {int} characters")]
fn create_task_description_length(world: &mut MeanderWorld, len: usize) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: "Verbose".into(),
            description: Some("d".repeat(len)),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("I create a task with a whitespace description")]
fn create_task_whitespace_description(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: "Sparse".into(),
            description: Some("   ".into()),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

fn only_task(world: &mut MeanderWorld) -> meander_lib::tasks::Task {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert_eq!(tasks.len(), 1);
    tasks.into_iter().next().unwrap()
}

#[then(expr = "the task has a description of {int} characters")]
fn task_description_length(world: &mut MeanderWorld, len: usize) {
    let task = only_task(world);
    assert_eq!(task.description.map(|d| d.chars().count()), Some(len));
}

#[then("the task has no description")]
fn task_no_description(world: &mut MeanderWorld) {
    assert_eq!(only_task(world).description, None);
}

#[when(expr = "I create a task with carry-over rule {word}")]
fn create_task_carry_over(world: &mut MeanderWorld, rule: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let rule = match rule.as_str() {
        "carry" => meander_lib::tasks::CarryOverRule::Carry,
        "return" => meander_lib::tasks::CarryOverRule::Return,
        other => panic!("unknown carry-over rule {other}"),
    };
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title: "Ruled".into(),
            carry_over_rule: Some(rule),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "the task has carry-over rule {word}")]
fn task_carry_over(world: &mut MeanderWorld, rule: String) {
    let expected = match rule.as_str() {
        "carry" => meander_lib::tasks::CarryOverRule::Carry,
        "return" => meander_lib::tasks::CarryOverRule::Return,
        other => panic!("unknown carry-over rule {other}"),
    };
    assert_eq!(only_task(world).carry_over_rule, Some(expected));
}

#[then("the task has no carry-over rule")]
fn task_no_carry_over(world: &mut MeanderWorld) {
    assert_eq!(only_task(world).carry_over_rule, None);
}

#[when(expr = "I move {word} after {word}")]
fn move_after(world: &mut MeanderWorld, moved: String, anchor: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let moved_id = tasks
        .iter()
        .find(|t| t.title == moved)
        .expect("moved task missing")
        .id;
    let anchor_index = tasks
        .iter()
        .position(|t| t.title == anchor)
        .expect("anchor task missing");
    let after_id = tasks
        .get(anchor_index + 1)
        .map(|t| t.id)
        .filter(|id| *id != moved_id);
    if let Err(e) = world.rt().block_on(meander_lib::tasks::move_task(
        &pool,
        active,
        moved_id,
        Some(tasks[anchor_index].id),
        after_id,
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I delete {word}")]
fn delete_task_titled(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .iter()
        .find(|t| t.title == title)
        .expect("task missing")
        .id;
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::tasks::delete(&pool, active, id))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I delete the foreign task")]
fn delete_foreign_task(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let foreign = world.profile_id.expect("no second profile");
    let foreign_id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, foreign))
        .expect("foreign task list failed")[0]
        .id;
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::tasks::delete(&pool, active, foreign_id))
    {
        world.error = Some(e.to_string());
    }
}

#[when("I delete a task that does not exist")]
fn delete_unknown_task(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::tasks::delete(&pool, active, i64::MAX))
    {
        world.error = Some(e.to_string());
    }
}

#[then("the deletion succeeds")]
fn deletion_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "deletion failed: {:?}", world.error);
}

#[then("the deletion fails")]
fn deletion_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "deletion unexpectedly succeeded");
}

fn update_task_by_id(world: &mut MeanderWorld, id: i64, title: &str) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let current = world
        .rt()
        .block_on(
            sqlx::query_as::<_, meander_lib::tasks::Task>("SELECT * FROM tasks WHERE id = ?")
                .bind(id)
                .fetch_optional(&pool),
        )
        .expect("task fetch failed");
    if let Some(task) = &current {
        world.remembered_updated_at = Some(task.updated_at.clone());
    }
    let (description, estimated_minutes, spent_minutes, carry_over_rule) = current
        .map(|t| {
            (
                t.description,
                t.estimated_minutes,
                t.spent_minutes,
                t.carry_over_rule,
            )
        })
        .unwrap_or_default();
    // updated_at has seconds resolution — wait for the tick to differ.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    if let Err(e) = world.rt().block_on(meander_lib::tasks::update(
        &pool,
        active,
        id,
        &meander_lib::tasks::UpdateTask {
            title: title.to_string(),
            description,
            estimated_minutes,
            spent_minutes,
            carry_over_rule,
            status: meander_lib::tasks::TaskStatus::Done,
            series: None,
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I rename {word} to {string} and mark it done")]
fn rename_task_done(world: &mut MeanderWorld, from: String, to: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .iter()
        .find(|t| t.title == from)
        .expect("task missing")
        .id;
    update_task_by_id(world, id, &to);
}

#[when("I update the foreign task")]
fn update_foreign_task(world: &mut MeanderWorld) {
    let foreign = world.profile_id.expect("no second profile");
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let foreign_id = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, foreign))
        .expect("foreign task list failed")[0]
        .id;
    update_task_by_id(world, foreign_id, "Foreign edit");
}

#[when("I update a task that does not exist")]
fn update_unknown_task(world: &mut MeanderWorld) {
    update_task_by_id(world, i64::MAX, "Ghost");
}

#[then("the task update succeeds")]
fn task_update_succeeded(world: &mut MeanderWorld) {
    assert!(world.error.is_none(), "update failed: {:?}", world.error);
}

#[then("the task update fails")]
fn task_update_failed(world: &mut MeanderWorld) {
    assert!(world.error.is_some(), "update unexpectedly succeeded");
}

#[then(expr = "the task {string} has status done")]
fn task_has_status_done(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let task = tasks
        .iter()
        .find(|t| t.title == title)
        .expect("task missing");
    assert_eq!(task.status, meander_lib::tasks::TaskStatus::Done);
}

#[then("the task's updated timestamp changed")]
fn task_updated_at_changed(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let before = world
        .remembered_updated_at
        .take()
        .expect("no prior timestamp");
    assert_ne!(tasks[0].updated_at, before, "updated_at did not change");
}

#[when(expr = "I update {word} with a spent time of {int} minutes")]
fn update_task_spent(world: &mut MeanderWorld, title: String, minutes: i64) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .find(|t| t.title == title)
        .expect("task missing");
    if let Err(e) = world.rt().block_on(meander_lib::tasks::update(
        &pool,
        active,
        task.id,
        &meander_lib::tasks::UpdateTask {
            title: task.title.clone(),
            description: task.description.clone(),
            estimated_minutes: task.estimated_minutes,
            spent_minutes: Some(minutes),
            carry_over_rule: task.carry_over_rule,
            status: task.status,
            series: None,
        },
    )) {
        world.error = Some(e.to_string());
    }
}

fn weekly_monday() -> meander_lib::series::NewSeries {
    meander_lib::series::NewSeries {
        recurrence: serde_json::to_value(meander_lib::series::Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![meander_lib::series::Weekday::Monday],
        })
        .unwrap(),
        start_date: FIRST_INSTANCE_DATE.to_string(),
        end_date: None,
    }
}

#[when(expr = "I create a task titled {string} repeating weekly on Monday")]
fn create_repeating_task(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title,
            series: Some(weekly_monday()),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

fn add_schedule_to(world: &mut MeanderWorld, title: &str) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .find(|t| t.title == title)
        .expect("task missing");
    world.task_id = Some(task.id);
    if let Err(e) = world.rt().block_on(meander_lib::tasks::update(
        &pool,
        active,
        task.id,
        &meander_lib::tasks::UpdateTask {
            title: task.title.clone(),
            description: task.description.clone(),
            estimated_minutes: task.estimated_minutes,
            spent_minutes: task.spent_minutes,
            carry_over_rule: task.carry_over_rule,
            status: task.status,
            series: Some(weekly_monday()),
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I make {word} repeat weekly on Monday")]
fn make_task_repeat(world: &mut MeanderWorld, title: String) {
    add_schedule_to(world, &title);
}

#[when(expr = "I try to change {word}'s schedule")]
fn reschedule_task(world: &mut MeanderWorld, title: String) {
    add_schedule_to(world, &title);
}

/// The capability assertion behind "X repeats weekly on Monday": the task
/// the user sees is backed by a series carrying exactly that rule.
fn repeats_weekly_monday(world: &mut MeanderWorld, title: &str) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    let task = tasks
        .iter()
        .find(|t| t.title == title)
        .expect("task not found");
    let series = world
        .rt()
        .block_on(meander_lib::series::list(&pool, active))
        .expect("series list failed")
        .into_iter()
        .find(|s| Some(s.id) == task.series_id)
        .expect("the task does not repeat");
    assert_eq!(
        series.recurrence,
        meander_lib::series::Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![meander_lib::series::Weekday::Monday],
        }
    );
}

#[then(expr = "{word} repeats weekly on Monday")]
fn task_repeats(world: &mut MeanderWorld, title: String) {
    repeats_weekly_monday(world, &title);
}

#[then(expr = "{word} still repeats weekly on Monday")]
fn task_still_repeats(world: &mut MeanderWorld, title: String) {
    repeats_weekly_monday(world, &title);
}

#[then(expr = "{word} is still the same task")]
fn task_is_same(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let matching: Vec<_> = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .filter(|t| t.title == title)
        .collect();
    assert_eq!(matching.len(), 1, "the task was replaced, not updated");
    assert_eq!(matching[0].id, world.task_id.expect("no captured task id"));
}

#[when(expr = "I try to create a task titled {string} whose repeat ends before it starts")]
fn create_task_repeat_ends_before_start(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let mut series = weekly_monday();
    series.end_date = Some("2026-10-18".to_string());
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title,
            series: Some(series),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I try to create a task titled {string} with an unreadable repeat")]
fn create_task_unreadable_repeat(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let mut series = weekly_monday();
    series.recurrence = serde_json::json!({"kind": "every blue moon"});
    if let Err(e) = world.rt().block_on(meander_lib::tasks::create(
        &pool,
        active,
        &meander_lib::tasks::NewTask {
            title,
            series: Some(series),
            ..Default::default()
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when("I try to make the foreign task repeat")]
fn make_foreign_task_repeat(world: &mut MeanderWorld) {
    let foreign = world.profile_id.expect("no second profile");
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, foreign))
        .expect("foreign task list failed")[0]
        .clone();
    if let Err(e) = world.rt().block_on(meander_lib::tasks::update(
        &pool,
        active,
        task.id,
        &meander_lib::tasks::UpdateTask {
            title: task.title.clone(),
            description: task.description.clone(),
            estimated_minutes: task.estimated_minutes,
            spent_minutes: task.spent_minutes,
            carry_over_rule: task.carry_over_rule,
            status: task.status,
            series: Some(weekly_monday()),
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I remove {word}'s repeat")]
fn remove_repeat(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .find(|t| t.title == title)
        .expect("task missing");
    let series_id = task.series_id.expect("the task does not repeat");
    if let Err(e) = world
        .rt()
        .block_on(meander_lib::series::delete(&pool, active, series_id))
    {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "a task titled {string} no longer exists")]
fn task_no_longer_exists(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let tasks = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed");
    assert!(!tasks.iter().any(|t| t.title == title));
}

#[then("no repeating tasks exist")]
fn no_repeating_tasks(world: &mut MeanderWorld) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = world
        .rt()
        .block_on(meander_lib::series::list(&pool, active))
        .expect("series list failed");
    assert!(series.is_empty());
}

const FIRST_INSTANCE_DATE: &str = "2026-10-19";
const LATER_INSTANCE_DATE: &str = "2026-10-26";

/// A second persisted instance of `title`'s series on the Monday after the
/// first — stands in for a future instance the board would create.
fn add_later_instance(world: &mut MeanderWorld, title: &str, instance_title: &str) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .find(|t| t.title == title)
        .expect("task missing");
    let series_id = task.series_id.expect("the task does not repeat");
    world
        .rt()
        .block_on(
            sqlx::query(
                "INSERT INTO tasks (profile_id, title, description, carry_over_rule, \
                 estimated_minutes, series_id, scheduled_date, sort_order) \
                 VALUES (?, ?, NULL, 'return', NULL, ?, ?, 0)",
            )
            .bind(active)
            .bind(instance_title)
            .bind(series_id)
            .bind(LATER_INSTANCE_DATE)
            .execute(&pool),
        )
        .expect("later instance insert failed");
}

#[when(expr = "a later instance of {word} is titled {string}")]
fn later_instance_titled(world: &mut MeanderWorld, title: String, instance_title: String) {
    add_later_instance(world, &title, &instance_title);
}

#[when(expr = "a later instance of {word} exists")]
fn later_instance_exists(world: &mut MeanderWorld, title: String) {
    let instance_title = format!("{title} again");
    add_later_instance(world, &title, &instance_title);
}

fn series_of(world: &mut MeanderWorld, title: &str) -> meander_lib::series::TaskSeries {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let task = world
        .rt()
        .block_on(meander_lib::tasks::list(&pool, active))
        .expect("task list failed")
        .into_iter()
        .find(|t| t.title == title)
        .expect("task missing");
    let series_id = task.series_id.expect("the task does not repeat");
    world
        .rt()
        .block_on(meander_lib::series::list(&pool, active))
        .expect("series list failed")
        .into_iter()
        .find(|s| s.id == series_id)
        .expect("series missing")
}

#[when(expr = "I retitle {word}'s series to {string}")]
fn retitle_series(world: &mut MeanderWorld, title: String, new_title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, &title);
    if let Err(e) = world.rt().block_on(meander_lib::series::update(
        &pool,
        active,
        series.id,
        &meander_lib::series::UpdateSeries {
            title: new_title,
            description: series.description.clone(),
            carry_over_rule: Some(series.carry_over_rule),
            estimated_minutes: series.estimated_minutes,
            recurrence: serde_json::to_value(&series.recurrence).unwrap(),
            start_date: series.start_date.clone(),
            end_date: series.end_date.clone(),
            category_ids: vec![],
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "every instance of {word}'s repeat is titled {string}")]
fn instances_retitled(world: &mut MeanderWorld, title: String, expected: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, &expected);
    let instances = world
        .rt()
        .block_on(meander_lib::tasks::list_instances(&pool, active, series.id))
        .expect("instance list failed");
    assert!(instances.len() >= 2, "expected the added later instance");
    assert!(instances.iter().all(|t| t.title == expected));
    let _ = title;
}

#[when(expr = "I end {word}'s repeat at the later instance")]
fn end_repeat(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, &title);
    if let Err(e) = world.rt().block_on(meander_lib::series::truncate(
        &pool,
        active,
        series.id,
        LATER_INSTANCE_DATE,
    )) {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "the earlier instance of {word} remains")]
fn earlier_instance_remains(world: &mut MeanderWorld, title: String) {
    let series = series_of(world, &title);
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let dates: Vec<String> = world
        .rt()
        .block_on(async {
            sqlx::query_scalar(
                "SELECT scheduled_date FROM tasks WHERE series_id = ? ORDER BY scheduled_date",
            )
            .bind(series.id)
            .fetch_all(&pool)
            .await
        })
        .expect("instance dates query failed");
    assert_eq!(dates, vec![FIRST_INSTANCE_DATE.to_string()]);
}

#[then(expr = "no instance of {word} remains on or after the later instance")]
fn no_later_instances(world: &mut MeanderWorld, title: String) {
    let series = series_of(world, &title);
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let count: i64 = world
        .rt()
        .block_on(async {
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM tasks WHERE series_id = ? AND scheduled_date >= ?",
            )
            .bind(series.id)
            .bind(LATER_INSTANCE_DATE)
            .fetch_one(&pool)
            .await
        })
        .expect("instance count failed");
    assert_eq!(count, 0);
    // The series itself is ended before the later instance's date.
    let series = series_of(world, &title);
    assert_eq!(series.end_date.as_deref(), Some("2026-10-25"));
}

/// Rewrites `title`'s series under `title` unchanged except the recurrence —
/// stands in for picking a different schedule at series scope.
fn update_series_recurrence(
    world: &mut MeanderWorld,
    title: &str,
    recurrence: meander_lib::series::Recurrence,
) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, title);
    if let Err(e) = world.rt().block_on(meander_lib::series::update(
        &pool,
        active,
        series.id,
        &meander_lib::series::UpdateSeries {
            title: series.title.clone(),
            description: series.description.clone(),
            carry_over_rule: Some(series.carry_over_rule),
            estimated_minutes: series.estimated_minutes,
            recurrence: serde_json::to_value(&recurrence).unwrap(),
            start_date: series.start_date.clone(),
            end_date: series.end_date.clone(),
            category_ids: vec![],
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "I change {word}'s repeat to daily")]
fn change_repeat_to_daily(world: &mut MeanderWorld, title: String) {
    update_series_recurrence(
        world,
        &title,
        meander_lib::series::Recurrence::Daily { interval_days: 1 },
    );
}

#[then(expr = "{word} repeats daily")]
fn task_repeats_daily(world: &mut MeanderWorld, title: String) {
    let series = series_of(world, &title);
    assert_eq!(
        series.recurrence,
        meander_lib::series::Recurrence::Daily { interval_days: 1 }
    );
}

fn series_instance_dates(world: &mut MeanderWorld, series_id: i64) -> Vec<String> {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    world
        .rt()
        .block_on(async {
            sqlx::query_scalar(
                "SELECT scheduled_date FROM tasks WHERE series_id = ? ORDER BY scheduled_date",
            )
            .bind(series_id)
            .fetch_all(&pool)
            .await
        })
        .expect("instance dates query failed")
}

#[then(expr = "both instances of {word}'s repeat remain")]
fn both_instances_remain(world: &mut MeanderWorld, title: String) {
    let series = series_of(world, &title);
    assert_eq!(
        series_instance_dates(world, series.id),
        vec![
            FIRST_INSTANCE_DATE.to_string(),
            LATER_INSTANCE_DATE.to_string()
        ]
    );
}

#[when(expr = "I end {word}'s repeat at its first instance")]
fn end_repeat_at_start(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, &title);
    if let Err(e) = world.rt().block_on(meander_lib::series::truncate(
        &pool,
        active,
        series.id,
        FIRST_INSTANCE_DATE,
    )) {
        world.error = Some(e.to_string());
    }
}

#[when(expr = "a later instance of {word} is marked done")]
fn later_instance_done(world: &mut MeanderWorld, title: String) {
    let instance_title = format!("{title} again");
    add_later_instance(world, &title, &instance_title);
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let series = series_of(world, &title);
    world
        .rt()
        .block_on(async {
            sqlx::query(
                "UPDATE tasks SET status = 'done' WHERE series_id = ? AND scheduled_date = ?",
            )
            .bind(series.id)
            .bind(LATER_INSTANCE_DATE)
            .execute(&pool)
            .await
        })
        .expect("marking the later instance done failed");
}

#[then(expr = "the later instance of {word} is still done")]
fn later_instance_still_done(world: &mut MeanderWorld, title: String) {
    // `title` is the pre-update title; the series row is the only one here.
    let _ = title;
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = world
        .rt()
        .block_on(meander_lib::series::list(&pool, active))
        .expect("series list failed")
        .into_iter()
        .next()
        .expect("series missing");
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let status: String = world
        .rt()
        .block_on(async {
            sqlx::query_scalar(
                "SELECT status FROM tasks WHERE series_id = ? AND scheduled_date = ?",
            )
            .bind(series.id)
            .bind(LATER_INSTANCE_DATE)
            .fetch_one(&pool)
            .await
        })
        .expect("instance status query failed");
    assert_eq!(status, "done");
}

#[when(expr = "I add the category {word} to {word}'s series")]
fn categorize_series(world: &mut MeanderWorld, category: String, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let category_id = world
        .rt()
        .block_on(meander_lib::categories::list(&pool, active))
        .expect("category list failed")
        .into_iter()
        .find(|c| c.title == category)
        .expect("category missing")
        .id;
    let series = series_of(world, &title);
    if let Err(e) = world.rt().block_on(meander_lib::series::update(
        &pool,
        active,
        series.id,
        &meander_lib::series::UpdateSeries {
            title: series.title.clone(),
            description: series.description.clone(),
            carry_over_rule: Some(series.carry_over_rule),
            estimated_minutes: series.estimated_minutes,
            recurrence: serde_json::to_value(&series.recurrence).unwrap(),
            start_date: series.start_date.clone(),
            end_date: series.end_date.clone(),
            category_ids: vec![category_id],
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "every instance of {word}'s repeat is categorized {word}")]
fn instances_categorized(world: &mut MeanderWorld, title: String, category: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let category_id = world
        .rt()
        .block_on(meander_lib::categories::list(&pool, active))
        .expect("category list failed")
        .into_iter()
        .find(|c| c.title == category)
        .expect("category missing")
        .id;
    let series = series_of(world, &title);
    let instances = world
        .rt()
        .block_on(meander_lib::tasks::list_instances(&pool, active, series.id))
        .expect("instance list failed");
    assert!(instances.len() >= 2, "expected the added later instance");
    for instance in &instances {
        let linked: i64 = world
            .rt()
            .block_on(async {
                sqlx::query_scalar(
                    "SELECT COUNT(*) FROM task_categories WHERE task_id = ? AND category_id = ?",
                )
                .bind(instance.id)
                .bind(category_id)
                .fetch_one(&pool)
                .await
            })
            .expect("task_categories query failed");
        assert_eq!(linked, 1, "instance {} missing the category", instance.id);
    }
}

#[given(expr = "a repeating task titled {string} exists on a second profile")]
fn foreign_repeating_task(world: &mut MeanderWorld, title: String) {
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let other = world
        .rt()
        .block_on(meander_lib::profiles::create(&pool, "Work"))
        .expect("create profile failed");
    world.profile_id = Some(other.id);
    world
        .rt()
        .block_on(meander_lib::tasks::create(
            &pool,
            other.id,
            &meander_lib::tasks::NewTask {
                title,
                series: Some(weekly_monday()),
                ..Default::default()
            },
        ))
        .expect("foreign repeating task failed");
}

#[when(expr = "I try to retitle the foreign series to {string}")]
fn retitle_foreign_series(world: &mut MeanderWorld, new_title: String) {
    let foreign = world.profile_id.expect("no second profile");
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = world
        .rt()
        .block_on(meander_lib::series::list(&pool, foreign))
        .expect("foreign series list failed")
        .into_iter()
        .next()
        .expect("foreign series missing");
    if let Err(e) = world.rt().block_on(meander_lib::series::update(
        &pool,
        active,
        series.id,
        &meander_lib::series::UpdateSeries {
            title: new_title,
            description: series.description.clone(),
            carry_over_rule: Some(series.carry_over_rule),
            estimated_minutes: series.estimated_minutes,
            recurrence: serde_json::to_value(&series.recurrence).unwrap(),
            start_date: series.start_date.clone(),
            end_date: series.end_date.clone(),
            category_ids: vec![],
        },
    )) {
        world.error = Some(e.to_string());
    }
}

#[then(expr = "the foreign series keeps its title {string}")]
fn foreign_series_keeps_title(world: &mut MeanderWorld, expected: String) {
    let foreign = world.profile_id.expect("no second profile");
    let pool = world.state.as_ref().expect("no app state in world").pool();
    let series = world
        .rt()
        .block_on(meander_lib::series::list(&pool, foreign))
        .expect("foreign series list failed");
    assert_eq!(series.len(), 1);
    assert_eq!(series[0].title, expected);
}

#[when(expr = "I try to change {word}'s repeat to an unreadable schedule")]
fn reschedule_series_unreadable(world: &mut MeanderWorld, title: String) {
    let state = world.state.as_ref().expect("no app state in world");
    let pool = state.pool();
    let active = state.active_profile_id();
    let series = series_of(world, &title);
    if let Err(e) = world.rt().block_on(meander_lib::series::update(
        &pool,
        active,
        series.id,
        &meander_lib::series::UpdateSeries {
            title: series.title.clone(),
            description: series.description.clone(),
            carry_over_rule: Some(series.carry_over_rule),
            estimated_minutes: series.estimated_minutes,
            recurrence: serde_json::json!({ "kind": "fortnightly" }),
            start_date: series.start_date.clone(),
            end_date: series.end_date.clone(),
            category_ids: vec![],
        },
    )) {
        world.error = Some(e.to_string());
    }
}
