use cucumber::{World, given, then, when};

mod support;

#[derive(Debug, Default, World)]
struct MeanderWorld {
    runtime: Option<tokio::runtime::Runtime>,
    db_path: Option<std::path::PathBuf>,
    pool: Option<sqlx::SqlitePool>,
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

fn main() {
    futures::executor::block_on(MeanderWorld::run("tests/features"));
}
