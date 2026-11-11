use std::fs::File;
use std::io;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use md5::{Digest, Md5};

/// No path in the messages: they may reach a crash report, and a path carries
/// the name the user gave the file.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("cannot read the file: {reason}")]
    Io { reason: String },
}

/// MD5 of a file, base64-encoded: the form cozy-stack expects in `Content-MD5`
/// and returns in `md5sum`. Streams the file, so a video of several gigabytes
/// never sits in memory.
#[uniffi::export]
pub fn md5_file(path: String) -> Result<String, CoreError> {
    let io_error = |e: io::Error| CoreError::Io {
        reason: e.to_string(),
    };
    let mut file = File::open(&path).map_err(io_error)?;
    let mut hasher = Md5::new();
    io::copy(&mut file, &mut hasher).map_err(io_error)?;
    Ok(STANDARD.encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    fn temp_file(name: &str, content: &[u8]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("twake-core-{}-{name}", std::process::id()));
        File::create(&path).unwrap().write_all(content).unwrap();
        path
    }

    fn md5_of(path: &Path) -> Result<String, CoreError> {
        let md5 = md5_file(path.to_string_lossy().into_owned());
        let _ = std::fs::remove_file(path);
        md5
    }

    #[test]
    fn known_content() {
        let path = temp_file("known", b"The quick brown fox jumps over the lazy dog");
        // RFC 1321 test vector 9e107d9d372bb6826bd81d3542a419d6, in base64
        assert_eq!(md5_of(&path).unwrap(), "nhB9nTcrtoJr2B01QqQZ1g==");
    }

    #[test]
    fn empty_file() {
        let path = temp_file("empty", b"");
        assert_eq!(md5_of(&path).unwrap(), "1B2M2Y8AsgTpgAmY7PhCfg==");
    }

    #[test]
    fn file_of_several_megabytes() {
        let content: Vec<u8> = (0..3 * 1024 * 1024 + 17).map(|i| (i % 251) as u8).collect();
        let path = temp_file("large", &content);
        assert_eq!(
            md5_of(&path).unwrap(),
            STANDARD.encode(Md5::digest(&content))
        );
    }

    #[test]
    fn missing_file() {
        let err = md5_file("/nonexistent/twake-core-secret.jpg".into()).unwrap_err();
        assert!(matches!(err, CoreError::Io { .. }));
        assert!(!err.to_string().contains("secret"));
    }
}
