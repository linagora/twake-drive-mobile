import { redirectSystemPath } from './+native-intent'

describe('redirectSystemPath', () => {
  it('sends the OAuth callback to the drive, whichever shape it arrives in', () => {
    expect(redirectSystemPath({ path: 'twakedrive://?code=abc', initial: true })).toBe(
      '/(drive)/files'
    )
    expect(
      redirectSystemPath({ path: 'https://links.twake.app/drive?code=abc', initial: true })
    ).toBe('/(drive)/files')
  })

  it('sends a share to the drive too', () => {
    expect(redirectSystemPath({ path: 'twakedrive://dataUrl=x', initial: false })).toBe(
      '/(drive)/files'
    )
  })

  it('opens the route a link of ours names', () => {
    expect(redirectSystemPath({ path: 'twakedrive:///search', initial: false })).toBe(
      'twakedrive:///search'
    )
  })

  it('sends the custom-scheme callback without slashes to the drive', () => {
    expect(redirectSystemPath({ path: 'twakedrive:?code=abc', initial: true })).toBe(
      '/(drive)/files'
    )
  })

  it('leaves an ordinary route alone', () => {
    expect(redirectSystemPath({ path: '/(drive)/files/abc', initial: false })).toBe(
      '/(drive)/files/abc'
    )
  })
})
