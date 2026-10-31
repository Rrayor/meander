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

pub use crate::validation::{MAX_DURATION_MINUTES, PositiveDuration};

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

// Canonical home is validation; re-exported so internal call sites
// stay short.
pub(crate) use crate::validation::parse_estimate;

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

/// Public task-domain service: validates that `id` is an existing task
/// owned by `profile_id`. Other feature modules legitimately consume it
/// to verify association targets (e.g. categories attaching to a task);
/// it is not an internal detail to bypass or duplicate.
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

/// Series rows sharing a family: the living row plus every segment it
/// succeeded. `succeeded_by` always points at the living row directly.
const FAMILY_IDS: &str = "SELECT id FROM task_series WHERE COALESCE(succeeded_by, id) = \
    COALESCE((SELECT succeeded_by FROM task_series WHERE id = ?), ?)";

/// An instance row exists for this date anywhere in the family —
/// prevents a segment and the living series materializing a seam date
/// twice, and matches `list_instances`' segment-aware resolution.
async fn instance_in_family(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: i64,
    series_id: i64,
    date: &str,
) -> Result<bool> {
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND scheduled_date = ? \
         AND series_id IN ({FAMILY_IDS})"
    ))
    .bind(profile_id)
    .bind(date)
    .bind(series_id)
    .bind(series_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count > 0)
}

/// The date was individually deleted somewhere in the family — the
/// board's materialization must not resurrect it (spec §152).
async fn skipped_in_family(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    series_id: i64,
    date: &str,
) -> Result<bool> {
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM skipped_instances WHERE scheduled_date = ? \
         AND series_id IN ({FAMILY_IDS})"
    ))
    .bind(date)
    .bind(series_id)
    .bind(series_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count > 0)
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

