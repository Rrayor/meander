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

/// Spec §125: a start date is required, an end date optional. Both must be
/// real Gregorian `YYYY-MM-DD` dates — a stored schedule that can never
/// occur ("2026-02-30") would break later occurrence calculation.
fn iso_date(raw: &str, code: ErrorCode, field: &str) -> Result<()> {
    let reject = || DbError::Validation {
        code,
        message: format!("{field} must be a real ISO date (YYYY-MM-DD)"),
    };
    if raw.len() != 10 {
        return Err(reject());
    }
    if raw.as_bytes()[4] != b'-' || raw.as_bytes()[7] != b'-' {
        return Err(reject());
    }
    let year: u32 = raw[0..4].parse().map_err(|_| reject())?;
    let month: u32 = raw[5..7].parse().map_err(|_| reject())?;
    let day: u32 = raw[8..10].parse().map_err(|_| reject())?;
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return Err(reject());
    }
    Ok(())
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn is_leap_year(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

// Civil-calendar arithmetic (Hinnant's algorithms) — enough to walk dates
// without pulling in chrono. Inputs are dates `iso_date` already accepted.
fn parse_iso(raw: &str) -> (u32, u32, u32) {
    (
        raw[0..4].parse().unwrap_or(0),
        raw[5..7].parse().unwrap_or(0),
        raw[8..10].parse().unwrap_or(0),
    )
}

fn to_iso((y, m, d): (u32, u32, u32)) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

fn days_from_civil(y: u32, m: u32, d: u32) -> i64 {
    let y = i64::from(y) - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * i64::from(mp) + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (u32, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    ((yoe + era * 400 + i64::from(m <= 2)) as u32, m, d)
}

/// Weekday index of a date, Monday = 0 (matches the `Weekday` enum order).
fn weekday_index(y: u32, m: u32, d: u32) -> i64 {
    (days_from_civil(y, m, d) + 3).rem_euclid(7)
}

/// Day-of-month of the nth (1-4) or last (-1) `weekday` in a month. Validation
/// bounds nth to those values; every month contains each weekday ≥ 4 times.
fn nth_weekday_day(y: u32, m: u32, nth: i8, weekday: Weekday) -> u32 {
    let offset = (i64::from(weekday as u8) - weekday_index(y, m, 1)).rem_euclid(7);
    let first = 1 + offset as u32;
    if nth == -1 {
        let last_day = days_in_month(y, m);
        first + 7 * ((last_day - first) / 7)
    } else {
        first + 7 * (nth as u32 - 1)
    }
}

/// The first occurrence on or after the series start date — the day the
/// first instance occupies. Mirrors `isScheduledOn` (src/lib/recurrence.ts):
/// weekly/monthly intervals count whole periods anchored at the start, so a
/// start date past its period's matching day pushes the first occurrence
/// into the next eligible period. `None` when the schedule produces no
/// occurrence through `end`.
pub(crate) fn first_occurrence(
    recurrence: &Recurrence,
    start: &str,
    end: Option<&str>,
) -> Option<String> {
    let (y, m, d) = parse_iso(start);
    let first = match recurrence {
        Recurrence::Daily { .. } => (y, m, d),
        Recurrence::Weekly {
            interval_weeks,
            weekdays,
        } => {
            // Eligible weeks are Monday-anchored at the start's week, every
            // `interval_weeks` — the same anchor the frontend predicate uses.
            // This is a fixed internal convention for counting intervals,
            // independent of the user-facing week-start display setting.
            let start_wd = weekday_index(y, m, d);
            let anchor_monday = days_from_civil(y, m, d) - start_wd;
            let this_week = weekdays
                .iter()
                .map(|w| i64::from(*w as u8))
                .filter(|w| *w >= start_wd)
                .min();
            let z = match this_week {
                Some(w) => anchor_monday + w,
                None => {
                    anchor_monday
                        + 7 * i64::from(*interval_weeks)
                        + weekdays.iter().map(|w| i64::from(*w as u8)).min()?
                }
            };
            civil_from_days(z)
        }
        Recurrence::MonthlyDay {
            interval_months,
            day,
        } => {
            let day = u32::from(*day);
            let clamped = day.min(days_in_month(y, m));
            if clamped >= d {
                (y, m, clamped)
            } else {
                let (y2, m2) = shift_months(y, m, *interval_months);
                (y2, m2, day.min(days_in_month(y2, m2)))
            }
        }
        Recurrence::MonthlyNthWeekday {
            interval_months,
            nth,
            weekday,
        } => {
            let day = nth_weekday_day(y, m, *nth, *weekday);
            if day >= d {
                (y, m, day)
            } else {
                let (y2, m2) = shift_months(y, m, *interval_months);
                (y2, m2, nth_weekday_day(y2, m2, *nth, *weekday))
            }
        }
        // Validation rejects workday-aware schedules before insert.
        Recurrence::WorkdayAfter { .. } => return None,
    };
    let (y, m, d) = first;
    // Only four-digit years are representable (isScheduledOn's strict
    // \d{4} pattern); a computed occurrence past 9999-12-31 can never be
    // matched or displayed.
    if y > 9999 {
        return None;
    }
    // Compare civil days, not ISO text — "10000-…" sorts before
    // "9999-…" lexically.
    if let Some(end) = end {
        let (ey, em, ed) = parse_iso(end);
        if days_from_civil(y, m, d) > days_from_civil(ey, em, ed) {
            return None;
        }
    }
    Some(to_iso(first))
}

fn shift_months(y: u32, m: u32, months: u32) -> (u32, u32) {
    let idx = i64::from(y) * 12 + i64::from(m - 1) + i64::from(months);
    ((idx / 12) as u32, (idx % 12 + 1) as u32)
}

/// Input carrying the schedule — a `series` field on task create/update.
/// `recurrence` arrives as untrusted JSON: decoding it inside the typed
/// boundary maps malformed payloads to `RecurrenceInvalid` instead of an
/// opaque Tauri argument error (see `insert`).
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct NewSeries {
    /// Arrives untyped so malformed payloads reach our typed validation
    /// (a Tauri argument error would bypass `ApiError`); the exported
    /// contract stays the `Recurrence` union it must decode to.
    #[specta(type = Recurrence)]
    pub recurrence: serde_json::Value,
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
    let recurrence: Recurrence = serde_json::from_value(fields.series.recurrence.clone())
        .map_err(|e| invalid(format!("recurrence is not a known schedule: {e}")))?;
    recurrence.validate()?;
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
    // The single write path enforces the occurrence rule for every caller:
    // a schedule that can never occur through its end date is rejected.
    if first_occurrence(&recurrence, start, end).is_none() {
        return Err(DbError::Validation {
            code: ErrorCode::RecurrenceInvalid,
            message: "the schedule has no occurrence on or before its end date".into(),
        });
    }
    let recurrence_json = serde_json::to_string(&recurrence).map_err(|e| DbError::Validation {
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
            recurrence: serde_json::to_value(recurrence).unwrap(),
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
    async fn malformed_recurrence_is_a_typed_error() {
        let (pool, pid) = seeded_pool().await;
        for (raw, case) in [
            (
                serde_json::json!({"kind": "weekly", "interval_weeks": 1, "weekdays": null}),
                "null weekdays",
            ),
            (
                serde_json::json!({"kind": "weekly", "interval_weeks": 1, "weekdays": ["funday"]}),
                "unknown weekday",
            ),
            (serde_json::json!({"kind": "quarterly"}), "unknown kind"),
            (
                serde_json::json!({"kind": "monthly_day", "interval_months": 1, "day": 300}),
                "day out of u8 range",
            ),
        ] {
            let input = NewSeries {
                recurrence: raw,
                start_date: START.into(),
                end_date: None,
            };
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

        for (date, case) in [
            ("2026-02-30", "nonexistent day"),
            ("2025-02-29", "non-leap February"),
            ("2026-13-01", "month 13"),
            ("2026-04-31", "April 31"),
        ] {
            let mut impossible = series(weekly());
            impossible.start_date = date.into();
            let err = create(&pool, pid, &fields_for(&impossible))
                .await
                .unwrap_err();
            assert_code(&err, ErrorCode::StartDateInvalid);
            assert_eq!(list(&pool, pid).await.unwrap().len(), 0, "{case}");
        }
        // Boundary cases that DO exist must pass.
        for date in ["2024-02-29", "2026-01-31"] {
            let mut leap = series(weekly());
            leap.start_date = date.into();
            create(&pool, pid, &fields_for(&leap)).await.unwrap();
        }

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
    async fn schedule_with_no_occurrence_is_rejected() {
        let (pool, pid) = seeded_pool().await;
        // START (2026-10-19) is a Monday — a Wednesday-only weekly cannot
        // occur on or before a same-day end.
        let mut impossible = series(Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![Weekday::Wednesday],
        });
        impossible.end_date = Some(START.into());
        let err = create(&pool, pid, &fields_for(&impossible))
            .await
            .unwrap_err();
        assert_code(&err, ErrorCode::RecurrenceInvalid);
        assert_eq!(list(&pool, pid).await.unwrap().len(), 0);
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

    // START (2026-10-19) is a Monday; the first Wednesday after it.
    const WEDNESDAY_AFTER_START: &str = "2026-10-21";

    #[test]
    fn first_occurrence_lands_on_the_first_matching_date() {
        // Daily: the start date is always an occurrence.
        assert_eq!(
            first_occurrence(&Recurrence::Daily { interval_days: 3 }, START, None).as_deref(),
            Some(START)
        );
        // Weekly including the start weekday: the start date itself.
        assert_eq!(
            first_occurrence(&weekly(), START, None).as_deref(),
            Some(START)
        );
        // Weekly excluding it, but with a later weekday in the same week.
        assert_eq!(
            first_occurrence(
                &Recurrence::Weekly {
                    interval_weeks: 1,
                    weekdays: vec![Weekday::Wednesday],
                },
                START,
                None,
            )
            .as_deref(),
            Some(WEDNESDAY_AFTER_START)
        );
        // No matching weekday left this week: the next eligible week —
        // `interval_weeks` later, on the earliest selected weekday.
        assert_eq!(
            first_occurrence(
                &Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Monday, Weekday::Friday],
                },
                "2026-10-24", // a Saturday — past both picks for this week
                None,
            )
            .as_deref(),
            Some("2026-11-02")
        );
        // Monthly-day past this month: clamp into the next eligible month.
        assert_eq!(
            first_occurrence(
                &Recurrence::MonthlyDay {
                    interval_months: 2,
                    day: 31,
                },
                START,
                None,
            )
            .as_deref(),
            Some("2026-10-31")
        );
        assert_eq!(
            first_occurrence(
                &Recurrence::MonthlyDay {
                    interval_months: 3,
                    day: 15,
                },
                START,
                None,
            )
            .as_deref(),
            Some("2027-01-15")
        );
        // Nth weekday: second Monday of Oct 2026 is the 12th; a start after
        // it moves to December's second Monday (interval 2).
        assert_eq!(
            first_occurrence(
                &Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: 2,
                    weekday: Weekday::Monday,
                },
                "2026-10-01",
                None,
            )
            .as_deref(),
            Some("2026-10-12")
        );
        assert_eq!(
            first_occurrence(
                &Recurrence::MonthlyNthWeekday {
                    interval_months: 2,
                    nth: -1,
                    weekday: Weekday::Friday,
                },
                "2026-10-31", // past Oct's last Friday (the 30th)
                None,
            )
            .as_deref(),
            Some("2026-12-25") // last Friday of December
        );
    }

    #[test]
    fn first_occurrence_respects_the_end_date() {
        let never = Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![Weekday::Wednesday],
        };
        // End before the first matching Wednesday → no occurrence.
        assert_eq!(first_occurrence(&never, START, Some("2026-10-20")), None);
        // End on the matching Wednesday → it.
        assert_eq!(
            first_occurrence(&never, START, Some(WEDNESDAY_AFTER_START)).as_deref(),
            Some(WEDNESDAY_AFTER_START)
        );
    }

    #[test]
    fn first_occurrence_stays_within_representable_years() {
        // 9999-12-31 is a Friday. A Monday-only weekly can only occur again
        // in year 10000, which the four-digit ISO contract cannot represent
        // — regardless of whether an end date bounds it.
        let monday = Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![Weekday::Monday],
        };
        let last_day = "9999-12-31";
        assert_eq!(first_occurrence(&monday, last_day, Some(last_day)), None);
        assert_eq!(first_occurrence(&monday, last_day, None), None);
        // A monthly schedule rolling into year 10000 is equally rejected.
        assert_eq!(
            first_occurrence(
                &Recurrence::MonthlyDay {
                    interval_months: 1,
                    day: 1,
                },
                "9999-12-02",
                None,
            ),
            None
        );
    }
}
