/**
 * The instance flags twake-drive web reads to decide what a share is: the first
 * opens sharing with people, the second makes that share a shared drive rather
 * than a cozy-to-cozy sharing.
 */
export const SHARED_DRIVE_FLAG = 'drive.shared-drive.enabled'
export const FEDERATED_SHARED_FOLDER_FLAG = 'drive.federated-shared-folder.enabled'

export const HIDE_COZY_TO_COZY_FLAG = 'cozy.hide-sharing-cozy-to-cozy'

interface PeopleSharingFlags {
  sharedDrive: unknown
  federatedSharedFolder: unknown
  hideCozyToCozy: unknown
}

// Same reading as web: twake-drive areDrivesAvailable for the two drive flags,
// cozy-sharing ShareModal for the cozy-to-cozy one.
export const isSharingWithPeopleEnabled = (flags: PeopleSharingFlags): boolean =>
  !!flags.sharedDrive || !!flags.federatedSharedFolder || !flags.hideCozyToCozy
