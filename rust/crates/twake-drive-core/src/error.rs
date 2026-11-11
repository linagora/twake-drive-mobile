/// No path in the messages: they may reach a crash report, and a path carries
/// the name the user gave the file.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("cannot read the file: {reason}")]
    Io { reason: String },
}
