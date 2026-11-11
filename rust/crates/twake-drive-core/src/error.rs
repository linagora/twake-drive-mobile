/// No path in the messages: they may reach a crash report, and a path carries
/// the name the user gave the file.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("cannot read the file: {reason}")]
    Io { reason: String },
    #[error("backup state: {reason}")]
    Storage { reason: String },
    /// The backup state cannot be used (corrupt, or written by a newer app).
    /// The platform deletes the file given to `BackupStore::open` with its
    /// `-wal` and `-shm` files, then opens it again. Nothing is lost for good:
    /// the folder of the device in Drive tells what is already saved.
    #[error("backup state unusable: {reason}")]
    Unusable { reason: String },
}
