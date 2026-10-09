import { isSharingWithPeopleEnabled } from './sharingFlags'

describe('isSharingWithPeopleEnabled', () => {
  const off = { sharedDrive: false, federatedSharedFolder: false, hideCozyToCozy: true }

  it('is off when shared drives and cozy-to-cozy are both off', () => {
    expect(isSharingWithPeopleEnabled(off)).toBe(false)
    expect(
      isSharingWithPeopleEnabled({
        sharedDrive: null,
        federatedSharedFolder: undefined,
        hideCozyToCozy: true
      })
    ).toBe(false)
  })

  it('is on with the shared drive flag', () => {
    expect(isSharingWithPeopleEnabled({ ...off, sharedDrive: true })).toBe(true)
  })

  it('is on with the federated shared folder flag', () => {
    expect(isSharingWithPeopleEnabled({ ...off, federatedSharedFolder: true })).toBe(true)
  })

  it('is on while cozy-to-cozy sharing is not hidden', () => {
    expect(isSharingWithPeopleEnabled({ ...off, hideCozyToCozy: undefined })).toBe(true)
  })
})
