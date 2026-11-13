use std::sync::Arc;

use super::albums::{self, AlbumMedia};
use super::folders::{self, DeviceFolder, MAX_NAME_ATTEMPTS};
use super::http::{HttpRequest, Stack, StackTransport, TokenSource};
use super::index;
use super::upload::{self, MediaToSend};
use crate::CoreError;
use crate::backup::{BackupConfig, BackupStore, PassAction, RemoteFile, UploadOutcome};
use crate::library::library_id_of;

const FOLDER_GONE: &str = "FolderGone";

#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
pub enum UploadPlan {
    /// The folder of the device already holds this content: recorded as saved.
    AlreadyThere { file_id: String },
    /// Send this request with the file as its body.
    Send { request: HttpRequest },
}

#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
pub enum UploadReply {
    /// 409: prepare the upload again with the next `name_attempt`.
    NameTaken,
    /// 404 on a new version: the Drive file is gone. Prepare the upload again,
    /// it creates a new file.
    FileGone,
    /// The outcome went to the backup state.
    Recorded { action: PassAction },
}

/// The short calls of the backup to cozy-stack. The platform sends the
/// requests and owns the token; the core builds them and reads the answers.
#[derive(uniffi::Object)]
pub struct StackClient {
    stack: Stack,
    store: Arc<BackupStore>,
}

#[uniffi::export]
impl StackClient {
    #[uniffi::constructor]
    pub fn new(
        instance_url: String,
        transport: Arc<dyn StackTransport>,
        tokens: Arc<dyn TokenSource>,
        store: Arc<BackupStore>,
    ) -> Arc<Self> {
        Arc::new(Self {
            stack: Stack {
                base_url: instance_url.trim_end_matches('/').to_string(),
                transport,
                tokens,
            },
            store,
        })
    }

    /// The backup folders of every device of the account, newest first: the
    /// user may pick one up again after a reinstall.
    pub fn list_device_folders(&self) -> Result<Vec<DeviceFolder>, CoreError> {
        folders::list(&self.stack)
    }

    pub fn find_device_folder(&self, device_id: String) -> Result<Option<DeviceFolder>, CoreError> {
        Ok(folders::list(&self.stack)?
            .into_iter()
            .find(|folder| folder.device_ids.contains(&device_id)))
    }

    /// `root_name` is the translated « Sauvegardé depuis mon mobile ».
    pub fn create_device_folder(
        &self,
        device_id: String,
        device_name: String,
        root_name: String,
    ) -> Result<DeviceFolder, CoreError> {
        let folder = folders::create(&self.stack, &device_id, &device_name, &root_name)?;
        // Known before the first pass: the folder may go before it.
        self.store.set_folder_path(&folder.path)?;
        Ok(folder)
    }

    /// Picks up the folder of another install or of the flagship app: the
    /// device is added to its devices, so `find_device_folder` finds it next
    /// time, and its files count for the dedup.
    pub fn adopt_device_folder(
        &self,
        folder_id: String,
        device_id: String,
    ) -> Result<DeviceFolder, CoreError> {
        let folder = folders::adopt(&self.stack, &folder_id, &device_id)?;
        self.store.set_folder_path(&folder.path)?;
        Ok(folder)
    }

    /// Where the pass goes, called first. Found by its id, which a move or a
    /// rename keeps; the stored folder wins over `requested`, as a system pass
    /// may have moved to another folder of the device. A folder deleted or in
    /// the trash gives way to another folder of the device, every media going
    /// again; without one, None: the backup stops with "FolderGone" until the
    /// user answers (`recreate_device_folder`).
    pub fn ensure_device_folder(
        &self,
        requested: BackupConfig,
    ) -> Result<Option<BackupConfig>, CoreError> {
        let config = self
            .store
            .backup_config()?
            .filter(|stored| stored.device_id == requested.device_id)
            .unwrap_or(requested);
        if let Some(folder) = folders::current(&self.stack, &config.folder_id)? {
            self.store.keep_folder(&config, &folder.path)?;
            return Ok(Some(config));
        }
        let Some(folder) = self.find_device_folder(config.device_id.clone())? else {
            self.store.wait_for(FOLDER_GONE.into())?;
            return Ok(None);
        };
        let moved = BackupConfig {
            folder_id: folder.id,
            device_id: config.device_id,
        };
        self.store.move_to_folder(&moved, &folder.path)?;
        Ok(Some(moved))
    }

