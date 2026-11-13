use rusqlite::{OptionalExtension, params};

use super::store::{BackupStore, storage};
use crate::CoreError;

/// Which Drive album stands for each album of the phone.
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
}
