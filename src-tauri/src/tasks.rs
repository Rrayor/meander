use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::Result;
use crate::errors::ErrorCode;

pub const TASK_TITLE_MAX_LEN: usize = 200;

#[nutype::nutype(
    sanitize(trim),
    validate(
        len_char_min = 1,
        len_char_max = TASK_TITLE_MAX_LEN,
        predicate = |s| !s.chars().any(char::is_control)
    ),
    derive(Debug, PartialEq)
)]
pub struct TaskTitle(String);

/// Spec: a description is optional and at most 20,000 characters (the
/// long-form field — deliberately larger than a note's 10,000 limit).
pub const TASK_DESCRIPTION_MAX_LEN: usize = 20_000;

#[nutype::nutype(
    sanitize(trim),
    validate(len_char_min = 1, len_char_max = TASK_DESCRIPTION_MAX_LEN),
    derive(Debug, PartialEq)
)]
pub struct TaskDescription(String);

/// Spec: durations are optional, but when present they are positive and at
/// most 24 hours — the schema enforces the same 1–1440 CHECK on both
/// estimated and spent minutes.
pub const MAX_DURATION_MINUTES: i64 = 24 * 60;

#[nutype::nutype(
    validate(greater = 0, less_or_equal = MAX_DURATION_MINUTES),
    derive(Debug, PartialEq)
)]
pub struct PositiveDuration(i64);