    /// The user's answer to "FolderGone": the folder made again where it last
    /// was, or at `requested_path`, the app's, for a store that never read it,
    /// and every media goes again. A folder found again meanwhile, restored
    /// from the trash, is kept as it is.
    pub fn recreate_device_folder(
        &self,
        requested_path: Option<String>,
    ) -> Result<BackupConfig, CoreError> {
        let config = self
            .store
            .backup_config()?
            .ok_or_else(|| CoreError::Stack {
                reason: "no backup to make the folder of".into(),
            })?;
        // `begin_pass` below clears "FolderGone"; a failure before it leaves the question up.
        if let Some(folder) = folders::current(&self.stack, &config.folder_id)? {
            self.store.keep_folder(&config, &folder.path)?;
            self.store.begin_pass()?;
            return Ok(config);
        }
        let path = self
            .store
            .folder_path()?
            .or(requested_path)
            .ok_or_else(|| CoreError::Stack {
                reason: "the device folder is gone and its path unknown".into(),
            })?;
        let folder = folders::create_at(&self.stack, &config.device_id, &path)?;
        let moved = BackupConfig {
            folder_id: folder.id,
            device_id: config.device_id,
        };
        self.store.move_to_folder(&moved, &folder.path)?;
        self.store.begin_pass()?;
        Ok(moved)
    }

    /// Puts the saved media of the albums the user picked in Drive albums of
    /// the same names, as the flagship app does for Drive Photos. Called at
    /// the end of a pass: the media saved by the system or found in Drive
    /// count too.
    pub fn sync_albums(
        &self,
        device_id: String,
        picked: Vec<AlbumMedia>,
        now: i64,
    ) -> Result<(), CoreError> {
        let mut known = None;
        let mut first_error = None;
        // One album failing leaves the others to go; an album without a name
        // would merge with every other one.
        for album in picked.iter().filter(|album| !album.name.is_empty()) {
            if let Err(e) = self.sync_album(&device_id, album, now, &mut known) {
                first_error.get_or_insert(e);
            }
        }
        first_error.map_or(Ok(()), Err)
    }

    /// Reads what the folder holds, for the dedup of the next uploads.
    pub fn sync_folder_index(&self, folder_id: String) -> Result<(), CoreError> {
        self.store
            .replace_remote_index(&index::list_files(&self.stack, &folder_id)?)
    }

    /// The Drive file already holding `md5`, recorded as the media's upload.
    /// With an md5 from an earlier pass, it spares the export of a media
    /// whose content is in Drive.
    pub fn already_there(
        &self,
        local_id: String,
        md5: String,
        now: i64,
    ) -> Result<Option<String>, CoreError> {
        let Some(file) = self.store.remote_file_with_md5(&md5)? else {
            return Ok(None);
        };
        let own_file = self.store.drive_file_of(&local_id)?;
        let outcome = UploadOutcome::AlreadyThere {
            file_id: file.file_id.clone(),
        };
        self.store
            .record_outcome(local_id.clone(), md5, outcome, now)?;
        if file.id_from_library.as_deref() != Some(library_id_of(&local_id)) {
            self.store.set_drive_file(&local_id, own_file.as_deref())?;
        }
        Ok(Some(file.file_id))
    }

    /// Two equal photos of the library share one Drive file: the second is
    /// recorded as saved, and an edit of the second creates its own file
    /// instead of a new version of the first's.
    pub fn prepare_upload(
        &self,
        folder_id: String,
        device_id: String,
        media: MediaToSend,
        name_attempt: u32,
        now: i64,
    ) -> Result<UploadPlan, CoreError> {
        if let Some(file_id) = self.already_there(media.local_id.clone(), media.md5.clone(), now)? {
            return Ok(UploadPlan::AlreadyThere { file_id });
        }
        let existing = self.existing_file(&media)?;
        let request = upload::request(
            &self.stack,
            &folder_id,
            &device_id,
            &media,
            existing.as_deref(),
            name_attempt,
        )?;
        Ok(UploadPlan::Send { request })
    }

    pub fn read_upload_response(
        &self,
        media: MediaToSend,
        name_attempt: u32,
        status: u16,
        body: Vec<u8>,
        now: i64,
    ) -> Result<UploadReply, CoreError> {
        let existing = self.existing_file(&media)?;
        let outcome = match upload::outcome(status, &body)? {
            None if existing.is_none() && name_attempt + 1 < MAX_NAME_ATTEMPTS => {
                return Ok(UploadReply::NameTaken);
            }
            // A new version keeps its name, and a name may be taken only so often.
            None => UploadOutcome::Refused { status },
            Some(UploadOutcome::Refused { status: 404 }) if existing.is_some() => {
                self.store.forget_drive_file(&media.local_id)?;
                return Ok(UploadReply::FileGone);
            }
            Some(outcome) => outcome,
        };
        if let UploadOutcome::Uploaded { file_id } = &outcome {
            self.store.add_remote_file(&RemoteFile {
                file_id: file_id.clone(),
                md5: media.md5.clone(),
                id_from_library: Some(library_id_of(&media.local_id).into()),
                name: media.name.clone(),
            })?;
        }
        let action = self
            .store
            .record_outcome(media.local_id, media.md5, outcome, now)?;
        Ok(UploadReply::Recorded { action })
    }
}

impl StackClient {
    /// The Drive file of an older version, known after a reinstall too
    /// through the idFromLibrary of the file.
    fn existing_file(&self, media: &MediaToSend) -> Result<Option<String>, CoreError> {
        match self.store.drive_file_of(&media.local_id)? {
            Some(id) => Ok(Some(id)),
            None => self
                .store
                .remote_file_of_media(library_id_of(&media.local_id), &media.name),
        }
    }

