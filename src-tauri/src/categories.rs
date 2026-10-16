use serde::Serialize;
use sqlx::SqlitePool;

use crate::db::Result;

/// Spec: category titles are required; 100 chars keeps them readable when
/// rendered as small chips on task cards.
pub const CATEGORY_TITLE_MAX_LEN: usize = 100;

#[derive(Debug, Clone, Serialize, specta::Type, sqlx::FromRow)]
pub struct Category {
    pub id: i64,
    pub profile_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list(pool: &SqlitePool, profile_id: i64) -> Result<Vec<Category>> {
    Ok(sqlx::query_as::<_, Category>(
        "SELECT * FROM categories WHERE profile_id = ? ORDER BY title, id",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db_path() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "meander-categories-test-{}-{nanos}.db",
            std::process::id()
        ))
    }

    async fn seeded_pool() -> (SqlitePool, i64) {
        let pool = crate::db::connect(&temp_db_path()).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let profile_id = crate::profiles::list(&pool).await.unwrap()[0].id;
        (pool, profile_id)
    }

    const TITLE_A: &str = "Admin";
    const TITLE_B: &str = "Builds";

    #[tokio::test]
    async fn list_returns_only_the_owning_profiles_categories() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        for (profile_id, title) in [(pid, TITLE_A), (other.id, TITLE_B)] {
            sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
                .bind(profile_id)
                .bind(title)
                .execute(&pool)
                .await
                .unwrap();
        }

        let categories = list(&pool, pid).await.unwrap();

        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].title, TITLE_A);
        assert_eq!(categories[0].profile_id, pid);
    }

    #[tokio::test]
    async fn list_sorts_alphabetically_by_title() {
        let (pool, pid) = seeded_pool().await;
        for title in [TITLE_B, TITLE_A] {
            sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
                .bind(pid)
                .bind(title)
                .execute(&pool)
                .await
                .unwrap();
        }

        let titles: Vec<String> = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.title)
            .collect();

        assert_eq!(titles, vec![TITLE_A, TITLE_B]);
    }

    #[tokio::test]
    async fn the_schema_rejects_blank_or_overlong_titles() {
        let (pool, pid) = seeded_pool().await;
        for title in ["   ", &"x".repeat(CATEGORY_TITLE_MAX_LEN + 1)] {
            let result = sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
                .bind(pid)
                .bind(title)
                .execute(&pool)
                .await;
            assert!(result.is_err(), "title {title:?} should be rejected");
        }
    }
}
