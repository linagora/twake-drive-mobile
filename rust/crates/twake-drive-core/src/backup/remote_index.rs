use rusqlite::{OptionalExtension, params};

use super::store::{BackupStore, storage};
use crate::CoreError;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RemoteFile {
    pub file_id: String,
    pub md5: String,
    pub id_from_library: Option<String>,
    pub name: String,
}

/// What the folder of the device already holds, so a media is only sent when
/// its content is not there yet.
impl BackupStore {
    pub(crate) fn replace_remote_index(&self, files: &[RemoteFile]) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction().map_err(storage)?;
        tx.execute("DELETE FROM remote_file", []).map_err(storage)?;
        for file in files {
            insert(&tx, file)?;
        }
        tx.commit().map_err(storage)
    }

    pub(crate) fn add_remote_file(&self, file: &RemoteFile) -> Result<(), CoreError> {
        insert(&self.db(), file)
    }

    /// The Drive file of this media was deleted: the next upload creates one.
    pub(crate) fn forget_drive_file(&self, local_id: &str) -> Result<(), CoreError> {
        let mut db = self.db();
        let tx = db.transaction().map_err(storage)?;
        tx.execute(
            "UPDATE media SET drive_file_id = NULL WHERE local_id = ?1",
            params![local_id],
        )
        .map_err(storage)?;
        tx.execute(
            "DELETE FROM remote_file WHERE id_from_library = ?1",
            params![local_id],
        )
        .map_err(storage)?;
        tx.commit().map_err(storage)
    }

    pub(crate) fn drive_file_of(&self, local_id: &str) -> Result<Option<String>, CoreError> {
        self.db()
            .query_row(
                "SELECT drive_file_id FROM media WHERE local_id = ?1",
                params![local_id],
                |row| row.get(0),
            )
            .optional()
            .map(Option::flatten)
            .map_err(storage)
    }

    pub(crate) fn set_drive_file(
        &self,
        local_id: &str,
        file_id: Option<&str>,
    ) -> Result<(), CoreError> {
        self.db()
            .execute(
                "UPDATE media SET drive_file_id = ?2 WHERE local_id = ?1",
                params![local_id, file_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    pub(crate) fn remote_file_with_md5(&self, md5: &str) -> Result<Option<RemoteFile>, CoreError> {
        self.db()
            .query_row(
                "SELECT file_id, md5, id_from_library, name FROM remote_file WHERE md5 = ?1 LIMIT 1",
                params![md5],
                |row| {
                    Ok(RemoteFile {
                        file_id: row.get(0)?,
                        md5: row.get(1)?,
                        id_from_library: row.get(2)?,
                        name: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(storage)
    }

    /// The Drive file of an older version of this media. The flagship app gives
    /// the photo and the video of a Live Photo the same idFromLibrary: only a
    /// file of the same kind (photo or video) counts, and an ambiguous match
    /// gives none, so the media goes as a new file rather than over another.
    pub(crate) fn remote_file_of_media(
        &self,
        local_id: &str,
        name: &str,
    ) -> Result<Option<String>, CoreError> {
        let db = self.db();
        let mut query = db
            .prepare("SELECT file_id, name FROM remote_file WHERE id_from_library = ?1")
            .map_err(storage)?;
        let files = query
            .query_map(params![local_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)?;
        let kind = kind_of(name);
        let same_kind: Vec<_> = files
            .into_iter()
            .filter(|(_, other)| kind.is_some() && kind_of(other) == kind)
            .collect();
        Ok(match same_kind.as_slice() {
            [(file_id, _)] => Some(file_id.clone()),
            _ => None,
        })
    }
}

#[derive(PartialEq)]
enum Kind {
    Photo,
    Video,
}

fn kind_of(name: &str) -> Option<Kind> {
    let (_, ext) = name.rsplit_once('.')?;
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "heic" | "heif" | "png" | "gif" | "webp" | "avif" | "dng" | "tif"
        | "tiff" | "bmp" => Some(Kind::Photo),
        "mov" | "mp4" | "m4v" | "3gp" | "avi" | "mkv" | "webm" => Some(Kind::Video),
        _ => None,
    }
}

fn insert(db: &rusqlite::Connection, file: &RemoteFile) -> Result<(), CoreError> {
    db.execute(
        "INSERT OR REPLACE INTO remote_file (file_id, md5, id_from_library, name)
         VALUES (?1, ?2, ?3, ?4)",
        params![file.file_id, file.md5, file.id_from_library, file.name],
    )
    .map_err(storage)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(id: &str, md5: &str, library: Option<&str>, name: &str) -> RemoteFile {
        RemoteFile {
            file_id: id.into(),
            md5: md5.into(),
            id_from_library: library.map(Into::into),
            name: name.into(),
        }
    }

    fn store() -> std::sync::Arc<BackupStore> {
        BackupStore::open(":memory:".into()).unwrap()
    }

    #[test]
    fn a_listing_replaces_the_index() {
        let s = store();
        s.replace_remote_index(&[file("f1", "a", Some("p1"), "a.jpg")])
            .unwrap();
        s.replace_remote_index(&[file("f2", "b", None, "b.jpg")])
            .unwrap();
        assert_eq!(s.remote_file_with_md5("a").unwrap(), None);
        assert_eq!(
            s.remote_file_with_md5("b").unwrap().map(|f| f.file_id),
            Some("f2".into())
        );
    }

    #[test]
    fn a_media_finds_its_file_by_its_library_id() {
        let s = store();
        s.add_remote_file(&file("f1", "a", Some("p1"), "a.jpg"))
            .unwrap();
        s.add_remote_file(&file("f1", "b", Some("p1"), "a.jpg"))
            .unwrap();
        assert_eq!(
            s.remote_file_of_media("p1", "IMG.JPG").unwrap(),
            Some("f1".into())
        );
        assert_eq!(s.remote_file_with_md5("a").unwrap(), None);
    }

    #[test]
    fn the_photo_of_a_live_photo_is_told_from_its_video() {
        let s = store();
        s.add_remote_file(&file("mov", "v", Some("p1"), "IMG_1.MOV"))
            .unwrap();
        s.add_remote_file(&file("heic", "h", Some("p1"), "IMG_1.HEIC"))
            .unwrap();
        assert_eq!(
            s.remote_file_of_media("p1", "IMG_1.heic").unwrap(),
            Some("heic".into())
        );
        assert_eq!(
            s.remote_file_of_media("p1", "IMG_1.mov").unwrap(),
            Some("mov".into())
        );
        s.add_remote_file(&file("heic2", "h2", Some("p1"), "IMG_1 (1).HEIC"))
            .unwrap();
        assert_eq!(s.remote_file_of_media("p1", "IMG_1.HEIC").unwrap(), None);
    }

    #[test]
    fn half_a_live_photo_is_never_versioned_by_the_other_half() {
        let s = store();
        s.add_remote_file(&file("mov", "v", Some("p1"), "IMG_1.MOV"))
            .unwrap();
        assert_eq!(s.remote_file_of_media("p1", "IMG_1.HEIC").unwrap(), None);
        s.replace_remote_index(&[file("heic", "h", Some("p2"), "IMG_2.HEIC")])
            .unwrap();
        assert_eq!(s.remote_file_of_media("p2", "IMG_2.MOV").unwrap(), None);
    }

    #[test]
    fn a_photo_finds_its_file_whatever_its_photo_format() {
        let s = store();
        s.add_remote_file(&file("f1", "a", Some("p1"), "IMG_1.JPG"))
            .unwrap();
        assert_eq!(
            s.remote_file_of_media("p1", "IMG_1.jpeg").unwrap(),
            Some("f1".into())
        );
        assert_eq!(s.remote_file_of_media("p1", "IMG_1").unwrap(), None);
    }
}
