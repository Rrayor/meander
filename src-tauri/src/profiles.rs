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

const MAX_NAME_LEN: usize = 100;

fn validated_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err(crate::db::DbError::Validation(
            "profile name is required".into(),
        ));
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(crate::db::DbError::Validation(
            "profile name must be 100 characters or fewer".into(),
        ));
    }
    if name.chars().any(char::is_control) {
        return Err(crate::db::DbError::Validation(
            "profile name cannot contain control characters".into(),
        ));
    }
    Ok(name)
}

pub async fn create(pool: &SqlitePool, name: &str) -> Result<Profile> {
    let name = validated_name(name)?;
    let result = sqlx::query("INSERT INTO profiles (name) VALUES (?)")
        .bind(name)
        .execute(pool)
        .await?;
    get(pool, result.last_insert_rowid()).await
}

pub async fn rename(pool: &SqlitePool, id: i64, name: &str) -> Result<Profile> {
    let name = validated_name(name)?;
    sqlx::query("UPDATE profiles SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Profile> {
    Ok(sqlx::query_as::<_, Profile>(
        "SELECT id, name, created_at, updated_at FROM profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_name_at_the_limit() {
        let name = "a".repeat(MAX_NAME_LEN);
        assert_eq!(validated_name(&name).unwrap(), name);
    }

    #[test]
    fn rejects_a_name_over_the_limit() {
        let name = "a".repeat(MAX_NAME_LEN + 1);
        assert!(validated_name(&name).is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(validated_name("two\nlines").is_err());
        assert!(validated_name("tab\there").is_err());
        assert!(validated_name("null\u{0000}byte").is_err());
    }

    #[test]
    fn allows_unicode_and_symbols() {
        assert_eq!(validated_name("José's tasks ").unwrap(), "José's tasks");
        assert_eq!(validated_name("ワーク 日本語").unwrap(), "ワーク 日本語");
        assert_eq!(validated_name("a?b!c#").unwrap(), "a?b!c#");
    }

    #[test]
    fn trims_before_validating() {
        assert!(validated_name("   \n  ").is_err());
        assert_eq!(validated_name("  ok  ").unwrap(), "ok");
    }
}
