use std::path::{Path, PathBuf};

use sqlx::SqlitePool;
use sqlx::sqlite::SqliteConnectOptions;

use super::{DbError, Result};

const DB_FILENAME: &str = "meander.db";

/// Default database location: the repository root in dev builds
/// (resolved via CARGO_MANIFEST_DIR, not cwd), the executable's
/// directory in release builds.
pub fn default_path() -> Result<PathBuf> {
    #[cfg(debug_assertions)]
    {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| DbError::Path("src-tauri has no parent dir".into()))?;
        Ok(repo_root.join(DB_FILENAME))
    }
    #[cfg(not(debug_assertions))]
    {
        let exe_dir = std::env::current_exe()?
            .parent()
            .ok_or_else(|| DbError::Path("executable has no parent dir".into()))?
            .to_path_buf();
        Ok(exe_dir.join(DB_FILENAME))
    }
}

/// Opens (or creates) a SQLite database at `path`, enabling WAL and
/// foreign keys, then applies all pending migrations.
pub async fn connect(path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_path_ends_with_db_filename() {
        let path = default_path().expect("default path resolves");
        assert_eq!(path.file_name().unwrap(), DB_FILENAME);
    }
}
