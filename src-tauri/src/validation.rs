//! Shared domain primitives and value validators.
//!
//! Feature modules must never reach into another feature module's
//! internals — shared vocabulary lives here instead (see AGENTS.md).

use crate::db::Result;
use crate::errors::ErrorCode;

/// Spec: durations are positive and at most 24 hours; the schema
/// enforces the same 1–1440 CHECK everywhere a duration is stored.
pub const MAX_DURATION_MINUTES: i64 = 24 * 60;

#[nutype::nutype(
    validate(greater = 0, less_or_equal = MAX_DURATION_MINUTES),
    derive(Debug, PartialEq)
)]
pub struct PositiveDuration(i64);

/// Spec: colors crossing the wire are `#rrggbb` hex values. Whitespace
/// is trimmed and the hex normalized to lowercase before validation.
#[nutype::nutype(
    sanitize(trim, lowercase),
    validate(predicate = |s: &str| {
        let Some(hex) = s.strip_prefix('#') else { return false };
        hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit())
    }),
    derive(Debug, PartialEq)
)]
pub struct HexColor(String);

/// Parses an optional `#rrggbb` color, mapping invalid input to the
/// caller's own error vocabulary.
pub fn parse_hex_color(
    raw: Option<&str>,
    code: ErrorCode,
    message: &str,
) -> Result<Option<String>> {
    match raw.map(str::trim).filter(|c| !c.is_empty()) {
        None => Ok(None),
        Some(c) => HexColor::try_new(c)
            .map(|c| Some(c.into_inner()))
            .map_err(|_| crate::db::DbError::Validation {
                code,
                message: message.into(),
            }),
    }
}

/// Parses an optional duration estimate, mapping out-of-range input to
/// the `EstimatedTimeOutOfRange` vocabulary.
pub fn parse_estimate(raw: Option<i64>) -> Result<Option<i64>> {
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

/// Real-calendar ISO date check (YYYY-MM-DD with a valid month/day).
/// Shared by scheduling entry points — series cadence dates, instance
/// reads, and task scheduling (feature-boundary rule).
pub fn iso_date(raw: &str, code: crate::errors::ErrorCode, field: &str) -> crate::db::Result<()> {
    let reject = || crate::db::DbError::Validation {
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

pub fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400) => {
            29
        }
        2 => 28,
        _ => 0,
    }
}
