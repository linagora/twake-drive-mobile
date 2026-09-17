import { renderHook } from '@testing-library/react-native'
import { Linking } from 'react-native'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'

import { useEditorNavigationGuard } from './useEditorNavigationGuard'

const STACK = 'https://mmaudet.twake.linagora.com'

const request = (url: string, isTopFrame = true): ShouldStartLoadRequest =>
  ({ url, isTopFrame, navigationType: 'click' }) as ShouldStartLoadRequest

describe('useEditorNavigationGuard', () => {
  // A fresh spy per test: a shared one carries call history across cases and
  // made the sub-frame assertion see the previous test's external navigation.
  let openURL: jest.SpyInstance
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  })
  afterEach(() => openURL.mockRestore())

  const guard = (...stackUris: (string | null)[]) =>
    renderHook(() => useEditorNavigationGuard(stackUris.length ? stackUris : [STACK])).result
      .current

  it('scopes the origin whitelist to the instance, never "*"', () => {
    expect(guard().originWhitelist).toEqual([
      'https://mmaudet.twake.linagora.com',
      'https://mmaudet-*.twake.linagora.com'
    ])
  })

  it('lets the editor navigate within the instance', () => {
    const { onShouldStartLoadWithRequest } = guard()
    expect(
      onShouldStartLoadWithRequest(request('https://mmaudet-notes.twake.linagora.com/?s=1'))
    ).toBe(true)
    expect(openURL).not.toHaveBeenCalled()
  })

  // The WebView holds a session_code, so an outside link must leave it.
  it('blocks an external top-level navigation and hands it to the browser', () => {
    const { onShouldStartLoadWithRequest } = guard()
    expect(onShouldStartLoadWithRequest(request('https://evil.example.com/'))).toBe(false)
    expect(openURL).toHaveBeenCalledWith('https://evil.example.com/')
  })

  // OnlyOffice renders its editor in an iframe on the document server, which is
  // legitimately another host; same-origin policy keeps it off the session.
  it('allows sub-frames on other hosts', () => {
    const { onShouldStartLoadWithRequest } = guard()
    expect(onShouldStartLoadWithRequest(request('https://docs.example.com/editor', false))).toBe(
      true
    )
    expect(openURL).not.toHaveBeenCalled()
  })

  it('allows about:blank', () => {
    expect(guard().onShouldStartLoadWithRequest(request('about:blank'))).toBe(true)
  })

  // A document opened from a sharing is served by its owner's instance, so the
  // guard must follow the document rather than the session.
  it('allows every instance it was given, not just the signed-in one', () => {
    const owner = 'https://alice.twake.linagora.com'
    const { onShouldStartLoadWithRequest, originWhitelist } = guard(STACK, owner)
    expect(originWhitelist).toContain('https://alice-*.twake.linagora.com')
    expect(
      onShouldStartLoadWithRequest(request('https://alice-notes.twake.linagora.com/#/n/1'))
    ).toBe(true)
    expect(
      onShouldStartLoadWithRequest(request('https://mmaudet-notes.twake.linagora.com/#/n/1'))
    ).toBe(true)
    expect(onShouldStartLoadWithRequest(request('https://evil.example.com/'))).toBe(false)
  })

  it('blocks everything until the stack uri is known', () => {
    const { onShouldStartLoadWithRequest, originWhitelist } = guard(null)
    expect(originWhitelist).toEqual([])
    expect(onShouldStartLoadWithRequest(request(`${STACK}/`))).toBe(false)
  })
})
