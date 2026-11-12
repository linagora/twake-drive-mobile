use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::{Connection, ErrorCode, OptionalExtension, TransactionBehavior::Immediate, params};

use super::rules::{Decision, PassAction, UNAVAILABLE_DELAY_SECS, UploadOutcome, decide};
use crate::CoreError;

/// Each entry moves the schema one version up; `PRAGMA user_version` says how
/// many already ran. Only ever append.
const MIGRATIONS: &[&str] = &[
    "
    CREATE TABLE media (
        local_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        md5 TEXT,
        state TEXT NOT NULL DEFAULT 'pending',
        drive_file_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        not_before INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
    );
    CREATE INDEX media_queue ON media (state, created_at);
",
    "
    CREATE TABLE remote_file (
        file_id TEXT PRIMARY KEY,
        md5 TEXT NOT NULL,
        id_from_library TEXT,
        name TEXT NOT NULL
    );
    CREATE INDEX remote_file_md5 ON remote_file (md5);
    CREATE INDEX remote_file_library ON remote_file (id_from_library);
",
];

/// No lease nor delay lasts this long: a later `not_before` comes from a clock
/// that went back, and the media is due at once.
const MAX_HOLD_SECS: i64 = 8 * 24 * 60 * 60;

/// On iOS the core runs on the SQLite another library builds into the app.
/// 3.24.0 brought the upsert `record_media` relies on.
const MIN_SQLITE_VERSION: i32 = 3_024_000;

const PENDING: &str = "pending";
const DONE: &str = "done";
const SKIPPED: &str = "skipped";
const FAILED: &str = "failed";

/// A media to upload. `drive_file_id` is set when an older version is already
/// in Drive: the upload is then a new version of that file. `modified_at` goes
/// back with the md5 of this version (`set_md5`).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct QueuedMedia {
    pub local_id: String,
    pub modified_at: i64,
    pub md5: Option<String>,
    pub drive_file_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, uniffi::Record)]
pub struct BackupCounts {
    pub done: u32,
    pub pending: u32,
    pub skipped: u32,
    pub failed: u32,
    /// Among `pending`: media the device could not read, an iCloud original
    /// out of reach. They never fail, the user may want to know.
    pub unavailable: u32,
}

/// The backup state of one device: which media exist, which are in Drive, and
/// when to try the others again. Times are Unix seconds given by the caller.
///
/// The database must stay on the device: one Drive folder per phone, so a copy
/// restored on another phone would claim its media are already saved. Put its
/// folder out of the backups, the `-wal` and `-shm` files included
/// (`isExcludedFromBackup` on iOS, `getNoBackupFilesDir()` on Android).
#[derive(uniffi::Object)]
pub struct BackupStore {
    db: Mutex<Connection>,
}

#[uniffi::export]
impl BackupStore {
    #[uniffi::constructor]
    pub fn open(path: String) -> Result<Arc<Self>, CoreError> {
        check_sqlite_version(rusqlite::version_number())?;
        // rusqlite appends the path to a "cannot open" message; keep only SQLite's own.
        let mut db = Connection::open(path).map_err(|e| match e.sqlite_error() {
            Some(sqlite) => storage(rusqlite::Error::SqliteFailure(*sqlite, None)),
            None => storage(e),
        })?;
        // rusqlite already sets a 5 s busy timeout: the app and its background
        // task may write at the same time.
        db.pragma_update(None, "journal_mode", "WAL")
            .map_err(storage)?;
        db.pragma_update(None, "foreign_keys", true)
            .map_err(storage)?;
        migrate(&mut db)?;
        Ok(Arc::new(Self { db: Mutex::new(db) }))
    }

