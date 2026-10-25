//! One-shot developer seeding: fills a database with realistic task
//! data for the past twelve weeks so board navigation and carry-over
//! have something to display (plan item 35). Guarded by a
//! meander_meta flag — running it twice inserts nothing.

use sqlx::SqlitePool;

use super::Result;

/// Weeks of history to fill, the current week included.
const SEED_WEEKS: i64 = 12;

const DEMO_CATEGORIES: &[(&str, &str)] = &[
    ("Work", "#3b82f6"),
    ("Personal", "#22c55e"),
    ("Health", "#f59e0b"),
];

const REVIEW_TITLE: &str = "Weekly review";
const REVIEW_ESTIMATE: i64 = 30;
const REVIEW_CARRY_OVER: &str = "carry";

const TASK_TITLES: &[&str] = &[
    "Write weekly report",
    "Review open PRs",
    "Grocery run",
    "Clean the kitchen",
    "Read twenty pages",
    "File expenses",
    "Water the plants",
    "Call the bank",
];

const WEEKLY_BACKLOG_TITLES: &[&str] = &["Plan meals", "Tidy the desk"];
const BACKLOG_TITLES: &[&str] = &[
    "Renew passport",
    "Sort the hallway closet",
    "Read the tax letter",
];

/// Days since the Unix epoch — the ordinal `civil_from_days` consumes.
/// Local time, matching the board's `todayLocalIso` (UTC epoch math
/// would disagree with the board for hours every day).
async fn today_ordinal(pool: &SqlitePool) -> Result<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT CAST(julianday(date('now', 'localtime')) - 2440587.5 AS INTEGER)",
    )
    .fetch_one(pool)
    .await?)
}

/// The start of the week containing `z` under the profile's
/// configured `week_start` weekday (Monday = 0). 1970-01-01 was a
/// Thursday, so +3 shifts epoch ordinals onto that index space.
fn week_start_of(z: i64, week_start: i64) -> i64 {
    z - ((z + 3).rem_euclid(7) - week_start).rem_euclid(7)
}

/// The first `weekday` (Monday = 0) on or after ordinal `z`.
fn next_weekday(z: i64, weekday: i64) -> i64 {
    z + (weekday - (z + 3).rem_euclid(7)).rem_euclid(7)
}

fn iso_of(z: i64) -> String {
    crate::series::to_iso(crate::series::civil_from_days(z))
}

