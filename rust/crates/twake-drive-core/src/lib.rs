mod checksum;

pub use checksum::{CoreError, md5_file};

uniffi::setup_scaffolding!();
