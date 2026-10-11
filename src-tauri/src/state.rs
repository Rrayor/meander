use std::path::{Path, PathBuf};
use std::sync::RwLock;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::db::{self, Result};
use crate::profiles;

/// Application state managed by Tauri. Holds the active database pool,
/// the path it was opened from, and the selected profile.
#[derive(Debug)]
pub struct AppState {
    pool: RwLock<SqlitePool>,
    path: RwLock<PathBuf>,
    active_profile_id: RwLock<i64>,
}

impl AppState {
    /// Connects to `path` and selects the first profile. The profile list
    /// is expected to have been seeded by the caller.
    pub async fn new(path: &Path) -> Result<Self> {
        let pool = db::connect(path).await?;
        let first = profiles::list(&pool).await?.first().map(|p| p.id);
        Ok(Self {
            pool: RwLock::new(pool),
            path: RwLock::new(path.to_path_buf()),
            // Pre-seed databases have no profiles yet; callers that seed
            // afterwards fix this up via `set_active_profile`.
            active_profile_id: RwLock::new(first.unwrap_or_default()),
        })
    }

    /// Connects using the configured path; if that fails (corrupt or
    /// unreadable file), falls back to `fallback`. Only fails when the
    /// fallback itself cannot be opened.
    pub async fn from_config(config: &Config, fallback: &Path) -> Result<Self> {
        let configured = config.database_path()?;
        let state = match Self::new(&configured).await {
            Ok(state) => Ok(state),
            Err(_) if configured != fallback => Self::new(fallback).await,
            Err(e) => Err(e),
        }?;
        db::seed(&state.pool()).await?;
        if let Some(id) = config.last_profile_id
            && profiles::get(&state.pool(), id).await.is_ok()
        {
            state.set_active_profile(id);
        }
        Ok(state)
    }

    pub fn pool(&self) -> SqlitePool {
        self.pool.read().expect("db pool lock poisoned").clone()
    }

    pub fn active_profile_id(&self) -> i64 {
        *self
            .active_profile_id
            .read()
            .expect("active profile lock poisoned")
    }

    /// Selects `id` as the active profile if it exists — the current
    /// selection is untouched when it does not.
    pub async fn switch_profile(&self, id: i64) -> Result<()> {
        profiles::get(&self.pool(), id).await?;
        self.set_active_profile(id);
        Ok(())
    }

    pub fn set_active_profile(&self, id: i64) {
        *self
            .active_profile_id
            .write()
            .expect("active profile lock poisoned") = id;
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
        db::seed(&pool).await?;
        *self.pool.write().expect("db pool lock poisoned") = pool.clone();
        *self.path.write().expect("db path lock poisoned") = path.to_path_buf();
        let active = match profiles::get(&pool, self.active_profile_id()).await {
            Ok(profile) => profile.id,
            Err(_) => profiles::list(&pool)
                .await?
                .first()
                .map(|p| p.id)
                .unwrap_or_default(),
        };
        self.set_active_profile(active);
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
            ..Default::default()
        };
        let state = AppState::from_config(&config, &fallback)
            .await
            .expect("should fall back");

        assert_eq!(state.path(), fallback);
    }
}
