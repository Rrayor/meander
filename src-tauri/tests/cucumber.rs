use cucumber::{World, given, then, when};

mod support;

#[derive(Debug, Default, World)]
struct MeanderWorld {
    runtime: Option<tokio::runtime::Runtime>,
    db_path: Option<std::path::PathBuf>,
    pool: Option<sqlx::SqlitePool>,
    state: Option<meander_lib::state::AppState>,
    candidate: Option<std::path::PathBuf>,
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

fn main() {
    futures::executor::block_on(MeanderWorld::run("tests/features"));
}