/// Moves a backlog task onto the current week's board: it joins the
/// "Weekly backlog" column (spec §24 — tasks pending but not yet
/// day-assigned). The scheduled date always clears — a picked day is a
/// separate action, not part of adding to the week.
pub async fn add_to_week(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<Task> {
    let result = sqlx::query(
        "UPDATE tasks SET placement = 'weekly_backlog', scheduled_date = NULL,          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?          AND placement = 'backlog'",
    )
    .bind(id)
    .bind(profile_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    get(pool, id).await
}

/// Schedules a standalone task for an arbitrary date (spec §228 — any date
/// may be used, not just the current week). A persisted series instance
/// redates its row — the moved occurrence deviates from cadence and is
/// used instead of a freshly materialized one (spec §228/§231).
/// Dates a series has dropped — tombstones from skips, deletions, or
/// moved-away instances. The details calendar needs them: a vacated
/// date is no longer "expected", so it must not draw the scheduled dot.
pub async fn skipped_dates(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT si.scheduled_date FROM skipped_instances si          JOIN task_series ts ON ts.id = si.series_id          WHERE ts.profile_id = ? AND si.series_id IN ({FAMILY_IDS})",
    ))
    .bind(profile_id)
    .bind(series_id)
    .bind(series_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

pub async fn schedule(pool: &SqlitePool, profile_id: i64, id: i64, date: &str) -> Result<Task> {
    crate::validation::iso_date(date, ErrorCode::ScheduledDateInvalid, "date")?;
    let mut tx = pool.begin().await?;
    let before: Option<(Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT series_id, scheduled_date FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let result = sqlx::query(
        "UPDATE tasks SET placement = 'scheduled', scheduled_date = ?,          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?          AND (placement != 'scheduled' OR scheduled_date != ?)",
    )
    .bind(date)
    .bind(id)
    .bind(profile_id)
    .bind(date)
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    let (moved_series, old_date) = before.unwrap_or((None, None));
    // A series instance moved off a cadence date must not rematerialize
    // there — tombstone the old date like a return to backlog would
    // (spec §148/§153), or the board shows the task twice.
    if let Some(sid) = moved_series
        && let Some(od) = old_date.as_deref()
        && od != date
    {
        sqlx::query(
            "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date) VALUES (?, ?)",
        )
        .bind(sid)
        .bind(od)
        .execute(&mut *tx)
        .await?;
    }
    // Another persisted occurrence already owns the destination slot —
    // landing a second one would duplicate the occurrence on the board.
    if let Some(moved_series) = moved_series {
        let occupied: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND id != ?              AND series_id IN ({FAMILY_IDS}) AND scheduled_date = ?",
        ))
        .bind(profile_id)
        .bind(id)
        .bind(moved_series)
        .bind(moved_series)
        .bind(date)
        .fetch_one(&mut *tx)
        .await?;
        if occupied > 0 {
            return Err(crate::db::DbError::Validation {
                code: ErrorCode::InstanceDateOccupied,
                message: "another instance of the series already occupies that date".into(),
            });
        }
    }
    tx.commit().await?;
    get(pool, id).await
}

/// Moves a scheduled-but-unpersisted occurrence atomically (spec §228):
/// materializes the row and redates it in one transaction, so a rejected
/// move cannot leave a stray instance behind. The tombstone vacates the
/// cadence date the same way a persisted-instance move does.
pub async fn schedule_occurrence(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
    date: &str,
    new_date: &str,
) -> Result<Task> {
    crate::validation::iso_date(new_date, ErrorCode::ScheduledDateInvalid, "date")?;
    crate::validation::iso_date(date, ErrorCode::InstanceDateInvalid, "date")?;
    let all = crate::series::list(pool, profile_id).await?;
    let root = |s: &crate::series::TaskSeries| s.succeeded_by.unwrap_or(s.id);
    let family_root = all
        .iter()
        .find(|s| s.id == series_id)
        .ok_or_else(|| crate::db::DbError::Validation {
            code: ErrorCode::SeriesNotFound,
            message: "the series does not exist".into(),
        })
        .map(root)?;
    let series = all
        .iter()
        .find(|s| {
            root(s) == family_root
                && crate::series::occurs_on(
                    &s.recurrence,
                    &s.start_date,
                    s.end_date.as_deref(),
                    date,
                )
        })
        .ok_or_else(|| crate::db::DbError::Validation {
            code: ErrorCode::InstanceDateNotScheduled,
            message: "the date is not a scheduled occurrence of this series".into(),
        })?;
    let mut tx = pool.begin().await?;
    // A board that already materialized this occurrence owns the row —
    // move it rather than inserting a duplicate for the same date.
    let existing: Option<i64> = sqlx::query_scalar(&format!(
        "SELECT id FROM tasks WHERE profile_id = ? AND scheduled_date = ?          AND series_id IN ({FAMILY_IDS})",
    ))
    .bind(profile_id)
    .bind(date)
    .bind(series.id)
    .bind(series.id)
    .fetch_optional(&mut *tx)
    .await?;
    let occupied: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND id != ?          AND series_id IN ({FAMILY_IDS}) AND scheduled_date = ?",
    ))
    .bind(profile_id)
    .bind(existing.unwrap_or(-1))
    .bind(series.id)
    .bind(series.id)
    .bind(new_date)
    .fetch_one(&mut *tx)
    .await?;
    if occupied > 0 {
        return Err(crate::db::DbError::Validation {
            code: ErrorCode::InstanceDateOccupied,
            message: "another instance of the series already occupies that date".into(),
        });
    }
    let moved_id = match existing {
        Some(id) => id,
        None => insert_instance(&mut tx, profile_id, series, date).await?.id,
    };
    sqlx::query("UPDATE tasks SET placement = 'scheduled', scheduled_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(new_date)
        .bind(moved_id)
        .execute(&mut *tx)
        .await?;
    // A same-date move is a no-op semantically — tombstoning would mark
    // the row's own destination as skipped and hide it from the board.
    if date != new_date {
        sqlx::query(
            "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date) VALUES (?, ?)",
        )
        .bind(series.id)
        .bind(date)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    get(pool, moved_id).await
}

/// Returns a task from the board to the backlog (spec §25 — any task in the
/// current week, weekly backlog or day-scheduled alike). Already-backlogged
/// or unknown ids are errors, not silent no-ops.
pub async fn return_to_backlog(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<Task> {
    let mut tx = pool.begin().await?;
    let task: Option<(Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT series_id, scheduled_date FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let result = sqlx::query(
        "UPDATE tasks SET placement = 'backlog', scheduled_date = NULL, series_id = NULL,          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?          AND placement != 'backlog'",
    )
    .bind(id)
    .bind(profile_id)
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    // A dated series instance that gets pulled back is "gone" from that
    // date, same as a deleted one — the tombstone keeps the board's
    // materialization from recreating the occurrence (spec §148/§153).
    if let Some((Some(series_id), Some(date))) = task {
        sqlx::query(
            "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date) VALUES (?, ?)",
        )
        .bind(series_id)
        .bind(date)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    get(pool, id).await
}

/// One-gesture board move (spec §314/§328): a drop changes placement,
/// scheduled date and status together. Series-instance date moves keep
/// the same tombstone and occupancy rules as `schedule`.
pub async fn board_move(
    pool: &SqlitePool,
    profile_id: i64,
    id: i64,
    placement: TaskPlacement,
    date: Option<&str>,
    status: TaskStatus,
) -> Result<Task> {
    // Placement and date must agree — a backlog row with a date would
    // show in both views, and a dated cell drop without a date cannot
    // exist (spec §312/§336).
    match (placement, date) {
        (TaskPlacement::Scheduled, Some(d)) => {
            crate::validation::iso_date(d, ErrorCode::ScheduledDateInvalid, "date")?;
        }
        (TaskPlacement::Scheduled, None)
        | (TaskPlacement::Backlog, Some(_))
        | (TaskPlacement::WeeklyBacklog, Some(_)) => {
            return Err(crate::db::DbError::Validation {
                code: ErrorCode::ScheduledDateInvalid,
                message: "the placement and date do not match".into(),
            });
        }
        _ => {}
    }
    let mut tx = pool.begin().await?;
    let before: Option<(Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT series_id, scheduled_date FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let result = sqlx::query(
        "UPDATE tasks SET placement = ?, scheduled_date = ?, status = ?,          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?",
    )
    .bind(placement)
    .bind(date)
    .bind(status)
    .bind(id)
    .bind(profile_id)
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    let (moved_series, old_date) = before.unwrap_or((None, None));
    if let Some(sid) = moved_series
        && let Some(od) = old_date.as_deref()
        && Some(od) != date
    {
        sqlx::query(
            "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date) VALUES (?, ?)",
        )
        .bind(sid)
        .bind(od)
        .execute(&mut *tx)
        .await?;
    }
    if let (Some(sid), Some(nd)) = (moved_series, date)
        && Some(nd) != old_date.as_deref()
    {
        let occupied: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND id != ?              AND series_id IN ({FAMILY_IDS}) AND scheduled_date = ?",
        ))
        .bind(profile_id)
        .bind(id)
        .bind(sid)
        .bind(sid)
        .bind(nd)
        .fetch_one(&mut *tx)
        .await?;
        if occupied > 0 {
            return Err(crate::db::DbError::Validation {
                code: ErrorCode::InstanceDateOccupied,
                message: "another instance of the series already occupies that date".into(),
            });
        }
    }
    tx.commit().await?;
    get(pool, id).await
}

/// Deletes a task scoped to its owning profile. Deleting an unknown id — or
/// another profile's task — is an error, not a silent no-op.
pub async fn delete(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<()> {
    let mut tx = pool.begin().await?;
    let task: Option<(Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT series_id, scheduled_date FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let result = sqlx::query("DELETE FROM tasks WHERE id = ? AND profile_id = ?")
        .bind(id)
        .bind(profile_id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    // A deleted instance stays deleted: the tombstone keeps the board's
    // materialization from recreating the still-scheduled occurrence.
    if let Some((Some(series_id), Some(date))) = task {
        sqlx::query(
            "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date) VALUES (?, ?)",
        )
        .bind(series_id)
        .bind(date)
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
    // One backlog entry per series — the earliest instance ever
    // persisted is the row the user thinks of as "the series" (spec
    // §146: a this-and-future save continues the series, it does not
    // start a new backlog item). Segments join to the living series
    // through `succeeded_by`.
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks t WHERE t.profile_id = ? AND t.placement = 'backlog' \
         AND (t.series_id IS NULL \
         OR t.id = (SELECT MIN(t2.id) FROM tasks t2 \
           JOIN task_series s2 ON s2.id = t2.series_id \
           WHERE COALESCE(s2.succeeded_by, s2.id) = \
                 COALESCE((SELECT s.succeeded_by FROM task_series s \
                           WHERE s.id = t.series_id), t.series_id))) \
         ORDER BY sort_order, id",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await?)
}

/// Board listing (spec §312–§316): one week's tasks — the standing
/// weekly backlog plus everything scheduled inside the week bounds.
/// Reading a week materializes that week's series occurrences (spec
/// §148/§342: boards prepopulate scheduled instances on view) — living
/// series only, since segments are history and never produce new rows.
/// Carry-over into the weekly backlog is a later plan item.
pub async fn list_week(pool: &SqlitePool, profile_id: i64, date: &str) -> Result<Vec<Task>> {
    crate::validation::iso_date(date, ErrorCode::InstanceDateInvalid, "date")?;
    let week_start = crate::profiles::week_start(pool, profile_id).await?;
    let (y, m, d) = crate::series::parse_iso(date);
    let z = crate::series::days_from_civil(y, m, d);
    // days_from_civil's epoch (1970-01-01) is a Thursday, so `z % 7`
    // gives Sunday = 0; Weekday indexes Monday = 0.
    let day_index = (z + 10).rem_euclid(7);
    let start_z = z - (day_index - week_start.index()).rem_euclid(7);
    let week_start_iso = crate::series::to_iso(crate::series::civil_from_days(start_z));
    let week_end_iso = crate::series::to_iso(crate::series::civil_from_days(start_z + 6));

    // Materialization covers every family row — living series and
    // segments alike, each bounded by its own schedule window, since a
    // midweek split leaves earlier occurrences on the segment. All
    // inserts share one transaction: a failed board read must not leave
    // a partially materialized week behind.
    let is_current_week = current_week_contains(pool, &week_start_iso, &week_end_iso).await?;
    let series = crate::series::list(pool, profile_id).await?;
    let mut tx = pool.begin().await?;
    if is_current_week {
        apply_carry_over(&mut tx, profile_id, &week_start_iso).await?;
    }
    for s in &series {
        for offset in 0..7 {
            let iso = crate::series::to_iso(crate::series::civil_from_days(start_z + offset));
            if !crate::series::occurs_on(&s.recurrence, &s.start_date, s.end_date.as_deref(), &iso)
                || skipped_in_family(&mut tx, s.id, &iso).await?
                || instance_in_family(&mut tx, profile_id, s.id, &iso).await?
            {
                continue;
            }
            insert_instance(&mut tx, profile_id, s, &iso).await?;
        }
    }
    tx.commit().await?;

    // The weekly backlog is a standing container of current state —
    // it renders on the current week's board only, never on past or
    // future weeks (spec §336/§348/§354).
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? AND \
         ((placement = 'weekly_backlog' AND ?) OR \
          (scheduled_date IS NOT NULL AND scheduled_date BETWEEN ? AND ?)) \
         ORDER BY scheduled_date, sort_order, id",
    )
    .bind(profile_id)
    .bind(is_current_week)
    .bind(&week_start_iso)
    .bind(&week_end_iso)
    .fetch_all(pool)
    .await?)
}

/// The configured start day of the current week — the carry-over
/// boundary. Only tasks dated before it are week-turn candidates.
async fn current_week_start(pool: &SqlitePool, profile_id: i64) -> Result<String> {
    let week_start = crate::profiles::week_start(pool, profile_id).await?;
    let today_iso: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
        .fetch_one(pool)
        .await?;
    let (y, m, d) = crate::series::parse_iso(&today_iso);
    let z = crate::series::days_from_civil(y, m, d);
    let day_index = (z + 10).rem_euclid(7);
    let start_z = z - (day_index - week_start.index()).rem_euclid(7);
    Ok(crate::series::to_iso(crate::series::civil_from_days(
        start_z,
    )))
}

/// Does the queried week contain today? Used to gate current-week-only
/// behavior (the weekly backlog, carry-over) off past and future boards.
async fn current_week_contains(
    pool: &SqlitePool,
    week_start: &str,
    week_end: &str,
) -> Result<bool> {
    let today_iso: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
        .fetch_one(pool)
        .await?;
    Ok(week_start <= today_iso.as_str() && today_iso.as_str() <= week_end)
}

/// Week-turn processing for a current-week read (spec §342–§346): an
/// incomplete task dated before the week start follows its carry-over
/// rule — carry joins the standing weekly backlog, return goes back to
/// the global backlog; both leave their old date behind. Unset rules
/// stay put — they surface via `pending_carry_over` for the user
/// prompt. A carried series instance moves like a standalone task but
/// first tombstones its old occurrence — otherwise the past board's
/// materialization would recreate a duplicate with none of its
/// progress. A returned instance keeps its date instead: recorded
/// history on the past board, while the anchor owns the backlog.
async fn apply_carry_over(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: i64,
    week_start_iso: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO skipped_instances (series_id, scheduled_date)          SELECT series_id, scheduled_date FROM tasks          WHERE profile_id = ? AND series_id IS NOT NULL          AND scheduled_date < ? AND status != 'done' AND carry_over_rule = 'carry'",
    )
    .bind(profile_id)
    .bind(week_start_iso)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "UPDATE tasks SET placement = 'weekly_backlog', scheduled_date = NULL,          series_id = NULL, updated_at = CURRENT_TIMESTAMP          WHERE profile_id = ? AND scheduled_date < ?          AND status != 'done' AND carry_over_rule = 'carry'",
    )
    .bind(profile_id)
    .bind(week_start_iso)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "UPDATE tasks SET placement = 'backlog', scheduled_date = NULL,          updated_at = CURRENT_TIMESTAMP WHERE profile_id = ? AND scheduled_date < ?          AND status != 'done' AND carry_over_rule = 'return' AND series_id IS NULL",
    )
    .bind(profile_id)
    .bind(week_start_iso)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Incomplete tasks dated before the current week with no carry-over
/// rule set — the prompt list (spec §344/§356).
pub async fn pending_carry_over(pool: &SqlitePool, profile_id: i64) -> Result<Vec<Task>> {
    let today_iso: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
        .fetch_one(pool)
        .await?;
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? AND carry_over_rule IS NULL          AND scheduled_date IS NOT NULL AND scheduled_date < ? AND status != 'done'          ORDER BY scheduled_date, sort_order, id",
    )
    .bind(profile_id)
    .bind(&today_iso)
    .fetch_all(pool)
    .await?)
}

/// Applies the user's carry-over decision to one pending task
/// immediately — sets the rule and moves the row per it.
pub async fn resolve_carry_over(
    pool: &SqlitePool,
    profile_id: i64,
    task_id: i64,
    rule: CarryOverRule,
) -> Result<()> {
    let placement = match rule {
        CarryOverRule::Carry => "weekly_backlog",
        CarryOverRule::Return => "backlog",
    };
    // Only a pending task may be resolved — the same eligibility as
    // pending_carry_over: undecided, incomplete, dated before this week.
    // Anything else is a not-found error, not a silent date wipe.
    let week_start = current_week_start(pool, profile_id).await?;
    let result = sqlx::query(
        "UPDATE tasks SET carry_over_rule = ?, placement = ?, scheduled_date = NULL,          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?          AND carry_over_rule IS NULL AND status != 'done'          AND scheduled_date IS NOT NULL AND scheduled_date < ?",
    )
    .bind(rule)
    .bind(placement)
    .bind(task_id)
    .bind(profile_id)
    .bind(week_start)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(task_not_found());
    }
    Ok(())
}

