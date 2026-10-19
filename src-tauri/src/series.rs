//! Task series: the persisted form of a repeating task (spec: a repetition
//! schedule creates a series; instances are ordinary tasks rows linked via
//! `tasks.series_id`). The schedule is a closed serde-tagged enum stored as
//! JSON text — extending the set later needs only a new variant.

use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqliteConnection, SqlitePool, Transaction};

use crate::db::{DbError, Result};
use crate::errors::ErrorCode;
use crate::tasks::{CarryOverRule, TaskDescription, TaskTitle};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

/// Spec §111-121: the supported recurrence shapes are a closed set —
/// daily/weekly/monthly and the named positional variants. Stored as
/// serde JSON in `task_series.recurrence`; the wire type and the stored
/// document are identical.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Recurrence {
    /// "Every day" / "every 3 days".
    Daily { interval_days: u32 },
    /// "Every week on Monday" / "every 2 weeks on Mon+Wed".
    Weekly {
        interval_weeks: u32,
        weekdays: Vec<Weekday>,
    },
    /// "On the 11th of each month". day 1-31; short months clamp to the
    /// last valid day (spec §119), so day=31 IS "last day of the month".
    MonthlyDay { interval_months: u32, day: u8 },
    /// "Second Monday", "last Friday". nth 1-4 = 1st-4th, -1 = last.
    MonthlyNthWeekday {
        interval_months: u32,
        nth: i8,
        weekday: Weekday,
    },
    /// "First workday after the Nth" — reserved for the work-day-settings
    /// milestone; validation rejects it until then.
    WorkdayAfter { day: u8 },
}

fn invalid(message: impl Into<String>) -> DbError {
    DbError::Validation {
        code: ErrorCode::RecurrenceInvalid,
        message: message.into(),
    }
}

impl Recurrence {
    /// Backend-authoritative rule check (nutype can't wrap variant fields).
    /// Any violation is a typed `RecurrenceInvalid` — malformed schedules
    /// must never reach storage.
    pub fn validate(&self) -> Result<()> {
        match self {
            Recurrence::Daily { interval_days } if *interval_days == 0 => {
                Err(invalid("daily interval must be at least 1"))
            }
            Recurrence::Weekly {
                interval_weeks,
                weekdays,
            } => {
                if *interval_weeks == 0 {
                    return Err(invalid("weekly interval must be at least 1"));
                }
                if weekdays.is_empty() {
                    return Err(invalid("a weekly schedule needs at least one weekday"));
                }
                let mut sorted = weekdays.clone();
                sorted.sort_by_key(|w| *w as u8);
                if sorted.windows(2).any(|w| w[0] == w[1]) {
                    return Err(invalid("weekdays must not repeat"));
                }
                Ok(())
            }
            Recurrence::MonthlyDay {
                interval_months,
                day,
            } => {
                if *interval_months == 0 {
                    return Err(invalid("monthly interval must be at least 1"));
                }
                if !(1..=31).contains(day) {
                    return Err(invalid("day of month must be between 1 and 31"));
                }
                Ok(())
            }
            Recurrence::MonthlyNthWeekday {
                interval_months,
                nth,
                ..
            } => {
                if *interval_months == 0 {
                    return Err(invalid("monthly interval must be at least 1"));
                }
                if !((1..=4).contains(nth) || *nth == -1) {
                    return Err(invalid("nth weekday must be 1-4 or -1 for last"));
                }
                Ok(())
            }
            Recurrence::WorkdayAfter { day } => {
                if !(1..=31).contains(day) {
                    return Err(invalid("day of month must be between 1 and 31"));
                }
                Err(DbError::Validation {
                    code: ErrorCode::WorkdayRulesUnsupported,
                    message: "workday-aware schedules require work-day settings".into(),
                })
            }
            _ => Ok(()),
        }
    }
}

/// Spec §125: a start date is required, an end date optional. Both are ISO
/// `YYYY-MM-DD`; the shape is validated, calendar sanity is left to the
/// later occurrence-calculation milestone.
fn iso_date(raw: &str, code: ErrorCode, field: &str) -> Result<()> {
    let valid = raw.len() == 10
        && raw.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        });
    if !valid {
        return Err(DbError::Validation {
            code,
            message: format!("{field} must be an ISO date (YYYY-MM-DD)"),
        });
    }
    Ok(())
}

/// Input carrying the schedule — a `series` field on task create/update.
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct NewSeries {
    pub recurrence: Recurrence,
    pub start_date: String,
    pub end_date: Option<String>,
}

/// What `insert` persists: the task's own fields plus the schedule.
pub struct SeriesFields<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub carry_over_rule: Option<CarryOverRule>,
    pub estimated_minutes: Option<i64>,
    pub series: &'a NewSeries,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
