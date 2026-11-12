mod backup;
mod checksum;
mod error;

pub use backup::{BackupCounts, BackupStore, PassAction, QueuedMedia, UploadOutcome};
pub use checksum::md5_file;
pub use error::CoreError;

uniffi::setup_scaffolding!();
