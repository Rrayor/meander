use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

use crate::series::Weekday;

use crate::db::Result;
use crate::validation::PositiveDuration;

#[derive(Debug, Serialize, specta::Type)]
pub struct GlobalThreshold {
    /// Per-weekday overrides — a missing day inherits `minutes` (§291).
    /// Keys are the weekday wire names ("monday"…); the specta map type
    /// can't index by an enum, so the boundary carries plain strings.
    pub day_minutes: BTreeMap<String, i64>,
    pub minutes: Option<i64>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<Profile>> {
    Ok(sqlx::query_as::<_, Profile>(
        "SELECT id, name, created_at, updated_at FROM profiles ORDER BY id",
    )
    .fetch_all(pool)
    .await?)
}

#[nutype::nutype(
    sanitize(trim),
    validate(
        len_char_min = 1,
        len_char_max = PROFILE_NAME_MAX_LEN,
        predicate = |s| !s.chars().any(char::is_control)
    ),
    derive(Debug, PartialEq)
)]
struct ProfileName(String);

const PROFILE_NAME_MAX_LEN: usize = 100;

fn profile_name(name: &str) -> Result<ProfileName> {
    ProfileName::try_new(name).map_err(|e| {
        let (code, message) = match e {
            ProfileNameError::LenCharMinViolated => (
                crate::errors::ErrorCode::ProfileNameRequired,
                "profile name is required".into(),
            ),
            ProfileNameError::LenCharMaxViolated => (
                crate::errors::ErrorCode::ProfileNameTooLong,
                format!("profile name must be {PROFILE_NAME_MAX_LEN} characters or fewer"),
            ),
            _ => (
                crate::errors::ErrorCode::ProfileNameInvalidCharacters,
                "profile name cannot contain control characters".into(),
            ),
        };
        crate::db::DbError::Validation { code, message }
    })
}

pub async fn create(pool: &SqlitePool, name: &str) -> Result<Profile> {
    let name = profile_name(name)?.into_inner();
    let result = sqlx::query("INSERT INTO profiles (name) VALUES (?)")
        .bind(name)
        .execute(pool)
        .await?;
    get(pool, result.last_insert_rowid()).await
}

