use sqlx::SqlitePool;

use super::Result;

/// Marks the database as seeded. Idempotent — safe to run on every boot.
pub async fn seed(pool: &SqlitePool) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO meander_meta (key, value) VALUES ('schema_seeded', '1')")
        .execute(pool)
        .await?;
    Ok(())
}
