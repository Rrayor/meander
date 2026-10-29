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

/// Spec: a category color is optional; an unset color defaults to the
/// primary accent. Users may pick any color — the palette (which mirrors
/// the threshold tints in index.css) just offers curated swatches.
pub const CATEGORY_PALETTE: [&str; 12] = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#4ade80", "#34d399", "#22d3ee", "#60a5fa",
    "#818cf8", "#a78bfa", "#e879f9", "#f472b6",
];
pub const DEFAULT_CATEGORY_COLOR: &str = "#2dd4bf";

#[nutype::nutype(
    sanitize(trim),
    validate(
        len_char_min = 1,
        len_char_max = CATEGORY_TITLE_MAX_LEN,
        predicate = |s| !s.chars().any(char::is_control)
    ),
    derive(Debug, PartialEq)
)]
pub struct CategoryTitle(String);

impl CategoryTitle {
    /// Validates `name`; the error variants are mapped to our own vocabulary.
    pub fn parse(raw: &str) -> Result<Self> {
        Self::try_new(raw).map_err(|e| {
            let (code, message) = match e {
                CategoryTitleError::LenCharMinViolated => (
                    ErrorCode::CategoryTitleRequired,
                    "category title is required".into(),
                ),
                CategoryTitleError::LenCharMaxViolated => (
                    ErrorCode::CategoryTitleTooLong,
                    format!("category title must be {CATEGORY_TITLE_MAX_LEN} characters or fewer"),
                ),
                _ => (
                    ErrorCode::CategoryTitleInvalidCharacters,
                    "category title cannot contain control characters".into(),
                ),
            };
            crate::db::DbError::Validation { code, message }
        })
    }
}

/// Spec: category descriptions are optional; 20,000 chars matches the task
/// description bound and is far beyond any realistic annotation.
pub const CATEGORY_DESCRIPTION_MAX_LEN: usize = 20_000;

#[nutype::nutype(
    sanitize(trim),
    validate(len_char_min = 1, len_char_max = CATEGORY_DESCRIPTION_MAX_LEN),
    derive(Debug, PartialEq)
)]
pub struct CategoryDescription(String);

/// Optional/blank-to-None semantics — reported with category vocabulary.
fn parse_category_description(raw: Option<&str>) -> Result<Option<String>> {
    Ok(raw
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(|d| {
            CategoryDescription::try_new(d).map_err(|_| crate::db::DbError::Validation {
                code: ErrorCode::CategoryDescriptionTooLong,
                message: format!(
                    "category description must be {CATEGORY_DESCRIPTION_MAX_LEN} characters or fewer"
                ),
            })
        })
        .transpose()?
        .map(CategoryDescription::into_inner))
}

