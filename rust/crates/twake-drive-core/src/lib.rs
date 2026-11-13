mod backup;
mod checksum;
mod error;
mod library;
mod stack;

pub use backup::{
    AlbumChoice, BackupConditions, BackupConfig, BackupCounts, BackupStatus, BackupStore,
    LibraryMedia, ParkedUpload, PassAction, QueuedMedia, UploadOutcome,
};
pub use checksum::md5_file;
pub use error::CoreError;
pub use library::{library_id, paired_video_key};
pub use stack::{
    DeviceFolder, Header, HttpRequest, HttpResponse, MediaToSend, StackClient, StackTransport,
    TokenSource, UploadPlan, UploadReply,
};

uniffi::setup_scaffolding!();