    /// A media seen in the library. New, it waits for its upload; changed since
    /// the last time, it is hashed and uploaded again as a new version.
    /// `modified_at` is the date of the last change of the media. On iOS it is
    /// `modificationDate`, which a favorite moves too: the media is hashed
    /// again, then found already in Drive, not uploaded.
    pub fn record_media(
        &self,
        local_id: String,
        created_at: i64,
        modified_at: i64,
    ) -> Result<(), CoreError> {
        self.db()
            .execute(
                "INSERT INTO media (local_id, created_at, modified_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (local_id) DO UPDATE SET
                 created_at = excluded.created_at,
                 modified_at = excluded.modified_at,
                 md5 = NULL, state = 'pending', attempts = 0, not_before = 0, last_error = NULL
             WHERE media.modified_at != excluded.modified_at",
                params![local_id, created_at, modified_at],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// A media gone from the library. What is in Drive stays there.
    pub fn forget_media(&self, local_id: String) -> Result<(), CoreError> {
        self.db()
            .execute("DELETE FROM media WHERE local_id = ?1", params![local_id])
            .map_err(storage)?;
        Ok(())
    }

    /// The md5 of the version hashed. Dropped when the media changed since:
    /// that version is no longer the one to upload.
    pub fn set_md5(
        &self,
        local_id: String,
        modified_at: i64,
        md5: String,
    ) -> Result<(), CoreError> {
        self.db()
            .execute(
                "UPDATE media SET md5 = ?3 WHERE local_id = ?1 AND modified_at = ?2",
                params![local_id, modified_at, md5],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// Up to `limit` media due for upload, newest first. They are held for
    /// `lease_secs`: a later pass skips them while an earlier one (or the
    /// system, for a background transfer) may still deliver them, and gets
    /// them back if no outcome came. A lease stays under 8 days.
    pub fn next_batch(
        &self,
        now: i64,
        limit: u32,
        lease_secs: i64,
    ) -> Result<Vec<QueuedMedia>, CoreError> {
        let mut db = self.db();
        // Immediate: two processes must not lease the same rows.
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        let batch = {
            let mut query = tx
                .prepare(
                    "SELECT local_id, modified_at, md5, drive_file_id FROM media
                     WHERE state = 'pending' AND (not_before <= ?1 OR not_before > ?1 + ?3)
                     ORDER BY created_at DESC LIMIT ?2",
                )
                .map_err(storage)?;
            query
                .query_map(params![now, limit, MAX_HOLD_SECS], |row| {
                    Ok(QueuedMedia {
                        local_id: row.get(0)?,
                        modified_at: row.get(1)?,
                        md5: row.get(2)?,
                        drive_file_id: row.get(3)?,
                    })
                })
                .map_err(storage)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(storage)?
        };
        for media in &batch {
            tx.execute(
                "UPDATE media SET not_before = ?2 WHERE local_id = ?1",
                params![media.local_id, now + lease_secs],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)?;
        Ok(batch)
    }

    /// Applies the retry rules to what the stack answered for the upload of
    /// `md5`, and says whether the rest of the pass is worth trying.
    pub fn record_outcome(
        &self,
        local_id: String,
        md5: String,
        outcome: UploadOutcome,
        now: i64,
    ) -> Result<PassAction, CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        let attempts: Option<u32> = tx
            .query_row(
                "SELECT attempts FROM media WHERE local_id = ?1 AND md5 = ?2 AND state = 'pending'",
                params![local_id, md5],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage)?;
        // Forgotten, edited or already settled by another transfer: stale.
        let Some(attempts) = attempts else {
            return Ok(decide(&outcome, 0, now).1);
        };
        let (decision, action) = decide(&outcome, attempts, now);
        let error = format!("{outcome:?}");
        match decision {
            Decision::Done { file_id } => tx.execute(
                "UPDATE media SET state = ?2, drive_file_id = ?3, attempts = 0, last_error = NULL
                 WHERE local_id = ?1",
                params![local_id, DONE, file_id],
            ),
            Decision::Rehash => tx.execute(
                "UPDATE media SET md5 = NULL, attempts = attempts + 1, not_before = 0
                 WHERE local_id = ?1",
                params![local_id],
            ),
            Decision::Skip => tx.execute(
                "UPDATE media SET state = ?2, last_error = ?3 WHERE local_id = ?1",
                params![local_id, SKIPPED, error],
            ),
            Decision::RetryAt(at) => tx.execute(
                "UPDATE media SET attempts = attempts + 1, not_before = ?2, last_error = ?3
                 WHERE local_id = ?1",
                params![local_id, at, error],
            ),
            Decision::Fail => tx.execute(
                "UPDATE media SET state = ?2, attempts = attempts + 1, last_error = ?3
                 WHERE local_id = ?1",
                params![local_id, FAILED, error],
            ),
            Decision::Wait => tx.execute(
                "UPDATE media SET not_before = 0 WHERE local_id = ?1",
                params![local_id],
            ),
            Decision::Later(at) => tx.execute(
                "UPDATE media SET not_before = ?2, last_error = ?3 WHERE local_id = ?1",
                params![local_id, at, error],
            ),
        }
        .map_err(storage)?;
        tx.commit().map_err(storage)?;
        Ok(action)
    }

    /// The version `modified_at` could not be read on the device, so it has no
    /// md5 yet: `record_outcome` cannot name it.
    pub fn record_unavailable(
        &self,
        local_id: String,
        modified_at: i64,
        now: i64,
    ) -> Result<(), CoreError> {
        self.db()
            .execute(
                "UPDATE media SET not_before = ?3, last_error = ?4
                 WHERE local_id = ?1 AND modified_at = ?2 AND state = 'pending'",
                params![
                    local_id,
                    modified_at,
                    now + UNAVAILABLE_DELAY_SECS,
                    format!("{:?}", UploadOutcome::Unavailable)
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// The user asks to try the failed media again.
    pub fn retry_failed(&self) -> Result<(), CoreError> {
        self.db()
            .execute(
                "UPDATE media SET state = 'pending', attempts = 0, not_before = 0, last_error = NULL
                 WHERE state = 'failed'",
                [],
            )
            .map_err(storage)?;
        Ok(())
    }

    pub fn counts(&self) -> Result<BackupCounts, CoreError> {
        let db = self.db();
        let mut query = db
            .prepare("SELECT state, COUNT(*) FROM media GROUP BY state")
            .map_err(storage)?;
        let rows = query
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
            })
            .map_err(storage)?;
        let mut counts = BackupCounts::default();
        for row in rows {
            let (state, count) = row.map_err(storage)?;
            match state.as_str() {
                DONE => counts.done = count,
                PENDING => counts.pending = count,
                SKIPPED => counts.skipped = count,
                FAILED => counts.failed = count,
                _ => {}
            }
        }
        counts.unavailable = db
            .query_row(
                "SELECT COUNT(*) FROM media WHERE state = 'pending' AND last_error = ?1",
                params![format!("{:?}", UploadOutcome::Unavailable)],
                |row| row.get(0),
            )
            .map_err(storage)?;
        Ok(counts)
    }
}

impl BackupStore {
    pub(super) fn db(&self) -> MutexGuard<'_, Connection> {
        // A panic while the lock was held leaves no half-written row: SQLite
        // rolled the transaction back, so the connection is still sound.
        self.db
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn check_sqlite_version(version: i32) -> Result<(), CoreError> {
    if version < MIN_SQLITE_VERSION {
        return Err(CoreError::Storage {
            reason: format!("SQLite {version} is older than {MIN_SQLITE_VERSION}"),
        });
    }
    Ok(())
}

/// One transaction, so a failed migration leaves no half-built schema and two
/// processes opening the store at once do not both run it.
fn migrate(db: &mut Connection) -> Result<(), CoreError> {
    let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
    let done: i64 = tx
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(storage)?;
    if done > MIGRATIONS.len() as i64 {
        return Err(CoreError::Unusable {
            reason: format!("schema version {done}, written by a newer app"),
        });
    }
    for (version, sql) in (1..).zip(MIGRATIONS).skip(done as usize) {
        tx.execute_batch(sql).map_err(storage)?;
        tx.pragma_update(None, "user_version", version as i64)
            .map_err(storage)?;
    }
    tx.commit().map_err(storage)
}

pub(super) fn storage(e: rusqlite::Error) -> CoreError {
    let reason = e.to_string();
    match e.sqlite_error_code() {
        Some(ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase) => {
            CoreError::Unusable { reason }
        }
        _ => CoreError::Storage { reason },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;
    const MD5: &str = "md5";

    fn store() -> Arc<BackupStore> {
        BackupStore::open(":memory:".into()).unwrap()
    }

    fn ids(batch: &[QueuedMedia]) -> Vec<&str> {
        batch.iter().map(|m| m.local_id.as_str()).collect()
    }

    fn uploaded(file_id: &str) -> UploadOutcome {
        UploadOutcome::Uploaded {
            file_id: file_id.into(),
        }
    }

    #[test]
    fn new_media_wait_newest_first() {
        let s = store();
        s.record_media("old".into(), 10, 10).unwrap();
        s.record_media("new".into(), 20, 20).unwrap();
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["new", "old"]);
        assert_eq!(s.counts().unwrap().pending, 2);
    }

    #[test]
    fn a_leased_media_comes_back_once_the_lease_ends() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        assert_eq!(s.next_batch(NOW, 10, 60).unwrap().len(), 1);
        assert!(s.next_batch(NOW + 59, 10, 60).unwrap().is_empty());
        assert_eq!(s.next_batch(NOW + 60, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn an_uploaded_media_leaves_the_queue_and_keeps_its_drive_file() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        let action = s
            .record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        assert_eq!(action, PassAction::Continue);
        assert!(s.next_batch(NOW, 10, 60).unwrap().is_empty());
        assert_eq!(s.counts().unwrap().done, 1);
    }

    #[test]
    fn seen_again_unchanged_a_saved_media_stays_saved() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        s.record_media("a".into(), 1, 1).unwrap();
        assert_eq!(s.counts().unwrap().done, 1);
    }

    #[test]
    fn an_edited_media_goes_again_as_a_new_version_of_its_file() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        s.record_media("a".into(), 1, 2).unwrap();
        assert_eq!(
            s.next_batch(NOW, 10, 60).unwrap(),
            [QueuedMedia {
                local_id: "a".into(),
                modified_at: 2,
                md5: None,
                drive_file_id: Some("f1".into()),
            }]
        );
    }

    #[test]
    fn an_upload_that_ends_after_an_edit_does_not_save_the_edit() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_media("a".into(), 1, 2).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        assert_eq!(s.counts().unwrap().pending, 1);
    }

    #[test]
    fn an_open_error_does_not_name_the_file() {
        let dir = std::env::temp_dir().join("twake-core-no-such-dir");
        let path = dir.join("state.db").to_string_lossy().into_owned();
        let Err(CoreError::Storage { reason }) = BackupStore::open(path) else {
            panic!("the store opened in a missing folder");
        };
        assert!(!reason.contains("twake-core-no-such-dir"), "{reason}");
    }

    #[test]
    fn a_412_drops_the_md5_and_retries_at_once() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.next_batch(NOW, 10, 3600).unwrap();
        s.record_outcome("a".into(), MD5.into(), UploadOutcome::ContentChanged, NOW)
            .unwrap();
        assert_eq!(s.next_batch(NOW, 10, 60).unwrap()[0].md5, None);
    }

    #[test]
    fn a_full_quota_stops_the_pass_and_keeps_the_media_due() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.next_batch(NOW, 10, 3600).unwrap();
        let action = s
            .record_outcome("a".into(), MD5.into(), UploadOutcome::QuotaExceeded, NOW)
            .unwrap();
        assert_eq!(action, PassAction::Stop);
        assert_eq!(s.next_batch(NOW, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_server_error_delays_the_media() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome(
            "a".into(),
            MD5.into(),
            UploadOutcome::Server { status: 503 },
            NOW,
        )
        .unwrap();
        assert!(s.next_batch(NOW + 59, 10, 60).unwrap().is_empty());
        assert_eq!(s.next_batch(NOW + 60, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn repeated_errors_end_in_failed() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        for _ in 0..super::super::rules::MAX_ATTEMPTS {
            s.record_outcome(
                "a".into(),
                MD5.into(),
                UploadOutcome::Refused { status: 404 },
                NOW,
            )
            .unwrap();
        }
        assert_eq!(s.counts().unwrap().failed, 1);
    }

    #[test]
    fn failed_media_go_again_when_the_user_asks() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        for _ in 0..super::super::rules::MAX_ATTEMPTS {
            s.record_outcome(
                "a".into(),
                MD5.into(),
                UploadOutcome::Server { status: 500 },
                NOW,
            )
            .unwrap();
        }
        assert!(s.next_batch(NOW + 1_000_000, 10, 60).unwrap().is_empty());
        s.retry_failed().unwrap();
        assert_eq!(s.next_batch(NOW, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_file_out_of_reach_never_fails_and_comes_back_in_an_hour() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        for _ in 0..2 * super::super::rules::MAX_ATTEMPTS {
            s.record_outcome("a".into(), MD5.into(), UploadOutcome::Unavailable, NOW)
                .unwrap();
        }
        assert_eq!(s.counts().unwrap().failed, 0);
        assert!(s.next_batch(NOW + 3599, 10, 60).unwrap().is_empty());
        assert_eq!(s.next_batch(NOW + 3600, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_file_out_of_reach_before_its_hash_comes_back_in_an_hour() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.next_batch(NOW, 10, 60).unwrap();
        s.record_unavailable("a".into(), 1, NOW).unwrap();
        assert_eq!(s.counts().unwrap().unavailable, 1);
        assert!(s.next_batch(NOW + 3599, 10, 60).unwrap().is_empty());
        assert_eq!(s.next_batch(NOW + 3600, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_file_out_of_reach_edited_meanwhile_stays_due() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.record_media("a".into(), 1, 2).unwrap();
        s.record_unavailable("a".into(), 1, NOW).unwrap();
        assert_eq!(s.next_batch(NOW, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_file_too_large_is_skipped() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), UploadOutcome::FileTooLarge, NOW)
            .unwrap();
        assert_eq!(s.counts().unwrap().skipped, 1);
        assert!(s.next_batch(NOW, 10, 60).unwrap().is_empty());
    }

    #[test]
    fn a_forgotten_media_leaves_the_counts() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.forget_media("a".into()).unwrap();
        assert_eq!(s.counts().unwrap(), BackupCounts::default());
    }

    #[test]
    fn the_hash_of_a_version_edited_meanwhile_is_dropped() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        let queued = s.next_batch(NOW, 10, 60).unwrap().remove(0);
        s.record_media("a".into(), 1, 2).unwrap();
        s.set_md5("a".into(), queued.modified_at, "v1".into())
            .unwrap();
        s.record_outcome("a".into(), "v1".into(), uploaded("f1"), NOW)
            .unwrap();
        assert_eq!(s.counts().unwrap().pending, 1);
        let again = s.next_batch(NOW, 10, 60).unwrap().remove(0);
        assert_eq!((again.modified_at, again.md5), (2, None));
    }

    #[test]
    fn a_late_outcome_leaves_a_saved_media_alone() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        s.record_outcome("a".into(), MD5.into(), UploadOutcome::ContentChanged, NOW)
            .unwrap();
        let md5: Option<String> = s
            .db()
            .query_row("SELECT md5 FROM media", [], |row| row.get(0))
            .unwrap();
        assert_eq!((s.counts().unwrap().done, md5), (1, Some(MD5.into())));
    }

    #[test]
    fn a_clock_that_went_back_does_not_freeze_the_queue() {
        let s = store();
        s.record_media("a".into(), 1, 1).unwrap();
        s.next_batch(NOW, 10, 3600).unwrap();
        let ten_days = 10 * 24 * 3600;
        assert_eq!(s.next_batch(NOW - ten_days, 10, 60).unwrap().len(), 1);
    }

    #[test]
    fn a_corrupt_database_is_reported_unusable() {
        let path = temp_db("corrupt");
        std::fs::write(&path, vec![0x42; 4096]).unwrap();
        let opened = BackupStore::open(path.clone());
        remove_db(&path);
        assert!(matches!(opened, Err(CoreError::Unusable { .. })));
    }

    #[test]
    fn a_database_from_a_newer_app_is_reported_unusable() {
        let path = temp_db("newer");
        Connection::open(&path)
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        let opened = BackupStore::open(path.clone());
        remove_db(&path);
        assert!(matches!(opened, Err(CoreError::Unusable { .. })));
    }

    fn temp_db(name: &str) -> String {
        let path =
            std::env::temp_dir().join(format!("twake-core-{}-{name}.db", std::process::id()));
        path.to_string_lossy().into_owned()
    }

    fn remove_db(path: &str) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{path}{suffix}"));
        }
    }

    #[test]
    fn a_sqlite_too_old_is_refused() {
        assert!(check_sqlite_version(3_023_999).is_err());
        assert!(check_sqlite_version(rusqlite::version_number()).is_ok());
    }

    #[test]
    fn double_quoted_strings_are_refused() {
        let s = store();
        let quoted = s.db().query_row(r#"SELECT "pending""#, [], |_| Ok(()));
        assert!(quoted.is_err());
    }

    #[test]
    fn the_state_survives_a_reopen() {
        let path = temp_db("state");
        BackupStore::open(path.clone())
            .unwrap()
            .record_media("a".into(), 1, 1)
            .unwrap();
        let counts = BackupStore::open(path.clone()).unwrap().counts().unwrap();
        remove_db(&path);
        assert_eq!(counts.pending, 1);
    }
}
