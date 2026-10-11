use std::path::{Path, PathBuf};
use std::sync::RwLock;

use sqlx::SqlitePool;

use crate::db::{self, Result};

/// Application state managed by Tauri. Holds the active database pool and
/// the path it was opened from.
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

    pub fn pool(&self) -> SqlitePool {
        self.pool.read().expect("db pool lock poisoned").clone()
    }

    pub fn path(&self) -> PathBuf {
        self.path.read().expect("db path lock poisoned").clone()
    }

    /// Opens a candidate database and swaps the active pool only if the
    /// connection succeeds.
    pub async fn reconnect(&self, path: &Path) -> Result<()> {
        let pool = db::connect(path).await?;
        *self.pool.write().expect("db pool lock poisoned") = pool;
        *self.path.write().expect("db path lock poisoned") = path.to_path_buf();
        Ok(())
    }
}
