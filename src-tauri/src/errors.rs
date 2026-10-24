use serde::Serialize;

/// Machine-readable error codes shared with the frontend. `code` is the stable
/// contract — UI copy maps from it; `message` is only a human-readable
/// fallback. Keep variants snake_case; they serialize directly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    TaskTitleRequired,
    TaskTitleTooLong,
    TaskTitleInvalidCharacters,
    TaskDescriptionTooLong,
    EstimatedTimeOutOfRange,
    SpentTimeOutOfRange,
    TaskNotFound,
    CategoryNotFound,
    CategoryTitleRequired,
    CategoryTitleTooLong,
    CategoryTitleInvalidCharacters,
    CategoryDescriptionTooLong,
    CategoryColorInvalid,
    ReorderAnchorsNotAdjacent,
    SeriesNotFound,
    RecurrenceInvalid,
    StartDateInvalid,
    EndDateInvalid,
    EndDateBeforeStart,
    WorkdayRulesUnsupported,
    AlreadyInSeries,
    InstanceDateInvalid,
    InstanceDateNotScheduled,
    NoteBodyRequired,
    NoteBodyTooLong,
    NoteNotFound,
    ProfileNameRequired,
    ProfileNameTooLong,
    ProfileNameInvalidCharacters,
    WorkDaysRequired,
    Internal,
}

/// Broad category so a client can pick "inline form error" vs "generic toast"
/// without maintaining its own lookup of every code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Validation,
    Internal,
}

/// The IPC-facing error payload — HTTP-shaped (`{code, kind, message}`) so a
/// future REST transport can return the identical body.
#[derive(Debug, Serialize, specta::Type)]
pub struct ApiError {
    pub code: ErrorCode,
    pub kind: ErrorKind,
    pub message: String,
}

impl ApiError {
    pub fn validation(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            kind: ErrorKind::Validation,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Internal,
            kind: ErrorKind::Internal,
            message: message.into(),
        }
    }
}

impl From<crate::db::DbError> for ApiError {
    fn from(e: crate::db::DbError) -> Self {
        match e {
            crate::db::DbError::Validation { code, message } => Self::validation(code, message),
            other => Self::internal(other.to_string()),
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_marks_kind_and_code() {
        let message = "title needed";
        let err = ApiError::validation(ErrorCode::TaskTitleRequired, message);
        assert_eq!(err.code, ErrorCode::TaskTitleRequired);
        assert_eq!(err.kind, ErrorKind::Validation);
        assert_eq!(err.message, message);
    }

    #[test]
    fn internal_marks_kind_and_code() {
        let message = "boom";
        let err = ApiError::internal(message);
        assert_eq!(err.code, ErrorCode::Internal);
        assert_eq!(err.kind, ErrorKind::Internal);
        assert_eq!(err.message, message);
    }

    #[test]
    fn db_validation_maps_to_typed_payload() {
        let message = "too long";
        let err = ApiError::from(crate::db::DbError::Validation {
            code: ErrorCode::EstimatedTimeOutOfRange,
            message: message.into(),
        });
        assert_eq!(err.code, ErrorCode::EstimatedTimeOutOfRange);
        assert_eq!(err.kind, ErrorKind::Validation);
        assert_eq!(err.message, message);
    }

    #[test]
    fn db_failures_without_codes_map_to_internal() {
        let detail = "newer app";
        let err = ApiError::from(crate::db::DbError::Incompatible(detail.into()));
        assert_eq!(err.code, ErrorCode::Internal);
        assert_eq!(err.kind, ErrorKind::Internal);
        assert!(err.message.contains(detail));
    }

    #[test]
    fn display_shows_the_message() {
        let message = "readable";
        assert_eq!(ApiError::internal(message).to_string(), message);
    }
}
