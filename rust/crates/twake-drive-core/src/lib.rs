mod backup;
mod checksum;
mod error;
mod stack;

pub use backup::{BackupCounts, BackupStore, PassAction, QueuedMedia, UploadOutcome};
pub use checksum::md5_file;
pub use error::CoreError;
pub use stack::{
    DeviceFolder, Header, HttpRequest, HttpResponse, MediaToSend, StackClient, StackTransport,
    TokenSource,
};

uniffi::setup_scaffolding!();
