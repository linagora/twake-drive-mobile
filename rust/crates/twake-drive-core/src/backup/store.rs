use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::{Connection, ErrorCode, OptionalExtension, TransactionBehavior::Immediate, params};

use super::rules::{Decision, PassAction, UNAVAILABLE_DELAY_SECS, UploadOutcome, decide};
use crate::CoreError;
use crate::library::{library_id_of, paired_video_key};
use crate::stack::MediaToSend;

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
    "ALTER TABLE media ADD COLUMN content_version TEXT;",
    "ALTER TABLE media ADD COLUMN paired_video TEXT;",
    "CREATE TABLE setting (key TEXT PRIMARY KEY, value BLOB NOT NULL);",
    "
    CREATE TABLE in_flight (
        local_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        md5 TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        paired_video_id TEXT,
        name_attempt INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        parked_at INTEGER NOT NULL
    );
",
    "CREATE TABLE album_choice (album_id TEXT PRIMARY KEY, included INTEGER NOT NULL);",
];

/// How long an upload handed to the system holds its media. The platform
/// gives up on the upload before (on iOS, `timeoutIntervalForResource`).
pub const UPLOAD_HOLD_SECS: i64 = 24 * 60 * 60;

const CHANGE_TOKEN: &str = "change_token";
const FOLDER_ID: &str = "folder_id";
const FOLDER_PATH: &str = "folder_path";
const DEVICE_ID: &str = "device_id";
const STOPPED_BY: &str = "stopped_by";
const CELLULAR_PHOTOS: &str = "cellular_photos";
const CELLULAR_VIDEOS: &str = "cellular_videos";
const ONLY_CHARGING: &str = "only_charging";
const LAST_PASS_AT: &str = "last_pass_at";

fn set_setting(db: &Connection, key: &str, value: impl Into<Vec<u8>>) -> Result<(), CoreError> {
    db.execute(
        "INSERT INTO setting (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value.into()],
    )
    .map_err(storage)?;
    Ok(())
}

/// The cause the screen shows for an answer that stops the pass.
fn stop_cause(outcome: &UploadOutcome) -> &'static str {
    match outcome {
        UploadOutcome::QuotaExceeded => "QuotaExceeded",
        UploadOutcome::Network => "Network",
        UploadOutcome::Unauthorized => "Unauthorized",
        UploadOutcome::Server { .. } => "Server",
        _ => "Refused",
    }
}

fn setting(db: &Connection, key: &str) -> Result<Option<String>, CoreError> {
    db.query_row(
        "SELECT value FROM setting WHERE key = ?1",
        params![key],
        |row| row.get::<_, Vec<u8>>(0),
    )
    .optional()
    .map_err(storage)
    .map(|value| value.and_then(|bytes| String::from_utf8(bytes).ok()))
}

/// No lease nor delay lasts this long: a later `not_before` comes from a clock
/// that went back, and the media is due at once.
const MAX_HOLD_SECS: i64 = 8 * 24 * 60 * 60;

/// On iOS the core runs on the SQLite another library builds into the app.
/// 3.24.0 brought the upsert `record_library` relies on.
const MIN_SQLITE_VERSION: i32 = 3_024_000;

const PENDING: &str = "pending";
const DONE: &str = "done";
const SKIPPED: &str = "skipped";
const FAILED: &str = "failed";
/// The `last_error` of a media the device could not read.
const UNAVAILABLE: &str = "Unavailable";

/// A media to upload. `drive_file_id` is set when an older version is already
/// in Drive: the upload is then a new version of that file. `modified_at` goes
/// back with the md5 of this version (`set_md5`).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct QueuedMedia {
    pub local_id: String,
    pub modified_at: i64,
    pub md5: Option<String>,
    pub drive_file_id: Option<String>,
    /// For the photo of a Live Photo: the Drive file of its video.
    pub paired_video_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct LibraryMedia {
    pub local_id: String,
    pub created_at: i64,
    pub modified_at: i64,
    /// What the content is made of (on iOS the original, or the md5 of its
    /// adjustment data). Unknown: any change of `modified_at` counts.
    pub content_version: Option<String>,
    /// For the photo of a Live Photo: the key of its video
    /// (`paired_video_key`), recorded in the same scan.
    pub paired_video: Option<String>,
}

/// What the backup screen shows.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct BackupStatus {
    pub counts: BackupCounts,
    /// When the last pass ended, in Unix seconds.
    pub last_pass_at: Option<i64>,
    /// What stopped the last pass for every media, one of `stop_cause`, or
    /// what it waits for (`wait_for`).
    pub stopped_by: Option<String>,
    /// The folder the backup goes to, which a pass may have made again.
    pub folder_id: Option<String>,
    pub folder_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct AlbumChoice {
    pub album_id: String,
    pub included: bool,
}