    /// `known` holds the backup albums of Drive once read, for the next albums.
    fn sync_album(
        &self,
        device_id: &str,
        album: &AlbumMedia,
        now: i64,
        known: &mut Option<Vec<(String, String)>>,
    ) -> Result<(), CoreError> {
        let mut files = self
            .store
            .files_to_reference(&album.album_id, &album.local_ids)?;
        if files.is_empty() {
            return Ok(());
        }
        let remote_id = match self.store.remote_album(&album.album_id)? {
            Some(id) if albums::exists(&self.stack, &id)? => id,
            stale => {
                if stale.is_some() {
                    // Deleted in Drive: made again, or taken up by its name,
                    // with every file of the album again.
                    self.store.forget_remote_album(&album.album_id)?;
                    files = self
                        .store
                        .files_to_reference(&album.album_id, &album.local_ids)?;
                }
                let known = match known {
                    Some(known) => known,
                    None => known.insert(albums::list(&self.stack)?),
                };
                let found = known
                    .iter()
                    .find(|(id, name)| *name == album.name && Some(id) != stale.as_ref());
                let id = match found {
                    Some((id, _)) => {
                        let id = id.clone();
                        let referenced = albums::referenced_files(&self.stack, &id)?;
                        self.store.mark_referenced(&album.album_id, &referenced)?;
                        files = self
                            .store
                            .files_to_reference(&album.album_id, &album.local_ids)?;
                        id
                    }
                    None => {
                        let id = albums::create(&self.stack, &album.name, device_id, now)?;
                        known.push((id.clone(), album.name.clone()));
                        id
                    }
                };
                self.store.set_remote_album(&album.album_id, &id)?;
                id
            }
        };
        for chunk in files.chunks(albums::REFERENCES_PER_CALL) {
            let done = albums::add_files(&self.stack, &remote_id, chunk)?;
            self.store.mark_referenced(&album.album_id, &done)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stack::fake_stack::{BASE, FakeStack, FakeTokens};

    const NOW: i64 = 1_000_000;

    fn client(
        fake: &Arc<FakeStack>,
        tokens: &Arc<FakeTokens>,
    ) -> (Arc<StackClient>, Arc<BackupStore>) {
        let store = BackupStore::open(":memory:".into()).unwrap();
        let client = StackClient::new(
            format!("{BASE}/"),
            fake.clone(),
            tokens.clone(),
            store.clone(),
        );
        (client, store)
    }

    fn media(local_id: &str, md5: &str) -> MediaToSend {
        MediaToSend {
            local_id: local_id.into(),
            name: "IMG_0001.HEIC".into(),
            mime: "image/heic".into(),
            size: 1234,
            md5: md5.into(),
            created_at: 1_794_355_200,
            modified_at: 1_794_355_201,
            paired_video_id: None,
        }
    }

    #[test]
    fn the_video_of_a_live_photo_goes_under_the_id_of_its_media() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let folder = fake.add_dir("/Photos/B/iPhone");
        let key = crate::paired_video_key("p1".into());
        let video = MediaToSend {
            name: "IMG_0001.MOV".into(),
            mime: "video/quicktime".into(),
            ..media(&key, "video")
        };
        store.record_media(key.clone(), 1, 1).unwrap();
        store.set_md5(key.clone(), 1, "video".into()).unwrap();
        let UploadPlan::Send { request } = client
            .prepare_upload(folder.clone(), "dev-1".into(), video.clone(), 0, NOW)
            .unwrap()
        else {
            panic!("a new video is sent")
        };
        assert!(
            request.url.contains("%22idFromLibrary%22%3A%22p1%22"),
            "{}",
            request.url
        );
        let reply = client
            .read_upload_response(video, 0, 201, br#"{"data":{"id":"mov"}}"#.to_vec(), NOW)
            .unwrap();
        assert!(matches!(reply, UploadReply::Recorded { .. }));
        assert_eq!(store.drive_file_of(&key).unwrap().as_deref(), Some("mov"));
    }

    #[test]
    fn a_first_backup_builds_the_flagship_folders() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, _) = client(&fake, &tokens);
        let folder = client
            .create_device_folder(
                "dev-1".into(),
                "iPhone".into(),
                "Sauvegardé depuis mon mobile".into(),
            )
            .unwrap();
        assert_eq!(folder.path, "/Photos/Sauvegardé depuis mon mobile/iPhone");
        assert_eq!(folder.device_ids, ["dev-1"]);
        assert_eq!(
            fake.referenced("io.cozy.apps/photos"),
            [fake.id_at("/Photos")]
        );
        assert_eq!(
            fake.referenced("io.cozy.apps/photos/mobile"),
            std::slice::from_ref(&folder.id)
        );
        assert_eq!(
            client.find_device_folder("dev-1".into()).unwrap(),
            Some(folder)
        );
        assert_eq!(client.find_device_folder("dev-2".into()).unwrap(), None);
    }