impl TaskTitle {
    /// Validates `name`; the error variants are mapped to our own vocabulary.
    pub fn parse(raw: &str) -> Result<Self> {
        Self::try_new(raw).map_err(|e| {
            let (code, message) = match e {
                TaskTitleError::LenCharMinViolated => (
                    ErrorCode::TaskTitleRequired,
                    "task title is required".into(),
                ),
                TaskTitleError::LenCharMaxViolated => (
                    ErrorCode::TaskTitleTooLong,
                    format!("task title must be {TASK_TITLE_MAX_LEN} characters or fewer"),
                ),
                _ => (
                    ErrorCode::TaskTitleInvalidCharacters,
                    "task title cannot contain control characters".into(),
                ),
            };
            crate::db::DbError::Validation { code, message }
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum CarryOverRule {
    Carry,
    Return,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum TaskPlacement {
    Backlog,
    WeeklyBacklog,
    Scheduled,
}

#[derive(Debug, Clone, Serialize, specta::Type, sqlx::FromRow)]
pub struct Task {
    pub id: i64,
    pub profile_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub carry_over_rule: Option<CarryOverRule>,
    pub estimated_minutes: Option<i64>,
    pub spent_minutes: Option<i64>,
    pub placement: TaskPlacement,
    pub scheduled_date: Option<String>,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Default, Deserialize, specta::Type)]
pub struct NewTask {
    pub title: String,
    pub description: Option<String>,
    pub estimated_minutes: Option<i64>,
    pub carry_over_rule: Option<CarryOverRule>,
}

/// Full-row update payload for the task detail view — every editable field
/// the spec lists (notes, categories, repetition come in later milestones).
#[derive(Debug, Deserialize, specta::Type)]
pub struct UpdateTask {
    pub title: String,
    pub description: Option<String>,
    pub estimated_minutes: Option<i64>,
    pub spent_minutes: Option<i64>,
    pub carry_over_rule: Option<CarryOverRule>,
    pub status: TaskStatus,
}

fn parse_description(raw: Option<&str>) -> Result<Option<String>> {
    Ok(raw
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(|d| {
            TaskDescription::try_new(d).map_err(|_| crate::db::DbError::Validation {
                code: ErrorCode::TaskDescriptionTooLong,
                message: format!(
                    "task description must be {TASK_DESCRIPTION_MAX_LEN} characters or fewer"
                ),
            })
        })
        .transpose()?
        .map(TaskDescription::into_inner))
}

fn parse_estimate(raw: Option<i64>) -> Result<Option<i64>> {
    Ok(raw
        .map(PositiveDuration::try_new)
        .transpose()
        .map_err(|_| crate::db::DbError::Validation {
            code: ErrorCode::EstimatedTimeOutOfRange,
            message: format!(
                "estimated time must be between 1 minute and {} hours",
                MAX_DURATION_MINUTES / 60
            ),
        })?
        .map(PositiveDuration::into_inner))
}

fn parse_spent(raw: Option<i64>) -> Result<Option<i64>> {
    Ok(raw
        .map(PositiveDuration::try_new)
        .transpose()
        .map_err(|_| crate::db::DbError::Validation {
            code: ErrorCode::SpentTimeOutOfRange,
            message: format!(
                "spent time must be between 1 minute and {} hours",
                MAX_DURATION_MINUTES / 60
            ),
        })?
        .map(PositiveDuration::into_inner))
}

pub async fn create(pool: &SqlitePool, profile_id: i64, input: &NewTask) -> Result<Task> {
    let title = TaskTitle::parse(&input.title)?.into_inner();
    let description = parse_description(input.description.as_deref())?;
    let estimated = parse_estimate(input.estimated_minutes)?;
    let result = sqlx::query(
        "INSERT INTO tasks (profile_id, title, description, estimated_minutes, carry_over_rule, sort_order)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
    )
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(estimated)
    .bind(input.carry_over_rule)
    .bind(profile_id)
    .execute(pool)
    .await?;
    get(pool, result.last_insert_rowid()).await
}

/// Smallest representable gap before the midpoint collapses onto a boundary.
const MIN_SORT_GAP: f64 = 1e-6;

const TASK_NOT_FOUND_MESSAGE: &str = "task does not exist";

fn task_not_found() -> crate::db::DbError {
    crate::db::DbError::Validation {
        code: ErrorCode::TaskNotFound,
        message: TASK_NOT_FOUND_MESSAGE.into(),
    }
}

/// Validates that `id` is an existing task owned by `profile_id` — shared
/// by every operation that targets a single task (update, delete, category
/// association).
pub(crate) async fn ensure_exists(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<()> {
    sort_order_of(pool, profile_id, id).await.map(|_| ())
}

async fn sort_order_of(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<f64> {
    let row: Option<(f64,)> =
        sqlx::query_as("SELECT sort_order FROM tasks WHERE id = ? AND profile_id = ?")
            .bind(id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await?;
    row.map(|r| r.0).ok_or_else(task_not_found)
}

/// Moves `task_id` between `before_id` and `after_id` (either may be `None`
/// for the list edges) by assigning the midpoint `sort_order`. Works on any
/// slice of the backlog — only the drop neighbours are needed.
pub async fn move_task(
    pool: &SqlitePool,
    profile_id: i64,
    task_id: i64,
    before_id: Option<i64>,
    after_id: Option<i64>,
) -> Result<()> {
    if before_id.is_none() && after_id.is_none() {
        sort_order_of(pool, profile_id, task_id).await?;
        return Ok(());
    }
    let (low, high) = match (before_id, after_id) {
        (None, None) => unreachable!("handled above"),
        (None, Some(after)) => {
            let a = sort_order_of(pool, profile_id, after).await?;
            (a - 1.0, a)
        }
        (Some(before), None) => {
            let b = sort_order_of(pool, profile_id, before).await?;
            (b, b + 1.0)
        }
        (Some(before), Some(after)) => {
            let b = sort_order_of(pool, profile_id, before).await?;
            let a = sort_order_of(pool, profile_id, after).await?;
            if b >= a {
                return Err(crate::db::DbError::Validation {
                    code: ErrorCode::ReorderAnchorsNotAdjacent,
                    message: "reorder anchors are not adjacent in order".into(),
                });
            }
            (b, a)
        }
    };
    let position = low + (high - low) / 2.0;
    if high - low < MIN_SORT_GAP {
        // Gap exhausted: renormalize the profile's order, then retry midpoint.
        let ids: Vec<i64> =
            sqlx::query_scalar("SELECT id FROM tasks WHERE profile_id = ? ORDER BY sort_order, id")
                .bind(profile_id)
                .fetch_all(pool)
                .await?;
        for (index, id) in ids.iter().enumerate() {
            sqlx::query("UPDATE tasks SET sort_order = ? WHERE id = ?")
                .bind((index + 1) as f64)
                .bind(id)
                .execute(pool)
                .await?;
        }
        return Box::pin(move_task(pool, profile_id, task_id, before_id, after_id)).await;
    }
    sqlx::query("UPDATE tasks SET sort_order = ? WHERE id = ?")
        .bind(position)
        .bind(task_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Full-row update scoped to the owning profile; bumps `updated_at`.
/// Unknown ids — including another profile's task — are an error.
pub async fn update(
    pool: &SqlitePool,
    profile_id: i64,
    id: i64,
    input: &UpdateTask,
) -> Result<Task> {
    let title = TaskTitle::parse(&input.title)?.into_inner();
    let description = parse_description(input.description.as_deref())?;
    let estimated = parse_estimate(input.estimated_minutes)?;
    let spent = parse_spent(input.spent_minutes)?;
    let result = sqlx::query(
        "UPDATE tasks SET title = ?, description = ?, estimated_minutes = ?, spent_minutes = ?,
         carry_over_rule = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND profile_id = ?",
    )
    .bind(title)
    .bind(description)
    .bind(estimated)
    .bind(spent)
    .bind(input.carry_over_rule)
    .bind(input.status)
    .bind(id)
    .bind(profile_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    get(pool, id).await
}

/// Deletes a task scoped to its owning profile. Deleting an unknown id — or
/// another profile's task — is an error, not a silent no-op.
pub async fn delete(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM tasks WHERE id = ? AND profile_id = ?")
        .bind(id)
        .bind(profile_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    Ok(())
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Task> {
    Ok(
        sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?,
    )
}

pub async fn list(pool: &SqlitePool, profile_id: i64) -> Result<Vec<Task>> {
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? ORDER BY sort_order, id",
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
            "meander-tasks-test-{}-{nanos}.db",
            std::process::id()
        ))
    }

    async fn seeded_pool() -> (SqlitePool, i64) {
        let pool = crate::db::connect(&temp_db_path()).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let profile_id = crate::profiles::list(&pool).await.unwrap()[0].id;
        (pool, profile_id)
    }

    async fn titles(pool: &SqlitePool, profile_id: i64) -> Vec<String> {
        list(pool, profile_id)
            .await
            .unwrap()
            .iter()
            .map(|t| t.title.clone())
            .collect()
    }

    const TITLE_A: &str = "A";
    const TITLE_B: &str = "B";
    const TITLE_C: &str = "C";

    fn task(title: &str) -> NewTask {
        NewTask {
            title: title.to_string(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn move_without_anchors_keeps_position() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        create(&pool, pid, &task(TITLE_B)).await.unwrap();
        let a = list(&pool, pid).await.unwrap()[0].id;

        move_task(&pool, pid, a, None, None).await.unwrap();

        assert_eq!(titles(&pool, pid).await, vec![TITLE_A, TITLE_B]);
    }

    #[tokio::test]
    async fn move_with_reversed_anchors_fails() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        create(&pool, pid, &task(TITLE_B)).await.unwrap();
        create(&pool, pid, &task(TITLE_C)).await.unwrap();
        let ids: Vec<i64> = list(&pool, pid)
            .await
            .unwrap()
            .iter()
            .map(|t| t.id)
            .collect();

        // before=C (sort 3) after=B (sort 2): b >= a, anchors inverted.
        let err = move_task(&pool, pid, ids[0], Some(ids[2]), Some(ids[1]))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::ReorderAnchorsNotAdjacent,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn move_renormalizes_when_the_gap_is_exhausted() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        create(&pool, pid, &task(TITLE_B)).await.unwrap();
        create(&pool, pid, &task(TITLE_C)).await.unwrap();
        let ids: Vec<i64> = list(&pool, pid)
            .await
            .unwrap()
            .iter()
            .map(|t| t.id)
            .collect();

        // Exhaust the gap between B and C so the midpoint can't fit.
        sqlx::query("UPDATE tasks SET sort_order = ? WHERE id = ?")
            .bind(1.0)
            .bind(ids[1])
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE tasks SET sort_order = ? WHERE id = ?")
            .bind(1.0 + MIN_SORT_GAP / 2.0)
            .bind(ids[2])
            .execute(&pool)
            .await
            .unwrap();

        move_task(&pool, pid, ids[0], Some(ids[1]), Some(ids[2]))
            .await
            .unwrap();

        assert_eq!(titles(&pool, pid).await, vec![TITLE_B, TITLE_A, TITLE_C]);
    }

    #[tokio::test]
    async fn delete_removes_the_task() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        create(&pool, pid, &task(TITLE_B)).await.unwrap();
        let a = list(&pool, pid).await.unwrap()[0].id;

        delete(&pool, pid, a).await.unwrap();

        assert_eq!(titles(&pool, pid).await, vec![TITLE_B]);
    }

    #[tokio::test]
    async fn delete_rejects_an_unknown_task() {
        let (pool, pid) = seeded_pool().await;

        let err = delete(&pool, pid, 999).await.unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::TaskNotFound,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn delete_rejects_another_profiles_task() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        create(&pool, other.id, &task(TITLE_A)).await.unwrap();
        let foreign = list(&pool, other.id).await.unwrap()[0].id;

        let err = delete(&pool, pid, foreign).await.unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::TaskNotFound,
                ..
            }
        ));
        // The foreign task is untouched.
        assert_eq!(titles(&pool, other.id).await, vec![TITLE_A]);
    }

    const TITLE_UPDATED: &str = "Renamed";
    const DESCRIPTION_UPDATED: &str = "new notes";

    fn update_payload(task: &Task) -> UpdateTask {
        UpdateTask {
            title: task.title.clone(),
            description: task.description.clone(),
            estimated_minutes: task.estimated_minutes,
            spent_minutes: task.spent_minutes,
            carry_over_rule: task.carry_over_rule,
            status: task.status,
        }
    }

    #[tokio::test]
    async fn update_persists_every_editable_field_and_bumps_updated_at() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        let original = list(&pool, pid).await.unwrap()[0].clone();
        // Ensure the timestamp tick differs.
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

        let updated = update(
            &pool,
            pid,
            original.id,
            &UpdateTask {
                title: TITLE_UPDATED.into(),
                description: Some(DESCRIPTION_UPDATED.into()),
                estimated_minutes: Some(90),
                spent_minutes: Some(15),
                carry_over_rule: Some(CarryOverRule::Carry),
                status: TaskStatus::InProgress,
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.title, TITLE_UPDATED);
        assert_eq!(updated.description.as_deref(), Some(DESCRIPTION_UPDATED));
        assert_eq!(updated.estimated_minutes, Some(90));
        assert_eq!(updated.spent_minutes, Some(15));
        assert_eq!(updated.carry_over_rule, Some(CarryOverRule::Carry));
        assert_eq!(updated.status, TaskStatus::InProgress);
        assert_eq!(updated.created_at, original.created_at);
        assert_ne!(updated.updated_at, original.updated_at);
    }

    #[tokio::test]
    async fn update_rejects_an_unknown_task() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        let existing = list(&pool, pid).await.unwrap()[0].clone();

        let err = update(&pool, pid, 999, &update_payload(&existing))
            .await
            .unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::TaskNotFound,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn update_rejects_another_profiles_task() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Work").await.unwrap();
        create(&pool, other.id, &task(TITLE_A)).await.unwrap();
        let foreign = list(&pool, other.id).await.unwrap()[0].clone();

        let err = update(&pool, pid, foreign.id, &update_payload(&foreign))
            .await
            .unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::TaskNotFound,
                ..
            }
        ));
        assert_eq!(titles(&pool, other.id).await, vec![TITLE_A]);
    }

    #[tokio::test]
    async fn update_rejects_out_of_range_spent_time() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        let existing = list(&pool, pid).await.unwrap()[0].clone();
        // The schema CHECK allows 1–1440 minutes; the service must reject
        // out-of-range values before they hit SQLite as opaque errors.
        for bad in [-5, 0, MAX_DURATION_MINUTES + 1] {
            let err = update(
                &pool,
                pid,
                existing.id,
                &UpdateTask {
                    spent_minutes: Some(bad),
                    ..update_payload(&existing)
                },
            )
            .await
            .unwrap_err();

            assert!(matches!(
                err,
                crate::db::DbError::Validation {
                    code: ErrorCode::SpentTimeOutOfRange,
                    ..
                }
            ));
        }
    }

    #[tokio::test]
    async fn update_revalidates_the_title() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        let existing = list(&pool, pid).await.unwrap()[0].clone();

        let err = update(
            &pool,
            pid,
            existing.id,
            &UpdateTask {
                title: "   ".into(),
                ..update_payload(&existing)
            },
        )
        .await
        .unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::TaskTitleRequired,
                ..
            }
        ));
    }
}
