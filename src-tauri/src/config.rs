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