/// The user's choices on when the backup may go. All off by default: Wi-Fi
/// only, whatever the battery.
#[derive(Debug, Clone, Default, PartialEq, uniffi::Record)]
pub struct BackupConditions {
    pub cellular_photos: bool,
    pub cellular_videos: bool,
    pub only_charging: bool,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct BackupConfig {
    pub folder_id: String,
    pub device_id: String,
}

/// An upload handed to the system, as it was prepared.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ParkedUpload {
    pub media: MediaToSend,
    pub name_attempt: u32,
    pub file_path: String,
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

    /// The media seen in the library, in one transaction. A new one waits for
    /// its upload; one whose `modified_at` changed is hashed and uploaded again
    /// as a new version, unless it is saved and its `content_version` says the
    /// content stayed the same (on iOS `modificationDate` moves with a favorite
    /// too). A failed or skipped media gets another try on any change.
    pub fn record_library(&self, media: Vec<LibraryMedia>) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        {
            // Before the upsert, which moves modified_at.
            let mut reset = tx
                .prepare(
                    "UPDATE media SET md5 = NULL, state = 'pending', attempts = 0, not_before = 0,
                         last_error = NULL
                     WHERE local_id = ?1 AND modified_at != ?2
                       AND NOT (state = 'done' AND ?3 IS NOT NULL AND content_version IS ?3)",
                )
                .map_err(storage)?;
            let mut upsert = tx
                .prepare(
                    "INSERT INTO media (local_id, created_at, modified_at, content_version, paired_video)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT (local_id) DO UPDATE SET
                         created_at = excluded.created_at,
                         modified_at = excluded.modified_at,
                         -- An unknown version of unchanged content keeps the known one.
                         content_version = CASE
                             WHEN excluded.content_version IS NULL
                                  AND media.modified_at = excluded.modified_at
                             THEN media.content_version
                             ELSE excluded.content_version END,
                         paired_video = excluded.paired_video",
                )
                .map_err(storage)?;
            let mut gone_video = tx
                .prepare("DELETE FROM media WHERE local_id = ?1")
                .map_err(storage)?;
            for m in media {
                reset
                    .execute(params![m.local_id, m.modified_at, m.content_version])
                    .map_err(storage)?;
                upsert
                    .execute(params![
                        m.local_id,
                        m.created_at,
                        m.modified_at,
                        m.content_version,
                        m.paired_video
                    ])
                    .map_err(storage)?;
                // An edit may turn a Live Photo into a still: its video is gone.
                if m.paired_video.is_none() && library_id_of(&m.local_id) == m.local_id {
                    gone_video
                        .execute(params![paired_video_key(m.local_id)])
                        .map_err(storage)?;
                }
            }
        }
        tx.commit().map_err(storage)
    }

    /// A media gone from the library. What is in Drive stays there.
    pub fn forget_media(&self, local_id: String) -> Result<(), CoreError> {
        self.db()
            .execute("DELETE FROM media WHERE local_id = ?1", params![local_id])
            .map_err(storage)?;
        Ok(())
    }

    /// The albums the user picked (`true`) or left out (`false`); the others
    /// are neutral. None picked means the whole library.
    pub fn album_choices(&self) -> Result<Vec<AlbumChoice>, CoreError> {
        let db = self.db();
        let mut query = db
            .prepare("SELECT album_id, included FROM album_choice ORDER BY album_id")
            .map_err(storage)?;
        query
            .query_map([], |row| {
                Ok(AlbumChoice {
                    album_id: row.get(0)?,
                    included: row.get(1)?,
                })
            })
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    /// `None` makes the album neutral again. The next scan reads the whole
    /// library: a change token says nothing of album membership.
    pub fn set_album_choice(
        &self,
        album_id: String,
        included: Option<bool>,
    ) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        match included {
            Some(included) => tx.execute(
                "INSERT INTO album_choice (album_id, included) VALUES (?1, ?2)
                 ON CONFLICT (album_id) DO UPDATE SET included = excluded.included",
                params![album_id, included],
            ),
            None => tx.execute(
                "DELETE FROM album_choice WHERE album_id = ?1",
                params![album_id],
            ),
        }
        .map_err(storage)?;
        tx.execute("DELETE FROM setting WHERE key = ?1", params![CHANGE_TOKEN])
            .map_err(storage)?;
        tx.commit().map_err(storage)
    }

    /// The media the albums leave out no longer wait for their upload, the
    /// video of a Live Photo with its photo. A media already saved stays so:
    /// it is in Drive, and an album picked again does not send it again.
    pub fn keep_only(&self, library_ids: Vec<String>) -> Result<(), CoreError> {
        let keep: std::collections::HashSet<String> = library_ids.into_iter().collect();
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        let known: Vec<String> = {
            let mut query = tx
                .prepare("SELECT local_id FROM media WHERE state != 'done'")
                .map_err(storage)?;
            query
                .query_map([], |row| row.get(0))
                .map_err(storage)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(storage)?
        };
        for local_id in known {
            if !keep.contains(library_id_of(&local_id)) {
                tx.execute("DELETE FROM media WHERE local_id = ?1", params![local_id])
                    .map_err(storage)?;
            }
        }
        tx.commit().map_err(storage)
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
                    // The photo of a Live Photo waits for its video: it
                    // carries the Drive id of the video, as with the flagship.
                    // A video out of reach does not hold the photo back.
                    "SELECT media.local_id, media.modified_at, media.md5, media.drive_file_id,
                            video.drive_file_id
                     FROM media LEFT JOIN media AS video ON video.local_id = media.paired_video
                     WHERE media.state = 'pending'
                       AND (media.not_before <= ?1 OR media.not_before > ?1 + ?3)
                       AND (video.state IS NULL OR video.state != 'pending'
                            OR video.last_error IS ?4)
                     ORDER BY media.created_at DESC LIMIT ?2",
                )
                .map_err(storage)?;
            query
                .query_map(params![now, limit, MAX_HOLD_SECS, UNAVAILABLE], |row| {
                    Ok(QueuedMedia {
                        local_id: row.get(0)?,
                        modified_at: row.get(1)?,
                        md5: row.get(2)?,
                        drive_file_id: row.get(3)?,
                        paired_video_id: row.get(4)?,
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
        let error = format!("{outcome:?}");
        // A stale answer stops the pass too: it holds for every media.
        if decide(&outcome, attempts.unwrap_or(0), now).1 == PassAction::Stop {
            set_setting(&tx, STOPPED_BY, stop_cause(&outcome))?;
        }
        // Forgotten, edited or already settled by another transfer: stale.
        let Some(attempts) = attempts else {
            tx.commit().map_err(storage)?;
            return Ok(decide(&outcome, 0, now).1);
        };
        let (decision, action) = decide(&outcome, attempts, now);
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
                    UNAVAILABLE
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// Where the last scan of the library stopped, in the platform's own form
    /// (on iOS an archived `PHPersistentChangeToken`). It lives with the state
    /// it describes: a new account or a database rebuilt starts from a full scan.
    pub fn change_token(&self) -> Result<Option<Vec<u8>>, CoreError> {
        self.db()
            .query_row(
                "SELECT value FROM setting WHERE key = ?1",
                params![CHANGE_TOKEN],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage)
    }

    /// Saved once the changes it covers are recorded.
    pub fn set_change_token(&self, token: Vec<u8>) -> Result<(), CoreError> {
        self.db()
            .execute(
                "INSERT INTO setting (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![CHANGE_TOKEN, token],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// A pass starts: what stopped the last one is no longer the state.
    pub fn begin_pass(&self) -> Result<(), CoreError> {
        self.db()
            .execute("DELETE FROM setting WHERE key = ?1", params![STOPPED_BY])
            .map_err(storage)?;
        Ok(())
    }

    /// A pass went through the queue, or stopped on an answer that would hold
    /// for every media (`stopped_by`).
    pub fn end_pass(&self, now: i64) -> Result<(), CoreError> {
        set_setting(&self.db(), LAST_PASS_AT, now.to_string())
    }

    pub fn status(&self) -> Result<BackupStatus, CoreError> {
        let counts = self.counts()?;
        let db = self.db();
        Ok(BackupStatus {
            counts,
            last_pass_at: setting(&db, LAST_PASS_AT)?.and_then(|at| at.parse().ok()),
            stopped_by: setting(&db, STOPPED_BY)?,
            folder_id: setting(&db, FOLDER_ID)?,
            folder_path: setting(&db, FOLDER_PATH)?,
        })
    }

    /// Where the backup goes, for a pass the system starts without the app.
    pub fn set_backup_config(&self, config: BackupConfig) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        for (key, value) in [(FOLDER_ID, config.folder_id), (DEVICE_ID, config.device_id)] {
            tx.execute(
                "INSERT INTO setting (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value.into_bytes()],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)
    }

    /// None once the backup is turned off: a pass started by the system ends.
    pub fn backup_config(&self) -> Result<Option<BackupConfig>, CoreError> {
        let db = self.db();
        Ok(match (setting(&db, FOLDER_ID)?, setting(&db, DEVICE_ID)?) {
            (Some(folder_id), Some(device_id)) => Some(BackupConfig {
                folder_id,
                device_id,
            }),
            _ => None,
        })
    }

    /// The pass held media back for the user's conditions: "WaitingForWifi"
    /// or "WaitingForPower", shown as what stopped it.
    pub fn wait_for(&self, cause: String) -> Result<(), CoreError> {
        set_setting(&self.db(), STOPPED_BY, cause)
    }

    /// Media the pass took but held back: due again at once, for the next pass.
    pub fn release_media(&self, local_ids: Vec<String>) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        for local_id in local_ids {
            tx.execute(
                "UPDATE media SET not_before = 0 WHERE local_id = ?1 AND state = 'pending'",
                params![local_id],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)
    }

    pub fn conditions(&self) -> Result<BackupConditions, CoreError> {
        let db = self.db();
        let on = |key| Ok::<_, CoreError>(setting(&db, key)?.as_deref() == Some("1"));
        Ok(BackupConditions {
            cellular_photos: on(CELLULAR_PHOTOS)?,
            cellular_videos: on(CELLULAR_VIDEOS)?,
            only_charging: on(ONLY_CHARGING)?,
        })
    }

    pub fn set_conditions(&self, conditions: BackupConditions) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        for (key, on) in [
            (CELLULAR_PHOTOS, conditions.cellular_photos),
            (CELLULAR_VIDEOS, conditions.cellular_videos),
            (ONLY_CHARGING, conditions.only_charging),
        ] {
            set_setting(&tx, key, if on { "1" } else { "0" })?;
        }
        tx.commit().map_err(storage)
    }

    pub fn clear_backup_config(&self) -> Result<(), CoreError> {
        self.db()
            .execute(
                "DELETE FROM setting WHERE key IN (?1, ?2, ?3)",
                params![FOLDER_ID, DEVICE_ID, FOLDER_PATH],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// An upload handed to the system, whose answer may come in a later run of
    /// the app. Holds the media `UPLOAD_HOLD_SECS`. Returns the file of an
    /// earlier upload of the media, which the platform deletes: its answer
    /// never came within the hold.
    pub fn park_upload(
        &self,
        media: MediaToSend,
        name_attempt: u32,
        file_path: String,
        now: i64,
    ) -> Result<Option<String>, CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        let earlier: Option<String> = tx
            .query_row(
                "SELECT file_path FROM in_flight WHERE local_id = ?1",
                params![media.local_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage)?;
        tx.execute(
            "INSERT OR REPLACE INTO in_flight (local_id, name, mime, size, md5, created_at,
                 modified_at, paired_video_id, name_attempt, file_path, parked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                media.local_id,
                media.name,
                media.mime,
                media.size as i64,
                media.md5,
                media.created_at,
                media.modified_at,
                media.paired_video_id,
                name_attempt,
                file_path,
                now
            ],
        )
        .map_err(storage)?;
        tx.execute(
            "UPDATE media SET not_before = ?2 WHERE local_id = ?1",
            params![media.local_id, now + UPLOAD_HOLD_SECS],
        )
        .map_err(storage)?;
        tx.commit().map_err(storage)?;
        Ok(earlier.filter(|earlier| *earlier != file_path))
    }

    pub fn parked_upload(&self, local_id: String) -> Result<Option<ParkedUpload>, CoreError> {
        self.db()
            .query_row(
                "SELECT local_id, name, mime, size, md5, created_at, modified_at, paired_video_id,
                        name_attempt, file_path
                 FROM in_flight WHERE local_id = ?1",
                params![local_id],
                |row| {
                    Ok(ParkedUpload {
                        media: MediaToSend {
                            local_id: row.get(0)?,
                            name: row.get(1)?,
                            mime: row.get(2)?,
                            size: row.get::<_, i64>(3)? as u64,
                            md5: row.get(4)?,
                            created_at: row.get(5)?,
                            modified_at: row.get(6)?,
                            paired_video_id: row.get(7)?,
                        },
                        name_attempt: row.get(8)?,
                        file_path: row.get(9)?,
                    })
                },
            )
            .optional()
            .map_err(storage)
    }

    /// The answer came: the platform deletes the file.
    pub fn settle_upload(&self, local_id: String) -> Result<(), CoreError> {
        self.db()
            .execute(
                "DELETE FROM in_flight WHERE local_id = ?1",
                params![local_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// Forgets the uploads whose answer never came within the hold: the
    /// platform deletes the files returned, and the media are due again.
    pub fn drop_lost_uploads(&self, now: i64) -> Result<Vec<String>, CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        let before = now - UPLOAD_HOLD_SECS;
        let files = {
            let mut query = tx
                .prepare("SELECT file_path FROM in_flight WHERE parked_at <= ?1")
                .map_err(storage)?;
            query
                .query_map(params![before], |row| row.get(0))
                .map_err(storage)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(storage)?
        };
        tx.execute(
            "DELETE FROM in_flight WHERE parked_at <= ?1",
            params![before],
        )
        .map_err(storage)?;
        tx.commit().map_err(storage)?;
        Ok(files)
    }

    /// The files of the uploads in flight, to keep when the platform cleans up.
    pub fn parked_files(&self) -> Result<Vec<String>, CoreError> {
        let db = self.db();
        let mut query = db
            .prepare("SELECT file_path FROM in_flight")
            .map_err(storage)?;
        query
            .query_map([], |row| row.get(0))
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
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
                params![UNAVAILABLE],
                |row| row.get(0),
            )
            .map_err(storage)?;
        Ok(counts)
    }
}

impl BackupStore {
    #[cfg(test)]
    pub(crate) fn record_media(
        &self,
        local_id: String,
        created_at: i64,
        modified_at: i64,
    ) -> Result<(), CoreError> {
        self.record_library(vec![LibraryMedia {
            local_id,
            created_at,
            modified_at,
            content_version: None,
            paired_video: None,
        }])
    }

    pub(crate) fn folder_path(&self) -> Result<Option<String>, CoreError> {
        setting(&self.db(), FOLDER_PATH)
    }

    pub(crate) fn set_folder_path(&self, path: &str) -> Result<(), CoreError> {
        set_setting(&self.db(), FOLDER_PATH, path)
    }

    /// The folder and where it is now, written only when one of them changed.
    pub(crate) fn keep_folder(&self, config: &BackupConfig, path: &str) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        for (key, value) in [
            (FOLDER_ID, config.folder_id.as_str()),
            (DEVICE_ID, config.device_id.as_str()),
            (FOLDER_PATH, path),
        ] {
            if setting(&tx, key)?.as_deref() != Some(value) {
                set_setting(&tx, key, value)?;
            }
        }
        tx.commit().map_err(storage)
    }

    /// The backup goes on in another folder: the media saved in the old one go
    /// again. Their md5 stays, so those the new folder already holds are found
    /// without an export.
    pub(crate) fn move_to_folder(
        &self,
        config: &BackupConfig,
        path: &str,
    ) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction_with_behavior(Immediate).map_err(storage)?;
        tx.execute(
            "UPDATE media SET state = 'pending', drive_file_id = NULL, attempts = 0, not_before = 0,
             last_error = NULL WHERE state != 'skipped'",
            [],
        )
        .map_err(storage)?;
        tx.execute("DELETE FROM remote_file", []).map_err(storage)?;
        // The uploads handed to the system go to the old folder: their answers
        // are dropped, their copies cleaned with the other leftovers.
        tx.execute("DELETE FROM in_flight", []).map_err(storage)?;
        set_setting(&tx, FOLDER_ID, config.folder_id.clone())?;
        set_setting(&tx, DEVICE_ID, config.device_id.clone())?;
        set_setting(&tx, FOLDER_PATH, path)?;
        tx.commit().map_err(storage)
    }

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
    fn a_scan_queues_the_new_and_edited_media_only() {
        let s = store();
        s.record_media("saved".into(), 1, 1).unwrap();
        s.record_media("edited".into(), 2, 2).unwrap();
        for id in ["saved", "edited"] {
            s.set_md5(id.into(), if id == "saved" { 1 } else { 2 }, MD5.into())
                .unwrap();
            s.record_outcome(id.into(), MD5.into(), uploaded(id), NOW)
                .unwrap();
        }
        s.record_library(vec![
            seen("saved", 1, None),
            seen("edited", 4, None),
            seen("new", 3, None),
        ])
        .unwrap();
        assert_eq!(
            ids(&s.next_batch(NOW, 10, 60).unwrap()),
            ["edited", "new"].map(String::from)
        );
        assert_eq!(s.counts().unwrap().done, 1);
    }

    fn seen(local_id: &str, modified_at: i64, version: Option<&str>) -> LibraryMedia {
        LibraryMedia {
            local_id: local_id.into(),
            created_at: modified_at,
            modified_at,
            content_version: version.map(String::from),
            paired_video: None,
        }
    }

    #[test]
    fn the_photo_of_a_live_photo_goes_after_its_video_with_its_id() {
        let s = store();
        let photo = LibraryMedia {
            paired_video: Some("lp#video".into()),
            ..seen("lp", 5, None)
        };
        s.record_library(vec![photo, seen("lp#video", 5, None)])
            .unwrap();
        let first = s.next_batch(NOW, 10, 60).unwrap();
        assert_eq!(ids(&first), ["lp#video"]);
        s.set_md5("lp#video".into(), 5, MD5.into()).unwrap();
        s.record_outcome("lp#video".into(), MD5.into(), uploaded("mov"), NOW)
            .unwrap();
        let then = s.next_batch(NOW, 10, 60).unwrap();
        assert_eq!(ids(&then), ["lp"]);
        assert_eq!(then[0].paired_video_id.as_deref(), Some("mov"));
    }

    #[test]
    fn a_video_out_of_reach_does_not_hold_its_photo_back() {
        let s = store();
        let photo = LibraryMedia {
            paired_video: Some("lp#video".into()),
            ..seen("lp", 5, None)
        };
        s.record_library(vec![photo, seen("lp#video", 5, None)])
            .unwrap();
        s.record_unavailable("lp#video".into(), 5, NOW).unwrap();
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["lp"]);
        assert_eq!(UNAVAILABLE, format!("{:?}", UploadOutcome::Unavailable));
    }

    #[test]
    fn a_failed_media_gets_another_try_when_it_changes() {
        let s = store();
        s.record_library(vec![seen("a", 1, Some("original"))])
            .unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        for _ in 0..super::super::rules::MAX_ATTEMPTS {
            s.record_outcome(
                "a".into(),
                MD5.into(),
                UploadOutcome::Refused { status: 422 },
                NOW,
            )
            .unwrap();
        }
        assert_eq!(s.counts().unwrap().failed, 1);
        s.record_library(vec![seen("a", 2, Some("original"))])
            .unwrap();
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["a"]);
    }

    #[test]
    fn a_version_learnt_later_spares_the_next_favorite() {
        let s = store();
        s.record_library(vec![seen("a", 1, None)]).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        // A scan that knows the version, then one that could not read it.
        s.record_library(vec![seen("a", 1, Some("original"))])
            .unwrap();
        s.record_library(vec![seen("a", 1, None)]).unwrap();
        s.record_library(vec![seen("a", 2, Some("original"))])
            .unwrap();
        assert!(s.next_batch(NOW, 10, 60).unwrap().is_empty());
    }

    #[test]
    fn a_live_photo_turned_into_a_still_drops_its_video() {
        let s = store();
        let photo = LibraryMedia {
            paired_video: Some("lp#video".into()),
            ..seen("lp", 5, None)
        };
        s.record_library(vec![photo, seen("lp#video", 5, None)])
            .unwrap();
        s.record_library(vec![seen("lp", 6, None)]).unwrap();
        assert_eq!(s.counts().unwrap().pending, 1);
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["lp"]);
    }

    #[test]
    fn a_photo_whose_video_will_not_go_goes_alone() {
        let s = store();
        let photo = LibraryMedia {
            paired_video: Some("lp#video".into()),
            ..seen("lp", 5, None)
        };
        s.record_library(vec![photo, seen("lp#video", 5, None)])
            .unwrap();
        s.set_md5("lp#video".into(), 5, MD5.into()).unwrap();
        s.record_outcome(
            "lp#video".into(),
            MD5.into(),
            UploadOutcome::FileTooLarge,
            NOW,
        )
        .unwrap();
        let batch = s.next_batch(NOW, 10, 60).unwrap();
        assert_eq!(ids(&batch), ["lp"]);
        assert_eq!(batch[0].paired_video_id, None);
    }

    fn saved_with_version(s: &BackupStore, version: &str) {
        s.record_library(vec![seen("a", 1, Some(version))]).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome("a".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
    }

    #[test]
    fn a_favorite_leaves_a_saved_media_saved() {
        let s = store();
        saved_with_version(&s, "original");
        s.record_library(vec![seen("a", 2, Some("original"))])
            .unwrap();
        assert!(s.next_batch(NOW, 10, 60).unwrap().is_empty());
        assert_eq!(s.counts().unwrap().done, 1);
    }

    #[test]
    fn an_edit_queues_a_saved_media_again() {
        let s = store();
        saved_with_version(&s, "original");
        s.record_library(vec![seen("a", 2, Some("adj-1"))]).unwrap();
        let batch = s.next_batch(NOW, 10, 60).unwrap();
        assert_eq!(ids(&batch), ["a"]);
        assert_eq!(batch[0].md5, None);
    }

    #[test]
    fn an_unknown_version_falls_back_on_the_date() {
        let s = store();
        saved_with_version(&s, "original");
        s.record_library(vec![seen("a", 2, None)]).unwrap();
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["a"]);
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
                paired_video_id: None,
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
    fn the_status_says_when_and_why_the_last_pass_stopped() {
        let s = store();
        assert_eq!(s.status().unwrap().last_pass_at, None);
        s.begin_pass().unwrap();
        s.record_media("a".into(), 1, 1).unwrap();
        s.set_md5("a".into(), 1, MD5.into()).unwrap();
        s.record_outcome(
            "a".into(),
            MD5.into(),
            UploadOutcome::Server { status: 503 },
            NOW,
        )
        .unwrap();
        s.end_pass(NOW).unwrap();
        let status = s.status().unwrap();
        assert_eq!(status.last_pass_at, Some(NOW));
        assert_eq!(status.stopped_by.as_deref(), Some("Server"));
        assert_eq!(status.counts.pending, 1);
        // The next pass goes through: nothing stops the backup any more.
        s.begin_pass().unwrap();
        s.end_pass(NOW + 60).unwrap();
        let status = s.status().unwrap();
        assert_eq!(status.stopped_by, None);
        assert_eq!(status.last_pass_at, Some(NOW + 60));
    }

    #[test]
    fn a_stale_answer_that_stops_the_pass_is_shown_too() {
        let s = store();
        s.record_outcome("gone".into(), MD5.into(), UploadOutcome::QuotaExceeded, NOW)
            .unwrap();
        assert_eq!(
            s.status().unwrap().stopped_by.as_deref(),
            Some("QuotaExceeded")
        );
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

    #[test]
    fn the_change_token_is_kept_across_a_reopen() {
        let path = temp_db("token");
        let s = BackupStore::open(path.clone()).unwrap();
        assert_eq!(s.change_token().unwrap(), None);
        s.set_change_token(vec![1, 2]).unwrap();
        s.set_change_token(vec![3]).unwrap();
        let token = BackupStore::open(path.clone())
            .unwrap()
            .change_token()
            .unwrap();
        remove_db(&path);
        assert_eq!(token, Some(vec![3]));
    }

    #[test]
    fn album_choices_are_kept_and_send_the_next_scan_through_the_whole_library() {
        let s = store();
        s.set_change_token(vec![1]).unwrap();
        s.set_album_choice("camera".into(), Some(true)).unwrap();
        s.set_album_choice("screenshots".into(), Some(false))
            .unwrap();
        s.set_album_choice("camera".into(), None).unwrap();
        assert_eq!(
            s.album_choices().unwrap(),
            [AlbumChoice {
                album_id: "screenshots".into(),
                included: false
            }]
        );
        assert_eq!(s.change_token().unwrap(), None);
    }

    #[test]
    fn media_out_of_the_albums_leave_the_queue_with_their_video() {
        let s = store();
        for id in ["kept", "out", "out#video"] {
            s.record_media(id.into(), 1, 1).unwrap();
        }
        s.keep_only(vec!["kept".into()]).unwrap();
        assert_eq!(ids(&s.next_batch(NOW, 10, 60).unwrap()), ["kept"]);
        assert_eq!(s.counts().unwrap().pending, 1);
    }

    #[test]
    fn a_saved_media_out_of_the_albums_stays_saved() {
        let s = store();
        s.record_media("saved".into(), 1, 1).unwrap();
        s.set_md5("saved".into(), 1, MD5.into()).unwrap();
        s.record_outcome("saved".into(), MD5.into(), uploaded("f1"), NOW)
            .unwrap();
        s.keep_only(vec![]).unwrap();
        // Picked again, it is not sent again.
        s.record_media("saved".into(), 1, 1).unwrap();
        assert!(s.next_batch(NOW, 10, 60).unwrap().is_empty());
        assert_eq!(s.counts().unwrap().done, 1);
    }

    #[test]
    fn a_media_held_back_for_wifi_is_due_again_at_once() {
        let s = store();
        s.record_media("video".into(), 1, 1).unwrap();
        assert_eq!(s.next_batch(NOW, 10, 600).unwrap().len(), 1);
        assert!(s.next_batch(NOW + 1, 10, 600).unwrap().is_empty());
        s.release_media(vec!["video".into()]).unwrap();
        s.wait_for("WaitingForWifi".into()).unwrap();
        assert_eq!(ids(&s.next_batch(NOW + 1, 10, 600).unwrap()), ["video"]);
        assert_eq!(
            s.status().unwrap().stopped_by.as_deref(),
            Some("WaitingForWifi")
        );
    }

    #[test]
    fn the_backup_waits_for_wifi_until_the_user_allows_mobile_data() {
        let s = store();
        assert_eq!(s.conditions().unwrap(), BackupConditions::default());
        let chosen = BackupConditions {
            cellular_photos: true,
            cellular_videos: false,
            only_charging: true,
        };
        s.set_conditions(chosen.clone()).unwrap();
        assert_eq!(s.conditions().unwrap(), chosen);
        s.set_conditions(BackupConditions::default()).unwrap();
        assert_eq!(s.conditions().unwrap(), BackupConditions::default());
    }

    #[test]
    fn the_config_of_the_backup_goes_with_the_backup() {
        let s = store();
        assert_eq!(s.backup_config().unwrap(), None);
        let config = BackupConfig {
            folder_id: "dir".into(),
            device_id: "dev-1".into(),
        };
        s.set_backup_config(config.clone()).unwrap();
        assert_eq!(s.backup_config().unwrap(), Some(config));
        s.clear_backup_config().unwrap();
        assert_eq!(s.backup_config().unwrap(), None);
    }

    fn to_send(local_id: &str) -> MediaToSend {
        MediaToSend {
            local_id: local_id.into(),
            name: "IMG_0001.HEIC".into(),
            mime: "image/heic".into(),
            size: 5_000_000_000,
            md5: MD5.into(),
            created_at: 1,
            modified_at: 2,
            paired_video_id: Some("mov".into()),
        }
    }

    #[test]
    fn an_upload_in_flight_comes_back_as_it_was_prepared() {
        let s = store();
        assert_eq!(
            s.park_upload(to_send("a"), 2, "/tmp/a1".into(), NOW)
                .unwrap(),
            None
        );
        assert_eq!(
            s.parked_upload("a".into()).unwrap(),
            Some(ParkedUpload {
                media: to_send("a"),
                name_attempt: 2,
                file_path: "/tmp/a1".into()
            })
        );
        assert_eq!(s.parked_files().unwrap(), ["/tmp/a1"]);
        s.settle_upload("a".into()).unwrap();
        assert_eq!(s.parked_upload("a".into()).unwrap(), None);
        assert!(s.parked_files().unwrap().is_empty());
    }

    #[test]
    fn an_upload_whose_answer_never_came_gives_its_file_back() {
        let s = store();
        s.park_upload(to_send("a"), 0, "/tmp/a1".into(), NOW)
            .unwrap();
        // The hold ended, the media went again with a new export.
        assert_eq!(
            s.park_upload(to_send("a"), 0, "/tmp/a2".into(), NOW)
                .unwrap(),
            Some("/tmp/a1".into())
        );
        assert_eq!(s.parked_files().unwrap(), ["/tmp/a2"]);
    }

    #[test]
    fn only_the_media_handed_over_is_held_a_day() {
        let s = store();
        s.record_media("a".into(), 1, 2).unwrap();
        s.record_media("b".into(), 1, 2).unwrap();
        assert_eq!(s.next_batch(NOW, 10, 600).unwrap().len(), 2);
        s.park_upload(to_send("a"), 0, "/tmp/a".into(), NOW)
            .unwrap();
        // The pass ended before b: it comes back with the lease, a with the hold.
        assert_eq!(ids(&s.next_batch(NOW + 600, 10, 600).unwrap()), ["b"]);
        s.forget_media("b".into()).unwrap();
        assert!(
            s.next_batch(NOW + UPLOAD_HOLD_SECS - 1, 10, 600)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            ids(&s.next_batch(NOW + UPLOAD_HOLD_SECS, 10, 600).unwrap()),
            ["a"]
        );
    }

    #[test]
    fn an_upload_lost_for_a_day_gives_its_file_back() {
        let s = store();
        s.park_upload(to_send("a"), 0, "/tmp/a".into(), NOW)
            .unwrap();
        s.park_upload(to_send("b"), 0, "/tmp/b".into(), NOW + 10)
            .unwrap();
        assert!(
            s.drop_lost_uploads(NOW + UPLOAD_HOLD_SECS - 1)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            s.drop_lost_uploads(NOW + UPLOAD_HOLD_SECS).unwrap(),
            ["/tmp/a"]
        );
        assert_eq!(s.parked_files().unwrap(), ["/tmp/b"]);
    }
}