/// Materializes the instance for one scheduled occurrence (spec §230):
/// picking a scheduled-but-unpersisted calendar date creates its task row
/// in the background so it can be viewed, noted, and edited. Idempotent —
/// a date that already has an instance returns it, so repeated picks,
/// retries, and a future board creation share the same row.
///
/// The instance inherits the series' shared fields and category set —
/// the same baseline a whole-series save propagates — while `status`,
/// `spent_minutes`, and `placement` start at the defaults. A pick that
/// isn't a scheduled occurrence is a typed rejection, not a silent task.
pub async fn get_or_create_instance(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
    date: &str,
) -> Result<Task> {
    crate::validation::iso_date(date, ErrorCode::InstanceDateInvalid, "date")?;
    let series = crate::series::get(pool, profile_id, series_id).await?;
    if let Some(existing) = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? AND series_id = ? AND scheduled_date = ?",
    )
    .bind(profile_id)
    .bind(series_id)
    .bind(date)
    .fetch_optional(pool)
    .await?
    {
        return Ok(existing);
    }
    // Tombstones block auto-materialization only — a deliberate pick
    // recreates the occurrence on purpose (same as deleted instances).
    if !crate::series::occurs_on(
        &series.recurrence,
        &series.start_date,
        series.end_date.as_deref(),
        date,
    ) {
        return Err(crate::db::DbError::Validation {
            code: ErrorCode::InstanceDateNotScheduled,
            message: "the date is not a scheduled occurrence of this series".into(),
        });
    }
    let mut tx = pool.begin().await?;
    let task = insert_instance(&mut tx, profile_id, &series, date).await?;
    tx.commit().await?;
    Ok(task)
}

