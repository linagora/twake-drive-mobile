/// What the stack answered to the upload of one media, as the platform read it.
/// A 409 never gets here: the stack client renames the file and tries again.
#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
pub enum UploadOutcome {
    /// 201, or the new version of a file already in the folder.
    Uploaded { file_id: String },
    /// The folder of the device already holds the same content.
    AlreadyThere { file_id: String },
    /// 412: the file changed between its md5 and its upload.
    ContentChanged,
    /// 413 "disk quota exceeded".
    QuotaExceeded,
    /// 413 "max file size": this file will never fit.
    FileTooLarge,
    /// No answer: offline, timeout, connection reset.
    Network,
    /// 401: a token that expired while the transfer waited, e.g. in a
    /// background session. The next pass asks a fresh one.
    Unauthorized,
    /// The file could not be read on the device: an iCloud original that did
    /// not download, an export that failed.
    Unavailable,
    /// 5xx.
    Server { status: u16 },
    /// Any other 4xx. A 403 or 404 (the folder of the device deleted) concerns
    /// every media; a 400 or 422 only this one.
    Refused { status: u16 },
}

/// Whether the rest of the pass is worth trying.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PassAction {
    Continue,
    Stop,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Decision {
    Done {
        file_id: String,
    },
    /// Hash again before the next try.
    Rehash,
    /// Never try this media again.
    Skip,
    /// Try again at this time, the attempt counted.
    RetryAt(i64),
    /// Too many attempts: give up until the user asks again.
    Fail,
    /// Nothing wrong with the media (quota, network): leave it due, no attempt counted.
    Wait,
    /// Out of reach for now: try again at this time, no attempt counted.
    Later(i64),
}

pub(crate) const MAX_ATTEMPTS: u32 = 8;
const FIRST_DELAY_SECS: i64 = 60;
pub(crate) const UNAVAILABLE_DELAY_SECS: i64 = 60 * 60;

/// `attempts` counts the tries already made before this one.
pub(crate) fn decide(outcome: &UploadOutcome, attempts: u32, now: i64) -> (Decision, PassAction) {
    use PassAction::*;
    match outcome {
        UploadOutcome::Uploaded { file_id } | UploadOutcome::AlreadyThere { file_id } => (
            Decision::Done {
                file_id: file_id.clone(),
            },
            Continue,
        ),
        // Counted: a file never byte-stable on export would otherwise loop forever.
        UploadOutcome::ContentChanged if attempts + 1 >= MAX_ATTEMPTS => (Decision::Fail, Continue),
        UploadOutcome::ContentChanged => (Decision::Rehash, Continue),
        UploadOutcome::FileTooLarge => (Decision::Skip, Continue),
        // The next media would fail the same way, and the platform schedules the
        // next pass once the network is back.
        UploadOutcome::QuotaExceeded | UploadOutcome::Network | UploadOutcome::Unauthorized => {
            (Decision::Wait, Stop)
        }
        UploadOutcome::Server { .. } | UploadOutcome::Refused { status: 403 | 404 } => {
            (retry(attempts + 1, now), Stop)
        }
        // An iCloud original may stay out of reach for days: never a failure.
        UploadOutcome::Unavailable => (Decision::Later(now + UNAVAILABLE_DELAY_SECS), Continue),
        UploadOutcome::Refused { .. } => (retry(attempts + 1, now), Continue),
    }
}

fn retry(attempts: u32, now: i64) -> Decision {
    if attempts >= MAX_ATTEMPTS {
        return Decision::Fail;
    }
    // At most 64 minutes, before the last attempt.
    Decision::RetryAt(now + (FIRST_DELAY_SECS << (attempts - 1)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;

    #[test]
    fn a_stored_file_is_done() {
        let outcome = UploadOutcome::Uploaded {
            file_id: "f1".into(),
        };
        assert_eq!(
            decide(&outcome, 3, NOW),
            (
                Decision::Done {
                    file_id: "f1".into()
                },
                PassAction::Continue
            )
        );
    }

    #[test]
    fn a_file_that_changed_is_hashed_again() {
        assert_eq!(
            decide(&UploadOutcome::ContentChanged, 0, NOW),
            (Decision::Rehash, PassAction::Continue)
        );
    }

    #[test]
    fn a_file_that_keeps_changing_fails_in_the_end() {
        assert_eq!(
            decide(&UploadOutcome::ContentChanged, MAX_ATTEMPTS - 1, NOW),
            (Decision::Fail, PassAction::Continue)
        );
    }

    #[test]
    fn a_file_too_large_is_skipped_for_good() {
        assert_eq!(
            decide(&UploadOutcome::FileTooLarge, 0, NOW),
            (Decision::Skip, PassAction::Continue)
        );
    }

    #[test]
    fn a_full_quota_or_no_network_stops_the_pass_without_counting_an_attempt() {
        for outcome in [UploadOutcome::QuotaExceeded, UploadOutcome::Network] {
            assert_eq!(decide(&outcome, 2, NOW), (Decision::Wait, PassAction::Stop));
        }
    }

    #[test]
    fn an_expired_token_waits_for_the_next_pass_without_counting_an_attempt() {
        assert_eq!(
            decide(&UploadOutcome::Unauthorized, MAX_ATTEMPTS - 1, NOW),
            (Decision::Wait, PassAction::Stop)
        );
    }

    #[test]
    fn a_file_out_of_reach_is_tried_later_and_the_pass_goes_on() {
        assert_eq!(
            decide(&UploadOutcome::Unavailable, MAX_ATTEMPTS - 1, NOW),
            (Decision::Later(NOW + 3600), PassAction::Continue)
        );
    }

    #[test]
    fn only_a_folder_or_permission_error_stops_the_pass() {
        for status in [403, 404] {
            assert_eq!(
                decide(&UploadOutcome::Refused { status }, 0, NOW).1,
                PassAction::Stop
            );
        }
        for status in [400, 422] {
            assert_eq!(
                decide(&UploadOutcome::Refused { status }, 0, NOW).1,
                PassAction::Continue
            );
        }
    }

    #[test]
    fn the_delay_doubles_from_a_minute() {
        let server = UploadOutcome::Server { status: 503 };
        assert_eq!(decide(&server, 0, NOW).0, Decision::RetryAt(NOW + 60));
        assert_eq!(decide(&server, 1, NOW).0, Decision::RetryAt(NOW + 120));
        assert_eq!(
            decide(&UploadOutcome::Refused { status: 404 }, 6, NOW),
            (Decision::RetryAt(NOW + 3840), PassAction::Stop)
        );
    }

    #[test]
    fn too_many_attempts_fail() {
        assert_eq!(
            decide(
                &UploadOutcome::Server { status: 500 },
                MAX_ATTEMPTS - 1,
                NOW
            ),
            (Decision::Fail, PassAction::Stop)
        );
    }
}
