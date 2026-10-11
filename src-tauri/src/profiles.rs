use serde::Serialize;
use sqlx::SqlitePool;

use crate::db::Result;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<Profile>> {
    Ok(sqlx::query_as::<_, Profile>(
        "SELECT id, name, created_at, updated_at FROM profiles ORDER BY id",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Profile> {
    Ok(sqlx::query_as::<_, Profile>(
        "SELECT id, name, created_at, updated_at FROM profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}
