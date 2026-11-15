//! How many uploads the platform hands to its background transfers at once.
//! The tasks are made in batches while the app is on the screen, where iOS
//! starts them at once; made in the background they wait for the system.

const MAX_TASKS: u32 = 6;
const MAX_BYTES: u64 = 300 * MB;
/// A larger media goes alone.
const ALONE_FROM: u64 = 150 * MB;
/// Left free on the phone once the copy of a media is made.
const KEEP_FREE: u64 = 1024 * MB;
const MB: u64 = 1024 * 1024;

/// What to do with a media of known size, asked before its copy is made.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum HandRoom {
    /// Copy it and hand it now.
    Go,
    /// Not this one yet, it goes alone: a smaller media may go meanwhile.
    Later,
    /// No more room until an upload ends: the batch stops here.
    Full,
    /// Its copy would leave the phone short of space: a smaller media may go.
    NoDisk,
}

/// The copies the uploads running still hold, as exported.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, uniffi::Record)]
pub struct LiveCopies {
    pub bytes: u64,
    pub largest: u64,
}

/// Where a media of `size` bytes stands, with `live_tasks` uploads running
/// that hold the `live` copies, and `free_disk` left on the phone.
#[uniffi::export]
pub fn hand_room(live_tasks: u32, live: LiveCopies, size: u64, free_disk: u64) -> HandRoom {
    if free_disk < size.saturating_add(KEEP_FREE) {
        return HandRoom::NoDisk;
    }
    if live_tasks == 0 {
        return HandRoom::Go;
    }
    if live_tasks >= MAX_TASKS || live.bytes >= MAX_BYTES || live.largest > ALONE_FROM {
        return HandRoom::Full;
    }
    if size > ALONE_FROM || live.bytes + size > MAX_BYTES {
        return HandRoom::Later;
    }
    HandRoom::Go
}

/// A media to fetch from iCloud first goes alone, after those on the phone:
/// its download would hold the whole batch back.
#[uniffi::export]
pub fn may_fetch_from_icloud(live_tasks: u32) -> bool {
    live_tasks == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    const DISK: u64 = 10 * 1024 * MB;
    const NONE: LiveCopies = LiveCopies {
        bytes: 0,
        largest: 0,
    };

    fn small(bytes: u64) -> LiveCopies {
        LiveCopies {
            bytes,
            largest: bytes.min(5 * MB),
        }
    }

    #[test]
    fn six_uploads_run_at_once() {
        assert_eq!(hand_room(5, small(50 * MB), 5 * MB, DISK), HandRoom::Go);
        assert_eq!(hand_room(6, small(50 * MB), 5 * MB, DISK), HandRoom::Full);
    }

    #[test]
    fn the_copies_waiting_to_go_stay_under_300_mb() {
        assert_eq!(hand_room(3, small(290 * MB), 10 * MB, DISK), HandRoom::Go);
        assert_eq!(
            hand_room(3, small(290 * MB), 11 * MB, DISK),
            HandRoom::Later
        );
        assert_eq!(hand_room(3, small(300 * MB), 1, DISK), HandRoom::Full);
    }

    #[test]
    fn a_video_over_150_mb_goes_alone() {
        assert_eq!(hand_room(1, small(4 * MB), 151 * MB, DISK), HandRoom::Later);
        assert_eq!(hand_room(0, NONE, 2048 * MB, DISK), HandRoom::Go);
        // Running, it takes no company, even under 300 MB in all.
        let video = LiveCopies {
            bytes: 200 * MB,
            largest: 200 * MB,
        };
        assert_eq!(hand_room(1, video, 1, DISK), HandRoom::Full);
    }

    #[test]
    fn a_copy_that_would_leave_less_than_1_gb_free_is_not_made() {
        // A 1 GB video with 1.5 GB free: a smaller media may go instead.
        assert_eq!(hand_room(0, NONE, 1024 * MB, 1536 * MB), HandRoom::NoDisk);
        assert_eq!(hand_room(0, NONE, 400 * MB, 1536 * MB), HandRoom::Go);
    }

    #[test]
    fn a_media_in_icloud_waits_for_the_others() {
        assert!(may_fetch_from_icloud(0));
        assert!(!may_fetch_from_icloud(1));
    }
}
