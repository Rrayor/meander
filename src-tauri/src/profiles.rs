use serde::Serialize;
use sqlx::SqlitePool;

use crate::db::Result;

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
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

#[nutype::nutype(
    sanitize(trim),
    validate(
        len_char_min = 1,
        len_char_max = PROFILE_NAME_MAX_LEN,
        predicate = |s| !s.chars().any(char::is_control)
    ),
    derive(Debug, PartialEq)
)]
struct ProfileName(String);

const PROFILE_NAME_MAX_LEN: usize = 100;

fn profile_name(name: &str) -> Result<ProfileName> {
    ProfileName::try_new(name).map_err(|e| {
        let (code, message) = match e {
            ProfileNameError::LenCharMinViolated => (
                crate::errors::ErrorCode::ProfileNameRequired,
                "profile name is required".into(),
            ),
            ProfileNameError::LenCharMaxViolated => (
                crate::errors::ErrorCode::ProfileNameTooLong,
                format!("profile name must be {PROFILE_NAME_MAX_LEN} characters or fewer"),
            ),
            _ => (
                crate::errors::ErrorCode::ProfileNameInvalidCharacters,
                "profile name cannot contain control characters".into(),
            ),
        };
        crate::db::DbError::Validation { code, message }
    })
}

pub async fn create(pool: &SqlitePool, name: &str) -> Result<Profile> {
    let name = profile_name(name)?.into_inner();
    let result = sqlx::query("INSERT INTO profiles (name) VALUES (?)")
        .bind(name)
        .execute(pool)
        .await?;
    get(pool, result.last_insert_rowid()).await
}

pub async fn rename(pool: &SqlitePool, id: i64, name: &str) -> Result<Profile> {
    let name = profile_name(name)?.into_inner();
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
        let name = "a".repeat(100);
        assert_eq!(profile_name(&name).unwrap().into_inner(), name);
    }

    #[test]
    fn rejects_a_name_over_the_limit() {
        let name = "a".repeat(101);
        assert!(profile_name(&name).is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(profile_name("two\nlines").is_err());
        assert!(profile_name("tab\there").is_err());
        assert!(profile_name("null\u{0000}byte").is_err());
    }

    #[test]
    fn allows_unicode_and_symbols() {
        assert_eq!(
            profile_name("José's tasks ").unwrap().into_inner(),
            "José's tasks"
        );
        assert_eq!(
            profile_name("ワーク 日本語").unwrap().into_inner(),
            "ワーク 日本語"
        );
        assert_eq!(profile_name("a?b!c#").unwrap().into_inner(), "a?b!c#");
    }

    #[test]
    fn trims_before_validating() {
        assert!(profile_name("   \n  ").is_err());
        assert_eq!(profile_name("  ok  ").unwrap().into_inner(), "ok");
    }
}
