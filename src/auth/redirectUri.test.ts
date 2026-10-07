import { Platform } from 'react-native'

import {
  CUSTOM_SCHEME_REDIRECT,
  UNIVERSAL_LINK_REDIRECT,
  isOurRedirect,
  normalizeRedirectUrl,
  resetRedirectUri,
  resolveRedirectUri
} from './redirectUri'
import { isAppLinkUsable } from '@/native/twakeAuthBridge'

jest.mock('@/native/twakeAuthBridge', () => ({ isAppLinkUsable: jest.fn() }))

const mockIsAppLinkUsable = isAppLinkUsable as jest.Mock

describe('resolveRedirectUri', () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    resetRedirectUri()
    mockIsAppLinkUsable.mockReset()
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    Platform.OS = 'ios'
    warn.mockRestore()
  })

  it('takes the verified link on Android, where a custom scheme gets cancelled', async () => {
    Platform.OS = 'android'
    mockIsAppLinkUsable.mockResolvedValue(true)
    await expect(resolveRedirectUri()).resolves.toBe(UNIVERSAL_LINK_REDIRECT)
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the custom scheme and says so when Android did not verify the link', async () => {
    Platform.OS = 'android'
    mockIsAppLinkUsable.mockResolvedValue(false)
    await expect(resolveRedirectUri()).resolves.toBe(CUSTOM_SCHEME_REDIRECT)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not verified'))
  })

  it('asks the OS once per sign-in, so every step agrees', async () => {
    Platform.OS = 'android'
    mockIsAppLinkUsable.mockResolvedValueOnce(false).mockResolvedValue(true)
    expect(await resolveRedirectUri()).toBe(CUSTOM_SCHEME_REDIRECT)
    expect(await resolveRedirectUri()).toBe(CUSTOM_SCHEME_REDIRECT)
    expect(mockIsAppLinkUsable).toHaveBeenCalledTimes(1)
    resetRedirectUri()
    expect(await resolveRedirectUri()).toBe(UNIVERSAL_LINK_REDIRECT)
  })

  it('keeps the custom scheme on iOS, which the auth session intercepts itself', async () => {
    await expect(resolveRedirectUri()).resolves.toBe(CUSTOM_SCHEME_REDIRECT)
    expect(mockIsAppLinkUsable).not.toHaveBeenCalled()
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
