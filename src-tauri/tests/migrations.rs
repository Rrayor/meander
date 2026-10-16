//! Migration-generic regression test: schema-valid data must survive every
//! migration unchanged. Applies each migration file individually and inserts a
//! probe row into every table after each step, then verifies all probe values
//! round-trip. Catches rebuild-migration corruption (positional `SELECT *`
//! copies, CHECK violations on pre-existing rows) rather than any specific
//! past bug.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

fn migration_paths() -> Vec<std::path::PathBuf> {
    let mut paths: Vec<_> = std::fs::read_dir("migrations")
        .expect("migrations dir missing")
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "sql"))
        .collect();
    paths.sort();
    paths
}

#[derive(Clone, PartialEq, Debug)]
enum ProbeVal {
    Int(i64),
    Real(f64),
    Text(String),
}

struct Column {
    name: String,
    ty: String,
    notnull: bool,
    has_default: bool,
    is_pk: bool,
    fk_table: Option<String>,
}

async fn schema(pool: &SqlitePool, table: &str) -> Vec<Column> {
    let info = sqlx::query(&format!("PRAGMA table_info({table})"))
        .fetch_all(pool)
        .await
        .unwrap();
    let fks = sqlx::query(&format!("PRAGMA foreign_key_list({table})"))
        .fetch_all(pool)
        .await
        .unwrap();
    info.iter()
        .map(|r| {
            let name: String = r.get("name");
            let fk_table = fks
                .iter()
                .find(|f| f.get::<String, _>("from") == name)
                .map(|f| f.get("table"));
            Column {
                name,
                ty: r.get::<String, _>("type").to_uppercase(),
                notnull: r.get::<i64, _>("notnull") == 1,
                has_default: r.get::<Option<String>, _>("dflt_value").is_some(),
                is_pk: r.get::<i64, _>("pk") > 0,
                fk_table,
            }
        })
        .collect()
}

async fn user_tables(pool: &SqlitePool) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT name FROM sqlite_master WHERE type = 'table' \
         AND name NOT LIKE 'sqlite_%' AND name != '_sqlx_migrations' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

/// Extracts per-column CHECK limits from the table DDL: `col IN ('a','b')`
/// literals and `col BETWEEN lo AND hi` bounds, so probes satisfy constraints.
async fn check_bounds(
    pool: &SqlitePool,
    table: &str,
) -> (Vec<(String, String)>, Vec<(String, i64)>) {
    let ddl: String = sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE name = ?")
        .bind(table)
        .fetch_one(pool)
        .await
        .unwrap();
    let in_re = regex::Regex::new(r"(?i)(\w+)\s+IN\s*\(([^)]*)\)").unwrap();
    let between_re = regex::Regex::new(r"(?i)(\w+)\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)").unwrap();
    let ins = in_re
        .captures_iter(&ddl)
        .filter_map(|c| {
            let col = c[1].to_string();
            let first = c[2]
                .split(',')
                .next()?
                .trim()
                .trim_matches('\'')
                .to_string();
            Some((col, first))
        })
        .collect();
    let betweens = between_re
        .captures_iter(&ddl)
        .map(|c| (c[1].to_string(), c[2].parse::<i64>().unwrap()))
        .collect();
    (ins, betweens)
}

