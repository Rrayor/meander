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
        tokio::fs::create_dir_all(parent).await?;
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

/// Opens `path` read-only and verifies it is a compatible Meander database:
/// `meander_meta` must exist and every applied migration must be in the
/// app's known migration set. The candidate is never modified — the check
/// does not run migrations.
pub async fn check_compatible(path: &Path) -> Result<()> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let pool = SqlitePool::connect_with(options).await?;
    if !table_exists(&pool, "meander_meta").await? {
        return Err(DbError::Incompatible("missing meander_meta table".into()));
    }
    if table_exists(&pool, "_sqlx_migrations").await? {
        let applied: Vec<i64> =
            sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success = 1")
                .fetch_all(&pool)
                .await?;
        let known: std::collections::HashSet<i64> = sqlx::migrate!("./migrations")
            .migrations
            .iter()
            .map(|m| m.version)
            .collect();
        if let Some(&v) = applied.iter().find(|v| !known.contains(v)) {
            return Err(DbError::Incompatible(format!(
                "database was created by a newer version (unknown migration {v})"
            )));
        }
    }
    Ok(())
}

async fn table_exists(pool: &SqlitePool, name: &str) -> std::result::Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)",
    )
    .bind(name)
    .fetch_one(pool)
    .await
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
