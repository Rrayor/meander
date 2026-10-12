use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::Result;

#[nutype::nutype(
    sanitize(trim),
    validate(
        len_char_min = 1,
        len_char_max = 200,
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
                    "task title must be 200 characters or fewer".into()
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
    pub created_at: String,
    pub updated_at: String,
}

pub async fn create(pool: &SqlitePool, profile_id: i64, title: &str) -> Result<Task> {
    let title = TaskTitle::parse(title)?.into_inner();
    let result = sqlx::query("INSERT INTO tasks (profile_id, title) VALUES (?, ?)")
        .bind(profile_id)
        .bind(title)
        .execute(pool)
        .await?;
    get(pool, result.last_insert_rowid()).await
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
    Ok(
        sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE profile_id = ? ORDER BY id")
            .bind(profile_id)
            .fetch_all(pool)
            .await?,
    )
}
