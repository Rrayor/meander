use serde::Serialize;
use sqlx::SqlitePool;

use crate::db::{DbError, Result};
use crate::errors::ErrorCode;

/// Spec §52: a note is the short-form field — at most 10,000 characters,
/// deliberately smaller than a description's 20,000.
pub const NOTE_BODY_MAX_LEN: usize = 10_000;

#[nutype::nutype(
    sanitize(trim),
    validate(len_char_min = 1, len_char_max = NOTE_BODY_MAX_LEN),
    derive(Debug, PartialEq)
)]
pub struct NoteBody(String);

impl NoteBody {
    pub fn parse(raw: &str) -> Result<Self> {
        Self::try_new(raw).map_err(|e| {
            let (code, message) = match e {
                NoteBodyError::LenCharMinViolated => {
                    (ErrorCode::NoteBodyRequired, "note body is required".into())
                }
                NoteBodyError::LenCharMaxViolated => (
                    ErrorCode::NoteBodyTooLong,
                    format!("note body must be {NOTE_BODY_MAX_LEN} characters or fewer"),
                ),
            };
            DbError::Validation { code, message }
        })
    }
}

#[derive(Debug, Clone, Serialize, specta::Type, sqlx::FromRow)]
pub struct Note {
    pub id: i64,
    /// Set when the note belongs to a task (or a series instance — an
    /// instance is an ordinary tasks row); null on series notes.
    pub task_id: Option<i64>,
    /// Set when the note belongs to a series.
    pub series_id: Option<i64>,
    pub body: String,
    pub created_at: String,
    /// NULL until the first edit — set on update, never on create, so a
    /// same-second edit is still distinguishable from an untouched note.
    pub updated_at: Option<String>,
}

fn not_found() -> DbError {
    DbError::Validation {
        code: ErrorCode::NoteNotFound,
        message: "note not found".into(),
    }
}

