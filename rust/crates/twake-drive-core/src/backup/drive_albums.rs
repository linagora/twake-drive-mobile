use rusqlite::{OptionalExtension, params};

use super::store::{BackupStore, storage};
use crate::CoreError;

/// Which Drive album stands for each album of the phone, and which files it
/// already references.
impl BackupStore {
    pub(crate) fn remote_album(&self, album_id: &str) -> Result<Option<String>, CoreError> {
        self.db()
            .query_row(
                "SELECT remote_id FROM album_remote WHERE album_id = ?1",
                params![album_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage)
    }

    pub(crate) fn set_remote_album(
        &self,
        album_id: &str,
        remote_id: &str,
    ) -> Result<(), CoreError> {
        self.db()
            .execute(
                "INSERT INTO album_remote (album_id, remote_id) VALUES (?1, ?2)
                 ON CONFLICT (album_id) DO UPDATE SET remote_id = excluded.remote_id",
                params![album_id, remote_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    /// The Drive files of the saved media among `local_ids` the album does not reference yet.
    pub(crate) fn files_to_reference(
        &self,
        album_id: &str,
        local_ids: &[String],
    ) -> Result<Vec<String>, CoreError> {
        let db = self.db();
        let mut query = db
            .prepare(
                "SELECT drive_file_id FROM media
                 WHERE local_id = ?1 AND state = 'done' AND drive_file_id IS NOT NULL
                   AND drive_file_id NOT IN (SELECT file_id FROM album_file WHERE album_id = ?2)",
            )
            .map_err(storage)?;
        let mut files = Vec::new();
        for local_id in local_ids {
            let file: Option<String> = query
                .query_row(params![local_id, album_id], |row| row.get(0))
                .optional()
                .map_err(storage)?;
            files.extend(file);
        }
        files.sort();
        files.dedup();
        Ok(files)
    }

    pub(crate) fn forget_remote_album(&self, album_id: &str) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction().map_err(storage)?;
        tx.execute(
            "DELETE FROM album_remote WHERE album_id = ?1",
            params![album_id],
        )
        .map_err(storage)?;
        tx.execute(
            "DELETE FROM album_file WHERE album_id = ?1",
            params![album_id],
        )
        .map_err(storage)?;
        tx.commit().map_err(storage)
    }

    pub(crate) fn mark_referenced(
        &self,
        album_id: &str,
        file_ids: &[String],
    ) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction().map_err(storage)?;
        for file_id in file_ids {
            tx.execute(
                "INSERT OR IGNORE INTO album_file (album_id, file_id) VALUES (?1, ?2)",
                params![album_id, file_id],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)
    }
}