/// Creates one instance row under `series` inside an open transaction —
/// shared by the deliberate calendar pick above and the board's
/// per-week materialization.
async fn insert_instance(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: i64,
    series: &crate::series::TaskSeries,
    date: &str,
) -> Result<Task> {
    let result = sqlx::query(
        "INSERT INTO tasks (profile_id, title, description, estimated_minutes, \
         carry_over_rule, series_id, scheduled_date, sort_order) \
         VALUES (?, ?, ?, ?, ?, ?, ?, \
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
    )
    .bind(profile_id)
    .bind(&series.title)
    .bind(&series.description)
    .bind(series.estimated_minutes)
    .bind(series.carry_over_rule)
    .bind(series.id)
    .bind(date)
    .bind(profile_id)
    .execute(&mut **tx)
    .await?;
    let id = result.last_insert_rowid();
    sqlx::query(
        "INSERT INTO task_categories (task_id, category_id) \
         SELECT ?, category_id FROM series_categories WHERE series_id = ?",
    )
    .bind(id)
    .bind(series.id)
    .execute(&mut **tx)
    .await?;
    sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

/// Persisted instances of one series, oldest first — the details view's
/// calendar reads these to tell real instances from merely-scheduled dates.
pub async fn list_instances(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
) -> Result<Vec<Task>> {
    // Segment-scoped: any member id — the living series or one of its
    // earlier segments — resolves to the same instance set, so a details
    // view opened on a pre-split instance still sees the continuation.
    Ok(sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE profile_id = ? AND series_id IN ( \
           SELECT id FROM task_series WHERE COALESCE(succeeded_by, id) = \
             COALESCE((SELECT succeeded_by FROM task_series WHERE id = ?), ?)) \
         ORDER BY scheduled_date, id",
    )
    .bind(profile_id)
    .bind(series_id)
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
    async fn list_week_omits_the_weekly_backlog_outside_the_current_week() {
        // The weekly backlog is a standing container of current
        // state — it renders on the current week's board only, never
        // on past or future weeks (spec §336/§348/§354).
        let (pool, pid) = seeded_pool().await;
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, placement) VALUES (?, ?, 'weekly_backlog')",
        )
        .bind(pid)
        .bind("Pending")
        .execute(&pool)
        .await
        .unwrap();
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();

        // BEFORE_WEEK is a fixed past date — permanently non-current.
        // The forward check derives two weeks ahead of today so it can
        // never expire into the current week.
        let (y, m, d) = crate::series::parse_iso(&today);
        let z = crate::series::days_from_civil(y, m, d);
        let future = crate::series::to_iso(crate::series::civil_from_days(z + 14));
        assert!(list_week(&pool, pid, BEFORE_WEEK).await.unwrap().is_empty());
        assert!(list_week(&pool, pid, &future).await.unwrap().is_empty());
        assert_eq!(
            list_week(&pool, pid, &today)
                .await
                .unwrap()
                .iter()
                .map(|t| t.title.as_str())
                .collect::<Vec<_>>(),
            ["Pending"],
        );
    }

    #[tokio::test]
    async fn list_week_materializes_and_filters_the_displayed_week() {
        let (pool, pid) = seeded_pool().await;
        // Dates relative to the real current week — the weekly backlog
        // only renders on the current board (spec §348), so fixed
        // fixture dates would expire at the week boundary.
        let today_z: i64 = sqlx::query_scalar(
            "SELECT CAST(julianday(date('now', 'localtime')) - 2440587.5 AS INTEGER)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let monday = today_z - (today_z + 3).rem_euclid(7);
        let iso = |z: i64| crate::series::to_iso(crate::series::civil_from_days(z));
        create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.to_string(),
                series: Some(crate::series::NewSeries {
                    recurrence: serde_json::json!({
                        "kind": "weekly",
                        "interval_weeks": 1,
                        "weekdays": ["monday"],
                    }),
                    start_date: iso(monday),
                    end_date: None,
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        // A weekly-backlog task and a task scheduled outside the week.
        let weekly = create(&pool, pid, &task(TITLE_B)).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'weekly_backlog' WHERE id = ?")
            .bind(weekly.id)
            .execute(&pool)
            .await
            .unwrap();
        let outside = create(&pool, pid, &task(TITLE_C)).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'scheduled', scheduled_date = ? WHERE id = ?")
            .bind(iso(monday + 7))
            .bind(outside.id)
            .execute(&pool)
            .await
            .unwrap();

        // The Monday instance materializes on view and is returned
        // alongside the weekly backlog; the out-of-week task is not.
        let tasks = list_week(&pool, pid, &iso(today_z)).await.unwrap();
        let titles: Vec<&str> = tasks.iter().map(|t| t.title.as_str()).collect();
        assert!(titles.contains(&TITLE_A));
        assert!(titles.contains(&TITLE_B));
        assert!(!titles.contains(&TITLE_C));
        let instance = tasks.iter().find(|t| t.title == TITLE_A).unwrap();
        assert_eq!(
            instance.scheduled_date.as_deref(),
            Some(iso(monday).as_str())
        );

        // A later week materializes that week's instance instead.
        let next = list_week(&pool, pid, &iso(monday + 7)).await.unwrap();
        assert_eq!(
            next.iter()
                .filter(|t| t.series_id.is_some())
                .map(|t| t.scheduled_date.as_deref())
                .collect::<Vec<_>>(),
            vec![Some(iso(monday + 7).as_str())]
        );
    }

    const DAILY_START: &str = "2026-10-19"; // a Monday

    fn daily_series() -> crate::series::NewSeries {
        crate::series::NewSeries {
            recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
            start_date: DAILY_START.to_string(),
            end_date: None,
        }
    }

    async fn daily_task(pool: &SqlitePool, pid: i64) -> Task {
        create(
            pool,
            pid,
            &NewTask {
                title: TITLE_A.to_string(),
                series: Some(daily_series()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
    }

    // Dates inside the Oct 19–25 week shared by the board tests, plus
    // the neighbouring days just outside it.
    const TUESDAY: &str = "2026-10-20";
    const WEDNESDAY: &str = "2026-10-21";
    const THURSDAY: &str = "2026-10-22";
    const SATURDAY: &str = "2026-10-24";
    const SUNDAY: &str = "2026-10-25";
    const NEXT_WEEK: &str = "2026-10-26"; // the next week's Monday
    const BEFORE_WEEK: &str = "2026-10-18"; // the previous week's Sunday

    #[tokio::test]
    async fn a_deleted_instance_is_not_resurrected_by_the_board() {
        let (pool, pid) = seeded_pool().await;
        daily_task(&pool, pid).await;
        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        assert_eq!(week.iter().filter(|t| t.series_id.is_some()).count(), 7);
        let victim = week
            .iter()
            .find(|t| t.scheduled_date.as_deref() == Some(WEDNESDAY))
            .unwrap();

        delete(&pool, pid, victim.id).await.unwrap();

        // The occurrence is still scheduled but the deletion sticks.
        let again = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let series_dates: Vec<Option<&str>> = again
            .iter()
            .filter(|t| t.series_id.is_some())
            .map(|t| t.scheduled_date.as_deref())
            .collect();
        assert_eq!(series_dates.len(), 6);
        assert!(!series_dates.contains(&Some(WEDNESDAY)));
    }

    #[tokio::test]
    async fn a_deliberate_pick_can_recreate_a_deleted_instance() {
        let (pool, pid) = seeded_pool().await;
        let anchor = daily_task(&pool, pid).await;
        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let victim = week
            .iter()
            .find(|t| t.scheduled_date.as_deref() == Some(WEDNESDAY))
            .unwrap();
        delete(&pool, pid, victim.id).await.unwrap();

        // Picking the date again in the calendar is a deliberate
        // re-creation — the tombstone only blocks passive board
        // materialization.
        let recreated = get_or_create_instance(&pool, pid, anchor.series_id.unwrap(), WEDNESDAY)
            .await
            .unwrap();
        assert_eq!(recreated.scheduled_date.as_deref(), Some(WEDNESDAY));
    }

    #[tokio::test]
    async fn list_week_materializes_earlier_segment_occurrences() {
        let (pool, pid) = seeded_pool().await;
        let anchor = daily_task(&pool, pid).await; // persists only Monday
        // A this-and-future cut needs a persisted instance at the
        // cutoff — materialize Wednesday first.
        get_or_create_instance(&pool, pid, anchor.series_id.unwrap(), WEDNESDAY)
            .await
            .unwrap();
        let series = crate::series::list(&pool, pid).await.unwrap();
        // A midweek "this and future" cut: the living row owns
        // Wednesday on, the segment keeps Monday–Tuesday.
        crate::series::update_from(
            &pool,
            pid,
            series[0].id,
            WEDNESDAY,
            &crate::series::UpdateSeries {
                title: TITLE_A.to_string(),
                description: None,
                carry_over_rule: None,
                estimated_minutes: None,
                recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
                start_date: WEDNESDAY.to_string(),
                end_date: None,
                category_ids: vec![],
            },
        )
        .await
        .unwrap();

        let week = list_week(&pool, pid, THURSDAY).await.unwrap();
        let dates: Vec<Option<&str>> = week
            .iter()
            .filter(|t| t.series_id.is_some())
            .map(|t| t.scheduled_date.as_deref())
            .collect();
        // The unpersisted Tuesday materializes under the segment —
        // without family-wide materialization it stays missing.
        assert!(dates.contains(&Some(TUESDAY)));
        assert_eq!(dates.len(), 7);
    }

    #[tokio::test]
    async fn list_week_rejects_a_malformed_date() {
        let (pool, pid) = seeded_pool().await;
        let result = list_week(&pool, pid, "not-a-date").await;
        assert!(matches!(
            result,
            Err(crate::db::DbError::Validation {
                code: ErrorCode::InstanceDateInvalid,
                ..
            })
        ));
    }

    /// A task left behind on a past week — created undated, then dated
    /// into last week through SQL so the fixture is time-relative.
    async fn stray_task(
        pool: &SqlitePool,
        pid: i64,
        title: &str,
        rule: Option<&str>,
        done: bool,
    ) -> Task {
        let task = create(pool, pid, &task(title)).await.unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = date('now', 'localtime', '-7 days'),              carry_over_rule = ?, status = ? WHERE id = ?",
        )
        .bind(rule)
        .bind(if done { "done" } else { "todo" })
        .bind(task.id)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(task.id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn a_carried_past_task_joins_the_current_weekly_backlog() {
        // Spec §346/§353: incomplete tasks with carry-over=true appear
        // in the current week's weekly backlog.
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, Some("carry"), false).await;
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let week = list_week(&pool, pid, &today).await.unwrap();
        let carried = week.iter().find(|t| t.id == stray.id).unwrap();
        assert_eq!(carried.placement, TaskPlacement::WeeklyBacklog);
        assert!(carried.scheduled_date.is_none());
        // Idempotent: a second read changes nothing further.
        let second = list_week(&pool, pid, &today).await.unwrap();
        assert_eq!(week.len(), second.len());
    }

    #[tokio::test]
    async fn a_returned_past_task_goes_back_to_the_global_backlog() {
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, Some("return"), false).await;
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        list_week(&pool, pid, &today).await.unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.placement, TaskPlacement::Backlog);
        assert!(row.scheduled_date.is_none());
    }

    #[tokio::test]
    async fn an_unset_rule_stays_dated_and_surfaces_in_the_pending_list() {
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, None, false).await;
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        list_week(&pool, pid, &today).await.unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(row.scheduled_date.is_some());
        let pending = pending_carry_over(&pool, pid).await.unwrap();
        assert_eq!(pending.iter().map(|t| t.id).collect::<Vec<_>>(), [stray.id]);
        // Resolving applies immediately and clears the pending list.
        resolve_carry_over(&pool, pid, stray.id, CarryOverRule::Carry)
            .await
            .unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.placement, TaskPlacement::WeeklyBacklog);
        assert!(row.scheduled_date.is_none());
        assert!(pending_carry_over(&pool, pid).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn carry_over_leaves_done_and_current_week_tasks_alone() {
        let (pool, pid) = seeded_pool().await;
        let done = stray_task(&pool, pid, TITLE_A, Some("carry"), true).await;
        let open = stray_task(&pool, pid, TITLE_B, Some("carry"), false).await;
        // An incomplete task dated inside the current week must not move.
        sqlx::query("UPDATE tasks SET scheduled_date = date('now', 'localtime') WHERE id = ?")
            .bind(open.id)
            .execute(&pool)
            .await
            .unwrap();
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        list_week(&pool, pid, &today).await.unwrap();
        for id in [done.id, open.id] {
            let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!(row.scheduled_date.is_some());
        }
    }

    #[tokio::test]
    async fn carry_over_only_runs_on_the_current_week_read() {
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, Some("carry"), false).await;
        // Reading a past or a future week must not apply rules.
        let (y, m, d) = crate::series::parse_iso(
            &sqlx::query_scalar::<_, String>("SELECT date('now', 'localtime')")
                .fetch_one(&pool)
                .await
                .unwrap(),
        );
        let z = crate::series::days_from_civil(y, m, d);
        let iso = |z: i64| crate::series::to_iso(crate::series::civil_from_days(z));
        list_week(&pool, pid, &iso(z + 14)).await.unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(row.scheduled_date.is_some());
    }

    #[tokio::test]
    async fn a_returned_series_instance_keeps_its_past_date() {
        // Instances stay as recorded history on the past board; the
        // anchor already represents the series in the global backlog.
        let (pool, pid) = seeded_pool().await;
        // The series-linked task defaults to the return rule; its
        // series_id identifies the family.
        // The daily series starts a month back so a week-ago instance is
        // a real occurrence regardless of today's date.
        let start: String = sqlx::query_scalar("SELECT date('now', 'localtime', '-30 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let task = create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.to_string(),
                series: Some(crate::series::NewSeries {
                    recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
                    start_date: start,
                    end_date: None,
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let past: String = sqlx::query_scalar("SELECT date('now', 'localtime', '-7 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let instance = get_or_create_instance(&pool, pid, task.series_id.unwrap(), &past)
            .await
            .unwrap();
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        list_week(&pool, pid, &today).await.unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(instance.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.scheduled_date.as_deref(), Some(past.as_str()));
    }

    #[tokio::test]
    async fn resolve_carry_over_rejects_tasks_that_are_not_pending() {
        // The resolver must not wipe dates off tasks that never qualified
        // for the prompt: done, already-decided, or dated this week.
        let (pool, pid) = seeded_pool().await;
        let done = stray_task(&pool, pid, TITLE_A, None, true).await;
        let decided = stray_task(&pool, pid, TITLE_B, Some("carry"), false).await;
        let future = stray_task(&pool, pid, TITLE_C, None, false).await;
        sqlx::query(
            "UPDATE tasks SET scheduled_date = date('now', 'localtime', '+10 days') WHERE id = ?",
        )
        .bind(future.id)
        .execute(&pool)
        .await
        .unwrap();
        for task in [&done, &decided, &future] {
            let err = resolve_carry_over(&pool, pid, task.id, CarryOverRule::Return)
                .await
                .unwrap_err();
            assert!(format!("{err:?}").contains("TaskNotFound"));
        }
        for task in [&done, &decided, &future] {
            let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
                .bind(task.id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!(row.scheduled_date.is_some());
        }
    }

    #[tokio::test]
    async fn resolve_carry_over_rejects_unknown_and_foreign_tasks() {
        // Same profile scoping as update/delete — a bare UPDATE that
        // touched nothing is TaskNotFound, not a silent no-op.
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, None, false).await;
        let err = resolve_carry_over(&pool, pid, stray.id + 999, CarryOverRule::Carry)
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
        // Foreign profile: another profile's task cannot be resolved.
        let other_id: i64 =
            sqlx::query_scalar("INSERT INTO profiles (name) VALUES ('other') RETURNING id")
                .fetch_one(&pool)
                .await
                .unwrap();
        let err = resolve_carry_over(&pool, other_id, stray.id, CarryOverRule::Return)
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
        // …and the stray stays pending and untouched.
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(row.scheduled_date.is_some());
        assert!(row.carry_over_rule.is_none());
    }

    #[tokio::test]
    async fn resolving_as_return_sends_the_task_to_the_global_backlog() {
        let (pool, pid) = seeded_pool().await;
        let stray = stray_task(&pool, pid, TITLE_A, None, false).await;
        resolve_carry_over(&pool, pid, stray.id, CarryOverRule::Return)
            .await
            .unwrap();
        let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(stray.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.placement, TaskPlacement::Backlog);
        assert_eq!(row.carry_over_rule, Some(CarryOverRule::Return));
        assert!(row.scheduled_date.is_none());
    }

    #[tokio::test]
    async fn a_carried_series_instance_moves_with_a_tombstone() {
        // Carry moves the instance to the weekly backlog — progress and
        // notes travel with the row — and tombstones the old occurrence
        // so the past board never re-materializes a duplicate.
        let (pool, pid) = seeded_pool().await;
        let start: String = sqlx::query_scalar("SELECT date('now', 'localtime', '-30 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let task = create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.to_string(),
                carry_over_rule: Some(CarryOverRule::Carry),
                series: Some(crate::series::NewSeries {
                    recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
                    start_date: start,
                    end_date: None,
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let past: String = sqlx::query_scalar("SELECT date('now', 'localtime', '-7 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let instance = get_or_create_instance(&pool, pid, task.series_id.unwrap(), &past)
            .await
            .unwrap();
        let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(&pool)
            .await
            .unwrap();
        let week = list_week(&pool, pid, &today).await.unwrap();
        let carried = week.iter().find(|t| t.id == instance.id).unwrap();
        assert_eq!(carried.placement, TaskPlacement::WeeklyBacklog);
        assert!(carried.scheduled_date.is_none());
        // …and it's detached — no longer an occurrence, so a later
        // series truncate can't delete work the user chose to keep.
        assert!(carried.series_id.is_none());
        // The past board shows no row at that date — the tombstone keeps
        // materialization from recreating the moved occurrence.
        let past_week = list_week(&pool, pid, &past).await.unwrap();
        assert!(
            !past_week.iter().any(|t| t.series_id == carried.series_id
                && t.scheduled_date.as_deref() == Some(past.as_str())),
            "carried occurrence reappeared on the past board"
        );
    }

    #[tokio::test]
    async fn pending_carry_over_lists_only_undecided_past_incompletes() {
        let (pool, pid) = seeded_pool().await;
        // Undecided + past + incomplete — the only combination listed.
        let listed = stray_task(&pool, pid, TITLE_A, None, false).await;
        // Done tasks never prompt; decided rules never prompt; dates in
        // the current week are not carry-over candidates.
        stray_task(&pool, pid, TITLE_B, None, true).await;
        stray_task(&pool, pid, TITLE_C, Some("carry"), false).await;
        let current = stray_task(&pool, pid, "Current", None, false).await;
        sqlx::query("UPDATE tasks SET scheduled_date = date('now', 'localtime') WHERE id = ?")
            .bind(current.id)
            .execute(&pool)
            .await
            .unwrap();
        // A foreign-profile stray never shows up.
        let other_id: i64 =
            sqlx::query_scalar("INSERT INTO profiles (name) VALUES ('other') RETURNING id")
                .fetch_one(&pool)
                .await
                .unwrap();
        stray_task(&pool, other_id, "Foreign", None, false).await;
        let pending = pending_carry_over(&pool, pid).await.unwrap();
        assert_eq!(
            pending.iter().map(|t| t.id).collect::<Vec<_>>(),
            [listed.id]
        );
    }

    #[tokio::test]
    async fn list_week_is_idempotent() {
        let (pool, pid) = seeded_pool().await;
        daily_task(&pool, pid).await;
        let first = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let second = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        // Re-reading the week must not create duplicate instances.
        assert_eq!(first.len(), second.len());
        let ids: Vec<i64> = second.iter().map(|t| t.id).collect();
        let mut dedup = ids.clone();
        dedup.dedup();
        assert_eq!(ids.len(), dedup.len());
    }

    #[tokio::test]
    async fn list_week_anchors_bounds_on_the_configured_week_start() {
        let (pool, pid) = seeded_pool().await;
        // Wednesday week start: Oct 25 sits in the Oct 21–27 week, so a
        // task on Sat Oct 24 is in range…
        crate::profiles::set_week_start(&pool, pid, crate::series::Weekday::Wednesday)
            .await
            .unwrap();
        let task = create(&pool, pid, &task(TITLE_A)).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'scheduled', scheduled_date = ? WHERE id = ?")
            .bind(SATURDAY)
            .bind(task.id)
            .execute(&pool)
            .await
            .unwrap();
        let week = list_week(&pool, pid, SUNDAY).await.unwrap();
        assert!(week.iter().any(|t| t.id == task.id));
        // …but a Monday-start view of the same date puts Oct 24 in the
        // previous week and lists nothing.
        crate::profiles::set_week_start(&pool, pid, crate::series::Weekday::Monday)
            .await
            .unwrap();
        assert!(list_week(&pool, pid, NEXT_WEEK).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_a_non_series_task_writes_no_tombstone() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task(TITLE_A)).await.unwrap();
        delete(&pool, pid, task.id).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM skipped_instances")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn list_week_materializes_nothing_past_a_series_end() {
        let (pool, pid) = seeded_pool().await;
        create(
            &pool,
            pid,
            &NewTask {
                title: TITLE_A.to_string(),
                series: Some(crate::series::NewSeries {
                    recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
                    start_date: DAILY_START.to_string(),
                    end_date: Some(WEDNESDAY.to_string()),
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let dates: Vec<Option<&str>> = week
            .iter()
            .filter(|t| t.series_id.is_some())
            .map(|t| t.scheduled_date.as_deref())
            .collect();
        // The window ends Wednesday — Thursday through Sunday stay empty.
        assert_eq!(
            dates,
            vec![Some(DAILY_START), Some(TUESDAY), Some(WEDNESDAY)]
        );
    }

    #[tokio::test]
    async fn list_week_includes_the_week_edges_and_not_the_neighbours() {
        const FOURTH: &str = "D";
        let (pool, pid) = seeded_pool().await;
        let fixtures = [
            (TITLE_A, DAILY_START, true), // Monday — week start
            (TITLE_B, SUNDAY, true),      // Sunday — week end
            (TITLE_C, BEFORE_WEEK, false),
            (FOURTH, NEXT_WEEK, false),
        ];
        for (title, date, _) in fixtures {
            let task = create(&pool, pid, &task(title)).await.unwrap();
            sqlx::query(
                "UPDATE tasks SET placement = 'scheduled', scheduled_date = ? WHERE id = ?",
            )
            .bind(date)
            .bind(task.id)
            .execute(&pool)
            .await
            .unwrap();
        }

        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let dates: Vec<Option<&str>> = week.iter().map(|t| t.scheduled_date.as_deref()).collect();
        for (_, date, expected) in fixtures {
            assert_eq!(dates.contains(&Some(date)), expected, "date {date}");
        }
    }

    #[tokio::test]
    async fn list_week_never_leaks_or_materializes_for_another_profile() {
        let (pool, pid) = seeded_pool().await;
        let other = crate::profiles::create(&pool, "second").await.unwrap().id;
        daily_task(&pool, other).await; // foreign series
        let foreign = create(&pool, other, &task(TITLE_A)).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'scheduled', scheduled_date = ? WHERE id = ?")
            .bind(WEDNESDAY)
            .bind(foreign.id)
            .execute(&pool)
            .await
            .unwrap();

        // The board only lists the active profile's tasks — and reading
        // it must not materialize instances for the other profile.
        assert!(list_week(&pool, pid, WEDNESDAY).await.unwrap().is_empty());
        let foreign_tasks: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND series_id IS NOT NULL",
        )
        .bind(other)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(foreign_tasks, 1, "foreign series materialized anyway");
    }

    #[tokio::test]
    async fn a_deleted_segment_instance_stays_deleted() {
        let (pool, pid) = seeded_pool().await;
        let anchor = daily_task(&pool, pid).await;
        get_or_create_instance(&pool, pid, anchor.series_id.unwrap(), WEDNESDAY)
            .await
            .unwrap();
        let series = crate::series::list(&pool, pid).await.unwrap();
        crate::series::update_from(
            &pool,
            pid,
            series[0].id,
            WEDNESDAY,
            &crate::series::UpdateSeries {
                title: TITLE_A.to_string(),
                description: None,
                carry_over_rule: None,
                estimated_minutes: None,
                recurrence: serde_json::json!({"kind": "daily", "interval_days": 1}),
                start_date: WEDNESDAY.to_string(),
                end_date: None,
                category_ids: vec![],
            },
        )
        .await
        .unwrap();

        // Deleting the segment's Tuesday instance tombstones it —
        // family-wide, so the board cannot recreate it from either row.
        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let victim = week
            .iter()
            .find(|t| t.scheduled_date.as_deref() == Some(TUESDAY))
            .unwrap();
        assert_ne!(victim.series_id, anchor.series_id);
        delete(&pool, pid, victim.id).await.unwrap();

        let again = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        assert!(
            !again
                .iter()
                .any(|t| t.scheduled_date.as_deref() == Some(TUESDAY))
        );
    }

    #[tokio::test]
    async fn a_recreated_instance_shows_on_the_board_again() {
        let (pool, pid) = seeded_pool().await;
        let anchor = daily_task(&pool, pid).await;
        let week = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        let victim = week
            .iter()
            .find(|t| t.scheduled_date.as_deref() == Some(WEDNESDAY))
            .unwrap();
        delete(&pool, pid, victim.id).await.unwrap();

        get_or_create_instance(&pool, pid, anchor.series_id.unwrap(), WEDNESDAY)
            .await
            .unwrap();

        let again = list_week(&pool, pid, WEDNESDAY).await.unwrap();
        // The persisted row wins over the tombstone — the deliberate
        // re-pick is visible again.
        assert!(
            again
                .iter()
                .any(|t| t.scheduled_date.as_deref() == Some(WEDNESDAY))
        );
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
    fn weekly_schedule() -> crate::series::NewSeries {
        crate::series::NewSeries {
            recurrence: serde_json::to_value(crate::series::Recurrence::Weekly {
                interval_weeks: 1,
                weekdays: vec![crate::series::Weekday::Monday],
            })
            .unwrap(),
            start_date: DAILY_START.to_string(),
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
        assert_eq!(task.scheduled_date.as_deref(), Some(DAILY_START));
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
        schedule.end_date = Some(DAILY_START.to_string());

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
        assert_eq!(first.scheduled_date.as_deref(), Some(DAILY_START));
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
        assert_eq!(updated.scheduled_date.as_deref(), Some(DAILY_START));
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

    mod instance_materialization {
        use super::*;

        fn weekly_series() -> crate::series::NewSeries {
            crate::series::NewSeries {
                recurrence: serde_json::json!({
                    "kind": "weekly",
                    "interval_weeks": 1,
                    "weekdays": ["monday"],
                }),
                start_date: DAILY_START.to_string(),
                end_date: None,
            }
        }

        async fn repeating_task(pool: &SqlitePool, pid: i64) -> Task {
            create(
                pool,
                pid,
                &NewTask {
                    title: TITLE_A.to_string(),
                    estimated_minutes: Some(45),
                    series: Some(weekly_series()),
                    ..Default::default()
                },
            )
            .await
            .unwrap()
        }

        fn assert_code(err: &crate::db::DbError, expected: ErrorCode) {
            assert!(
                matches!(err, crate::db::DbError::Validation { code, .. } if *code == expected),
                "expected {expected:?}, got {err}"
            );
        }

        #[tokio::test]
        async fn materializes_a_scheduled_date_with_series_defaults() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;
            let series_id = first.series_id.unwrap();

            let created = get_or_create_instance(&pool, pid, series_id, NEXT_WEEK)
                .await
                .unwrap();

            assert_ne!(created.id, first.id);
            assert_eq!(created.series_id, Some(series_id));
            assert_eq!(created.scheduled_date.as_deref(), Some(NEXT_WEEK));
            // The series' shared fields carry over; per-instance state
            // starts fresh.
            assert_eq!(created.title, TITLE_A);
            assert_eq!(created.estimated_minutes, Some(45));
            assert_eq!(created.carry_over_rule, Some(CarryOverRule::Return));
            assert_eq!(created.status, TaskStatus::Todo);
            assert!(created.spent_minutes.is_none());
        }

        #[tokio::test]
        async fn is_idempotent_across_repeated_picks() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;
            let series_id = first.series_id.unwrap();

            let a = get_or_create_instance(&pool, pid, series_id, NEXT_WEEK)
                .await
                .unwrap();
            let b = get_or_create_instance(&pool, pid, series_id, NEXT_WEEK)
                .await
                .unwrap();

            assert_eq!(a.id, b.id);
            assert_eq!(
                list_instances(&pool, pid, series_id).await.unwrap().len(),
                2,
            );
        }

        #[tokio::test]
        async fn returns_the_existing_instance_for_a_persisted_date() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;
            let series_id = first.series_id.unwrap();

            // The series' own first occurrence already has a row — the
            // call must hand it back untouched, not duplicate it.
            let same = get_or_create_instance(&pool, pid, series_id, DAILY_START)
                .await
                .unwrap();

            assert_eq!(same.id, first.id);
            assert_eq!(
                list_instances(&pool, pid, series_id).await.unwrap().len(),
                1,
            );
        }

        #[tokio::test]
        async fn rejects_a_date_that_is_not_scheduled() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;

            let err = get_or_create_instance(&pool, pid, first.series_id.unwrap(), WEDNESDAY)
                .await
                .unwrap_err();

            assert_code(&err, ErrorCode::InstanceDateNotScheduled);
            assert_eq!(
                list_instances(&pool, pid, first.series_id.unwrap())
                    .await
                    .unwrap()
                    .len(),
                1,
            );
        }

        #[tokio::test]
        async fn rejects_a_date_past_the_series_end() {
            let (pool, pid) = seeded_pool().await;
            let first = create(
                &pool,
                pid,
                &NewTask {
                    title: TITLE_A.to_string(),
                    series: Some(crate::series::NewSeries {
                        end_date: Some(NEXT_WEEK.to_string()),
                        ..weekly_series()
                    }),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            let err = get_or_create_instance(&pool, pid, first.series_id.unwrap(), "2026-11-02")
                .await
                .unwrap_err();

            assert_code(&err, ErrorCode::InstanceDateNotScheduled);
        }

        #[tokio::test]
        async fn rejects_a_malformed_date() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;

            let err = get_or_create_instance(&pool, pid, first.series_id.unwrap(), "26-10-2026")
                .await
                .unwrap_err();

            assert_code(&err, ErrorCode::InstanceDateInvalid);
        }

        #[tokio::test]
        async fn rejects_a_foreign_series() {
            let (pool, pid) = seeded_pool().await;
            let first = repeating_task(&pool, pid).await;
            let other = crate::profiles::create(&pool, "Work").await.unwrap();

            let err = get_or_create_instance(&pool, other.id, first.series_id.unwrap(), NEXT_WEEK)
                .await
                .unwrap_err();

            assert_code(&err, ErrorCode::SeriesNotFound);
        }

        #[tokio::test]
        async fn copies_the_series_category_set() {
            let (pool, pid) = seeded_pool().await;
            let category = crate::categories::create(
                &pool,
                pid,
                &crate::categories::NewCategory {
                    title: "Errands".to_string(),
                    description: None,
                    color: None,
                },
            )
            .await
            .unwrap();
            let first = repeating_task(&pool, pid).await;
            let series_id = first.series_id.unwrap();
            sqlx::query("INSERT INTO series_categories (series_id, category_id) VALUES (?, ?)")
                .bind(series_id)
                .bind(category.id)
                .execute(&pool)
                .await
                .unwrap();

            let created = get_or_create_instance(&pool, pid, series_id, NEXT_WEEK)
                .await
                .unwrap();

            let cats = crate::categories::for_task(&pool, pid, created.id)
                .await
                .unwrap();
            assert_eq!(cats.len(), 1);
            assert_eq!(cats[0].id, category.id);
        }
    }

    #[tokio::test]
    async fn add_to_week_moves_a_backlog_task_into_the_weekly_backlog() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        assert_eq!(task.placement, TaskPlacement::Backlog);

        let moved = add_to_week(&pool, pid, task.id).await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::WeeklyBacklog);
        assert_eq!(moved.scheduled_date, None);
    }

    #[tokio::test]
    async fn add_to_week_rejects_a_task_already_on_the_board() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'weekly_backlog' WHERE id = ?")
            .bind(task.id)
            .execute(&pool)
            .await
            .unwrap();

        let err = add_to_week(&pool, pid, task.id).await.unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
    }

    #[tokio::test]
    async fn add_to_week_rejects_another_profiles_task() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        let (other_pool, other) = seeded_pool().await;

        let err = add_to_week(&other_pool, other, task.id).await.unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
        assert_eq!(
            get(&pool, task.id).await.unwrap().placement,
            TaskPlacement::Backlog
        );
    }

    #[tokio::test]
    async fn return_to_backlog_sends_a_scheduled_task_back() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        sqlx::query(
            "UPDATE tasks SET placement = 'scheduled', scheduled_date = '2026-10-30' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        let moved = return_to_backlog(&pool, pid, task.id).await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Backlog);
        assert_eq!(moved.scheduled_date, None);
    }

    #[tokio::test]
    async fn return_to_backlog_sends_a_weekly_backlog_task_back() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        add_to_week(&pool, pid, task.id).await.unwrap();

        let moved = return_to_backlog(&pool, pid, task.id).await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Backlog);
    }

    #[tokio::test]
    async fn return_to_backlog_rejects_a_task_already_there() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        let err = return_to_backlog(&pool, pid, task.id).await.unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
    }

    #[tokio::test]
    async fn add_to_week_clears_a_stray_scheduled_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        sqlx::query("UPDATE tasks SET scheduled_date = '2026-10-30' WHERE id = ?")
            .bind(task.id)
            .execute(&pool)
            .await
            .unwrap();

        let moved = add_to_week(&pool, pid, task.id).await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::WeeklyBacklog);
        assert_eq!(moved.scheduled_date, None);
    }

    #[tokio::test]
    async fn add_to_week_rejects_an_unknown_task() {
        let (pool, pid) = seeded_pool().await;
        let err = add_to_week(&pool, pid, 9999).await.unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
    }

    #[tokio::test]
    async fn return_to_backlog_rejects_an_unknown_task() {
        let (pool, pid) = seeded_pool().await;
        let err = return_to_backlog(&pool, pid, 9999).await.unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
    }

    #[tokio::test]
    async fn add_to_week_preserves_the_tasks_other_fields() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        sqlx::query(
            "UPDATE tasks SET status = 'in_progress', estimated_minutes = 45, spent_minutes = 10 WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        let moved = add_to_week(&pool, pid, task.id).await.unwrap();
        assert_eq!(moved.status, TaskStatus::InProgress);
        assert_eq!(moved.estimated_minutes, Some(45));
        assert_eq!(moved.spent_minutes, Some(10));
        assert_eq!(moved.sort_order, task.sort_order);
    }

    #[tokio::test]
    async fn schedule_puts_a_backlog_task_on_a_picked_day() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        let moved = schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Scheduled);
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
        assert_eq!(list(&pool, pid).await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn schedule_redates_an_already_scheduled_task() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();

        let moved = schedule(&pool, pid, task.id, "2026-01-05").await.unwrap();
        assert_eq!(moved.scheduled_date.as_deref(), Some("2026-01-05"));
    }

    #[tokio::test]
    async fn schedule_rejects_the_same_date_as_a_no_op() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();

        let error = schedule(&pool, pid, task.id, "2027-03-15")
            .await
            .unwrap_err();
        assert!(format!("{error:?}").contains("TaskNotFound"));
    }

    #[tokio::test]
    async fn schedule_rejects_unknown_and_foreign_tasks() {
        let (pool, pid) = seeded_pool().await;
        let foreign = create(&pool, pid, &task("Errand")).await.unwrap();
        let (other_pool, other) = seeded_pool().await;

        assert!(
            format!(
                "{:?}",
                schedule(&pool, pid, 9999, "2027-03-15").await.unwrap_err()
            )
            .contains("TaskNotFound")
        );
        assert!(
            format!(
                "{:?}",
                schedule(&other_pool, other, foreign.id, "2027-03-15")
                    .await
                    .unwrap_err()
            )
            .contains("TaskNotFound")
        );
    }

    #[tokio::test]
    async fn schedule_moves_a_weekly_backlog_task_to_a_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        add_to_week(&pool, pid, task.id).await.unwrap();

        let moved = schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Scheduled);
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
    }

    #[tokio::test]
    async fn schedule_redates_a_persisted_series_instance() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();

        let moved = schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Scheduled);
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
        assert_eq!(moved.series_id, task.series_id);
    }

    #[tokio::test]
    async fn scheduling_a_series_instance_tombstones_the_old_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = '2026-10-30', placement = 'scheduled' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();

        let tombstones: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM skipped_instances WHERE series_id = ? AND scheduled_date = '2026-10-30'",
        )
        .bind(task.series_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(tombstones, 1);
    }

    #[tokio::test]
    async fn a_moved_instance_vacates_its_old_dates_board() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = '2026-11-16', placement = 'scheduled' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();

        let old_week = list_week(&pool, pid, "2026-11-16").await.unwrap();
        assert!(old_week.iter().all(|t| t.id != task.id));
        let new_week = list_week(&pool, pid, "2027-03-15").await.unwrap();
        assert!(new_week.iter().any(|t| t.id == task.id));
    }

    #[tokio::test]
    async fn skipped_dates_reports_family_tombstones() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = '2026-11-16', placement = 'scheduled' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        assert!(
            skipped_dates(&pool, pid, task.series_id.unwrap())
                .await
                .unwrap()
                .is_empty()
        );
        schedule(&pool, pid, task.id, "2027-03-15").await.unwrap();
        assert_eq!(
            skipped_dates(&pool, pid, task.series_id.unwrap())
                .await
                .unwrap(),
            vec!["2026-11-16".to_string()]
        );
    }

    #[tokio::test]
    async fn schedule_rejects_a_date_occupied_by_another_family_instance() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, series_id, placement, scheduled_date, sort_order)              VALUES (?, 'Other', ?, 'scheduled', '2027-03-15', 5)",
        )
        .bind(pid)
        .bind(task.series_id)
        .execute(&pool)
        .await
        .unwrap();

        let error = schedule(&pool, pid, task.id, "2027-03-15")
            .await
            .unwrap_err();
        assert!(format!("{error:?}").contains("InstanceDateOccupied"));
    }

    #[tokio::test]
    async fn schedule_occurrence_materializes_moves_and_tombstones() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        let series_id = task.series_id.unwrap();

        let moved = schedule_occurrence(&pool, pid, series_id, "2027-03-14", "2027-03-15")
            .await
            .unwrap();
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
        assert_eq!(
            skipped_dates(&pool, pid, series_id).await.unwrap(),
            vec!["2027-03-14".to_string()]
        );

        // Rejection after materialization must leave no stray row.
        let err = schedule_occurrence(
            &pool,
            pid,
            series_id,
            "2027-03-16",
            moved.scheduled_date.as_deref().unwrap(),
        )
        .await
        .unwrap_err();
        assert!(format!("{err:?}").contains("InstanceDateOccupied"));
        let stray: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND series_id = ? AND scheduled_date = '2027-03-16'",
        )
        .bind(pid)
        .bind(series_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(stray, 0);
    }

    #[tokio::test]
    async fn schedule_occurrence_moves_an_already_materialized_row() {
        const FROM: &str = "2027-03-14";
        const TO: &str = "2027-03-15";
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        let series_id = task.series_id.unwrap();
        let materialized = get_or_create_instance(&pool, pid, series_id, FROM)
            .await
            .unwrap();

        let moved = schedule_occurrence(&pool, pid, series_id, FROM, TO)
            .await
            .unwrap();
        assert_eq!(moved.id, materialized.id);
        assert_eq!(moved.scheduled_date.as_deref(), Some(TO));
        let dupes: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND series_id = ? AND scheduled_date IN (?, ?)",
        )
        .bind(pid)
        .bind(series_id)
        .bind(FROM)
        .bind(TO)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(dupes, 1);
    }

    #[tokio::test]
    async fn schedule_occurrence_rejects_unknown_and_foreign_series() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        let (other_pool, other) = seeded_pool().await;

        assert!(
            format!(
                "{:?}",
                schedule_occurrence(&pool, pid, 9999, "2027-03-14", "2027-03-15")
                    .await
                    .unwrap_err()
            )
            .contains("SeriesNotFound")
        );
        assert!(
            format!(
                "{:?}",
                schedule_occurrence(
                    &other_pool,
                    other,
                    task.series_id.unwrap(),
                    "2027-03-14",
                    "2027-03-15",
                )
                .await
                .unwrap_err()
            )
            .contains("SeriesNotFound")
        );
    }

    #[tokio::test]
    async fn schedule_occurrence_rejects_an_unscheduled_source_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();

        let error = schedule_occurrence(
            &pool,
            pid,
            task.series_id.unwrap(),
            "1900-01-01",
            "2027-03-15",
        )
        .await
        .unwrap_err();
        assert!(format!("{error:?}").contains("InstanceDateNotScheduled"));
    }

    #[tokio::test]
    async fn schedule_occurrence_rejects_a_malformed_source_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();

        let error = schedule_occurrence(
            &pool,
            pid,
            task.series_id.unwrap(),
            "not-a-date",
            "2027-03-15",
        )
        .await
        .unwrap_err();
        assert!(format!("{error:?}").contains("InstanceDateInvalid"));
    }

    #[tokio::test]
    async fn schedule_occurrence_on_its_own_date_is_not_tombstoned() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        let series_id = task.series_id.unwrap();

        let moved = schedule_occurrence(&pool, pid, series_id, "2027-03-14", "2027-03-14")
            .await
            .unwrap();
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-14"));
        // A same-date move must not tombstone its own destination —
        // the row would sit on a date the board treats as skipped.
        assert!(
            skipped_dates(&pool, pid, series_id)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn board_move_writes_placement_date_and_status() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        let moved = board_move(
            &pool,
            pid,
            task.id,
            TaskPlacement::Scheduled,
            Some("2027-03-15"),
            TaskStatus::InProgress,
        )
        .await
        .unwrap();
        assert_eq!(moved.placement, TaskPlacement::Scheduled);
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
        assert_eq!(moved.status, TaskStatus::InProgress);

        let back = board_move(
            &pool,
            pid,
            task.id,
            TaskPlacement::WeeklyBacklog,
            None,
            TaskStatus::Done,
        )
        .await
        .unwrap();
        assert_eq!(back.placement, TaskPlacement::WeeklyBacklog);
        assert_eq!(back.scheduled_date, None);
        assert_eq!(back.status, TaskStatus::Done);
    }

    #[tokio::test]
    async fn board_move_tombstones_a_moved_series_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = '2026-11-16', placement = 'scheduled' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();

        board_move(
            &pool,
            pid,
            task.id,
            TaskPlacement::Scheduled,
            Some("2027-03-15"),
            TaskStatus::Todo,
        )
        .await
        .unwrap();
        assert_eq!(
            skipped_dates(&pool, pid, task.series_id.unwrap())
                .await
                .unwrap(),
            vec!["2026-11-16".to_string()]
        );
    }

    #[tokio::test]
    async fn board_move_rejects_an_occupied_family_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE tasks SET scheduled_date = '2026-11-16', placement = 'scheduled' WHERE id = ?",
        )
        .bind(task.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, series_id, placement, scheduled_date, sort_order)              VALUES (?, 'Other', ?, 'scheduled', '2027-03-15', 5)",
        )
        .bind(pid)
        .bind(task.series_id)
        .execute(&pool)
        .await
        .unwrap();

        let err = board_move(
            &pool,
            pid,
            task.id,
            TaskPlacement::Scheduled,
            Some("2027-03-15"),
            TaskStatus::Todo,
        )
        .await
        .unwrap_err();
        assert!(format!("{err:?}").contains("InstanceDateOccupied"));
    }

    #[tokio::test]
    async fn board_move_rejects_a_placement_date_mismatch() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        // A backlog or weekly-backlog drop must never carry a date —
        // the row would render in both views at once.
        for placement in [TaskPlacement::Backlog, TaskPlacement::WeeklyBacklog] {
            let err = board_move(
                &pool,
                pid,
                task.id,
                placement,
                Some("2027-03-15"),
                TaskStatus::Todo,
            )
            .await
            .unwrap_err();
            assert!(format!("{err:?}").contains("ScheduledDateInvalid"));
        }
        // And a scheduled drop without a date cannot exist.
        assert!(
            board_move(
                &pool,
                pid,
                task.id,
                TaskPlacement::Scheduled,
                None,
                TaskStatus::Todo
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn board_move_rejects_unknown_foreign_and_bad_dates() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        let (other_pool, other) = seeded_pool().await;

        assert!(
            board_move(
                &pool,
                pid,
                9999,
                TaskPlacement::Scheduled,
                Some("2027-03-15"),
                TaskStatus::Todo
            )
            .await
            .is_err()
        );
        assert!(
            board_move(
                &other_pool,
                other,
                task.id,
                TaskPlacement::Scheduled,
                Some("2027-03-15"),
                TaskStatus::Todo
            )
            .await
            .is_err()
        );
        assert!(
            format!(
                "{:?}",
                board_move(
                    &pool,
                    pid,
                    task.id,
                    TaskPlacement::Scheduled,
                    Some("bad"),
                    TaskStatus::Todo
                )
                .await
                .unwrap_err()
            )
            .contains("ScheduledDateInvalid")
        );
    }

    #[tokio::test]
    async fn two_standalone_tasks_share_a_date_freely() {
        let (pool, pid) = seeded_pool().await;
        let first = create(&pool, pid, &task("One")).await.unwrap();
        let second = create(&pool, pid, &task("Two")).await.unwrap();
        schedule(&pool, pid, first.id, "2027-03-15").await.unwrap();

        // Occupancy only constrains series families — plain tasks can
        // share a day (the board holds any number of scheduled cards).
        let moved = schedule(&pool, pid, second.id, "2027-03-15").await.unwrap();
        assert_eq!(moved.scheduled_date.as_deref(), Some("2027-03-15"));
    }

    #[tokio::test]
    async fn skipped_dates_never_leak_another_profiles_series() {
        let (pool, pid) = seeded_pool().await;
        let task = create(
            &pool,
            pid,
            &NewTask {
                series: Some(daily_series()),
                ..task("Repeating")
            },
        )
        .await
        .unwrap();
        let (other_pool, other) = seeded_pool().await;

        assert!(
            skipped_dates(&other_pool, other, task.series_id.unwrap())
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn schedule_rejects_an_impossible_calendar_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        let error = schedule(&pool, pid, task.id, "2027-02-30")
            .await
            .unwrap_err();
        assert!(format!("{error:?}").contains("ScheduledDateInvalid"));
    }

    #[tokio::test]
    async fn schedule_rejects_a_malformed_date() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();

        let error = schedule(&pool, pid, task.id, "not-a-date")
            .await
            .unwrap_err();
        assert!(format!("{error:?}").contains("ScheduledDateInvalid"));
        assert_eq!(
            get(&pool, task.id).await.unwrap().placement,
            TaskPlacement::Backlog
        );
    }

    #[tokio::test]
    async fn return_to_backlog_tombstones_a_series_instance() {
        let (pool, pid) = seeded_pool().await;
        let series = crate::series::create(
            &pool,
            pid,
            &crate::series::SeriesFields {
                title: "Dated",
                description: None,
                carry_over_rule: None,
                estimated_minutes: None,
                series: &daily_series(),
            },
        )
        .await
        .unwrap();
        let instance = sqlx::query_as::<_, Task>(
            "INSERT INTO tasks (profile_id, title, placement, scheduled_date, series_id)              VALUES (?, 'Dated', 'scheduled', '2026-10-30', ?) RETURNING *",
        )
        .bind(pid)
        .bind(series.id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let moved = return_to_backlog(&pool, pid, instance.id).await.unwrap();
        assert_eq!(moved.placement, TaskPlacement::Backlog);
        assert_eq!(moved.series_id, None);
        // The occurrence's date is tombstoned so the board won't
        // rematerialize it — same guarantee as deleting an instance.
        let skipped: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM skipped_instances WHERE series_id = ? AND scheduled_date = '2026-10-30'",
        )
        .bind(series.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(skipped, 1);
    }

    #[tokio::test]
    async fn list_excludes_tasks_that_moved_onto_the_board() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        assert_eq!(list(&pool, pid).await.unwrap().len(), 1);

        add_to_week(&pool, pid, task.id).await.unwrap();
        assert!(list(&pool, pid).await.unwrap().is_empty());
        return_to_backlog(&pool, pid, task.id).await.unwrap();
        assert_eq!(list(&pool, pid).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn return_to_backlog_rejects_another_profiles_task() {
        let (pool, pid) = seeded_pool().await;
        let task = create(&pool, pid, &task("Errand")).await.unwrap();
        sqlx::query("UPDATE tasks SET placement = 'weekly_backlog' WHERE id = ?")
            .bind(task.id)
            .execute(&pool)
            .await
            .unwrap();
        let (other_pool, other) = seeded_pool().await;

        let err = return_to_backlog(&other_pool, other, task.id)
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("TaskNotFound"));
        assert_eq!(
            get(&pool, task.id).await.unwrap().placement,
            TaskPlacement::WeeklyBacklog
        );
    }
}
