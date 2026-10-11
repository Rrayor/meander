use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn temp_db_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("meander-test-{}-{nanos}.db", std::process::id()))
}

pub fn migration_count() -> usize {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
    std::fs::read_dir(dir)
        .expect("migrations dir missing")
        .filter(|e| {
            e.as_ref()
                .is_ok_and(|e| e.path().extension().is_some_and(|x| x == "sql"))
        })
        .count()
}