/// Parent ownership checks — a note's profile comes from its parent row,
/// never from the client.
async fn ensure_task_owned(pool: &SqlitePool, profile_id: i64, task_id: i64) -> Result<()> {
    let owned: Option<i64> =
        sqlx::query_scalar("SELECT id FROM tasks WHERE id = ? AND profile_id = ?")
            .bind(task_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await?;
    if owned.is_none() {
        return Err(DbError::Validation {
            code: ErrorCode::TaskNotFound,
            message: "task not found".into(),
        });
    }
    Ok(())
}

async fn ensure_series_owned(pool: &SqlitePool, profile_id: i64, series_id: i64) -> Result<()> {
    let owned: Option<i64> =
        sqlx::query_scalar("SELECT id FROM task_series WHERE id = ? AND profile_id = ?")
            .bind(series_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await?;
    if owned.is_none() {
        return Err(DbError::Validation {
            code: ErrorCode::SeriesNotFound,
            message: "series not found".into(),
        });
    }
    Ok(())
}

/// Resolves the note's parent profile. A missing note and a foreign note
/// both surface as NoteNotFound — no existence leak across profiles.
async fn ensure_note_owned(pool: &SqlitePool, profile_id: i64, note_id: i64) -> Result<()> {
    let owned: Option<i64> = sqlx::query_scalar(
        "SELECT n.id FROM task_notes n \
         LEFT JOIN tasks t ON t.id = n.task_id \
         LEFT JOIN task_series s ON s.id = n.series_id \
         WHERE n.id = ? AND COALESCE(t.profile_id, s.profile_id) = ?",
    )
    .bind(note_id)
    .bind(profile_id)
    .fetch_optional(pool)
    .await?;
    owned.map(|_| ()).ok_or_else(not_found)
}

pub async fn list_for_task(pool: &SqlitePool, profile_id: i64, task_id: i64) -> Result<Vec<Note>> {
    ensure_task_owned(pool, profile_id, task_id).await?;
    sqlx::query_as::<_, Note>(
        "SELECT id, task_id, series_id, body, created_at, updated_at \
         FROM task_notes WHERE task_id = ? ORDER BY created_at, id",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub async fn list_for_series(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
) -> Result<Vec<Note>> {
    ensure_series_owned(pool, profile_id, series_id).await?;
    sqlx::query_as::<_, Note>(
        "SELECT id, task_id, series_id, body, created_at, updated_at \
         FROM task_notes WHERE series_id = ? ORDER BY created_at, id",
    )
    .bind(series_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub async fn create_for_task(
    pool: &SqlitePool,
    profile_id: i64,
    task_id: i64,
    body: &str,
) -> Result<Note> {
    ensure_task_owned(pool, profile_id, task_id).await?;
    let body = NoteBody::parse(body)?.into_inner();
    sqlx::query_as::<_, Note>(
        "INSERT INTO task_notes (task_id, body) VALUES (?, ?) \
         RETURNING id, task_id, series_id, body, created_at, updated_at",
    )
    .bind(task_id)
    .bind(body)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn create_for_series(
    pool: &SqlitePool,
    profile_id: i64,
    series_id: i64,
    body: &str,
) -> Result<Note> {
    ensure_series_owned(pool, profile_id, series_id).await?;
    let body = NoteBody::parse(body)?.into_inner();
    sqlx::query_as::<_, Note>(
        "INSERT INTO task_notes (series_id, body) VALUES (?, ?) \
         RETURNING id, task_id, series_id, body, created_at, updated_at",
    )
    .bind(series_id)
    .bind(body)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn update(pool: &SqlitePool, profile_id: i64, note_id: i64, body: &str) -> Result<Note> {
    ensure_note_owned(pool, profile_id, note_id).await?;
    let body = NoteBody::parse(body)?.into_inner();
    sqlx::query_as::<_, Note>(
        "UPDATE task_notes SET body = ?, updated_at = datetime('now') WHERE id = ? \
         RETURNING id, task_id, series_id, body, created_at, updated_at",
    )
    .bind(body)
    .bind(note_id)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn delete(pool: &SqlitePool, profile_id: i64, note_id: i64) -> Result<()> {
    ensure_note_owned(pool, profile_id, note_id).await?;
    sqlx::query("DELETE FROM task_notes WHERE id = ?")
        .bind(note_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::profiles;
    use crate::series;
    use crate::tasks::{self, NewTask};

    fn temp_db_path() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "meander-notes-test-{}-{nanos}.db",
            std::process::id()
        ))
    }

    async fn fixture() -> (SqlitePool, i64) {
        let pool = db::connect(&temp_db_path()).await.unwrap();
        db::seed(&pool).await.unwrap();
        let profile_id = profiles::list(&pool).await.unwrap()[0].id;
        (pool, profile_id)
    }

    async fn task_on(pool: &SqlitePool, profile_id: i64) -> tasks::Task {
        tasks::create(
            pool,
            profile_id,
            &NewTask {
                title: "Standup".into(),
                ..Default::default()
            },
        )
        .await
        .expect("task create failed")
    }

    async fn repeating_task(pool: &SqlitePool, profile_id: i64) -> tasks::Task {
        tasks::create(
            pool,
            profile_id,
            &NewTask {
                title: "Standup".into(),
                series: Some(crate::series::NewSeries {
                    recurrence: serde_json::json!({
                        "kind": "daily",
                        "interval_days": 1
                    }),
                    start_date: "2026-10-19".to_string(),
                    end_date: None,
                }),
                ..Default::default()
            },
        )
        .await
        .expect("repeating task create failed")
    }

    #[tokio::test]
    async fn a_note_round_trips_on_a_task() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;

        let note = create_for_task(&pool, profile, task.id, "  remember the agenda  ")
            .await
            .expect("create failed");
        assert_eq!(note.body, "remember the agenda");
        assert_eq!(note.task_id, Some(task.id));
        assert_eq!(note.series_id, None);

        let listed = list_for_task(&pool, profile, task.id)
            .await
            .expect("list failed");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, note.id);
    }

    #[tokio::test]
    async fn a_note_round_trips_on_a_series() {
        let (pool, profile) = fixture().await;
        let task = repeating_task(&pool, profile).await;
        let series_id = task.series_id.expect("no series");

        let note = create_for_series(&pool, profile, series_id, "sync weekly")
            .await
            .expect("create failed");
        assert_eq!(note.series_id, Some(series_id));
        assert_eq!(note.task_id, None);
        let listed = list_for_series(&pool, profile, series_id)
            .await
            .expect("list failed");
        assert_eq!(listed.len(), 1);
    }

    #[tokio::test]
    async fn a_blank_note_is_rejected() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        let err = create_for_task(&pool, profile, task.id, "   ")
            .await
            .expect_err("blank note accepted");
        match err {
            DbError::Validation { code, .. } => {
                assert_eq!(code, ErrorCode::NoteBodyRequired)
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_note_at_the_limit_is_accepted_and_past_it_rejected() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        let max = "x".repeat(NOTE_BODY_MAX_LEN);
        create_for_task(&pool, profile, task.id, &max)
            .await
            .expect("limit-length note rejected");
        let over = "x".repeat(NOTE_BODY_MAX_LEN + 1);
        let err = create_for_task(&pool, profile, task.id, &over)
            .await
            .expect_err("oversize note accepted");
        match err {
            DbError::Validation { code, .. } => {
                assert_eq!(code, ErrorCode::NoteBodyTooLong)
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[tokio::test]
    async fn updating_a_note_rewrites_body_and_touches_updated_at() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        let note = create_for_task(&pool, profile, task.id, "v1")
            .await
            .expect("create failed");
        let updated = update(&pool, profile, note.id, "v2")
            .await
            .expect("update failed");
        assert_eq!(updated.body, "v2");
        assert_eq!(note.updated_at, None, "created note is not marked edited");
        assert!(updated.updated_at.is_some());
    }

    #[tokio::test]
    async fn a_same_second_edit_is_still_marked_edited() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        let note = create_for_task(&pool, profile, task.id, "typo")
            .await
            .expect("create failed");
        // Editing immediately — well inside one stored second — must still
        // flip the audit marker to "edited".
        let updated = update(&pool, profile, note.id, "fixed")
            .await
            .expect("update failed");
        assert!(updated.updated_at.is_some());
    }

    #[tokio::test]
    async fn deleting_a_note_removes_it() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        let note = create_for_task(&pool, profile, task.id, "gone")
            .await
            .expect("create failed");
        delete(&pool, profile, note.id)
            .await
            .expect("delete failed");
        assert!(
            list_for_task(&pool, profile, task.id)
                .await
                .expect("list failed")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn unknown_and_foreign_parents_are_rejected() {
        let (pool, profile) = fixture().await;
        let foreign = profiles::create(&pool, "Other")
            .await
            .expect("foreign profile create failed")
            .id;
        let _task = task_on(&pool, profile).await;
        let foreign_task = task_on(&pool, foreign).await;

        // A foreign task can't be listed or noted from this profile.
        assert!(
            list_for_task(&pool, profile, foreign_task.id)
                .await
                .is_err()
        );
        assert!(
            create_for_task(&pool, profile, foreign_task.id, "spy")
                .await
                .is_err()
        );

        // A foreign note can't be edited or deleted from this profile.
        let foreign_note = create_for_task(&pool, foreign, foreign_task.id, "theirs")
            .await
            .expect("foreign create failed");
        let err = update(&pool, profile, foreign_note.id, "hijack")
            .await
            .expect_err("foreign note updated");
        match err {
            DbError::Validation { code, .. } => assert_eq!(code, ErrorCode::NoteNotFound),
            other => panic!("unexpected error: {other:?}"),
        }
        assert!(delete(&pool, profile, foreign_note.id).await.is_err());
        assert_eq!(
            list_for_task(&pool, foreign, foreign_task.id)
                .await
                .unwrap()
                .len(),
            1,
            "the foreign note must survive the rejected writes"
        );
    }

    #[tokio::test]
    async fn deleting_a_task_cascades_its_notes() {
        let (pool, profile) = fixture().await;
        let task = task_on(&pool, profile).await;
        create_for_task(&pool, profile, task.id, "note")
            .await
            .expect("create failed");
        tasks::delete(&pool, profile, task.id)
            .await
            .expect("task delete failed");
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_notes")
            .fetch_one(&pool)
            .await
            .expect("count failed");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn deleting_a_series_cascades_its_notes() {
        let (pool, profile) = fixture().await;
        let task = repeating_task(&pool, profile).await;
        let series_id = task.series_id.expect("no series");
        create_for_series(&pool, profile, series_id, "note")
            .await
            .expect("create failed");
        series::delete(&pool, profile, series_id)
            .await
            .expect("series delete failed");
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_notes")
            .fetch_one(&pool)
            .await
            .expect("count failed");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn a_note_cannot_exist_without_a_parent() {
        let (pool, _) = fixture().await;
        let err = sqlx::query("INSERT INTO task_notes (body) VALUES ('orphan')")
            .execute(&pool)
            .await
            .expect_err("orphan note inserted");
        assert!(err.to_string().contains("CHECK"));
    }
}
