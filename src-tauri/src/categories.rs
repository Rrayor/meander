use serde::Serialize;
use sqlx::SqlitePool;

use crate::db::Result;
use crate::errors::ErrorCode;

/// Spec: category titles are required; 100 chars keeps them readable when
/// rendered as small chips on task cards.
pub const CATEGORY_TITLE_MAX_LEN: usize = 100;

const CATEGORY_NOT_FOUND_MESSAGE: &str = "category does not exist";

fn category_not_found() -> crate::db::DbError {
    crate::db::DbError::Validation {
        code: ErrorCode::CategoryNotFound,
        message: CATEGORY_NOT_FOUND_MESSAGE.into(),
    }
}

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

async fn ensure_exists(pool: &SqlitePool, profile_id: i64, category_id: i64) -> Result<()> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM categories WHERE id = ? AND profile_id = ?")
            .bind(category_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await?;
    row.map(|_| ()).ok_or_else(category_not_found)
}

/// Associates a task with a category. Both entities must belong to
/// `profile_id` — a cross-profile pairing is rejected as not-found on the
/// offending side rather than leaking another profile's data.
/// Adding an existing association is a no-op (the PK makes it idempotent).
pub async fn add_to_task(
    pool: &SqlitePool,
    profile_id: i64,
    task_id: i64,
    category_id: i64,
) -> Result<()> {
    crate::tasks::ensure_exists(pool, profile_id, task_id).await?;
    ensure_exists(pool, profile_id, category_id).await?;
    sqlx::query("INSERT OR IGNORE INTO task_categories (task_id, category_id) VALUES (?, ?)")
        .bind(task_id)
        .bind(category_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Removes a task–category association. Unknown tasks/categories are
/// rejected; removing an association that isn't there is a no-op so UI
/// toggles stay idempotent.
pub async fn remove_from_task(
    pool: &SqlitePool,
    profile_id: i64,
    task_id: i64,
    category_id: i64,
) -> Result<()> {
    crate::tasks::ensure_exists(pool, profile_id, task_id).await?;
    ensure_exists(pool, profile_id, category_id).await?;
    sqlx::query("DELETE FROM task_categories WHERE task_id = ? AND category_id = ?")
        .bind(task_id)
        .bind(category_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Categories attached to a task, ordered alphabetically — the order the UI
/// renders chips/dots in.
pub async fn for_task(pool: &SqlitePool, profile_id: i64, task_id: i64) -> Result<Vec<Category>> {
    crate::tasks::ensure_exists(pool, profile_id, task_id).await?;
    Ok(sqlx::query_as::<_, Category>(
        "SELECT c.* FROM categories c
         JOIN task_categories tc ON tc.category_id = c.id
         WHERE tc.task_id = ? AND c.profile_id = ?
         ORDER BY c.title, c.id",
    )
    .bind(task_id)
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
    async fn list_roundtrips_all_fields() {
        const DESCRIPTION: &str = "Things to buy";
        const COLOR: &str = "#2DD4BF";
        let (pool, pid) = seeded_pool().await;
        sqlx::query(
            "INSERT INTO categories (profile_id, title, description, color)
             VALUES (?, ?, ?, ?)",
        )
        .bind(pid)
        .bind(TITLE_A)
        .bind(DESCRIPTION)
        .bind(COLOR)
        .execute(&pool)
        .await
        .unwrap();

        let category = list(&pool, pid).await.unwrap().remove(0);

        assert_eq!(category.title, TITLE_A);
        assert_eq!(category.description.as_deref(), Some(DESCRIPTION));
        assert_eq!(category.color.as_deref(), Some(COLOR));
        assert!(!category.created_at.is_empty());
        assert!(!category.updated_at.is_empty());
    }

    #[tokio::test]
    async fn optional_fields_roundtrip_as_null() {
        let (pool, pid) = seeded_pool().await;
        sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
            .bind(pid)
            .bind(TITLE_A)
            .execute(&pool)
            .await
            .unwrap();

        let category = list(&pool, pid).await.unwrap().remove(0);

        assert_eq!(category.description, None);
        assert_eq!(category.color, None);
    }

    async fn new_task(pool: &SqlitePool, profile_id: i64, title: &str) -> i64 {
        crate::tasks::create(
            pool,
            profile_id,
            &crate::tasks::NewTask {
                title: title.into(),
                description: None,
                estimated_minutes: None,
                carry_over_rule: None,
            },
        )
        .await
        .unwrap()
        .id
    }

    async fn new_category(pool: &SqlitePool, profile_id: i64, title: &str) -> i64 {
        sqlx::query("INSERT INTO categories (profile_id, title) VALUES (?, ?)")
            .bind(profile_id)
            .bind(title)
            .execute(pool)
            .await
            .unwrap()
            .last_insert_rowid()
    }

    #[tokio::test]
    async fn associating_a_category_is_listed_for_the_task() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;

        add_to_task(&pool, pid, task, category).await.unwrap();

        let categories = for_task(&pool, pid, task).await.unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].title, TITLE_B);
    }

    #[tokio::test]
    async fn adding_the_same_association_twice_is_idempotent() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;

        add_to_task(&pool, pid, task, category).await.unwrap();
        add_to_task(&pool, pid, task, category).await.unwrap();

        assert_eq!(for_task(&pool, pid, task).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn removing_an_association_unlists_it() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        remove_from_task(&pool, pid, task, category).await.unwrap();

        assert!(for_task(&pool, pid, task).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn removing_a_missing_association_is_a_noop() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;

        remove_from_task(&pool, pid, task, category).await.unwrap();
    }

    #[tokio::test]
    async fn associating_a_foreign_category_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        let task = new_task(&pool, pid, TITLE_A).await;
        let foreign = new_category(&pool, other.id, TITLE_B).await;

        let err = add_to_task(&pool, pid, task, foreign).await.unwrap_err();

        match err {
            crate::db::DbError::Validation { code, message } => {
                assert_eq!(code, ErrorCode::CategoryNotFound);
                assert_eq!(message, CATEGORY_NOT_FOUND_MESSAGE);
            }
            other => panic!("expected a validation error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn associating_a_foreign_task_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        let foreign_task = new_task(&pool, other.id, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;

        assert!(
            add_to_task(&pool, pid, foreign_task, category)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn deleting_a_category_cascades_its_associations() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(category)
            .execute(&pool)
            .await
            .unwrap();

        assert!(for_task(&pool, pid, task).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_a_task_cascades_its_associations() {
        let (pool, pid) = seeded_pool().await;
        let task = new_task(&pool, pid, TITLE_A).await;
        let category = new_category(&pool, pid, TITLE_B).await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        crate::tasks::delete(&pool, pid, task).await.unwrap();

        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 0);
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