    fn config(folder_id: &str) -> BackupConfig {
        BackupConfig {
            folder_id: folder_id.into(),
            device_id: "dev-1".into(),
        }
    }

    /// A folder made the way the app does, with one media saved in it.
    fn saved_backup(
        fake: &Arc<FakeStack>,
        client: &StackClient,
        store: &BackupStore,
    ) -> DeviceFolder {
        let folder = client
            .create_device_folder("dev-1".into(), "iPhone".into(), "B".into())
            .unwrap();
        client.ensure_device_folder(config(&folder.id)).unwrap();
        store.record_media("p1".into(), 1, 1).unwrap();
        store.set_md5("p1".into(), 1, "m1".into()).unwrap();
        store
            .record_outcome(
                "p1".into(),
                "m1".into(),
                UploadOutcome::Uploaded {
                    file_id: "f1".into(),
                },
                NOW,
            )
            .unwrap();
        fake.add_file(&format!("{}/IMG.HEIC", folder.path), "m1", Some("p1"));
        folder
    }

    fn picked(local_ids: &[&str]) -> Vec<AlbumMedia> {
        vec![AlbumMedia {
            album_id: "local-vacances".into(),
            name: "Vacances".into(),
            local_ids: local_ids.iter().map(|id| id.to_string()).collect(),
        }]
    }

