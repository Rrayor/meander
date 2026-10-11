mod connect;
mod seed;

pub use connect::{check_compatible, connect, default_path};
pub use seed::seed;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("migration failed: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("cannot resolve database path: {0}")]
    Path(String),
    #[error("incompatible database: {0}")]
    Incompatible(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, DbError>;