pub async fn rename(pool: &SqlitePool, id: i64, name: &str) -> Result<Profile> {
    let name = profile_name(name)?.into_inner();
    sqlx::query("UPDATE profiles SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Profile> {
    Ok(sqlx::query_as::<_, Profile>(
        "SELECT id, name, created_at, updated_at FROM profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}

pub async fn week_start(pool: &SqlitePool, profile_id: i64) -> Result<Weekday> {
    let (value,): (i64,) = sqlx::query_as("SELECT week_start FROM profiles WHERE id = ?")
        .bind(profile_id)
        .fetch_one(pool)
        .await?;
    // Anything out of range falls back to Monday rather than breaking
    // display reads on a row a hand-edited DB could produce.
    Ok(Weekday::from_index(value).unwrap_or(Weekday::Monday))
}

pub async fn set_week_start(pool: &SqlitePool, profile_id: i64, weekday: Weekday) -> Result<()> {
    sqlx::query("UPDATE profiles SET week_start = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(weekday.index())
        .bind(profile_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// The Mon-Fri default from the spec — also the fallback for a stored mask
/// with no recognizable bits (a hand-edited database).
const DEFAULT_WORK_DAYS_MASK: i64 = 0b001_1111;
const WEEKDAY_BITS: i64 = 0b111_1111;

/// Stored `work_days` mask → weekday list in canonical Monday-first order.
fn decode_work_days(mask: i64) -> Vec<Weekday> {
    let mask = mask & WEEKDAY_BITS;
    let mask = if mask == 0 {
        DEFAULT_WORK_DAYS_MASK
    } else {
        mask
    };
    Weekday::ALL
        .into_iter()
        .filter(|d| mask & d.bit() != 0)
        .collect()
}

pub async fn work_days(pool: &SqlitePool, profile_id: i64) -> Result<Vec<Weekday>> {
    let (mask,): (i64,) = sqlx::query_as("SELECT work_days FROM profiles WHERE id = ?")
        .bind(profile_id)
        .fetch_one(pool)
        .await?;
    Ok(decode_work_days(mask))
}

pub async fn set_work_days(pool: &SqlitePool, profile_id: i64, days: &[Weekday]) -> Result<()> {
    if days.is_empty() {
        return Err(crate::db::DbError::Validation {
            code: crate::errors::ErrorCode::WorkDaysRequired,
            message: "at least one work day is required".into(),
        });
    }
    let mask = days.iter().fold(0, |m, d| m | d.bit());
    sqlx::query("UPDATE profiles SET work_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(mask)
        .bind(profile_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// The default threshold color (spec §297): red.
pub const DEFAULT_THRESHOLD_COLOR: &str = "#f87171";

/// The global per-day estimate threshold (spec §295/§297): minutes + a
/// `#rrggbb` color, both absent when the user never set one.
pub async fn global_threshold(pool: &SqlitePool, profile_id: i64) -> Result<GlobalThreshold> {
    let row: (Option<i64>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT global_threshold_minutes, global_threshold_color, global_threshold_day_minutes FROM profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await?;
    Ok(GlobalThreshold {
        minutes: row.0,
        color: row.1,
        day_minutes: row
            .2
            .and_then(|j| serde_json::from_str(&j).ok())
            .unwrap_or_default(),
    })
}

/// Sets — or clears, with `None` minutes — the global threshold. The color
/// is user-picked and validated as `#rrggbb` like category colors.
pub async fn set_global_threshold(
    pool: &SqlitePool,
    profile_id: i64,
    minutes: Option<i64>,
    color: Option<String>,
    day_minutes: BTreeMap<Weekday, i64>,
) -> Result<()> {
    let validated = minutes
        .map(|m| {
            crate::validation::PositiveDuration::try_new(m).map_err(|_| {
                crate::db::DbError::Validation {
                    code: crate::errors::ErrorCode::EstimatedTimeOutOfRange,
                    message: format!(
                        "threshold must be between 1 and {} minutes",
                        crate::validation::MAX_DURATION_MINUTES
                    ),
                }
            })
        })
        .transpose()?
        .map(|d| d.into_inner());
    // Category colors use the same #rrggbb vocabulary — reuse the parse.
    let parsed_color = crate::validation::parse_hex_color(
        color.as_deref(),
        crate::errors::ErrorCode::ThresholdColorInvalid,
        "threshold color must be a #rrggbb hex value",
    )?;
    let mut days = BTreeMap::new();
    for (day, m) in day_minutes {
        let m = PositiveDuration::try_new(m).map_err(|_| crate::db::DbError::Validation {
            code: crate::errors::ErrorCode::EstimatedTimeOutOfRange,
            message: format!(
                "threshold must be between 1 and {} minutes",
                crate::validation::MAX_DURATION_MINUTES
            ),
        })?;
        days.insert(day, m.into_inner());
    }
    let days_json =
        (!days.is_empty()).then(|| serde_json::to_string(&days).expect("weekday keys serialize"));
    // §297: any stored threshold — global or day-only — defaults to
    // red when no color is picked; a fully unset one drops the color.
    let any_threshold = validated.is_some() || days_json.is_some();
    let parsed_color = if any_threshold {
        parsed_color.or_else(|| Some(DEFAULT_THRESHOLD_COLOR.to_string()))
    } else {
        None
    };
    sqlx::query(
        "UPDATE profiles SET global_threshold_minutes = ?, global_threshold_color = ?, global_threshold_day_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(validated)
    .bind(parsed_color)
    .bind(days_json)
    .bind(profile_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seeded_pool() -> (SqlitePool, i64) {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "meander-profiles-test-{}-{nanos}.db",
            std::process::id()
        ));
        let pool = crate::db::connect(&path).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let pid = list(&pool).await.unwrap()[0].id;
        (pool, pid)
    }

    #[tokio::test]
    async fn week_start_defaults_to_monday_and_updates() {
        let (pool, pid) = seeded_pool().await;
        assert_eq!(week_start(&pool, pid).await.unwrap(), Weekday::Monday);
        set_week_start(&pool, pid, Weekday::Sunday).await.unwrap();
        assert_eq!(week_start(&pool, pid).await.unwrap(), Weekday::Sunday);
    }

    #[tokio::test]
    async fn global_threshold_is_unset_then_persists_and_clears() {
        let (pool, pid) = seeded_pool().await;
        let initial = global_threshold(&pool, pid).await.unwrap();
        assert!(initial.minutes.is_none());
        assert!(initial.color.is_none());
        set_global_threshold(
            &pool,
            pid,
            Some(240),
            Some("#F87171".into()),
            BTreeMap::new(),
        )
        .await
        .unwrap();
        let set = global_threshold(&pool, pid).await.unwrap();
        assert_eq!(set.minutes, Some(240));
        assert_eq!(set.color.as_deref(), Some("#f87171"));
        set_global_threshold(&pool, pid, None, None, BTreeMap::new())
            .await
            .unwrap();
        let cleared = global_threshold(&pool, pid).await.unwrap();
        assert!(cleared.minutes.is_none());
        assert!(cleared.color.is_none());
    }

    #[tokio::test]
    async fn clearing_the_threshold_drops_any_color() {
        let (pool, pid) = seeded_pool().await;
        set_global_threshold(
            &pool,
            pid,
            Some(120),
            Some("#60a5fa".into()),
            BTreeMap::new(),
        )
        .await
        .unwrap();
        // Clearing with a stray color argument must not persist one.
        set_global_threshold(&pool, pid, None, Some("#60a5fa".into()), BTreeMap::new())
            .await
            .unwrap();
        let t = global_threshold(&pool, pid).await.unwrap();
        assert!(t.minutes.is_none());
        assert!(t.color.is_none());
    }

    #[tokio::test]
    async fn threshold_day_overrides_persist_clear_and_validate() {
        let (pool, pid) = seeded_pool().await;
        // Unset → empty map.
        let t = global_threshold(&pool, pid).await.unwrap();
        assert!(t.day_minutes.is_empty());
        // Overrides persist and round-trip.
        let mut m = BTreeMap::new();
        m.insert(Weekday::Monday, 480);
        m.insert(Weekday::Sunday, 720);
        set_global_threshold(&pool, pid, None, None, m)
            .await
            .unwrap();
        let t = global_threshold(&pool, pid).await.unwrap();
        assert_eq!(t.day_minutes.get("monday"), Some(&480));
        assert_eq!(t.day_minutes.get("sunday"), Some(&720));
        assert_eq!(t.day_minutes.len(), 2);
        // Boundary: 1440 accepted.
        let mut m = BTreeMap::new();
        m.insert(Weekday::Saturday, 1440);
        set_global_threshold(&pool, pid, None, None, m)
            .await
            .unwrap();
        let t = global_threshold(&pool, pid).await.unwrap();
        assert_eq!(t.day_minutes.get("saturday"), Some(&1440));
        assert_eq!(t.day_minutes.len(), 1);
        // Empty map clears to NULL.
        set_global_threshold(&pool, pid, None, None, BTreeMap::new())
            .await
            .unwrap();
        let t = global_threshold(&pool, pid).await.unwrap();
        assert!(t.day_minutes.is_empty());
        // Out-of-range values are rejected and don't mutate.
        for bad in [0, 1441, -5] {
            let mut m = BTreeMap::new();
            m.insert(Weekday::Monday, bad);
            assert!(
                set_global_threshold(&pool, pid, None, None, m)
                    .await
                    .is_err()
            );
        }
        let t = global_threshold(&pool, pid).await.unwrap();
        assert!(t.day_minutes.is_empty());
    }

    #[tokio::test]
    async fn global_threshold_defaults_color_to_red_when_omitted() {
        // §297: minutes saved without a pick get the default red.
        let (pool, pid) = seeded_pool().await;
        set_global_threshold(&pool, pid, Some(120), None, BTreeMap::new())
            .await
            .unwrap();
        let t = global_threshold(&pool, pid).await.unwrap();
        assert_eq!(t.color.as_deref(), Some("#f87171"));
    }

    #[tokio::test]
    async fn global_threshold_is_scoped_to_each_profile() {
        let (pool, pid) = seeded_pool().await;
        let other: i64 =
            sqlx::query_scalar("INSERT INTO profiles (name) VALUES ('Other') RETURNING id")
                .fetch_one(&pool)
                .await
                .unwrap();
        set_global_threshold(
            &pool,
            pid,
            Some(300),
            Some("#60a5fa".into()),
            BTreeMap::new(),
        )
        .await
        .unwrap();
        let own = global_threshold(&pool, pid).await.unwrap();
        let foreign = global_threshold(&pool, other).await.unwrap();
        assert_eq!(own.minutes, Some(300));
        assert!(foreign.minutes.is_none());
    }

    #[tokio::test]
    async fn global_threshold_rejects_out_of_range_minutes() {
        let (pool, pid) = seeded_pool().await;
        for bad in [0, 1441, -5] {
            let err = set_global_threshold(&pool, pid, Some(bad), None, BTreeMap::new())
                .await
                .unwrap_err();
            assert!(format!("{err:?}").contains("EstimatedTimeOutOfRange"));
        }
    }

    #[tokio::test]
    async fn global_threshold_rejects_a_non_hex_color() {
        let (pool, pid) = seeded_pool().await;
        let err = set_global_threshold(&pool, pid, Some(60), Some("red".into()), BTreeMap::new())
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("ThresholdColorInvalid"));
    }

    #[tokio::test]
    async fn week_start_is_scoped_to_each_profile() {
        let (pool, pid) = seeded_pool().await;
        let other = create(&pool, "second").await.unwrap();
        set_week_start(&pool, pid, Weekday::Sunday).await.unwrap();
        assert_eq!(week_start(&pool, other.id).await.unwrap(), Weekday::Monday);
        assert_eq!(week_start(&pool, pid).await.unwrap(), Weekday::Sunday);
    }

    #[tokio::test]
    async fn week_start_falls_back_to_monday_on_an_out_of_range_value() {
        let (pool, pid) = seeded_pool().await;
        sqlx::query("UPDATE profiles SET week_start = 9 WHERE id = ?")
            .bind(pid)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(week_start(&pool, pid).await.unwrap(), Weekday::Monday);
    }

    fn monday_friday() -> Vec<Weekday> {
        vec![
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
        ]
    }

    #[tokio::test]
    async fn work_days_defaults_to_monday_friday_and_updates() {
        let (pool, pid) = seeded_pool().await;
        assert_eq!(work_days(&pool, pid).await.unwrap(), monday_friday());
        let weekend_only = vec![Weekday::Saturday, Weekday::Sunday];
        set_work_days(&pool, pid, &weekend_only).await.unwrap();
        assert_eq!(work_days(&pool, pid).await.unwrap(), weekend_only);
    }

    #[tokio::test]
    async fn work_days_is_scoped_to_each_profile() {
        let (pool, pid) = seeded_pool().await;
        let other = create(&pool, "second").await.unwrap();
        let weekend_only = vec![Weekday::Saturday, Weekday::Sunday];
        set_work_days(&pool, pid, &weekend_only).await.unwrap();
        assert_eq!(work_days(&pool, other.id).await.unwrap(), monday_friday());
        assert_eq!(work_days(&pool, pid).await.unwrap(), weekend_only);
    }

    #[tokio::test]
    async fn work_days_rejects_an_empty_set() {
        let (pool, pid) = seeded_pool().await;
        let err = set_work_days(&pool, pid, &[]).await.unwrap_err();
        assert!(matches!(
            err,
            crate::db::DbError::Validation {
                code: crate::errors::ErrorCode::WorkDaysRequired,
                ..
            }
        ));
        assert_eq!(work_days(&pool, pid).await.unwrap(), monday_friday());
    }

    #[tokio::test]
    async fn work_days_dedupes_input_and_keeps_canonical_order() {
        let (pool, pid) = seeded_pool().await;
        set_work_days(
            &pool,
            pid,
            &[Weekday::Friday, Weekday::Monday, Weekday::Friday],
        )
        .await
        .unwrap();
        assert_eq!(
            work_days(&pool, pid).await.unwrap(),
            vec![Weekday::Monday, Weekday::Friday]
        );
    }

    #[tokio::test]
    async fn work_days_masks_unknown_bits_and_falls_back_on_zero() {
        let (pool, pid) = seeded_pool().await;
        // Bit 8 set alone — no recognizable weekday bits.
        sqlx::query("UPDATE profiles SET work_days = 256 WHERE id = ?")
            .bind(pid)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(work_days(&pool, pid).await.unwrap(), monday_friday());
        // Unknown high bits are ignored when weekday bits are present.
        sqlx::query("UPDATE profiles SET work_days = 257 WHERE id = ?")
            .bind(pid)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(work_days(&pool, pid).await.unwrap(), vec![Weekday::Monday]);
    }

    #[test]
    fn accepts_a_name_at_the_limit() {
        let name = "a".repeat(100);
        assert_eq!(profile_name(&name).unwrap().into_inner(), name);
    }

    #[test]
    fn rejects_a_name_over_the_limit() {
        let name = "a".repeat(101);
        assert!(profile_name(&name).is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(profile_name("two\nlines").is_err());
        assert!(profile_name("tab\there").is_err());
        assert!(profile_name("null\u{0000}byte").is_err());
    }

    #[test]
    fn allows_unicode_and_symbols() {
        assert_eq!(
            profile_name("José's tasks ").unwrap().into_inner(),
            "José's tasks"
        );
        assert_eq!(
            profile_name("ワーク 日本語").unwrap().into_inner(),
            "ワーク 日本語"
        );
        assert_eq!(profile_name("a?b!c#").unwrap().into_inner(), "a?b!c#");
    }

    #[test]
    fn trims_before_validating() {
        assert!(profile_name("   \n  ").is_err());
        assert_eq!(profile_name("  ok  ").unwrap().into_inner(), "ok");
    }
}
