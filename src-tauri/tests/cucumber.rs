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