#[derive(Debug, Default, serde::Deserialize, specta::Type)]
pub struct NewCategory {
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

pub async fn create(pool: &SqlitePool, profile_id: i64, input: &NewCategory) -> Result<Category> {
    let title = CategoryTitle::parse(&input.title)?.into_inner();
    let description = parse_category_description(input.description.as_deref())?;
    let color = crate::validation::parse_hex_color(
        input.color.as_deref(),
        ErrorCode::CategoryColorInvalid,
        "category color must be a #rrggbb hex value",
    )?
    .unwrap_or_else(|| DEFAULT_CATEGORY_COLOR.to_string());
    let result = sqlx::query(
        "INSERT INTO categories (profile_id, title, description, color) VALUES (?, ?, ?, ?)",
    )
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(color)
    .execute(pool)
    .await?;
    let category = sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = ?")
        .bind(result.last_insert_rowid())
        .fetch_one(pool)
        .await?;
    Ok(category)
}

#[derive(Debug, Clone, Serialize, specta::Type, sqlx::FromRow)]
pub struct Category {
    pub id: i64,
    pub profile_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
    /// §285: per-category per-day threshold — NULL when unset.
    pub threshold_minutes: Option<i64>,
    pub threshold_color: Option<String>,
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

/// Sets or clears a category's per-day threshold (§285). A set
/// threshold with no picked color defaults to a palette hue chosen by
/// the category's position — distinct hues for distinct categories.
/// Clearing the minutes clears the color with it.
pub async fn set_threshold(
    pool: &SqlitePool,
    profile_id: i64,
    category_id: i64,
    minutes: Option<i64>,
    color: Option<String>,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    set_threshold_tx(&mut tx, profile_id, category_id, minutes, color).await?;
    tx.commit().await?;
    Ok(())
}

/// Applies a batch of threshold edits in a single transaction —
/// either every changed row commits or none do.
pub async fn set_thresholds(
    pool: &SqlitePool,
    profile_id: i64,
    updates: &[(i64, Option<i64>, Option<String>)],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (id, minutes, color) in updates {
        set_threshold_tx(&mut tx, profile_id, *id, *minutes, color.clone()).await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn set_threshold_tx(
    conn: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: i64,
    category_id: i64,
    minutes: Option<i64>,
    color: Option<String>,
) -> Result<()> {
    let validated = minutes
        .map(|m| {
            crate::validation::PositiveDuration::try_new(m).map_err(|_| {
                crate::db::DbError::Validation {
                    code: crate::errors::ErrorCode::EstimatedTimeOutOfRange,
                    message: format!(
                        "threshold must be between 1 and {} minutes",
                        crate::validation::MAX_DURATION_MINUTES
                    ),
                }
            })
        })
        .transpose()?
        .map(|d| d.into_inner());
    let parsed_color = crate::validation::parse_hex_color(
        color.as_deref(),
        crate::errors::ErrorCode::ThresholdColorInvalid,
        "threshold color must be a #rrggbb hex value",
    )?;
    let parsed_color = if validated.is_some() {
        match parsed_color {
            Some(c) => Some(c),
            None => {
                // Keep a stored color when the edit only touches minutes;
                // otherwise pick the first palette hue no other category
                // claims (§285 "distinct hues for distinct categories").
                let stored: Option<Option<String>> = sqlx::query_scalar(
                    "SELECT threshold_color FROM categories WHERE id = ? AND profile_id = ?",
                )
                .bind(category_id)
                .bind(profile_id)
                .fetch_optional(&mut **conn)
                .await?;
                match stored.flatten() {
                    Some(c) => Some(c),
                    None => {
                        let used: Vec<String> = sqlx::query_scalar(
                            "SELECT threshold_color FROM categories WHERE profile_id = ? AND threshold_color IS NOT NULL AND id != ?",
                        )
                        .bind(profile_id)
                        .bind(category_id)
                        .fetch_all(&mut **conn)
                        .await?;
                        let hue = CATEGORY_PALETTE
                            .iter()
                            .find(|h| !used.contains(&h.to_string()))
                            .unwrap_or(
                                &CATEGORY_PALETTE[category_id as usize % CATEGORY_PALETTE.len()],
                            );
                        Some(hue.to_string())
                    }
                }
            }
        }
    } else {
        None
    };
    let changed = sqlx::query(
        "UPDATE categories SET threshold_minutes = ?, threshold_color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?",
    )
    .bind(validated)
    .bind(parsed_color)
    .bind(category_id)
    .bind(profile_id)
    .execute(&mut **conn)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(category_not_found());
    }
    Ok(())
}

/// Deletes a category scoped to its owning profile. task_categories rows
/// cascade away; the tasks themselves are untouched. Deleting an unknown id
/// — or another profile's category — is an error, not a silent no-op.
pub async fn delete(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM categories WHERE id = ? AND profile_id = ?")
        .bind(id)
        .bind(profile_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(category_not_found());
    }
    Ok(())
}

/// Updates a category scoped to its owning profile. Unknown or foreign ids
/// are rejected as not-found. Edits take effect for every associated task —
/// the association table stores ids, so there's nothing to cascade.
pub async fn update(
    pool: &SqlitePool,
    profile_id: i64,
    id: i64,
    input: &NewCategory,
) -> Result<Category> {
    let title = CategoryTitle::parse(&input.title)?.into_inner();
    let description = parse_category_description(input.description.as_deref())?;
    let color = crate::validation::parse_hex_color(
        input.color.as_deref(),
        ErrorCode::CategoryColorInvalid,
        "category color must be a #rrggbb hex value",
    )?
    .unwrap_or_else(|| DEFAULT_CATEGORY_COLOR.to_string());
    let result = sqlx::query(
        "UPDATE categories SET title = ?, description = ?, color = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND profile_id = ?",
    )
    .bind(title)
    .bind(description)
    .bind(color)
    .bind(id)
    .bind(profile_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(category_not_found());
    }
    Ok(
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?,
    )
}

pub(crate) async fn ensure_exists(
    pool: &SqlitePool,
    profile_id: i64,
    category_id: i64,
) -> Result<()> {
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
                series: None,
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
    async fn delete_removes_the_category_and_its_associations() {
        let (pool, pid) = seeded_pool().await;
        let category = new_category(&pool, pid, TITLE_A).await;
        let task = new_task(&pool, pid, "Alpha").await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        delete(&pool, pid, category).await.unwrap();

        assert!(list(&pool, pid).await.unwrap().is_empty());
        assert!(for_task(&pool, pid, task).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_leaves_associated_tasks_intact() {
        let (pool, pid) = seeded_pool().await;
        let category = new_category(&pool, pid, TITLE_A).await;
        let task = new_task(&pool, pid, "Alpha").await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        delete(&pool, pid, category).await.unwrap();

        assert_eq!(crate::tasks::list(&pool, pid).await.unwrap().len(), 1);
    }

    const RENAMED: &str = "Chores";
    const NEW_DESC: &str = "desc";
    const NEW_COLOR: &str = "#4ade80";

    #[tokio::test]
    async fn update_changes_the_fields() {
        let (pool, pid) = seeded_pool().await;
        let id = new_category(&pool, pid, TITLE_A).await;

        let updated = update(
            &pool,
            pid,
            id,
            &NewCategory {
                title: RENAMED.into(),
                description: Some(NEW_DESC.into()),
                color: Some(NEW_COLOR.into()),
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.id, id);
        assert_eq!(updated.title, RENAMED);
        assert_eq!(updated.description.as_deref(), Some(NEW_DESC));
        assert_eq!(updated.color.as_deref(), Some(NEW_COLOR));
    }

    #[tokio::test]
    async fn update_is_visible_on_associated_tasks() {
        let (pool, pid) = seeded_pool().await;
        let category = new_category(&pool, pid, TITLE_A).await;
        let task = new_task(&pool, pid, "Alpha").await;
        add_to_task(&pool, pid, task, category).await.unwrap();

        update(
            &pool,
            pid,
            category,
            &NewCategory {
                title: RENAMED.into(),
                description: None,
                color: Some(NEW_COLOR.into()),
            },
        )
        .await
        .unwrap();

        let titles: Vec<String> = for_task(&pool, pid, task)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.title)
            .collect();
        assert_eq!(titles, [RENAMED]);
    }

    #[tokio::test]
    async fn updating_a_foreign_or_unknown_category_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        let foreign = new_category(&pool, other.id, TITLE_B).await;
        let input = NewCategory {
            title: RENAMED.into(),
            description: None,
            color: None,
        };

        assert!(update(&pool, pid, foreign, &input).await.is_err());
        assert!(update(&pool, pid, i64::MAX, &input).await.is_err());
        // The foreign category is untouched.
        assert_eq!(list(&pool, other.id).await.unwrap()[0].title, TITLE_B);
    }

    #[tokio::test]
    async fn deleting_a_foreign_or_unknown_category_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        let foreign = new_category(&pool, other.id, TITLE_B).await;

        assert!(delete(&pool, pid, foreign).await.is_err());
        assert!(delete(&pool, pid, i64::MAX).await.is_err());
        // The foreign category itself survives.
        assert!(
            list(&pool, other.id)
                .await
                .unwrap()
                .iter()
                .any(|c| c.id == foreign)
        );
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

    fn new_category_input(title: &str) -> NewCategory {
        NewCategory {
            title: title.into(),
            description: None,
            color: None,
        }
    }

    #[tokio::test]
    async fn create_trims_and_stores_the_category() {
        const COLOR: &str = "#2DD4BF";
        let (pool, pid) = seeded_pool().await;
        let mut input = new_category_input("  Errands  ");
        input.description = Some(" Things to buy ".into());
        input.color = Some(COLOR.into());

        let created = create(&pool, pid, &input).await.unwrap();

        assert_eq!(created.title, "Errands");
        assert_eq!(created.description.as_deref(), Some("Things to buy"));
        assert_eq!(
            created.color.as_deref(),
            Some(COLOR.to_lowercase().as_str())
        );
        assert_eq!(created.profile_id, pid);
    }

    #[tokio::test]
    async fn create_trims_unicode_whitespace_beyond_ascii() {
        // str::trim removes U+0085 (Unicode White_Space) — the client mirrors
        // this with unicodeTrim so a NEL-padded title is not rejected as a
        // control character.
        let (pool, pid) = seeded_pool().await;

        let created = create(&pool, pid, &new_category_input("\u{85}Errands\u{85}"))
            .await
            .unwrap();

        assert_eq!(created.title, "Errands");
    }

    #[tokio::test]
    async fn create_defaults_color_to_the_primary_accent() {
        let (pool, pid) = seeded_pool().await;

        let created = create(&pool, pid, &new_category_input(TITLE_A))
            .await
            .unwrap();

        assert_eq!(created.color.as_deref(), Some(DEFAULT_CATEGORY_COLOR));
    }

    #[tokio::test]
    async fn create_rejects_blank_and_overlong_titles() {
        let (pool, pid) = seeded_pool().await;
        for title in ["   ", &"x".repeat(CATEGORY_TITLE_MAX_LEN + 1)] {
            assert!(
                create(&pool, pid, &new_category_input(title))
                    .await
                    .is_err()
            );
        }
        assert!(list(&pool, pid).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn create_rejects_an_overlong_description() {
        let (pool, pid) = seeded_pool().await;
        let mut input = new_category_input(TITLE_A);
        input.description = Some("x".repeat(CATEGORY_DESCRIPTION_MAX_LEN + 1));

        let err = create(&pool, pid, &input).await.unwrap_err();

        match err {
            crate::db::DbError::Validation { code, .. } => {
                assert_eq!(code, ErrorCode::CategoryDescriptionTooLong);
            }
            other => panic!("expected a validation error, got {other:?}"),
        }
        assert!(list(&pool, pid).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn create_accepts_a_description_at_the_bound() {
        let (pool, pid) = seeded_pool().await;
        let mut input = new_category_input(TITLE_A);
        input.description = Some("x".repeat(CATEGORY_DESCRIPTION_MAX_LEN));

        let created = create(&pool, pid, &input).await.unwrap();

        assert_eq!(
            created.description.map(|d| d.chars().count()),
            Some(CATEGORY_DESCRIPTION_MAX_LEN)
        );
    }

    #[tokio::test]
    async fn create_rejects_an_invalid_color() {
        let (pool, pid) = seeded_pool().await;
        let mut input = new_category_input(TITLE_A);
        input.color = Some("teal".into());

        let err = create(&pool, pid, &input).await.unwrap_err();

        match err {
            crate::db::DbError::Validation { code, .. } => {
                assert_eq!(code, ErrorCode::CategoryColorInvalid);
            }
            other => panic!("expected a validation error, got {other:?}"),
        }
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

    #[tokio::test]
    async fn set_threshold_persists_validates_and_clears() {
        let (pool, pid) = seeded_pool().await;
        let cid = new_category(&pool, pid, TITLE_A).await;
        // Set with an explicit color.
        set_threshold(&pool, pid, cid, Some(240), Some("#60a5fa".into()))
            .await
            .unwrap();
        let c = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|c| c.id == cid)
            .unwrap();
        assert_eq!(c.threshold_minutes, Some(240));
        assert_eq!(c.threshold_color.as_deref(), Some("#60a5fa"));
        // Boundary accepted.
        set_threshold(&pool, pid, cid, Some(1440), None)
            .await
            .unwrap();
        let c = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|c| c.id == cid)
            .unwrap();
        assert_eq!(c.threshold_minutes, Some(1440));
        // Out-of-range and negative rejected without mutating.
        for bad in [0, 1441, -5] {
            assert!(
                set_threshold(&pool, pid, cid, Some(bad), None)
                    .await
                    .is_err()
            );
        }
        let c = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|c| c.id == cid)
            .unwrap();
        assert_eq!(c.threshold_minutes, Some(1440));
        // Clearing the minutes clears the color too.
        set_threshold(&pool, pid, cid, None, None).await.unwrap();
        let c = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|c| c.id == cid)
            .unwrap();
        assert!(c.threshold_minutes.is_none());
        assert!(c.threshold_color.is_none());
    }

    #[tokio::test]
    async fn set_threshold_defaults_a_distinct_palette_hue() {
        let (pool, pid) = seeded_pool().await;
        let first = new_category(&pool, pid, "AAA").await;
        let second = new_category(&pool, pid, "ZZZ").await;
        set_threshold(&pool, pid, first, Some(120), None)
            .await
            .unwrap();
        set_threshold(&pool, pid, second, Some(60), None)
            .await
            .unwrap();
        let all = list(&pool, pid).await.unwrap();
        let c1 = all.iter().find(|c| c.id == first).unwrap();
        let c2 = all.iter().find(|c| c.id == second).unwrap();
        // §285: distinct categories get distinct palette hues.
        assert!(CATEGORY_PALETTE.contains(&c1.threshold_color.as_deref().unwrap()));
        assert!(CATEGORY_PALETTE.contains(&c2.threshold_color.as_deref().unwrap()));
        assert_ne!(c1.threshold_color, c2.threshold_color);
    }

    #[tokio::test]
    async fn set_threshold_is_scoped_and_errors_on_foreign_category() {
        let (pool, pid) = seeded_pool().await;
        let other: i64 = sqlx::query_scalar(
            "INSERT INTO profiles (name, week_start, work_days) VALUES ('other', 0, 31) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let foreign = new_category(&pool, other, TITLE_B).await;
        assert!(
            set_threshold(&pool, pid, foreign, Some(60), None)
                .await
                .is_err()
        );
        // And the foreign category keeps no threshold.
        let c = list(&pool, other)
            .await
            .unwrap()
            .into_iter()
            .find(|c| c.id == foreign)
            .unwrap();
        assert!(c.threshold_minutes.is_none());
    }
}
