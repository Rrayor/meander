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

/// Spec: durations are optional, but when present they are positive and at
/// most 24 hours.
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

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
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
}

pub async fn create(pool: &SqlitePool, profile_id: i64, input: &NewTask) -> Result<Task> {
    let title = TaskTitle::parse(&input.title)?.into_inner();
    let description = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(str::to_owned);
    let estimated = input
        .estimated_minutes
        .map(PositiveDuration::try_new)
        .transpose()
        .map_err(|_| crate::db::DbError::Validation {
            code: ErrorCode::EstimatedTimeOutOfRange,
            message: "estimated time must be between 1 minute and 24 hours".into(),
        })?
        .map(PositiveDuration::into_inner);
    let result = sqlx::query(
        "INSERT INTO tasks (profile_id, title, description, estimated_minutes, sort_order)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
    )
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(estimated)
    .bind(profile_id)
    .execute(pool)
    .await?;
    get(pool, result.last_insert_rowid()).await
}

/// Smallest representable gap before the midpoint collapses onto a boundary.
const MIN_SORT_GAP: f64 = 1e-6;

async fn sort_order_of(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<f64> {
    let row: Option<(f64,)> =
        sqlx::query_as("SELECT sort_order FROM tasks WHERE id = ? AND profile_id = ?")
            .bind(id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await?;
    row.map(|r| r.0)
        .ok_or_else(|| crate::db::DbError::Validation {
            code: ErrorCode::TaskNotFound,
            message: "task does not exist".into(),
        })
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
    let current = sort_order_of(pool, profile_id, task_id).await?;
    let (low, high) = match (before_id, after_id) {
        (None, None) => (current, current),
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
