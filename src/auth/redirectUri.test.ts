import { Platform } from 'react-native'

import {
  CUSTOM_SCHEME_REDIRECT,
  UNIVERSAL_LINK_REDIRECT,
  isOurRedirect,
  normalizeRedirectUrl,
  redirectUri
} from './redirectUri'

describe('redirectUri', () => {
  afterEach(() => {
    Platform.OS = 'ios'
  })

  it('takes the verified link on Android, where a custom scheme gets cancelled', () => {
    Platform.OS = 'android'
    expect(redirectUri()).toBe(UNIVERSAL_LINK_REDIRECT)
  })

  it('keeps the custom scheme on iOS, which the auth session intercepts itself', () => {
    expect(redirectUri()).toBe(CUSTOM_SCHEME_REDIRECT)
  })
})

describe('isOurRedirect', () => {
  it('recognises the custom scheme, with or without slashes', () => {
    expect(isOurRedirect('twakedrive://?code=abc')).toBe(true)
    expect(isOurRedirect('twakedrive:?code=abc')).toBe(true)
  })

  it('recognises the verified link', () => {
    expect(isOurRedirect('https://links.twake.app/drive?code=abc&state=x')).toBe(true)
  })

  it('ignores a link to another app of the same domain', () => {
    expect(isOurRedirect('https://links.twake.app/mail?code=abc')).toBe(false)
  })

  it('ignores anything else', () => {
    expect(isOurRedirect('https://example.test/drive?code=abc')).toBe(false)
    expect(isOurRedirect('')).toBe(false)
  })
})

describe('normalizeRedirectUrl', () => {
  it('gives the custom scheme its slashes back', () => {
    expect(normalizeRedirectUrl('twakedrive:?code=abc')).toBe('twakedrive://?code=abc')
  })

  it('drops the hash a browser appends', () => {
    expect(normalizeRedirectUrl('https://links.twake.app/drive?code=abc#')).toBe(
      'https://links.twake.app/drive?code=abc'
    )
  })
})
