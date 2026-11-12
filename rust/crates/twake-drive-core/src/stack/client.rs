use std::sync::Arc;

use super::folders::{self, DeviceFolder};
use super::http::{Stack, StackTransport, TokenSource};
use crate::CoreError;
use crate::backup::BackupStore;

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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stack::fake_stack::{BASE, FakeStack, FakeTokens};

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
}
