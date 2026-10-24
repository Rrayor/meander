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

impl Weekday {
    /// Index in declaration order, Monday = 0 — matches `weekday_index`.
    pub(crate) fn index(self) -> i64 {
        i64::from(self as u8)
    }

    pub(crate) fn from_index(i: i64) -> Option<Self> {
        Some(match i {
            0 => Self::Monday,
            1 => Self::Tuesday,
            2 => Self::Wednesday,
            3 => Self::Thursday,
            4 => Self::Friday,
            5 => Self::Saturday,
            6 => Self::Sunday,
            _ => return None,
        })
    }

    /// All weekdays in canonical Monday-first order.
    pub(crate) const ALL: [Self; 7] = [
        Self::Monday,
        Self::Tuesday,
        Self::Wednesday,
        Self::Thursday,
        Self::Friday,
        Self::Saturday,
        Self::Sunday,
    ];

    /// Bit position in the profiles.work_days mask — Monday is bit 0.
    pub(crate) fn bit(self) -> i64 {
        1 << self.index()
    }
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
pub(crate) fn iso_date(raw: &str, code: ErrorCode, field: &str) -> Result<()> {
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
            interval_weeks: _,
            weekdays,
        } => {
            // Interval weeks count 7-day blocks from the start date itself,
            // so every picked weekday appears once in the first block — the
            // first occurrence is simply the nearest of those offsets.
            // `interval_weeks` only governs later blocks. Independent of the
            // user-facing week-start display setting; mirrors isScheduledOn.
            let start_wd = weekday_index(y, m, d);
            let offset = weekdays
                .iter()
                .map(|w| (i64::from(*w as u8) - start_wd).rem_euclid(7))
                .min()?;
            civil_from_days(days_from_civil(y, m, d) + offset)
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

/// Is `iso` a scheduled occurrence of `recurrence` anchored at `start`,
/// bounded by `end`? Mirrors `isScheduledOn` (src/lib/recurrence.ts) —
/// the calendar offers exactly these dates, and `get_or_create_instance`
/// re-checks the rule server-side rather than trusting the pick.
/// Callers feed stored (already `iso_date`-validated) dates.
pub(crate) fn occurs_on(
    recurrence: &Recurrence,
    start: &str,
    end: Option<&str>,
    iso: &str,
) -> bool {
    let (sy, sm, sd) = parse_iso(start);
    let (dy, dm, dd) = parse_iso(iso);
    let start_z = days_from_civil(sy, sm, sd);
    let day_z = days_from_civil(dy, dm, dd);
    if day_z < start_z {
        return false;
    }
    if let Some(end) = end {
        let (ey, em, ed) = parse_iso(end);
        if day_z > days_from_civil(ey, em, ed) {
            return false;
        }
    }
    let months_between = |from_y: u32, from_m: u32, to_y: u32, to_m: u32| -> i64 {
        (i64::from(to_y) * 12 + i64::from(to_m - 1))
            - (i64::from(from_y) * 12 + i64::from(from_m - 1))
    };
    match recurrence {
        Recurrence::Daily { interval_days } => {
            *interval_days > 0 && (day_z - start_z) % i64::from(*interval_days) == 0
        }
        Recurrence::Weekly {
            interval_weeks,
            weekdays,
        } => {
            let wd = weekday_index(dy, dm, dd);
            if *interval_weeks == 0 || !weekdays.iter().any(|w| i64::from(*w as u8) == wd) {
                return false;
            }
            // Interval weeks count 7-day blocks from the start date itself —
            // independent of any week-start convention — so a weekday pick
            // can never fall into a boundary seam. Mirrors isScheduledOn.
            ((day_z - start_z) / 7) % i64::from(*interval_weeks) == 0
        }
        Recurrence::MonthlyDay {
            interval_months,
            day,
        } => {
            if *interval_months == 0 {
                return false;
            }
            let months = months_between(sy, sm, dy, dm);
            months >= 0
                && months % i64::from(*interval_months) == 0
                && dd == u32::from(*day).min(days_in_month(dy, dm))
        }
        Recurrence::MonthlyNthWeekday {
            interval_months,
            nth,
            weekday,
        } => {
            if *interval_months == 0 || weekday_index(dy, dm, dd) != i64::from(*weekday as u8) {
                return false;
            }
            let months = months_between(sy, sm, dy, dm);
            months >= 0
                && months % i64::from(*interval_months) == 0
                && dd == nth_weekday_day(dy, dm, *nth, *weekday)
        }
        // Validation rejects workday-aware schedules before insert — a
        // stored one could never produce an occurrence here.
        Recurrence::WorkdayAfter { .. } => false,
    }
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

/// Full-row update payload for whole-series editing (spec §146). Every
/// editable property crosses in one write; `category_ids` replaces both
/// the series' own set and every instance's — a series save overwrites
/// instance-level customizations.
#[derive(Debug, Deserialize, specta::Type)]
pub struct UpdateSeries {
    pub title: String,
    pub description: Option<String>,
    pub carry_over_rule: Option<CarryOverRule>,
    pub estimated_minutes: Option<i64>,
    #[specta(type = Recurrence)]
    pub recurrence: serde_json::Value,
    pub start_date: String,
    pub end_date: Option<String>,
    pub category_ids: Vec<i64>,
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
    /// Set only on earlier segments: the living series this pre-split
    /// schedule continues as (spec §146). Segments produce occurrences
    /// only within their own start/end window.
    pub succeeded_by: Option<i64>,
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
    succeeded_by: Option<i64>,
    estimated_minutes: Option<i64>,
    recurrence: String,
    start_date: String,
    end_date: Option<String>,
    created_at: String,
    updated_at: String,
}

const SERIES_COLUMNS: &str = "id, profile_id, title, description, carry_over_rule, estimated_minutes, \
     recurrence, start_date, end_date, succeeded_by, created_at, updated_at";

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
        succeeded_by: row.succeeded_by,
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

/// Everything insert and update share after validation: the decoded
/// schedule plus the normalized persisted fields.
struct PreparedSeries {
    recurrence_json: String,
    title: String,
    description: Option<String>,
    start: String,
    end: Option<String>,
}

/// The shared validation boundary for every series write — malformed
/// schedules, bad dates, unreachable end dates, and over-long text are
/// typed rejections before any row is touched.
fn prepare(
    recurrence_value: &serde_json::Value,
    title_raw: &str,
    description_raw: Option<&str>,
    start_raw: &str,
    end_raw: Option<&str>,
) -> Result<PreparedSeries> {
    let recurrence: Recurrence = serde_json::from_value(recurrence_value.clone())
        .map_err(|e| invalid(format!("recurrence is not a known schedule: {e}")))?;
    recurrence.validate()?;
    let title = TaskTitle::parse(title_raw)?.into_inner();
    let description = description_raw
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
    let start = start_raw.trim();
    iso_date(start, ErrorCode::StartDateInvalid, "start date")?;
    let end = end_raw.map(str::trim).filter(|d| !d.is_empty());
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
    Ok(PreparedSeries {
        recurrence_json,
        title,
        description,
        start: start.to_string(),
        end: end.map(str::to_string),
    })
}

/// Validates then inserts a series inside an existing transaction —
/// callers linking a task need both writes to commit or roll back together.
pub(crate) async fn insert(
    tx: &mut SqliteConnection,
    profile_id: i64,
    fields: &SeriesFields<'_>,
) -> Result<TaskSeries> {
    let prepared = prepare(
        &fields.series.recurrence,
        fields.title,
        fields.description,
        &fields.series.start_date,
        fields.series.end_date.as_deref(),
    )?;
    // Spec §95: carry-over defaults to return-to-backlog for series.
    let carry_over = fields.carry_over_rule.unwrap_or(CarryOverRule::Return);
    let row: SeriesRow = sqlx::query_as(&format!(
        "INSERT INTO task_series \
         (profile_id, title, description, carry_over_rule, estimated_minutes, \
          recurrence, start_date, end_date) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING {SERIES_COLUMNS}"
    ))
    .bind(profile_id)
    .bind(&prepared.title)
    .bind(&prepared.description)
    .bind(carry_over)
    .bind(fields.estimated_minutes)
    .bind(&prepared.recurrence_json)
    .bind(&prepared.start)
    .bind(&prepared.end)
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

/// The decoded series scoped to its owning profile — same not-found
/// semantics as every profile-scoped read.
pub async fn get(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<TaskSeries> {
    into_series(owned_row(pool, profile_id, id).await?)
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
    // Deleting a split series removes its whole chain: earlier segments
    // reference the living row through succeeded_by, so they must go in
    // the same delete or the FK blocks it. Instance rows cascade from
    // every segment.
    let result = sqlx::query(
        "DELETE FROM task_series WHERE (id = ? OR succeeded_by = ?) AND profile_id = ?",
    )
    .bind(id)
    .bind(id)
    .bind(profile_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(series_not_found());
    }
    Ok(())
}

/// Fetches the owning series row — every path scopes to `profile_id` so
/// a foreign id is a not-found, not a leak.
async fn owned_row(pool: &SqlitePool, profile_id: i64, id: i64) -> Result<SeriesRow> {
    let row: Option<SeriesRow> = sqlx::query_as(&format!(
        "SELECT {SERIES_COLUMNS} FROM task_series WHERE id = ? AND profile_id = ?"
    ))
    .bind(id)
    .bind(profile_id)
    .fetch_optional(pool)
    .await?;
    row.ok_or_else(series_not_found)
}

/// Writes the series' category set and propagates it to every instance
/// (spec §146). Category ids must belong to the profile — a foreign or
/// unknown id rejects the whole update.
async fn sync_categories(
    tx: &mut SqliteConnection,
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
    category_ids: &[i64],
) -> Result<()> {
    for category_id in category_ids {
        crate::categories::ensure_exists(pool, profile_id, *category_id).await?;
    }
    sqlx::query("DELETE FROM series_categories WHERE series_id = ?")
        .bind(series_id)
        .execute(&mut *tx)
        .await?;
    for category_id in category_ids {
        sqlx::query("INSERT INTO series_categories (series_id, category_id) VALUES (?, ?)")
            .bind(series_id)
            .bind(category_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "DELETE FROM task_categories WHERE task_id IN \
         (SELECT id FROM tasks WHERE series_id = ?)",
    )
    .bind(series_id)
    .execute(&mut *tx)
    .await?;
    for category_id in category_ids {
        sqlx::query(
            "INSERT INTO task_categories (task_id, category_id) \
             SELECT id, ? FROM tasks WHERE series_id = ?",
        )
        .bind(category_id)
        .bind(series_id)
        .execute(&mut *tx)
        .await?;
    }
    Ok(())
}

/// Whole-series update (spec §146): the shared fields land on the series
/// row and propagate to every persisted instance — past and future —
/// overwriting instance-level customizations. `status`, `spent_minutes`,
/// `scheduled_date`, and `placement` stay per-instance; the series row
/// doesn't carry them. All writes share one transaction so a failed
/// category or schedule leaves the series untouched.
pub async fn update(
    pool: &SqlitePool,
    profile_id: i64,
    id: i64,
    input: &UpdateSeries,
) -> Result<TaskSeries> {
    let mut tx: Transaction<'_, Sqlite> = pool.begin().await?;
    owned_row(pool, profile_id, id).await?;
    let prepared = prepare(
        &input.recurrence,
        &input.title,
        input.description.as_deref(),
        &input.start_date,
        input.end_date.as_deref(),
    )?;
    // Spec §95: carry-over defaults to return-to-backlog for series.
    let carry_over = input.carry_over_rule.unwrap_or(CarryOverRule::Return);
    // Same estimate boundary as task writes — without it, invalid values
    // surface as a generic CHECK failure on instance rows.
    let estimated = crate::tasks::parse_estimate(input.estimated_minutes)?;
    let result = sqlx::query(
        "UPDATE task_series SET title = ?, description = ?, carry_over_rule = ?, \
         estimated_minutes = ?, recurrence = ?, start_date = ?, end_date = ?, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&prepared.title)
    .bind(&prepared.description)
    .bind(carry_over)
    .bind(estimated)
    .bind(&prepared.recurrence_json)
    .bind(&prepared.start)
    .bind(&prepared.end)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(series_not_found());
    }
    sqlx::query(
        "UPDATE tasks SET title = ?, description = ?, carry_over_rule = ?, \
         estimated_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE series_id = ?",
    )
    .bind(&prepared.title)
    .bind(&prepared.description)
    .bind(carry_over)
    .bind(estimated)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sync_categories(&mut tx, pool, profile_id, id, &input.category_ids).await?;
    tx.commit().await?;
    into_series(owned_row(pool, profile_id, id).await?)
}

/// "Current and future" deletion (spec §152/§236): ends the series at the
/// viewed date — persisted instances on or after `from_date` are removed
/// and `end_date` moves to the day before, so the schedule can no longer
/// produce them. A `from_date` at or before the start is the same as
/// deleting the whole series. Past instances keep `series_id` and stay
/// viewable.
pub async fn truncate(pool: &SqlitePool, profile_id: i64, id: i64, from_date: &str) -> Result<()> {
    iso_date(from_date, ErrorCode::StartDateInvalid, "from date")?;
    let mut tx: Transaction<'_, Sqlite> = pool.begin().await?;
    let row = owned_row(pool, profile_id, id).await?;
    if from_date <= row.start_date.as_str() {
        sqlx::query("DELETE FROM task_series WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(());
    }
    sqlx::query("DELETE FROM tasks WHERE series_id = ? AND scheduled_date >= ?")
        .bind(id)
        .bind(from_date)
        .execute(&mut *tx)
        .await?;
    let (y, m, d) = parse_iso(from_date);
    let proposed = to_iso(civil_from_days(days_from_civil(y, m, d) - 1));
    // Deleting a persisted instance beyond an already-set end must not
    // revive occurrences between the old end and the new cutoff — keep the
    // earlier of the two.
    let new_end = match &row.end_date {
        Some(existing) if existing < &proposed => existing.clone(),
        _ => proposed,
    };
    sqlx::query("UPDATE task_series SET end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(new_end)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// "This and future" editing (spec §146/§234): splits the series at
/// `from_date` *invisibly* — the living series keeps its id, so every
/// reference (open dialogs, notes, queries) sees the edit immediately.
/// A new earlier segment carries the past: it is a clone of the old
/// schedule ended the day before the cutoff (same rule as `truncate`),
/// and persisted instances before `from_date` move onto it with their
/// custom values untouched. The living series then takes the edited
/// fields and schedule starting at the cutoff — identical to a
/// series-scope `update` restricted to the future. Repeated splits just
/// add more segments; nothing assumes a single one. A `from_date` at
/// or before the start with nothing earlier persisted is a full update.
pub async fn update_from(
    pool: &SqlitePool,
    profile_id: i64,
    id: i64,
    from_date: &str,
    input: &UpdateSeries,
) -> Result<TaskSeries> {
    iso_date(from_date, ErrorCode::InstanceDateInvalid, "from date")?;
    let row = owned_row(pool, profile_id, id).await?;
    let earlier: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE series_id = ? AND scheduled_date < ?")
            .bind(id)
            .bind(from_date)
            .fetch_one(pool)
            .await?;
    // A cutoff at the series start degenerates to a full update when
    // nothing earlier persisted — a start moved forward can leave
    // off-schedule rows behind that must not be overwritten. A cutoff
    // *before* the start is ambiguous: a stale retry of a superseded
    // split lands in an earlier segment's window, while a legit edit
    // anchored on an off-schedule persisted row does not. Only the
    // former is an idempotent no-op; the latter applies normally.
    if earlier == 0 {
        if from_date == row.start_date {
            return update(pool, profile_id, id, input).await;
        }
        if from_date < row.start_date.as_str() {
            let covered: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM task_series \
                 WHERE succeeded_by = ? AND start_date <= ? \
                 AND (end_date IS NULL OR end_date >= ?))",
            )
            .bind(id)
            .bind(from_date)
            .bind(from_date)
            .fetch_one(pool)
            .await?;
            if covered {
                return get(pool, profile_id, id).await;
            }
            // Uncovered and before the start is only legitimate when a
            // persisted row anchors the cutoff (a moved start's
            // survivor). Without one the date is fabricated — applying
            // the payload would rewrite the whole series.
            let anchored: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM tasks \
                 WHERE series_id = ? AND scheduled_date = ?)",
            )
            .bind(id)
            .bind(from_date)
            .fetch_one(pool)
            .await?;
            if !anchored {
                return Err(crate::db::DbError::Validation {
                    code: ErrorCode::InstanceDateNotScheduled,
                    message: "no instance of this series exists on that date".into(),
                });
            }
            return update(pool, profile_id, id, input).await;
        }
    }
    let later: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE series_id = ? AND scheduled_date >= ?",
    )
    .bind(id)
    .bind(from_date)
    .fetch_one(pool)
    .await?;
    // A real split always keeps at least the anchored instance. Zero
    // rows means the split already ran (a retried submit against the
    // old id) or the anchor never belonged to the series.
    if later == 0 {
        return Err(crate::db::DbError::Validation {
            code: ErrorCode::InstanceDateNotScheduled,
            message: "no instance of this series exists on or after that date".into(),
        });
    }
    let mut tx: Transaction<'_, Sqlite> = pool.begin().await?;

    if earlier > 0 {
        // Earlier segment: a clone of the old series, ended the day
        // before the cutoff (earlier of from-1 and any existing end),
        // taking over the persisted past. Its categories mirror the old
        // set so the moved instances keep their chips.
        let (y, m, d) = parse_iso(from_date);
        let proposed = to_iso(civil_from_days(days_from_civil(y, m, d) - 1));
        let segment_end = match &row.end_date {
            Some(existing) if existing < &proposed => existing.clone(),
            _ => proposed,
        };
        let segment: SeriesRow = sqlx::query_as(&format!(
            "INSERT INTO task_series \
             (profile_id, title, description, carry_over_rule, estimated_minutes, \
              recurrence, start_date, end_date, succeeded_by) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING {SERIES_COLUMNS}"
        ))
        .bind(profile_id)
        .bind(&row.title)
        .bind(&row.description)
        .bind(row.carry_over_rule)
        .bind(row.estimated_minutes)
        .bind(&row.recurrence)
        .bind(&row.start_date)
        .bind(&segment_end)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO series_categories (series_id, category_id) \
             SELECT ?, category_id FROM series_categories WHERE series_id = ?",
        )
        .bind(segment.id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE tasks SET series_id = ? WHERE series_id = ? AND scheduled_date < ?")
            .bind(segment.id)
            .bind(id)
            .bind(from_date)
            .execute(&mut *tx)
            .await?;
    }

    // The living series takes the edited values; its start anchors at
    // the cutoff so persisted instances can never sit before it.
    let prepared = prepare(
        &input.recurrence,
        &input.title,
        input.description.as_deref(),
        from_date,
        input.end_date.as_deref(),
    )?;
    let carry_over = input.carry_over_rule.unwrap_or(CarryOverRule::Return);
    let estimated = crate::tasks::parse_estimate(input.estimated_minutes)?;
    sqlx::query(
        "UPDATE task_series SET title = ?, description = ?, carry_over_rule = ?, \
         estimated_minutes = ?, recurrence = ?, start_date = ?, end_date = ?, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&prepared.title)
    .bind(&prepared.description)
    .bind(carry_over)
    .bind(estimated)
    .bind(&prepared.recurrence_json)
    .bind(&prepared.start)
    .bind(&prepared.end)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE tasks SET title = ?, description = ?, carry_over_rule = ?, \
         estimated_minutes = ?, updated_at = CURRENT_TIMESTAMP \
         WHERE series_id = ? AND scheduled_date >= ?",
    )
    .bind(&prepared.title)
    .bind(&prepared.description)
    .bind(carry_over)
    .bind(estimated)
    .bind(id)
    .bind(from_date)
    .execute(&mut *tx)
    .await?;
    sync_categories(&mut tx, pool, profile_id, id, &input.category_ids).await?;
    tx.commit().await?;
    into_series(owned_row(pool, profile_id, id).await?)
}

/// Categories attached to a series, ordered like the task-scoped listing.
pub async fn list_categories(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
) -> Result<Vec<crate::categories::Category>> {
    owned_row(pool, profile_id, series_id).await?;
    Ok(sqlx::query_as::<_, crate::categories::Category>(
        "SELECT c.* FROM categories c
         JOIN series_categories sc ON sc.category_id = c.id
         WHERE sc.series_id = ? AND c.profile_id = ?
         ORDER BY c.title, c.id",
    )
    .bind(series_id)
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
        // Interval blocks anchor at the start date, so the first block always
        // contains every picked weekday — the nearest one wins even though
        // Monday is "earlier in the week" than the Saturday start.
        assert_eq!(
            first_occurrence(
                &Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Monday, Weekday::Friday],
                },
                "2026-10-24", // a Saturday — Oct 26 (Mon) and Oct 30 (Fri) are in block 0
                None,
            )
            .as_deref(),
            Some("2026-10-26")
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
    fn occurs_on_matches_every_recurrence_kind() {
        // START is a Monday. Each case mirrors isScheduledOn's table.
        let cases: &[(Recurrence, &str, &str, Option<&str>, bool)] = &[
            (
                Recurrence::Daily { interval_days: 3 },
                START,
                "2026-10-22",
                None,
                true,
            ),
            (
                Recurrence::Daily { interval_days: 3 },
                START,
                "2026-10-21",
                None,
                false,
            ),
            (weekly(), START, "2026-11-02", None, true),
            (weekly(), START, "2026-10-21", None, false),
            (
                Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Monday],
                },
                START,
                "2026-10-26", // the off week — anchor skips it
                None,
                false,
            ),
            (
                Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Monday],
                },
                START,
                "2026-11-02",
                None,
                true,
            ),
            // Start-anchored blocks: a Saturday start's block 0 is Oct
            // 24–30, so Friday Oct 30 is the first occurrence — a Monday
            // anchor would have skipped the whole week and matched Nov 6.
            (
                Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Friday],
                },
                "2026-10-24",
                "2026-10-30",
                None,
                true,
            ),
            (
                Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Friday],
                },
                "2026-10-24",
                "2026-11-06", // block 1 — skipped
                None,
                false,
            ),
            (
                Recurrence::Weekly {
                    interval_weeks: 2,
                    weekdays: vec![Weekday::Friday],
                },
                "2026-10-24",
                "2026-11-13", // block 2
                None,
                true,
            ),
            (
                Recurrence::MonthlyDay {
                    interval_months: 1,
                    day: 31,
                },
                START,
                "2026-10-31",
                None,
                true,
            ),
            (
                Recurrence::MonthlyDay {
                    interval_months: 1,
                    day: 31,
                },
                START,
                "2026-11-30", // November clamps the 31st to the 30th
                None,
                true,
            ),
            (
                Recurrence::MonthlyDay {
                    interval_months: 2,
                    day: 19,
                },
                START,
                "2026-11-19", // odd month gap — not an eligible month
                None,
                false,
            ),
            (
                Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: 2,
                    weekday: Weekday::Monday,
                },
                START,
                "2026-11-09", // second Monday of November
                None,
                true,
            ),
            (
                Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: 2,
                    weekday: Weekday::Monday,
                },
                START,
                "2026-11-16", // third Monday
                None,
                false,
            ),
            (
                Recurrence::MonthlyNthWeekday {
                    interval_months: 1,
                    nth: -1,
                    weekday: Weekday::Friday,
                },
                START,
                "2026-10-30", // last Friday of October
                None,
                true,
            ),
            // Bounds: before the start and past the end never occur.
            (weekly(), START, "2026-10-12", None, false),
            (weekly(), START, "2026-10-26", Some("2026-10-25"), false),
            (weekly(), START, "2026-10-26", Some("2026-10-26"), true),
            (
                Recurrence::WorkdayAfter { day: 11 },
                START,
                "2026-11-11",
                None,
                false,
            ),
        ];
        for (recurrence, start, iso, end, expected) in cases {
            assert_eq!(
                occurs_on(recurrence, start, *end, iso),
                *expected,
                "{recurrence:?} on {iso}"
            );
        }
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

    const NEW_TITLE: &str = "Mow the lawn";
    const SECOND_INSTANCE_DATE: &str = "2026-10-26";
    const INSTANCE_FIXTURE_TITLE: &str = "custom title";
    const THIRD_INSTANCE_DATE: &str = "2026-11-02";

    fn update_input(recurrence: Recurrence) -> UpdateSeries {
        UpdateSeries {
            title: NEW_TITLE.to_string(),
            description: Some("weekly chore".to_string()),
            carry_over_rule: Some(CarryOverRule::Carry),
            estimated_minutes: Some(45),
            recurrence: serde_json::to_value(recurrence).unwrap(),
            start_date: START.to_string(),
            end_date: None,
            category_ids: vec![],
        }
    }

    /// A persisted instance of `series_id` on `iso` with fields the update
    /// must overwrite — stands in for a later instance's custom edits.
    async fn add_instance(pool: &SqlitePool, profile_id: i64, series_id: i64, iso: &str) -> i64 {
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, description, carry_over_rule, \
             estimated_minutes, series_id, scheduled_date, sort_order) \
             VALUES (?, ?, 'custom notes', 'carry', 5, ?, ?, 0)",
        )
        .bind(profile_id)
        .bind(INSTANCE_FIXTURE_TITLE)
        .bind(series_id)
        .bind(iso)
        .execute(pool)
        .await
        .unwrap()
        .last_insert_rowid()
    }

    async fn instance(pool: &SqlitePool, id: i64) -> crate::tasks::Task {
        sqlx::query_as("SELECT * FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn update_writes_shared_fields_to_the_series_and_every_instance() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        let other = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        let updated = update(&pool, pid, saved.id, &update_input(weekly()))
            .await
            .unwrap();
        assert_eq!(updated.title, NEW_TITLE);
        assert_eq!(updated.description.as_deref(), Some("weekly chore"));
        assert_eq!(updated.carry_over_rule, CarryOverRule::Carry);
        assert_eq!(updated.estimated_minutes, Some(45));

        // The customized instance is overwritten with the shared values —
        // status and spent stay per-instance (the series doesn't carry them).
        let instance = instance(&pool, other).await;
        assert_eq!(instance.title, NEW_TITLE);
        assert_eq!(instance.description.as_deref(), Some("weekly chore"));
        assert_eq!(instance.carry_over_rule, Some(CarryOverRule::Carry));
        assert_eq!(instance.estimated_minutes, Some(45));
    }

    #[tokio::test]
    async fn update_syncs_the_category_set_to_series_and_instances() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        let task_id = add_instance(&pool, pid, saved.id, START).await;
        let cat = crate::categories::create(
            &pool,
            pid,
            &crate::categories::NewCategory {
                title: "Home".to_string(),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let mut input = update_input(weekly());
        input.category_ids = vec![cat.id];
        update(&pool, pid, saved.id, &input).await.unwrap();

        assert_eq!(
            list_categories(&pool, pid, saved.id).await.unwrap().len(),
            1
        );
        assert_eq!(
            crate::categories::for_task(&pool, pid, task_id)
                .await
                .unwrap()
                .len(),
            1
        );

        // Saving a different set removes the old one everywhere.
        input.category_ids = vec![];
        update(&pool, pid, saved.id, &input).await.unwrap();
        assert!(
            list_categories(&pool, pid, saved.id)
                .await
                .unwrap()
                .is_empty()
        );
        assert!(
            crate::categories::for_task(&pool, pid, task_id)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn update_rejects_an_unknown_or_foreign_series() {
        let (pool, pid) = seeded_pool().await;
        assert_code(
            &update(&pool, pid, 9999, &update_input(weekly()))
                .await
                .unwrap_err(),
            ErrorCode::SeriesNotFound,
        );
        // A second profile's series is invisible to the first.
        let other_profile = crate::profiles::create(&pool, "Second").await.unwrap().id;
        let input = series(weekly());
        let saved = create(&pool, other_profile, &fields_for(&input))
            .await
            .unwrap();
        assert_code(
            &update(&pool, pid, saved.id, &update_input(weekly()))
                .await
                .unwrap_err(),
            ErrorCode::SeriesNotFound,
        );
    }

    #[tokio::test]
    async fn update_rejects_a_schedule_with_no_occurrence_and_leaves_rows_untouched() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        let mut input = update_input(weekly());
        input.end_date = Some("2026-10-19".to_string());
        input.recurrence = serde_json::to_value(Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![Weekday::Wednesday],
        })
        .unwrap();
        assert_code(
            &update(&pool, pid, saved.id, &input).await.unwrap_err(),
            ErrorCode::RecurrenceInvalid,
        );
        // Atomic: the series row still holds the original schedule.
        assert_eq!(list(&pool, pid).await.unwrap()[0].recurrence, weekly());
    }

    #[tokio::test]
    async fn update_rejects_a_foreign_category_and_leaves_rows_untouched() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        let other_profile = crate::profiles::create(&pool, "Second").await.unwrap().id;
        let foreign = crate::categories::create(
            &pool,
            other_profile,
            &crate::categories::NewCategory {
                title: "Foreign".to_string(),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let mut input = update_input(weekly());
        input.category_ids = vec![foreign.id];
        let err = update(&pool, pid, saved.id, &input).await.unwrap_err();
        assert_code(&err, ErrorCode::CategoryNotFound);
        assert!(
            list_categories(&pool, pid, saved.id)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn truncate_removes_future_instances_and_ends_the_series() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        // First instance (START is the Monday anchor) plus two later ones.
        add_instance(&pool, pid, saved.id, START).await;
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;
        add_instance(&pool, pid, saved.id, THIRD_INSTANCE_DATE).await;

        truncate(&pool, pid, saved.id, SECOND_INSTANCE_DATE)
            .await
            .unwrap();

        let remaining: Vec<String> = sqlx::query_scalar(
            "SELECT scheduled_date FROM tasks WHERE series_id = ? ORDER BY scheduled_date",
        )
        .bind(saved.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(remaining, vec![START.to_string()]);
        let series = list(&pool, pid).await.unwrap();
        assert_eq!(series[0].end_date.as_deref(), Some("2026-10-25"));
        // The removed instance is gone entirely.
        assert!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tasks WHERE id = ?")
                .bind(second)
                .fetch_one(&pool)
                .await
                .unwrap()
                == 0
        );
    }

    #[tokio::test]
    async fn truncate_at_or_before_the_start_deletes_the_whole_series() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        truncate(&pool, pid, saved.id, START).await.unwrap();

        assert!(list(&pool, pid).await.unwrap().is_empty());
        assert!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tasks WHERE series_id = ?")
                .bind(saved.id)
                .fetch_one(&pool)
                .await
                .unwrap()
                == 0
        );
    }

    #[tokio::test]
    async fn truncate_rejects_an_unknown_series_and_a_bad_date() {
        let (pool, pid) = seeded_pool().await;
        assert_code(
            &truncate(&pool, pid, 9999, SECOND_INSTANCE_DATE)
                .await
                .unwrap_err(),
            ErrorCode::SeriesNotFound,
        );
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        assert_code(
            &truncate(&pool, pid, saved.id, "not-a-date")
                .await
                .unwrap_err(),
            ErrorCode::StartDateInvalid,
        );
    }

    #[tokio::test]
    async fn update_rejects_an_out_of_range_estimate() {
        let (pool, pid) = seeded_pool().await;
        let input = series(weekly());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();

        for bad in [Some(0), Some(crate::tasks::MAX_DURATION_MINUTES + 1)] {
            let mut update_input = update_input(weekly());
            update_input.estimated_minutes = bad;
            assert_code(
                &update(&pool, pid, saved.id, &update_input)
                    .await
                    .unwrap_err(),
                ErrorCode::EstimatedTimeOutOfRange,
            );
        }
        // Nothing was written — the series kept its original estimate.
        assert_eq!(
            list(&pool, pid).await.unwrap()[0].estimated_minutes,
            saved.estimated_minutes
        );
    }

    #[tokio::test]
    async fn truncate_never_extends_an_earlier_end() {
        const EXISTING_END: &str = "2026-10-20";
        const OFF_SCHEDULE_INSTANCE: &str = "2026-11-10";

        let (pool, pid) = seeded_pool().await;
        let mut input = series(weekly());
        input.end_date = Some(EXISTING_END.to_string());
        let saved = create(&pool, pid, &fields_for(&input)).await.unwrap();
        // A persisted off-schedule instance beyond the current end.
        add_instance(&pool, pid, saved.id, OFF_SCHEDULE_INSTANCE).await;

        truncate(&pool, pid, saved.id, OFF_SCHEDULE_INSTANCE)
            .await
            .unwrap();

        // The instance is gone, but the earlier end stands — ending the
        // series at that date must not revive the weeks in between.
        let series = list(&pool, pid).await.unwrap();
        assert_eq!(series[0].end_date.as_deref(), Some(EXISTING_END));
        assert!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM tasks WHERE series_id = ? AND scheduled_date >= ?"
            )
            .bind(saved.id)
            .bind(OFF_SCHEDULE_INSTANCE)
            .fetch_one(&pool)
            .await
            .unwrap()
                == 0
        );
    }

    #[tokio::test]
    async fn update_from_splits_a_prior_segment_off_the_living_series() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let first = add_instance(&pool, pid, saved.id, START).await;
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;
        let third = add_instance(&pool, pid, saved.id, THIRD_INSTANCE_DATE).await;

        let updated = update_from(
            &pool,
            pid,
            saved.id,
            SECOND_INSTANCE_DATE,
            &update_input(weekly()),
        )
        .await
        .unwrap();

        // The living series keeps its id and takes the edited values
        // anchored at the cutoff.
        assert_eq!(updated.id, saved.id);
        assert_eq!(updated.title, NEW_TITLE);
        assert_eq!(updated.start_date, SECOND_INSTANCE_DATE);

        // The prior segment is a clone of the old schedule ended the
        // day before, holding the past instance with its custom values.
        let series = list(&pool, pid).await.unwrap();
        assert_eq!(series.len(), 2);
        let segment = series.iter().find(|s| s.id != saved.id).unwrap();
        assert_eq!(segment.end_date.as_deref(), Some("2026-10-25"));
        assert_eq!(segment.start_date, START);
        let past = instance(&pool, first).await;
        assert_eq!(past.series_id, Some(segment.id));
        assert_eq!(past.title, INSTANCE_FIXTURE_TITLE);

        // Future rows stay on the living series — ids preserved — with
        // the edited shared fields written over them.
        for id in [second, third] {
            let moved = instance(&pool, id).await;
            assert_eq!(moved.series_id, Some(saved.id));
            assert_eq!(moved.title, NEW_TITLE);
            assert_eq!(moved.description.as_deref(), Some("weekly chore"));
        }

        // The backlog shows one entry per series — the earliest
        // instance, which sits on the prior segment (spec §146: a
        // continuing series, not a new entry).
        let backlog: Vec<i64> = crate::tasks::list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert!(backlog.contains(&first));
        assert!(!backlog.contains(&second));
        assert!(!backlog.contains(&third));

        // The details view resolves the whole series from any member:
        // instances queried through the prior segment still see the
        // future.
        let via_segment = crate::tasks::list_instances(&pool, pid, segment.id)
            .await
            .unwrap();
        assert_eq!(via_segment.len(), 3);
    }

    #[tokio::test]
    async fn update_from_syncs_categories_onto_the_living_series() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let first = add_instance(&pool, pid, saved.id, START).await;
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;
        let cat = crate::categories::create(
            &pool,
            pid,
            &crate::categories::NewCategory {
                title: "Home".to_string(),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        // The old series had this category; the segment must keep it.
        let mut input = update_input(weekly());
        input.category_ids = vec![cat.id];
        update(&pool, pid, saved.id, &input).await.unwrap();

        let new_cat = crate::categories::create(
            &pool,
            pid,
            &crate::categories::NewCategory {
                title: "Work".to_string(),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        input.category_ids = vec![new_cat.id];
        update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();

        // The living series takes the new set; the moved-off past keeps
        // the segment's copy of the old one.
        assert_eq!(
            list_categories(&pool, pid, saved.id).await.unwrap()[0].id,
            new_cat.id
        );
        assert_eq!(
            crate::categories::for_task(&pool, pid, second)
                .await
                .unwrap()[0]
                .id,
            new_cat.id
        );
        let segment = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|s| s.id != saved.id)
            .unwrap();
        assert_eq!(
            list_categories(&pool, pid, segment.id).await.unwrap()[0].id,
            cat.id
        );
        assert_eq!(
            crate::categories::for_task(&pool, pid, first)
                .await
                .unwrap()[0]
                .id,
            cat.id
        );
    }

    #[tokio::test]
    async fn update_from_at_or_before_the_start_is_a_full_update() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        let result = update_from(&pool, pid, saved.id, START, &update_input(weekly()))
            .await
            .unwrap();

        // No split — the same row came back updated.
        assert_eq!(result.id, saved.id);
        assert_eq!(result.title, NEW_TITLE);
        assert_eq!(list(&pool, pid).await.unwrap().len(), 1);
        assert_eq!(instance(&pool, second).await.title, NEW_TITLE);
    }

    #[tokio::test]
    async fn update_from_rejects_foreign_series_and_bad_dates() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let other = crate::profiles::create(&pool, "Work").await.unwrap();

        assert_code(
            &update_from(
                &pool,
                other.id,
                saved.id,
                SECOND_INSTANCE_DATE,
                &update_input(weekly()),
            )
            .await
            .unwrap_err(),
            ErrorCode::SeriesNotFound,
        );
        assert_code(
            &update_from(&pool, pid, saved.id, "not-a-date", &update_input(weekly()))
                .await
                .unwrap_err(),
            ErrorCode::InstanceDateInvalid,
        );
    }

    #[tokio::test]
    async fn update_from_before_the_start_still_splits_when_earlier_rows_exist() {
        const MOVED_START: &str = "2026-11-02";

        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        // An off-schedule persisted row before a start the user moved
        // forward — a full update must not overwrite it.
        let early = add_instance(&pool, pid, saved.id, START).await;
        sqlx::query("UPDATE task_series SET start_date = ? WHERE id = ?")
            .bind(MOVED_START)
            .bind(saved.id)
            .execute(&pool)
            .await
            .unwrap();
        let later = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        let updated = update_from(
            &pool,
            pid,
            saved.id,
            SECOND_INSTANCE_DATE,
            &update_input(weekly()),
        )
        .await
        .unwrap();

        assert_eq!(updated.id, saved.id);
        let past = instance(&pool, early).await;
        let segment = list(&pool, pid)
            .await
            .unwrap()
            .into_iter()
            .find(|s| s.id != saved.id)
            .unwrap();
        assert_eq!(past.series_id, Some(segment.id));
        assert_eq!(past.title, INSTANCE_FIXTURE_TITLE);
        let moved = instance(&pool, later).await;
        assert_eq!(moved.series_id, Some(saved.id));
        assert_eq!(moved.title, NEW_TITLE);
    }

    #[tokio::test]
    async fn update_from_a_retried_split_is_a_harmless_full_update() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        add_instance(&pool, pid, saved.id, START).await;
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        let input = update_input(weekly());
        update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();

        // Retrying against the same (living) id: no earlier rows remain
        // and the cutoff is its start, so it degenerates to a normal
        // whole-series update — same values, no duplicate, no error.
        let result = update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();
        assert_eq!(result.id, saved.id);
        let all = list(&pool, pid).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(instance(&pool, second).await.title, NEW_TITLE);
    }

    #[tokio::test]
    async fn update_from_a_stale_retry_after_a_later_split_is_a_no_op() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        for iso in [START, SECOND_INSTANCE_DATE, THIRD_INSTANCE_DATE] {
            add_instance(&pool, pid, saved.id, iso).await;
        }

        let input = update_input(weekly());
        update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();
        update_from(&pool, pid, saved.id, THIRD_INSTANCE_DATE, &input)
            .await
            .unwrap();

        // A stale retry of the first split arrives after the second one
        // moved the living start forward. Rewinding the start would
        // overlap the second segment's window, so the call must leave
        // everything as-is.
        let result = update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();
        assert_eq!(result.start_date, THIRD_INSTANCE_DATE);
        assert_eq!(list(&pool, pid).await.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn update_from_before_a_moved_start_still_saves() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let anchor = add_instance(&pool, pid, saved.id, START).await;
        add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;

        // A whole-series update can move the start past persisted rows
        // without deleting them (off-schedule survivors).
        let mut moved = update_input(weekly());
        moved.start_date = THIRD_INSTANCE_DATE.into();
        update(&pool, pid, saved.id, &moved).await.unwrap();

        // Editing the earliest row — now predating the start — must
        // apply, not be mistaken for a stale retry: no earlier segment
        // covers its date.
        let result = update_from(&pool, pid, saved.id, START, &update_input(weekly()))
            .await
            .unwrap();
        assert_eq!(result.title, NEW_TITLE);
        assert_eq!(instance(&pool, anchor).await.title, NEW_TITLE);
    }

    #[tokio::test]
    async fn update_from_a_fabricated_pre_start_date_rejects() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let anchor = add_instance(&pool, pid, saved.id, START).await;

        // No segment and no instance on the cutoff — a fabricated
        // from_date must not rewrite the whole series.
        let err = update_from(&pool, pid, saved.id, "2026-10-05", &update_input(weekly()))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: ErrorCode::InstanceDateNotScheduled,
                ..
            }
        ));
        assert_eq!(instance(&pool, anchor).await.title, INSTANCE_FIXTURE_TITLE);
    }

    #[tokio::test]
    async fn update_from_twice_keeps_a_three_segment_chain_and_its_rows() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        let first = add_instance(&pool, pid, saved.id, START).await;
        let second = add_instance(&pool, pid, saved.id, SECOND_INSTANCE_DATE).await;
        let third = add_instance(&pool, pid, saved.id, THIRD_INSTANCE_DATE).await;

        let input = update_input(weekly());
        update_from(&pool, pid, saved.id, SECOND_INSTANCE_DATE, &input)
            .await
            .unwrap();
        update_from(&pool, pid, saved.id, THIRD_INSTANCE_DATE, &input)
            .await
            .unwrap();

        // The chain: earliest (START..SECOND-1) — middle (SECOND..THIRD-1)
        // — living (THIRD..), each linked to the living row and owning
        // the instances inside its window.
        let all = list(&pool, pid).await.unwrap();
        assert_eq!(all.len(), 3);
        let earliest = all.iter().find(|s| s.start_date == START).unwrap();
        let middle = all
            .iter()
            .find(|s| s.start_date == SECOND_INSTANCE_DATE)
            .unwrap();
        let living = all.iter().find(|s| s.id == saved.id).unwrap();
        assert_eq!(earliest.end_date.as_deref(), Some("2026-10-25"));
        assert_eq!(earliest.succeeded_by, Some(saved.id));
        assert_eq!(middle.end_date.as_deref(), Some("2026-11-01"));
        assert_eq!(middle.succeeded_by, Some(saved.id));
        assert_eq!(living.start_date, THIRD_INSTANCE_DATE);
        assert!(living.end_date.is_none());
        assert_eq!(instance(&pool, first).await.series_id, Some(earliest.id));
        assert_eq!(instance(&pool, second).await.series_id, Some(middle.id));
        assert_eq!(instance(&pool, third).await.series_id, Some(saved.id));
    }

    #[tokio::test]
    async fn delete_removes_the_whole_segment_chain() {
        let (pool, pid) = seeded_pool().await;
        let saved = create(&pool, pid, &fields_for(&series(weekly())))
            .await
            .unwrap();
        for iso in [START, SECOND_INSTANCE_DATE] {
            add_instance(&pool, pid, saved.id, iso).await;
        }
        update_from(
            &pool,
            pid,
            saved.id,
            SECOND_INSTANCE_DATE,
            &update_input(weekly()),
        )
        .await
        .unwrap();
        assert_eq!(list(&pool, pid).await.unwrap().len(), 2);

        delete(&pool, pid, saved.id).await.unwrap();

        assert_eq!(list(&pool, pid).await.unwrap().len(), 0);
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE profile_id = ?")
            .bind(pid)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0);
    }
}
