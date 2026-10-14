use sqlx::SqlitePool;

use super::Result;

pub(crate) const DEFAULT_PROFILE_NAME: &str = "Default";

/// Marks the database as seeded and inserts the default profile.
/// Idempotent — safe to run on every boot.
pub async fn seed(pool: &SqlitePool) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO meander_meta (key, value) VALUES ('schema_seeded', '1')")
        .execute(pool)
        .await?;
    sqlx::query(&format!(
        "INSERT INTO profiles (name) SELECT '{DEFAULT_PROFILE_NAME}' WHERE NOT EXISTS (SELECT 1 FROM profiles)"
    ))
    .execute(pool)
    .await?;
    Ok(())
}
