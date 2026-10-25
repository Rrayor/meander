// Fills a database with demo tasks for the past twelve weeks — useful
// for manually exercising past-board navigation (plan item 35).
// Run: cargo run --bin seed-demo-db -- [path/to.db] (defaults to the
// app's dev database path).
fn main() {
    let path = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .map(Ok)
        .unwrap_or_else(meander_lib::db::default_path)
        .expect("resolve database path");
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
        let pool = meander_lib::db::connect(&path)
            .await
            .expect("open database");
        meander_lib::db::seed(&pool).await.expect("bootstrap seed");
        let inserted = meander_lib::db::seed_demo(&pool).await.expect("demo seed");
        if inserted == 0 {
            println!(
                "{} already has demo data — nothing inserted",
                path.display()
            );
        } else {
            println!("seeded {} rows into {}", inserted, path.display());
        }
    });
}
