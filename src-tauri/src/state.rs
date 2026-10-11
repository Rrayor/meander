use std::path::{Path, PathBuf};
use std::sync::RwLock;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::db::{self, Result};

/// Application state managed by Tauri. Holds the active database pool and
/// the path it was opened from.
#[derive(Debug)]
pub struct AppState {
    pool: RwLock<SqlitePool>,
    path: RwLock<PathBuf>,
}

impl AppState {
    pub async fn new(path: &Path) -> Result<Self> {
        let pool = db::connect(path).await?;
        Ok(Self {
            pool: RwLock::new(pool),
            path: RwLock::new(path.to_path_buf()),
        })
    }

    /// Connects using the configured path; if that fails (corrupt or
    /// unreadable file), falls back to `fallback`. Only fails when the
    /// fallback itself cannot be opened.
    pub async fn from_config(config: &Config, fallback: &Path) -> Result<Self> {
        let configured = config.database_path()?;
        match Self::new(&configured).await {
            Ok(state) => Ok(state),
            Err(_) if configured != fallback => Self::new(fallback).await,
            Err(e) => Err(e),
        }
    }

    pub fn pool(&self) -> SqlitePool {
        self.pool.read().expect("db pool lock poisoned").clone()
    }

    pub fn path(&self) -> PathBuf {
        self.path.read().expect("db path lock poisoned").clone()
    }

    /// Swaps the active pool to `path` only if the candidate passes the
    /// compatibility check and connects cleanly — the current pool is
    /// untouched on any failure.
    pub async fn reconnect(&self, path: &Path) -> Result<()> {
        db::check_compatible(path).await?;
        let pool = db::connect(path).await?;
        *self.pool.write().expect("db pool lock poisoned") = pool;
        *self.path.write().expect("db path lock poisoned") = path.to_path_buf();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn from_config_falls_back_when_configured_file_is_corrupt() {
        let dir = std::env::temp_dir().join(format!(
            "meander-state-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let corrupt = dir.join("corrupt.db");
        std::fs::write(&corrupt, b"not a sqlite database").unwrap();
        let fallback = dir.join("fallback.db");

        let config = Config {
            database_path: Some(corrupt),
        };
        let state = AppState::from_config(&config, &fallback)
            .await
            .expect("should fall back");

        assert_eq!(state.path(), fallback);
    }
}
