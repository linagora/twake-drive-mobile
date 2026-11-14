//! A Live Photo is one media of the library and two files in Drive. The
//! flagship app gives both files the id of the media: the backup state keeps
//! the video under that id with a suffix.

const PAIRED_VIDEO: &str = "#video";

/// The key of the video of a Live Photo in the backup state.
#[uniffi::export]
pub fn paired_video_key(library_id: String) -> String {
    library_id + PAIRED_VIDEO
}

/// The id of the media in the library, for a key of the backup state.
#[uniffi::export]
pub fn library_id(local_id: String) -> String {
    library_id_of(&local_id).to_string()
}

pub(crate) fn library_id_of(local_id: &str) -> &str {
    local_id.strip_suffix(PAIRED_VIDEO).unwrap_or(local_id)
}

/// Whether a Drive file holding `id_from_library` may stand for this phone's
/// media. An Android id (content://…/123) names a media on one phone only:
/// another phone backing up to the same folder may hold the same, so only a
/// file this phone sent counts. An iOS id names one media of one library,
/// whichever app sent the file (the flagship app's included).
pub(crate) fn may_stand_for_own_media(
    id_from_library: &str,
    sent_from: &[String],
    this_device: Option<&str>,
) -> bool {
    !id_from_library.starts_with("content://")
        || this_device.is_some_and(|device| sent_from.iter().any(|from| from == device))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_video_of_a_live_photo_goes_back_to_its_media() {
        let key = paired_video_key("A1/L0/001".into());
        assert_ne!(key, "A1/L0/001");
        assert_eq!(library_id(key), "A1/L0/001");
        assert_eq!(library_id("A1/L0/001".into()), "A1/L0/001");
    }
}
