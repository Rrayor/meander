use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db;

const CONFIG_FILENAME: &str = "config.json";

/// Application-level settings — the layer needed before a database can be
/// opened (the selected db path) or about the machine rather than a
/// profile. Profile-scoped settings live inside the database.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub database_path: Option<PathBuf>,
    /// Restored at startup so the app reopens with the profile in use
    /// when it was last closed.
    #[serde(default)]
    pub last_profile_id: Option<i64>,
}

impl Config {
    /// The database path to open at startup: the configured file if it
    /// still exists, otherwise the platform default.
    pub fn database_path(&self) -> db::Result<PathBuf> {
        match &self.database_path {
            Some(path) if path.exists() => Ok(path.clone()),
            _ => db::default_path(),
        }
    }
}

/// Loads config from `dir`; missing or corrupt config yields defaults.
pub fn load(dir: &Path) -> Config {
    std::fs::read_to_string(dir.join(CONFIG_FILENAME))
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, config: &Config) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(
        dir.join(CONFIG_FILENAME),
        serde_json::to_string_pretty(config).map_err(std::io::Error::other)?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "meander-config-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn load_missing_file_returns_defaults() {
        let dir = temp_dir();
        let config = load(&dir);
        assert!(config.database_path.is_none());
        assert!(config.last_profile_id.is_none());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = temp_dir();
        let config = Config {
            database_path: Some(PathBuf::from("/some/where.db")),
            last_profile_id: Some(7),
        };
        save(&dir, &config).expect("save");
        let loaded = load(&dir);
        assert_eq!(loaded.database_path, config.database_path);
        assert_eq!(loaded.last_profile_id, Some(7));
    }

    #[test]
    fn load_corrupt_file_returns_defaults() {
        let dir = temp_dir();
        std::fs::write(dir.join(CONFIG_FILENAME), b"{ not json").unwrap();
        let config = load(&dir);
        assert!(config.database_path.is_none());
        assert!(config.last_profile_id.is_none());
    }

    #[test]
    fn database_path_returns_configured_when_it_exists() {
        let dir = temp_dir();
        let db = dir.join("custom.db");
        std::fs::write(&db, b"").unwrap();
        let config = Config {
            database_path: Some(db.clone()),
            ..Default::default()
        };
        assert_eq!(config.database_path().unwrap(), db);
    }

    #[test]
    fn database_path_falls_back_when_configured_is_missing() {
        let config = Config {
            database_path: Some(PathBuf::from("/definitely/does/not/exist.db")),
            ..Default::default()
        };
        assert_eq!(config.database_path().unwrap(), db::default_path().unwrap());
    }
}
