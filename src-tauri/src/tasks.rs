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
    /// Set when this task is an instance of a repeating-task series.
    pub series_id: Option<i64>,
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
    /// A repetition schedule turns this into a series plus its first
    /// instance — the returned task is already linked (spec §140).
    pub series: Option<crate::series::NewSeries>,
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
    /// Adding a schedule to a plain task attaches it to a new series;
    /// a task already linked to a series rejects this (series editing is
    /// a later milestone).
    pub series: Option<crate::series::NewSeries>,
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

pub(crate) fn parse_estimate(raw: Option<i64>) -> Result<Option<i64>> {
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

/// The series a schedule describes shares the task's fields — its first
/// instance is this task.
fn series_fields<'a>(
    title: &'a str,
    description: Option<&'a str>,
    carry_over_rule: Option<CarryOverRule>,
    estimated_minutes: Option<i64>,
    series: &'a crate::series::NewSeries,
) -> crate::series::SeriesFields<'a> {
    crate::series::SeriesFields {
        title,
        description,
        carry_over_rule,
        estimated_minutes,
        series,
    }
}

/// The date the first instance occupies — the series' first occurrence,
/// which is the start date only when the recurrence matches it. A schedule
/// that can never occur through its end date is rejected.
fn first_instance_date(series: &crate::series::TaskSeries) -> Result<String> {
    crate::series::first_occurrence(
        &series.recurrence,
        &series.start_date,
        series.end_date.as_deref(),
    )
    .ok_or_else(|| crate::db::DbError::Validation {
        code: ErrorCode::RecurrenceInvalid,
        message: "the schedule has no occurrence on or before its end date".into(),
    })
}