/// Returns the number of rows the seed inserted — 0 when the database
/// was demo-seeded before.
pub async fn seed_demo(pool: &SqlitePool) -> Result<usize> {
    let today = today_ordinal(pool).await?;
    let profile_id: i64 = sqlx::query_scalar("SELECT id FROM profiles ORDER BY id LIMIT 1")
        .fetch_one(pool)
        .await?;
    let week_start_index = crate::profiles::week_start(pool, profile_id).await?.index();
    let week_start = week_start_of(today, week_start_index);

    // Everything — marker included — lands in one transaction: a
    // failed seed rolls back entirely so a retry can actually run.
    let mut tx = pool.begin().await?;
    let marked =
        sqlx::query("INSERT OR IGNORE INTO meander_meta (key, value) VALUES ('demo_seeded', '1')")
            .execute(&mut *tx)
            .await?;
    if marked.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(0);
    }
    let oldest = week_start - (SEED_WEEKS - 1) * 7;

    let mut count = 0usize;

    let mut category_ids = Vec::new();
    for (title, color) in DEMO_CATEGORIES {
        let result =
            sqlx::query("INSERT INTO categories (profile_id, title, color) VALUES (?, ?, ?)")
                .bind(profile_id)
                .bind(*title)
                .bind(*color)
                .execute(&mut *tx)
                .await?;
        category_ids.push(result.last_insert_rowid());
        count += 1;
    }

    // A Friday review series — past occurrences persisted like real
    // instances (inherit title, estimate, carry-over, categories) and
    // finished ones are marked done so historical boards don't show a
    // backlog of open reviews.
    let first_friday = next_weekday(oldest, crate::series::Weekday::Friday.index());
    let series = sqlx::query(
        "INSERT INTO task_series (profile_id, title, carry_over_rule, estimated_minutes,          recurrence, start_date) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(profile_id)
    .bind(REVIEW_TITLE)
    .bind(REVIEW_CARRY_OVER)
    .bind(REVIEW_ESTIMATE)
    .bind(
        serde_json::to_value(crate::series::Recurrence::Weekly {
            interval_weeks: 1,
            weekdays: vec![crate::series::Weekday::Friday],
        })
        .expect("recurrence serializes")
        .to_string(),
    )
    .bind(iso_of(first_friday))
    .execute(&mut *tx)
    .await?;
    let series_id = series.last_insert_rowid();
    sqlx::query("INSERT INTO series_categories (series_id, category_id) VALUES (?, ?)")
        .bind(series_id)
        .bind(category_ids[0])
        .execute(&mut *tx)
        .await?;
    count += 2;

    let mut friday = first_friday;
    while friday <= today {
        let done = friday < week_start;
        let result = sqlx::query(
            "INSERT INTO tasks (profile_id, title, status, estimated_minutes, spent_minutes,              carry_over_rule, series_id, scheduled_date, sort_order)              VALUES (?, 'Weekly review', ?, 30, ?, 'carry', ?, ?,              (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
        )
        .bind(profile_id)
        .bind(if done { "done" } else { "todo" })
        .bind(if done { Some(30) } else { None })
        .bind(series_id)
        .bind(iso_of(friday))
        .bind(profile_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO task_categories (task_id, category_id)              SELECT ?, category_id FROM series_categories WHERE series_id = ?",
        )
        .bind(result.last_insert_rowid())
        .bind(series_id)
        .execute(&mut *tx)
        .await?;
        friday += 7;
        count += 1;
    }

    // One standalone scheduled task per day across the window. Past
    // weeks are done; the current week mixes statuses so the board
    // shows all three rows.
    for z in oldest..=today {
        let idx = (z - oldest) as usize;
        let est = 30 + (idx % 3) as i64 * 30;
        let (status, spent) = if z < week_start {
            ("done", Some(est))
        } else {
            match idx % 3 {
                0 => ("todo", None),
                1 => ("in_progress", Some(est / 2)),
                _ => ("done", Some(est)),
            }
        };
        let result = sqlx::query(
            "INSERT INTO tasks (profile_id, title, status, estimated_minutes, spent_minutes,              placement, scheduled_date, sort_order) VALUES (?, ?, ?, ?, ?, 'scheduled', ?,              (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE profile_id = ?))",
        )
        .bind(profile_id)
        .bind(TASK_TITLES[idx % TASK_TITLES.len()])
        .bind(status)
        .bind(est)
        .bind(spent)
        .bind(iso_of(z))
        .bind(profile_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO task_categories (task_id, category_id) VALUES (?, ?)")
            .bind(result.last_insert_rowid())
            .bind(category_ids[idx % category_ids.len()])
            .execute(&mut *tx)
            .await?;
        count += 1;
    }

    for title in WEEKLY_BACKLOG_TITLES {
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, placement) VALUES (?, ?, 'weekly_backlog')",
        )
        .bind(profile_id)
        .bind(*title)
        .execute(&mut *tx)
        .await?;
        count += 1;
    }
    for title in BACKLOG_TITLES {
        sqlx::query("INSERT INTO tasks (profile_id, title) VALUES (?, ?)")
            .bind(profile_id)
            .bind(*title)
            .execute(&mut *tx)
            .await?;
        count += 1;
    }

    tx.commit().await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seeded_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn demo_seed_fills_past_weeks_and_is_idempotent() {
        let pool = seeded_pool().await;
        let first = seed_demo(&pool).await.unwrap();
        assert!(first > 80, "expected a populated window, got {first}");
        // Second run is a no-op — the meta flag guards it.
        assert_eq!(seed_demo(&pool).await.unwrap(), 0);

        let earliest: Option<String> = sqlx::query_scalar(
            "SELECT MIN(scheduled_date) FROM tasks WHERE placement = 'scheduled'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(earliest.is_some());
        let range: f64 = sqlx::query_scalar(
            "SELECT julianday(MAX(scheduled_date)) - julianday(MIN(scheduled_date)) \
             FROM tasks WHERE placement = 'scheduled'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            (70.0..=90.0).contains(&range),
            "seeded span {range} days is not ~12 weeks"
        );
    }

    #[test]
    fn week_start_respects_the_configured_boundary() {
        // 2026-10-26 is a Monday; the previous Friday (23rd) belongs to
        // the current week when weeks start on Tuesday — the bug the
        // review caught. Ordinals: to_iso(days) helpers are private
        // upstream, so go through julianday-free integer math.
        let monday = crate::series::days_from_civil(2026, 10, 26);
        let friday = monday - 3;
        // Monday start → Friday is in last week.
        assert_eq!(week_start_of(friday, 0), monday - 7);
        // Tuesday start → Friday is in the current week.
        assert_eq!(week_start_of(friday, 1), monday - 6);
        // Saturday start → Friday belongs to the previous week.
        assert_eq!(week_start_of(friday, 5), monday - 9);
    }

    #[test]
    fn first_seeded_review_lands_on_a_real_friday() {
        // Whatever the configured week start is, the first review must
        // be an actual Friday (weekday index 4), or the board's Friday
        // materialization would duplicate it.
        let monday = crate::series::days_from_civil(2026, 10, 26);
        for week_start in 0..7 {
            let first = next_weekday(week_start_of(monday, week_start) - 11 * 7, 4);
            assert_eq!((first + 3) % 7, 4, "week_start {week_start}");
        }
    }

    #[tokio::test]
    async fn demo_seed_fails_without_a_profile_and_the_retry_works() {
        // No bootstrap seed → no profile → nothing to seed into. The
        // whole run rolls back — marker included — so the retry after
        // the profile exists actually fills the database.
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        assert!(seed_demo(&pool).await.is_err());
        let marked: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM meander_meta WHERE key = 'demo_seeded'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(marked, 0, "failed seed must not keep the marker");

        crate::db::seed(&pool).await.unwrap();
        assert!(seed_demo(&pool).await.unwrap() > 0);
    }

    #[tokio::test]
    async fn demo_seed_respects_the_window_bounds() {
        let pool = seeded_pool().await;
        seed_demo(&pool).await.unwrap();
        // Nothing is scheduled in the future — the seed only fills the
        // past twelve weeks, today included.
        let future: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE scheduled_date > date('now')")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(future, 0);
        let out_of_window: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE scheduled_date < date('now', '-84 days')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(out_of_window, 0);
    }

    #[tokio::test]
    async fn demo_seed_marks_past_weeks_done_and_mixes_the_current_one() {
        let pool = seeded_pool().await;
        seed_demo(&pool).await.unwrap();
        let unfinished_past: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE placement = 'scheduled' AND status != 'done'              AND scheduled_date < date('now', 'weekday 1', '-7 days')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(unfinished_past, 0);
        for status in ["todo", "in_progress", "done"] {
            let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE status = ?")
                .bind(status)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!(n > 0, "no seeded task with status {status}");
        }
    }

    #[tokio::test]
    async fn demo_seed_keeps_existing_user_data() {
        let pool = seeded_pool().await;
        // Pre-existing content must survive the seed unchanged.
        sqlx::query(
            "INSERT INTO tasks (profile_id, title, placement) VALUES (1, 'Mine', 'backlog')",
        )
        .execute(&pool)
        .await
        .unwrap();
        seed_demo(&pool).await.unwrap();
        let mine: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE title = 'Mine'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(mine, 1);
    }

    #[tokio::test]
    async fn demo_seed_places_weekly_backlog_and_backlog_rows() {
        let pool = seeded_pool().await;
        seed_demo(&pool).await.unwrap();
        let weekly: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE placement = 'weekly_backlog'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(weekly, WEEKLY_BACKLOG_TITLES.len() as i64);
        // Backlog rows are undated — materialized series instances
        // keep the backlog placement too, but they carry a date.
        let backlog: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE placement = 'backlog' AND scheduled_date IS NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(backlog, BACKLOG_TITLES.len() as i64);
    }

    #[tokio::test]
    async fn demo_seed_links_categories_and_the_series() {
        let pool = seeded_pool().await;
        seed_demo(&pool).await.unwrap();
        let categories: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(categories, DEMO_CATEGORIES.len() as i64);
        let linked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(linked > 0);
        let instances: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE series_id IS NOT NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(instances >= 11, "expected ~12 Friday instances");
    }
}
