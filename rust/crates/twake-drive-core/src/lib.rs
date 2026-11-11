mod checksum;
mod error;

pub use checksum::md5_file;
pub use error::CoreError;

uniffi::setup_scaffolding!();
