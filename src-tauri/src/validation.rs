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