pub struct TaskSeries {
    pub id: i64,
    pub profile_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub carry_over_rule: CarryOverRule,
    pub estimated_minutes: Option<i64>,
    pub recurrence: Recurrence,
    pub start_date: String,
    pub end_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct SeriesRow {
    id: i64,
    profile_id: i64,
    title: String,
    description: Option<String>,
    carry_over_rule: CarryOverRule,
    estimated_minutes: Option<i64>,
    recurrence: String,
    start_date: String,
    end_date: Option<String>,
    created_at: String,
    updated_at: String,
}

const SERIES_COLUMNS: &str = "id, profile_id, title, description, carry_over_rule, estimated_minutes, \
     recurrence, start_date, end_date, created_at, updated_at";

/// Decodes a stored row. A recurrence blob that fails to parse means the
/// stored document drifted from the enum — an internal error, not input.
fn into_series(row: SeriesRow) -> Result<TaskSeries> {
    Ok(TaskSeries {
        id: row.id,
        profile_id: row.profile_id,
        title: row.title,
        description: row.description,
        carry_over_rule: row.carry_over_rule,
        estimated_minutes: row.estimated_minutes,
        recurrence: serde_json::from_str(&row.recurrence).map_err(|e| DbError::Validation {
            code: ErrorCode::Internal,
            message: format!("stored recurrence is not a known rule: {e}"),
        })?,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn series_not_found() -> DbError {
    DbError::Validation {
        code: ErrorCode::SeriesNotFound,
        message: "task series does not exist".into(),
    }
}

/// Validates then inserts a series inside an existing transaction —
/// callers linking a task need both writes to commit or roll back together.
pub(crate) async fn insert(
    tx: &mut SqliteConnection,
    profile_id: i64,
    fields: &SeriesFields<'_>,
) -> Result<TaskSeries> {
    fields.series.recurrence.validate()?;
    let title = TaskTitle::parse(fields.title)?.into_inner();
    let description = fields
        .description
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(|d| {
            TaskDescription::try_new(d).map_err(|_| DbError::Validation {
                code: ErrorCode::TaskDescriptionTooLong,
                message: format!(
                    "task description must be {} characters or fewer",
                    crate::tasks::TASK_DESCRIPTION_MAX_LEN
                ),
            })
        })
        .transpose()?
        .map(TaskDescription::into_inner);
    let start = fields.series.start_date.trim();
    iso_date(start, ErrorCode::StartDateInvalid, "start date")?;
    let end = fields
        .series
        .end_date
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty());
    if let Some(end) = end {
        iso_date(end, ErrorCode::EndDateInvalid, "end date")?;
        if end < start {
            return Err(DbError::Validation {
                code: ErrorCode::EndDateBeforeStart,
                message: "end date must not be before the start date".into(),
            });
        }
    }
    let recurrence_json =
        serde_json::to_string(&fields.series.recurrence).map_err(|e| DbError::Validation {
            code: ErrorCode::Internal,
            message: format!("recurrence could not be serialized: {e}"),
        })?;
    // Spec §95: carry-over defaults to return-to-backlog for series.
    let carry_over = fields.carry_over_rule.unwrap_or(CarryOverRule::Return);
    let row: SeriesRow = sqlx::query_as(&format!(
        "INSERT INTO task_series \
         (profile_id, title, description, carry_over_rule, estimated_minutes, \
          recurrence, start_date, end_date) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING {SERIES_COLUMNS}"
    ))
    .bind(profile_id)
    .bind(title)
    .bind(description)
    .bind(carry_over)
    .bind(fields.estimated_minutes)
    .bind(recurrence_json)
    .bind(start)
    .bind(end)
    .fetch_one(&mut *tx)
    .await?;
    into_series(row)
}

/// Creates a series on its own — opens and commits a transaction so the
/// transactional `insert` stays the single write path.
pub async fn create(
    pool: &SqlitePool,
    profile_id: i64,
    fields: &SeriesFields<'_>,
) -> Result<TaskSeries> {
    let mut tx: Transaction<'_, Sqlite> = pool.begin().await?;
    let series = insert(&mut tx, profile_id, fields).await?;
    tx.commit().await?;
    Ok(series)
}

pub async fn list(pool: &SqlitePool, profile_id: i64) -> Result<Vec<TaskSeries>> {
    let rows: Vec<SeriesRow> = sqlx::query_as(&format!(
        "SELECT {SERIES_COLUMNS} FROM task_series WHERE profile_id = ? ORDER BY id"
    ))
    .bind(profile_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(into_series).collect()
}

/// Deletes a series scoped to its owning profile; instances cascade
/// (spec §154). Unknown or foreign ids are an error, not a no-op.
pub async fn delete(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM task_series WHERE id = ? AND profile_id = ?")
        .bind(id)
        .bind(profile_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(series_not_found());
    }
    Ok(())
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
            "meander-series-test-{}-{nanos}.db",
            std::process::id()
        ))
    }

    async fn seeded_pool() -> (SqlitePool, i64) {
        let pool = crate::db::connect(&temp_db_path()).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let profile_id = crate::profiles::list(&pool).await.unwrap()[0].id;
        (pool, profile_id)
    }

    const TITLE: &str = "Water plants";
    const START: &str = "2026-10-19";

    fn fields_for(series: &NewSeries) -> SeriesFields<'_> {
        SeriesFields {
            title: TITLE,
            description: None,
            carry_over_rule: None,
            estimated_minutes: None,
            series,
        }
    }