    #[test]
    fn a_picked_album_becomes_a_drive_album_of_its_saved_media() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        saved_backup(&fake, &client, &store);
        // p2 is not saved yet: it joins the album at a later pass.
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        let albums = fake.albums();
        let (id, album) = albums.iter().next().unwrap();
        assert_eq!(album["name"], "Vacances");
        assert_eq!(album["backupDeviceIds"], serde_json::json!(["dev-1"]));
        assert_eq!(fake.referenced(id), ["f1"]);
        let before = fake.requests();
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        assert_eq!(fake.requests(), before, "nothing new, no call");
    }

    #[test]
    fn an_album_of_the_same_name_from_another_backup_is_taken_up() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        saved_backup(&fake, &client, &store);
        save(&store, "p2", "f2");
        let flagship = fake.add_album("Vacances", "flagship-device");
        // The flagship app put the first photo in its album already.
        fake.reference(&flagship, "f1");
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        assert_eq!(fake.albums().len(), 1);
        assert_eq!(fake.referenced(&flagship), ["f1", "f2"]);
    }

    #[test]
    fn a_file_deleted_from_drive_leaves_the_rest_of_the_album_going() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        saved_backup(&fake, &client, &store);
        save(&store, "p2", "f2");
        fake.delete_file("f2");
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        let albums = fake.albums();
        let album = albums.keys().next().unwrap();
        assert_eq!(fake.referenced(album), ["f1"]);
        let before = fake.requests();
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        assert_eq!(
            fake.requests(),
            before,
            "the deleted file is not tried again"
        );
    }

    fn save(store: &BackupStore, local_id: &str, file_id: &str) {
        store.record_media(local_id.into(), 1, 1).unwrap();
        store
            .set_md5(local_id.into(), 1, format!("md5-{local_id}"))
            .unwrap();
        store
            .record_outcome(
                local_id.into(),
                format!("md5-{local_id}"),
                UploadOutcome::Uploaded {
                    file_id: file_id.into(),
                },
                NOW,
            )
            .unwrap();
    }

    #[test]
    fn an_album_deleted_in_drive_is_made_again() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        saved_backup(&fake, &client, &store);
        client
            .sync_albums("dev-1".into(), picked(&["p1"]), NOW)
            .unwrap();
        let first = fake.albums().keys().next().unwrap().clone();
        fake.delete_album(&first);
        store.record_media("p2".into(), 1, 1).unwrap();
        store.set_md5("p2".into(), 1, "m2".into()).unwrap();
        store
            .record_outcome(
                "p2".into(),
                "m2".into(),
                UploadOutcome::Uploaded {
                    file_id: "f2".into(),
                },
                NOW,
            )
            .unwrap();
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        client
            .sync_albums("dev-1".into(), picked(&["p1", "p2"]), NOW)
            .unwrap();
        let albums = fake.albums();
        let (again, _) = albums.iter().next().unwrap();
        assert_ne!(*again, first);
        assert_eq!(fake.referenced(again), ["f1", "f2"]);
    }

    #[test]
    fn a_folder_moved_and_renamed_stays_the_backup_folder() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let folder = saved_backup(&fake, &client, &store);
        fake.move_dir(&folder.id, "/Archives/Mon iPhone");
        let before = fake.requests();
        let kept = client.ensure_device_folder(config(&folder.id)).unwrap();
        assert_eq!(kept, Some(config(&folder.id)));
        assert_eq!(
            fake.requests(),
            before + 1,
            "the folder read by its id, nothing else"
        );
        let status = store.status().unwrap();
        assert_eq!(status.folder_path.as_deref(), Some("/Archives/Mon iPhone"));
        assert_eq!((status.counts.done, status.counts.pending), (1, 0));
    }

    #[test]
    fn a_folder_in_the_trash_stops_the_backup_until_the_user_answers() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let folder = saved_backup(&fake, &client, &store);
        fake.trash(&folder.id);
        assert_eq!(
            client.ensure_device_folder(config(&folder.id)).unwrap(),
            None
        );
        let status = store.status().unwrap();
        assert_eq!(status.stopped_by.as_deref(), Some("FolderGone"));
        assert_eq!(status.counts.done, 1, "nothing goes again without the user");
        assert!(
            client.list_device_folders().unwrap().is_empty(),
            "no folder made"
        );
        // Restored from the trash: the backup goes on in it, nothing reset.
        fake.move_dir(&folder.id, &folder.path);
        assert_eq!(
            client.ensure_device_folder(config(&folder.id)).unwrap(),
            Some(config(&folder.id))
        );
        assert_eq!(store.status().unwrap().counts.done, 1);
    }

    #[test]
    fn turned_off_from_the_question_nothing_of_it_is_left() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let folder = saved_backup(&fake, &client, &store);
        fake.trash(&folder.id);
        client.ensure_device_folder(config(&folder.id)).unwrap();
        store.clear_backup_config().unwrap();
        assert_eq!(store.status().unwrap().stopped_by, None);
    }

    #[test]
    fn the_user_makes_the_folder_again_and_its_media_go_again() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let old = saved_backup(&fake, &client, &store);
        fake.trash(&old.id);
        assert_eq!(client.ensure_device_folder(config(&old.id)).unwrap(), None);
        let moved = client.recreate_device_folder(None).unwrap();
        assert_ne!(moved.folder_id, old.id);
        let status = store.status().unwrap();
        assert_eq!(status.folder_id.as_deref(), Some(moved.folder_id.as_str()));
        assert_eq!(status.folder_path.as_deref(), Some("/Photos/B/iPhone"));
        assert_eq!((status.counts.done, status.counts.pending), (0, 1));
        assert_eq!(status.stopped_by, None, "answered: the banner goes");
        assert_eq!(store.drive_file_of("p1").unwrap(), None);
        // The md5 stays: no export to find a copy the new folder holds.
        let batch = store.next_batch(NOW, 16, 600).unwrap();
        assert_eq!(batch[0].md5.as_deref(), Some("m1"));
        assert_eq!(
            client
                .find_device_folder("dev-1".into())
                .unwrap()
                .unwrap()
                .id,
            moved.folder_id
        );
    }

    #[test]
    fn the_app_asking_for_the_deleted_folder_keeps_the_one_made_again() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let old = saved_backup(&fake, &client, &store);
        fake.destroy(&old.id);
        assert_eq!(client.ensure_device_folder(config(&old.id)).unwrap(), None);
        let moved = client.recreate_device_folder(None).unwrap();
        store
            .record_outcome(
                "p1".into(),
                "m1".into(),
                UploadOutcome::Uploaded {
                    file_id: "f2".into(),
                },
                NOW,
            )
            .unwrap();
        // The app's setting still names the old folder.
        assert_eq!(
            client.ensure_device_folder(config(&old.id)).unwrap(),
            Some(moved)
        );
        assert_eq!(store.status().unwrap().counts.done, 1);
        assert_eq!(client.list_device_folders().unwrap().len(), 1);
    }

    #[test]
    fn a_store_older_than_the_path_makes_the_folder_again_where_the_app_saw_it() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        // Set by an app that did not keep the path yet, the folder gone since.
        store.set_backup_config(config("gone")).unwrap();
        let path = "/Photos/B/iPhone".to_string();
        assert_eq!(client.ensure_device_folder(config("gone")).unwrap(), None);
        assert!(
            client.recreate_device_folder(None).is_err(),
            "no path, nowhere to go"
        );
        let moved = client.recreate_device_folder(Some(path.clone())).unwrap();
        assert_eq!(moved.folder_id, fake.id_at(&path));
        assert_eq!(store.status().unwrap().folder_path, Some(path));
    }

    #[test]
    fn a_folder_moved_out_of_photos_is_made_again_where_it_was() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let old = fake.add_device_dir("/Archives/iPhone", "dev-1", "2026-01-01T00:00:00Z");
        fake.reference("io.cozy.apps/photos/mobile", &old);
        client
            .adopt_device_folder(old.clone(), "dev-1".into())
            .unwrap();
        // The pass stores the app's choice before it asks for the folder.
        store.set_backup_config(config(&old)).unwrap();
        fake.destroy(&old);
        client.ensure_device_folder(config(&old)).unwrap();
        let moved = client.recreate_device_folder(None).unwrap();
        assert_eq!(moved.folder_id, fake.id_at("/Archives/iPhone"));
        assert_eq!(
            store.status().unwrap().folder_path.as_deref(),
            Some("/Archives/iPhone")
        );
    }

    #[test]
    fn the_uploads_handed_to_the_system_for_the_old_folder_are_dropped() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let old = saved_backup(&fake, &client, &store);
        store.record_media("p2".into(), 1, 1).unwrap();
        store
            .park_upload(media("p2", "m2"), 0, "/tmp/p2".into(), NOW)
            .unwrap();
        fake.trash(&old.id);
        client.ensure_device_folder(config(&old.id)).unwrap();
        client.recreate_device_folder(None).unwrap();
        assert_eq!(store.parked_upload("p2".into()).unwrap(), None);
    }

    #[test]
    fn another_folder_of_the_device_takes_over_from_a_deleted_one() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let old = saved_backup(&fake, &client, &store);
        let other = fake.add_device_dir("/Photos/B/iPhone 2", "dev-1", "2026-01-01T00:00:00Z");
        fake.reference("io.cozy.apps/photos/mobile", &other);
        fake.trash(&old.id);
        assert_eq!(
            client
                .ensure_device_folder(config(&old.id))
                .unwrap()
                .unwrap()
                .folder_id,
            other
        );
        assert_eq!(
            store.status().unwrap().folder_path.as_deref(),
            Some("/Photos/B/iPhone 2")
        );
    }

    #[test]
    fn the_photos_folder_is_found_by_its_reference_and_a_taken_name_is_numbered() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let photos = fake.add_dir("/Mes photos");
        fake.reference("io.cozy.apps/photos", &photos);
        fake.add_dir("/Mes photos/Backup");
        fake.add_dir("/Mes photos/Backup/iPhone");
        let (client, _) = client(&fake, &tokens);
        let folder = client
            .create_device_folder("dev-1".into(), "iPhone".into(), "Backup".into())
            .unwrap();
        assert_eq!(folder.path, "/Mes photos/Backup/iPhone (1)");
    }

    #[test]
    fn device_folders_leave_the_trash_out_newest_first() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let old = fake.add_device_dir("/Photos/B/old", "dev-1", "2025-01-01T00:00:00Z");
        let new = fake.add_device_dir("/Photos/B/new", "dev-1", "2026-01-01T00:00:00Z");
        let trashed = fake.add_device_dir("/.cozy_trash/gone", "dev-1", "2027-01-01T00:00:00Z");
        for id in [&trashed, &old, &new] {
            fake.reference("io.cozy.apps/photos/mobile", id);
        }
        fake.set_page_size(2);
        let (client, _) = client(&fake, &tokens);
        let ids: Vec<String> = client
            .list_device_folders()
            .unwrap()
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert_eq!(ids, [new, old]);
    }

    #[test]
    fn a_refused_token_is_refreshed_once() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::stale());
        let (client, _) = client(&fake, &tokens);
        assert!(client.list_device_folders().unwrap().is_empty());
        assert_eq!(tokens.refreshes(), 1);
    }

    #[test]
    fn the_index_keeps_the_files_of_every_page() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let folder = fake.add_dir("/Photos/B/iPhone");
        let first = fake.add_file("/Photos/B/iPhone/a.jpg", "md5-a", Some("lib-a"));
        fake.add_file("/Photos/B/iPhone/b.jpg", "md5-b", None);
        fake.add_file("/Photos/B/iPhone/c.jpg", "md5-c", None);
        fake.add_dir("/Photos/B/iPhone/sub");
        fake.set_page_size(2);
        let (client, store) = client(&fake, &tokens);
        client.sync_folder_index(folder).unwrap();
        assert!(store.remote_file_with_md5("md5-c").unwrap().is_some());
        assert_eq!(
            store.remote_file_of_media("lib-a", "a.jpg").unwrap(),
            Some(first)
        );
    }

    #[test]
    fn a_new_media_is_posted_with_the_flagship_parameters() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, _) = client(&fake, &tokens);
        let plan = client
            .prepare_upload("dir 1".into(), "dev-1".into(), media("p1", "MD5=="), 1, NOW)
            .unwrap();
        let UploadPlan::Send { request } = plan else {
            panic!("{plan:?}")
        };
        assert_eq!(request.method, "POST");
        assert_eq!(
            request.url,
            format!(
                "{BASE}/files/dir%201?Type=file&Name=IMG_0001%20(1).HEIC&Tags=library&Executable=false\
                 &CreatedAt=2026-11-11T00%3A00%3A00Z&UpdatedAt=2026-11-11T00%3A00%3A01Z\
                 &Metadata=%7B%22backupDeviceIds%22%3A%5B%22dev-1%22%5D%2C%22creationDateFromLibrary%22%3A%222026-11-11T00%3A00%3A00Z%22%2C%22idFromLibrary%22%3A%22p1%22%7D\
                 &Size=1234"
            )
        );
        assert_eq!(
            request
                .headers
                .iter()
                .map(|h| (h.name.as_str(), h.value.as_str()))
                .collect::<Vec<_>>(),
            [
                ("Authorization", "Bearer token"),
                ("Content-MD5", "MD5=="),
                ("Content-Type", "image/heic")
            ]
        );
    }

    #[test]
    fn a_content_already_in_the_folder_is_not_sent_again() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        store.record_media("p1".into(), 1, 1).unwrap();
        store.set_md5("p1".into(), 1, "same".into()).unwrap();
        store
            .replace_remote_index(&[RemoteFile {
                file_id: "f1".into(),
                md5: "same".into(),
                id_from_library: None,
                name: "IMG_0001.HEIC".into(),
            }])
            .unwrap();
        let plan = client
            .prepare_upload("dir".into(), "dev-1".into(), media("p1", "same"), 0, NOW)
            .unwrap();
        assert_eq!(
            plan,
            UploadPlan::AlreadyThere {
                file_id: "f1".into()
            }
        );
        assert_eq!(store.counts().unwrap().done, 1);
    }

    #[test]
    fn a_known_md5_already_in_the_folder_needs_no_file() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        store.record_media("p1".into(), 1, 1).unwrap();
        store.set_md5("p1".into(), 1, "same".into()).unwrap();
        assert_eq!(
            client
                .already_there("p1".into(), "same".into(), NOW)
                .unwrap(),
            None
        );
        store
            .replace_remote_index(&[RemoteFile {
                file_id: "f1".into(),
                md5: "same".into(),
                id_from_library: Some("p1".into()),
                name: "IMG_0001.HEIC".into(),
            }])
            .unwrap();
        assert_eq!(
            client
                .already_there("p1".into(), "same".into(), NOW)
                .unwrap(),
            Some("f1".into())
        );
        assert_eq!(store.counts().unwrap().done, 1);
    }

    #[test]
    fn an_edited_media_known_by_its_library_id_is_a_new_version() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        store
            .replace_remote_index(&[RemoteFile {
                file_id: "f1".into(),
                md5: "before".into(),
                id_from_library: Some("p1".into()),
                name: "IMG_0001.HEIC".into(),
            }])
            .unwrap();
        let plan = client
            .prepare_upload("dir".into(), "dev-1".into(), media("p1", "after"), 0, NOW)
            .unwrap();
        let UploadPlan::Send { request } = plan else {
            panic!("{plan:?}")
        };
        assert_eq!(request.method, "PUT");
        assert!(
            request
                .url
                .starts_with(&format!("{BASE}/files/f1?Tags=library&UpdatedAt=")),
            "{}",
            request.url
        );
    }

    fn known_version(store: &BackupStore) -> MediaToSend {
        store.record_media("p1".into(), 1, 1).unwrap();
        store.set_md5("p1".into(), 1, "after".into()).unwrap();
        store
            .replace_remote_index(&[RemoteFile {
                file_id: "f1".into(),
                md5: "before".into(),
                id_from_library: Some("p1".into()),
                name: "IMG_0001.HEIC".into(),
            }])
            .unwrap();
        media("p1", "after")
    }

    #[test]
    fn a_new_version_of_a_deleted_file_is_created_again() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let media = known_version(&store);
        let reply = client
            .read_upload_response(media.clone(), 0, 404, vec![], NOW)
            .unwrap();
        assert_eq!(reply, UploadReply::FileGone);
        let plan = client
            .prepare_upload("dir".into(), "dev-1".into(), media, 0, NOW)
            .unwrap();
        let UploadPlan::Send { request } = plan else {
            panic!("{plan:?}")
        };
        assert_eq!(request.method, "POST");
    }

    #[test]
    fn a_409_on_a_new_version_is_not_a_name_to_change() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let media = known_version(&store);
        let reply = client
            .read_upload_response(media, 0, 409, vec![], NOW)
            .unwrap();
        assert_eq!(
            reply,
            UploadReply::Recorded {
                action: PassAction::Continue
            }
        );
    }

    #[test]
    fn a_refused_token_on_an_upload_waits_for_the_next_pass() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        let media = known_version(&store);
        let reply = client
            .read_upload_response(media, 0, 401, vec![], NOW)
            .unwrap();
        assert_eq!(
            reply,
            UploadReply::Recorded {
                action: PassAction::Stop
            }
        );
        assert_eq!(tokens.refreshes(), 0);
    }

    #[test]
    fn an_uploaded_media_is_saved_and_dedups_its_twin() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        for id in ["p1", "p2"] {
            store.record_media(id.into(), 1, 1).unwrap();
            store.set_md5(id.into(), 1, "same".into()).unwrap();
        }
        let taken = client
            .read_upload_response(media("p1", "same"), 0, 409, vec![], NOW)
            .unwrap();
        assert_eq!(taken, UploadReply::NameTaken);
        let reply = client
            .read_upload_response(
                media("p1", "same"),
                0,
                201,
                br#"{"data":{"id":"f1"}}"#.to_vec(),
                NOW,
            )
            .unwrap();
        assert_eq!(
            reply,
            UploadReply::Recorded {
                action: PassAction::Continue
            }
        );
        let twin = client
            .prepare_upload("dir".into(), "dev-1".into(), media("p2", "same"), 0, NOW)
            .unwrap();
        assert_eq!(
            twin,
            UploadPlan::AlreadyThere {
                file_id: "f1".into()
            }
        );
        assert_eq!(store.counts().unwrap().done, 2);
    }

    #[test]
    fn the_edit_of_a_twin_gets_its_own_file() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        for id in ["p1", "p2"] {
            store.record_media(id.into(), 1, 1).unwrap();
            store.set_md5(id.into(), 1, "same".into()).unwrap();
        }
        client
            .read_upload_response(
                media("p1", "same"),
                0,
                201,
                br#"{"data":{"id":"f1"}}"#.to_vec(),
                NOW,
            )
            .unwrap();
        client
            .prepare_upload("dir".into(), "dev-1".into(), media("p2", "same"), 0, NOW)
            .unwrap();
        store.record_media("p2".into(), 1, 2).unwrap();
        store.set_md5("p2".into(), 2, "edited".into()).unwrap();
        let plan = client
            .prepare_upload("dir".into(), "dev-1".into(), media("p2", "edited"), 0, NOW)
            .unwrap();
        let UploadPlan::Send { request } = plan else {
            panic!("{plan:?}")
        };
        assert_eq!(request.method, "POST");
    }

    #[test]
    fn the_edited_photo_of_a_flagship_live_photo_versions_the_photo() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, _) = client(&fake, &tokens);
        let folder = fake.add_dir("/Photos/B/iPhone");
        fake.add_file("/Photos/B/iPhone/IMG_0001.MOV", "video", Some("p1"));
        let photo = fake.add_file("/Photos/B/iPhone/IMG_0001.HEIC", "photo", Some("p1"));
        client.sync_folder_index(folder).unwrap();
        let plan = client
            .prepare_upload("dir".into(), "dev-1".into(), media("p1", "edited"), 0, NOW)
            .unwrap();
        let UploadPlan::Send { request } = plan else {
            panic!("{plan:?}")
        };
        let expected = format!("{BASE}/files/{photo}?Tags=library&");
        assert!(request.url.starts_with(&expected), "{}", request.url);
    }

    #[test]
    fn a_name_taken_too_often_is_refused() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let (client, store) = client(&fake, &tokens);
        store.record_media("p1".into(), 1, 1).unwrap();
        store.set_md5("p1".into(), 1, "x".into()).unwrap();
        let last = MAX_NAME_ATTEMPTS - 1;
        let reply = client
            .read_upload_response(media("p1", "x"), last, 409, vec![], NOW)
            .unwrap();
        assert_eq!(
            reply,
            UploadReply::Recorded {
                action: PassAction::Continue
            }
        );
    }

    #[test]
    fn a_session_refused_after_a_refresh_is_tried_only_twice() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::revoked());
        let (client, _) = client(&fake, &tokens);
        assert!(client.list_device_folders().is_err());
        assert_eq!((fake.requests(), tokens.refreshes()), (2, 1));
    }

    #[test]
    fn a_failing_stack_is_not_taken_for_a_missing_folder() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let photos = fake.add_dir("/Mes photos");
        fake.reference("io.cozy.apps/photos", &photos);
        let (client, _) = client(&fake, &tokens);
        fake.fail_with(500);
        let created = client.create_device_folder("dev-1".into(), "iPhone".into(), "B".into());
        assert!(created.is_err());
        assert_eq!(fake.requests(), 1);
    }

    #[test]
    fn a_device_picks_up_the_folder_of_the_flagship_app() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let flagship =
            fake.add_device_dir("/Photos/B/iPhone", "flagship-id", "2025-01-01T00:00:00Z");
        fake.reference("io.cozy.apps/photos/mobile", &flagship);
        let (client, _) = client(&fake, &tokens);
        assert_eq!(client.find_device_folder("twake-id".into()).unwrap(), None);
        let folder = client
            .adopt_device_folder(flagship.clone(), "twake-id".into())
            .unwrap();
        assert_eq!(folder.device_ids, ["flagship-id", "twake-id"]);
        let again = client
            .adopt_device_folder(flagship.clone(), "twake-id".into())
            .unwrap();
        assert_eq!(again.device_ids, ["flagship-id", "twake-id"]);
        let found = client.find_device_folder("twake-id".into()).unwrap();
        assert_eq!(found.map(|f| f.id), Some(flagship));
    }

    #[test]
    fn two_devices_adopting_at_once_both_stay() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let flagship =
            fake.add_device_dir("/Photos/B/iPhone", "flagship-id", "2025-01-01T00:00:00Z");
        let (client, _) = client(&fake, &tokens);
        fake.adopt_meanwhile("ipad-id");
        let folder = client
            .adopt_device_folder(flagship, "twake-id".into())
            .unwrap();
        assert_eq!(folder.device_ids, ["flagship-id", "ipad-id", "twake-id"]);
    }

    #[test]
    fn a_folder_without_a_revision_is_not_written_blindly() {
        let (fake, tokens) = (FakeStack::new(), FakeTokens::valid());
        let folder = fake.add_device_dir("/Photos/B/iPhone", "flagship-id", "2025-01-01T00:00:00Z");
        fake.drop_rev(&folder);
        let (client, _) = client(&fake, &tokens);
        assert!(
            client
                .adopt_device_folder(folder, "twake-id".into())
                .is_err()
        );
    }
}
