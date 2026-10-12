use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::Result;

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

impl TaskTitle {
    /// Validates `name`; the error variants are mapped to our own vocabulary.
    pub fn parse(raw: &str) -> Result<Self> {
        Self::try_new(raw).map_err(|e| {
            crate::db::DbError::Validation(match e {
                TaskTitleError::LenCharMinViolated => "task title is required".into(),
                TaskTitleError::LenCharMaxViolated => {
                    format!("task title must be {TASK_TITLE_MAX_LEN} characters or fewer")
                }
                _ => "task title cannot contain control characters".into(),
            })
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
    if input.estimated_minutes.is_some_and(|m| m < 0) {
        return Err(crate::db::DbError::Validation(
            "estimated time cannot be negative".into(),
        ));
    }
    let result = sqlx::query(
        "INSERT INTO tasks (profile_id, title, description, estimated_minutes, sort_order)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
    )
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(input.estimated_minutes)
    .bind(profile_id)
    .execute(pool)
    .await?;
    get(pool, result.last_insert_rowid()).await
}

/// Rewrites the manual order of a profile's tasks. `ordered_ids` must list
/// every task of the profile exactly once; anything else is a validation error
/// rather than a partial reorder.
pub async fn reorder(pool: &SqlitePool, profile_id: i64, ordered_ids: &[i64]) -> Result<()> {
    let existing = list(pool, profile_id).await?;
    let mut expected: Vec<i64> = existing.iter().map(|t| t.id).collect();
    let mut given = ordered_ids.to_vec();
    expected.sort_unstable();
    given.sort_unstable();
    if expected != given {
        return Err(crate::db::DbError::Validation(
            "reorder must list every task of the profile exactly once".into(),
        ));
    }
    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE tasks SET sort_order = ? WHERE id = ? AND profile_id = ?")
            .bind((index + 1) as f64)
            .bind(id)
            .bind(profile_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
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