    fn series(recurrence: Recurrence) -> NewSeries {
        NewSeries {
            recurrence,
            start_date: START.to_string(),
            end_date: None,
        }
    }

    fn weekly() -> Recurrence {
        Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![Weekday::Monday],
        }
    }

    fn assert_code(err: &DbError, expected: ErrorCode) {
        assert!(
            matches!(err, DbError::Validation { code, .. } if *code == expected),
            "expected {expected:?}, got {err}"
        );
    }

    #[tokio::test]
    async fn create_round_trips_every_variant() {
        let (pool, pid) = seeded_pool().await;
        for recurrence in [
            Recurrence::Daily { interval_days: 3 },
            weekly(),
            Recurrence::MonthlyDay {
                interval_months: 1,
                day: 31,
            },
            Recurrence::MonthlyNthWeekday {
                interval_months: 2,
                nth: -1,
                weekday: Weekday::Friday,
            },
        ] {
            let input = series(recurrence.clone());
            let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
            assert_eq!(saved.recurrence, recurrence);
            assert_eq!(saved.start_date, START);
            assert_eq!(saved.title, TITLE);
            // Spec §95: a series defaults to return-to-backlog.
            assert_eq!(saved.carry_over_rule, CarryOverRule::Return);
        }
        assert_eq!(list(&pool, pid).await.unwrap().len(), 4);
    }

    #[tokio::test]
    async fn invalid_recurrences_are_rejected() {
        let (pool, pid) = seeded_pool().await;
        for (recurrence, case) in [
            (
                Recurrence::Daily { interval_days: 0 },
                "zero daily interval",
            ),
            (
                Recurrence::Weekly {
                    interval_weeks: 1,
                    weekdays: vec![],
                },
                "empty weekdays",
            ),
            (
                Recurrence::Weekly {
                    interval_weeks: 1,
                    weekdays: vec![Weekday::Monday, Weekday::Monday],
                },
                "repeated weekday",
            ),
            (
                Recurrence::MonthlyDay {
                    interval_months: 1,
                    day: 0,
                },
                "day zero",
            ),
            (
                Recurrence::MonthlyDay {
                    interval_months: 1,
                    day: 32,
                },
                "day 32",
            ),
            (
                Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: 0,
                    weekday: Weekday::Monday,
                },
                "nth zero",
            ),
            (
                Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: 5,
                    weekday: Weekday::Monday,
                },
                "nth five",
            ),
        ] {
            let input = series(recurrence);
            let err = create(&pool, pid, &fields_for(&input)).await.unwrap_err();
            assert_code(&err, ErrorCode::RecurrenceInvalid);
            assert_eq!(list(&pool, pid).await.unwrap().len(), 0, "{case}");
        }
    }

    #[tokio::test]
    async fn workday_rules_are_rejected_until_settings_exist() {
        let (pool, pid) = seeded_pool().await;
        let input = series(Recurrence::WorkdayAfter { day: 11 });
        let err = create(&pool, pid, &fields_for(&input)).await.unwrap_err();
        assert_code(&err, ErrorCode::WorkdayRulesUnsupported);
    }

    #[tokio::test]
    async fn dates_are_validated() {
        let (pool, pid) = seeded_pool().await;
        let mut bad_start = series(weekly());
        bad_start.start_date = "19-10-2026".into();
        let err = create(&pool, pid, &fields_for(&bad_start))
            .await
            .unwrap_err();
        assert_code(&err, ErrorCode::StartDateInvalid);

        let mut bad_end = series(weekly());
        bad_end.end_date = Some("October".into());
        let err = create(&pool, pid, &fields_for(&bad_end)).await.unwrap_err();
        assert_code(&err, ErrorCode::EndDateInvalid);

        let mut inverted = series(weekly());
        inverted.end_date = Some("2026-10-18".into());
        let err = create(&pool, pid, &fields_for(&inverted))
            .await
            .unwrap_err();
        assert_code(&err, ErrorCode::EndDateBeforeStart);
    }

    #[tokio::test]
    async fn delete_is_profile_scoped() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        let other = crate::profiles::create(&pool, "Work").await.unwrap();

        let err = delete(&pool, other.id, saved.id).await.unwrap_err();
        assert_code(&err, ErrorCode::SeriesNotFound);
        assert_eq!(list(&pool, pid).await.unwrap().len(), 1);

        delete(&pool, pid, saved.id).await.unwrap();
        assert_eq!(list(&pool, pid).await.unwrap().len(), 0);

        let err = delete(&pool, pid, saved.id).await.unwrap_err();
        assert_code(&err, ErrorCode::SeriesNotFound);
    }
}