pub async fn create(pool: &SqlitePool, profile_id: i64, input: &NewTask) -> Result<Task> {
    let title = TaskTitle::parse(&input.title)?.into_inner();
    let description = parse_description(input.description.as_deref())?;
    let estimated = parse_estimate(input.estimated_minutes)?;
    let mut tx = pool.begin().await?;
    // When a schedule links the task to a series, both rows must carry the
    // same policy — the series normalizes an unset rule to Return (spec
    // §95), so the first instance binds that same effective value.
    let carry_over = if input.series.is_some() {
        Some(input.carry_over_rule.unwrap_or(CarryOverRule::Return))
    } else {
        input.carry_over_rule
    };
    let saved_series = match &input.series {
        Some(series) => Some(
            crate::series::insert(
                &mut tx,
                profile_id,
                &series_fields(
                    &title,
                    description.as_deref(),
                    carry_over,
                    estimated,
                    series,
                ),
            )
            .await?,
        ),
        None => None,
    };
    // A schedule's first instance occupies the series' first occurrence —
    // the details view's calendar locates instances by scheduled_date.
    let first_date = saved_series.as_ref().map(first_instance_date).transpose()?;
    let series_id = saved_series.as_ref().map(|s| s.id);
    let result = sqlx::query(
        "INSERT INTO tasks (profile_id, title, description, estimated_minutes, carry_over_rule, series_id, scheduled_date, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
    )
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(estimated)
    .bind(carry_over)
    .bind(series_id)
    .bind(first_date)
    .bind(profile_id)
    .execute(&mut *tx)
    .await?;
    let id = result.last_insert_rowid();
    tx.commit().await?;
    get(pool, id).await
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
    let mut tx = pool.begin().await?;
    // Attaching a series shares the series' normalized policy with the
    // instance — an unset rule means Return for both (spec §95).
    let carry_over = if input.series.is_some() {
        Some(input.carry_over_rule.unwrap_or(CarryOverRule::Return))
    } else {
        input.carry_over_rule
    };
    if let Some(series) = &input.series {
        // A schedule on a plain task links it to a new series; on an
        // already-linked task the schedule belongs to the series —
        // editing it is the series milestone's scope.
        let linked: Option<i64> =
            sqlx::query_scalar("SELECT series_id FROM tasks WHERE id = ? AND profile_id = ?")
                .bind(id)
                .bind(profile_id)
                .fetch_optional(&mut *tx)
                .await?
                .flatten();
        match linked {
            None => {
                let saved_series = crate::series::insert(
                    &mut tx,
                    profile_id,
                    &series_fields(
                        &title,
                        description.as_deref(),
                        carry_over,
                        estimated,
                        series,
                    ),
                )
                .await?;
                let series_id = saved_series.id;
                // The existing task becomes the first occurrence's instance.
                sqlx::query("UPDATE tasks SET series_id = ?, scheduled_date = ? WHERE id = ?")
                    .bind(series_id)
                    .bind(first_instance_date(&saved_series)?)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            Some(_) => {
                return Err(crate::db::DbError::Validation {
                    code: ErrorCode::AlreadyInSeries,
                    message: "the task's schedule lives on its series".into(),
                });
            }
        }
    }
    let result = sqlx::query(
        "UPDATE tasks SET title = ?, description = ?, estimated_minutes = ?, spent_minutes = ?,
         carry_over_rule = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND profile_id = ?",
    )
    .bind(title)
    .bind(description)
    .bind(estimated)
    .bind(spent)
    .bind(carry_over)
    .bind(input.status)
    .bind(id)
    .bind(profile_id)
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    tx.commit().await?;
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

/// Persisted instances of one series, oldest first — the details view's
/// calendar reads these to tell real instances from merely-scheduled dates.
pub async fn list_instances(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
) -> Result<Vec<Task>> {
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? AND series_id = ? ORDER BY scheduled_date, id",
    )
    .bind(profile_id)
    .bind(series_id)
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
            series: None,
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
                series: None,
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

    // A Monday — the weekly fixture starts on a matching weekday so the
    // first instance lands on the start date itself.
    const SCHEDULE_START: &str = "2026-10-19";

    fn weekly_schedule() -> crate::series::NewSeries {
        crate::series::NewSeries {
            recurrence: serde_json::to_value(crate::series::Recurrence::Weekly {
                interval_weeks: 1,
                weekdays: vec![crate::series::Weekday::Monday],
            })
            .unwrap(),
            start_date: SCHEDULE_START.to_string(),
            end_date: None,
        }
    }

    #[tokio::test]
    async fn create_with_a_schedule_links_the_task_as_first_instance() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.into(),
                series: Some(weekly_schedule()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        assert!(task.series_id.is_some());
        let series_list = crate::series::list(&pool, pid).await.unwrap();
        assert_eq!(series_list.len(), 1);
        assert_eq!(series_list[0].id, task.series_id.unwrap());
        assert_eq!(series_list[0].title, TITLE_A);
        // The instance and its series must carry the same policy — an unset
        // rule normalizes to Return on both (spec §95).
        assert_eq!(task.carry_over_rule, Some(CarryOverRule::Return));
        assert_eq!(series_list[0].carry_over_rule, CarryOverRule::Return);
        // The first instance occupies the series start date.
        assert_eq!(task.scheduled_date.as_deref(), Some(SCHEDULE_START));
    }

    #[tokio::test]
    async fn a_schedule_with_no_occurrence_through_its_end_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        // Wednesday-only, ending Monday — the schedule can never occur.
        let mut schedule = weekly_schedule();
        schedule.recurrence = serde_json::to_value(crate::series::Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![crate::series::Weekday::Wednesday],
        })
        .unwrap();
        schedule.end_date = Some(SCHEDULE_START.to_string());

        let err = create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.into(),
                series: Some(schedule),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::RecurrenceInvalid,
                ..
            }
        ));
        // Both writes roll back — no half-created series remains.
        assert_eq!(list(&pool, pid).await.unwrap().len(), 0);
        assert_eq!(crate::series::list(&pool, pid).await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn list_instances_returns_a_series_tasks_in_date_order() {
        let (pool, pid) = seeded_pool().await;
        let first = create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.into(),
                series: Some(weekly_schedule()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let sid = first.series_id.unwrap();
        // A second, later instance of the same series, and an unrelated
        // task that must not leak in. The first instance is dated by create.
        assert_eq!(first.scheduled_date.as_deref(), Some(SCHEDULE_START));
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, series_id, scheduled_date, sort_order) \
             VALUES (?, ?, ?, '2026-10-26', ?)",
        )
        .bind(pid)
        .bind(TITLE_B)
        .bind(sid)
        .bind(99.0)
        .execute(&pool)
        .await
        .unwrap();
        create(&pool, pid, &task(TITLE_C)).await.unwrap();

        let instances = list_instances(&pool, pid, sid).await.unwrap();
        let names: Vec<&str> = instances.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(names, vec![TITLE_A, TITLE_B]);
    }

    #[tokio::test]
    async fn list_instances_is_scoped_to_the_owning_profile() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "Other").await.unwrap();
        let foreign = create(
            &pool,
            other.id,
            &NewTask {
                title: TITLE_A.into(),
                series: Some(weekly_schedule()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        assert!(
            list_instances(&pool, pid, foreign.series_id.unwrap())
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn update_with_a_schedule_links_the_existing_task() {
        let (pool, pid) = seeded_pool().await;
        create(&pool, pid, &task(TITLE_A)).await.unwrap();
        let existing = list(&pool, pid).await.unwrap()[0].clone();
        assert!(existing.series_id.is_none());

        let updated = update(
            &pool,
            pid,
            existing.id,
            &UpdateTask {
                series: Some(weekly_schedule()),
                ..update_payload(&existing)
            },
        )
        .await
        .unwrap();

        assert!(updated.series_id.is_some());
        // Instance fields are untouched — the task only gained a link and
        // the normalized carry-over policy shared with its series.
        assert_eq!(updated.status, existing.status);
        assert_eq!(updated.placement, existing.placement);
        assert_eq!(updated.sort_order, existing.sort_order);
        assert_eq!(updated.carry_over_rule, Some(CarryOverRule::Return));
        // The existing task becomes the start date's instance.
        assert_eq!(updated.scheduled_date.as_deref(), Some(SCHEDULE_START));
    }

    #[tokio::test]
    async fn update_with_a_schedule_on_a_linked_task_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.into(),
                series: Some(weekly_schedule()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let linked = list(&pool, pid).await.unwrap()[0].clone();

        let err = update(
            &pool,
            pid,
            linked.id,
            &UpdateTask {
                series: Some(weekly_schedule()),
                ..update_payload(&linked)
            },
        )
        .await
        .unwrap_err();

        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::AlreadyInSeries,
                ..
            }
        ));
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
