use std::sync::Arc;

use super::folders::{self, DeviceFolder, MAX_NAME_ATTEMPTS};
use super::http::{HttpRequest, Stack, StackTransport, TokenSource};
use super::index;
use super::upload::{self, MediaToSend};
use crate::CoreError;
use crate::backup::{BackupStore, PassAction, RemoteFile, UploadOutcome};

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
        folders::create(&self.stack, &device_id, &device_name, &root_name)
    }

    /// Reads what the folder holds, for the dedup of the next uploads.
    pub fn sync_folder_index(&self, folder_id: String) -> Result<(), CoreError> {
        self.store
            .replace_remote_index(&index::list_files(&self.stack, &folder_id)?)
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
        if let Some(file) = self.store.remote_file_with_md5(&media.md5)? {
            let own_file = self.store.drive_file_of(&media.local_id)?;
            let outcome = UploadOutcome::AlreadyThere {
                file_id: file.file_id.clone(),
            };
            self.store
                .record_outcome(media.local_id.clone(), media.md5, outcome, now)?;
            if file.id_from_library.as_deref() != Some(media.local_id.as_str()) {
                self.store
                    .set_drive_file(&media.local_id, own_file.as_deref())?;
            }
            return Ok(UploadPlan::AlreadyThere {
                file_id: file.file_id,
            });
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
                id_from_library: Some(media.local_id.clone()),
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
                .remote_file_of_media(&media.local_id, &media.name),
        }
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
}