/// Inserts a probe row into `table`, synthesizing a value for every non-pk
/// column so they can be verified later. Returns the new row's pk and its
/// probed values.
async fn probe_insert(
    pool: &SqlitePool,
    table: &str,
    step: usize,
) -> (i64, Vec<(String, ProbeVal)>) {
    let cols = schema(pool, table).await;
    let (ins, betweens) = check_bounds(pool, table).await;
    // A single-column INTEGER PRIMARY KEY is the rowid alias — auto-assigned,
    // so probing it is skipped. Composite-pk members (e.g. join tables) are
    // real columns and must be supplied.
    let pk_count = cols.iter().filter(|c| c.is_pk).count();
    let mut names = Vec::new();
    let mut values: Vec<(String, ProbeVal)> = Vec::new();
    for col in &cols {
        let rowid_alias = col.is_pk && pk_count == 1 && col.ty.contains("INT");
        if rowid_alias || (col.has_default && !col.notnull) {
            continue;
        }
        let value = if let Some(parent) = &col.fk_table {
            let id: Option<i64> =
                sqlx::query_scalar(&format!("SELECT id FROM {parent} ORDER BY id LIMIT 1"))
                    .fetch_optional(pool)
                    .await
                    .unwrap();
            ProbeVal::Int(id.unwrap_or(1))
        } else if let Some(lit) = ins.iter().find(|(c, _)| *c == col.name) {
            ProbeVal::Text(lit.1.clone())
        } else if let Some(b) = betweens.iter().find(|(c, _)| *c == col.name) {
            ProbeVal::Int(b.1)
        } else if col.ty.contains("INT") {
            ProbeVal::Int(step as i64 + 1)
        } else if col.ty.contains("REAL") || col.ty.contains("FLOA") || col.ty.contains("DOUB") {
            ProbeVal::Real(step as f64 + 0.5)
        } else {
            ProbeVal::Text(format!("probe_{table}_{}_{step}", col.name))
        };
        names.push(col.name.clone());
        values.push((col.name.clone(), value));
    }
    let placeholders = vec!["?"; names.len()].join(", ");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({placeholders})",
        names.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for (_, v) in &values {
        q = match v {
            ProbeVal::Int(i) => q.bind(*i),
            ProbeVal::Real(f) => q.bind(*f),
            ProbeVal::Text(t) => q.bind(t.clone()),
        };
    }
    let pk = q.execute(pool).await.unwrap().last_insert_rowid();
    (pk, values)
}

async fn probe_check(pool: &SqlitePool, table: &str, pk: i64, col: &str, expected: &ProbeVal) {
    let sql = format!("SELECT {col} FROM {table} WHERE rowid = ?");
    let ok = match expected {
        ProbeVal::Int(i) => {
            sqlx::query_scalar::<_, i64>(&sql)
                .bind(pk)
                .fetch_optional(pool)
                .await
                .unwrap()
                == Some(*i)
        }
        ProbeVal::Real(f) => {
            sqlx::query_scalar::<_, f64>(&sql)
                .bind(pk)
                .fetch_optional(pool)
                .await
                .unwrap()
                == Some(*f)
        }
        ProbeVal::Text(t) => {
            sqlx::query_scalar::<_, String>(&sql)
                .bind(pk)
                .fetch_optional(pool)
                .await
                .unwrap()
                .as_deref()
                == Some(t.as_str())
        }
    };
    assert!(ok, "probe value for {table}.{col} (rowid {pk}) changed");
}

#[test]
fn migrations_preserve_existing_data() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        // :memory: pools need a shared cache so all connections see one DB.
        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename("file:meander-migration-test?mode=memory&cache=shared")
                    .shared_cache(true)
                    .foreign_keys(true),
            )
            .await
            .unwrap();

        type Probe = (String, i64, Vec<(String, ProbeVal)>);
        let mut probes: Vec<Probe> = Vec::new();
        for (step, path) in migration_paths().iter().enumerate() {
            let sql = std::fs::read_to_string(path).unwrap();
            sqlx::raw_sql(&sql)
                .execute(&pool)
                .await
                .unwrap_or_else(|e| panic!("{} failed: {e}", path.display()));
            // Alphabetical order puts `profiles` before `tasks`, so FK parents
            // get their probe row first and children can reference it.
            for table in user_tables(&pool).await {
                let (pk, values) = probe_insert(&pool, &table, step).await;
                probes.push((table, pk, values));
            }
        }

        for (table, pk, values) in &probes {
            for (col, expected) in values {
                probe_check(&pool, table, *pk, col, expected).await;
            }
        }
    });
}
