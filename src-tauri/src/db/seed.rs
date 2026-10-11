use sqlx::SqlitePool;

use super::Result;

/// Marks the database as seeded and inserts the default profile.
/// Idempotent — safe to run on every boot.
pub async fn seed(pool: &SqlitePool) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO meander_meta (key, value) VALUES ('schema_seeded', '1')")
        .execute(pool)
        .await?;
    sqlx::query(
        "INSERT INTO profiles (name) SELECT 'Default' WHERE NOT EXISTS (SELECT 1 FROM profiles)",
    )
    .execute(pool)
    .await?;
    Ok(())
}
