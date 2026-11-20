import { readFileSync } from 'fs'
import { join } from 'path'
import { renderHook, waitFor, act } from '@testing-library/react-native'
import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native'
import flag from 'cozy-flags'

const mockNavigate = jest.fn()
const mockRouter = { navigate: mockNavigate }
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))

const mockClient = { id: 'client' }
jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => mockClient }))

const mockSaveToken = jest.fn(async (..._a: unknown[]) => undefined)
const mockRemoveToken = jest.fn(async (..._a: unknown[]) => undefined)
jest.mock('./notificationDeviceToken', () => ({
  PUSH_NOTIFICATIONS_FLAG: 'drive.mobile.push-notifications.enabled',
  saveNotificationDeviceToken: (...a: unknown[]) => mockSaveToken(...a),
  removeNotificationDeviceToken: (...a: unknown[]) => mockRemoveToken(...a)
}))

const mockTriggerReplication = jest.fn()
jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: (...a: unknown[]) => mockTriggerReplication(...a)
}))

// What the app keeps across launches.
const mockStored = new Map<string, string>()
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    remove: (key: string) => mockStored.delete(key)
  })
}))

type Listener = (arg: unknown) => void
const mockListeners: Record<string, Listener> = {}
const mockUnsubscribe = jest.fn()
const listen = (name: string) => (_m: unknown, listener: Listener) => {
  mockListeners[name] = listener
  return mockUnsubscribe
}
const NOT_DETERMINED = -1
const DENIED = 0
const AUTHORIZED = 1
let mockOsStatus = AUTHORIZED
const mockGetMessaging = jest.fn(() => ({}))
const mockGetToken = jest.fn(async () => 'fcm-token')
const mockRequestPermission = jest.fn(async () => mockOsStatus)
const mockGetInitialNotification = jest.fn(async (): Promise<unknown> => null)
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: () => mockGetMessaging(),
  getToken: () => mockGetToken(),
  hasPermission: async () => mockOsStatus,
  requestPermission: () => mockRequestPermission(),
  getInitialNotification: () => mockGetInitialNotification(),
  onTokenRefresh: listen('tokenRefresh'),
  onNotificationOpenedApp: listen('opened'),
  onMessage: listen('message')
}))

import { usePushNotifications } from './usePushNotifications'
import { usePushNotificationsSetting } from './pushPermission'

const launch = () =>
  renderHook(() => {
    usePushNotifications()
    return usePushNotificationsSetting()
  })

const FLAG = 'drive.mobile.push-notifications.enabled'
const sharingsPush = { data: { redirectLink: 'drive/#/sharings' } }

let appStateListener: ((state: string) => void) | null = null

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStored.clear()
    mockOsStatus = AUTHORIZED
    for (const name of Object.keys(mockListeners)) delete mockListeners[name]
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void
      return { remove: jest.fn() }
    })
    flag(FLAG, true)
  })

  afterEach(() => {
    flag(FLAG, null)
    jest.restoreAllMocks()
  })

  it('does nothing while the instance has not turned push on', async () => {
    flag(FLAG, null)
    const { result } = launch()
    await act(async () => undefined)
    expect(mockGetMessaging).not.toHaveBeenCalled()
    expect(mockSaveToken).not.toHaveBeenCalled()
    expect(result.current.available).toBe(false)
  })

  it('does nothing in a build without a Firebase configuration', async () => {
    mockGetMessaging.mockImplementationOnce(() => {
      throw new Error("No Firebase App '[DEFAULT]' has been created")
    })
    const { result } = launch()
    await act(async () => undefined)
    expect(mockSaveToken).not.toHaveBeenCalled()
    expect(result.current.available).toBe(false)
  })

  describe('when the OS allows notifications', () => {
    it('registers the device token without asking', async () => {
      const { result } = launch()
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'fcm-token'))
      expect(mockRequestPermission).not.toHaveBeenCalled()
      expect(result.current).toMatchObject({ available: true, on: true })
    })

    it('registers the token the OS rotates to', async () => {
      launch()
      await waitFor(() => expect(mockListeners.tokenRefresh).toBeDefined())
      act(() => mockListeners.tokenRefresh('rotated'))
      expect(mockSaveToken).toHaveBeenLastCalledWith(mockClient, 'rotated')
    })

    it('registers a token that could not be had at first once it arrives', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('SERVICE_NOT_AVAILABLE'))
      launch()
      await waitFor(() => expect(mockListeners.tokenRefresh).toBeDefined())
      await act(async () => undefined)
      expect(mockSaveToken).not.toHaveBeenCalled()
      act(() => mockListeners.tokenRefresh('late-token'))
      expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'late-token')
    })

    it('clears the token and keeps it off once turned off in the settings', async () => {
      const { result, unmount } = launch()
      await waitFor(() => expect(result.current.on).toBe(true))
      act(() => result.current.setOn(false))
      await waitFor(() => expect(mockRemoveToken).toHaveBeenCalledWith(mockClient))
      expect(result.current.on).toBe(false)

      unmount()
      mockSaveToken.mockClear()
      const next = launch()
      await waitFor(() => expect(next.result.current.available).toBe(true))
      expect(next.result.current.on).toBe(false)
      expect(mockSaveToken).not.toHaveBeenCalled()
    })

    it('registers again when turned back on', async () => {
      mockStored.set('pushNotifications', 'off')
      const { result } = launch()
      await waitFor(() => expect(result.current.available).toBe(true))
      expect(mockSaveToken).not.toHaveBeenCalled()
      act(() => result.current.setOn(true))
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'fcm-token'))
      expect(result.current.on).toBe(true)
    })
  })

  describe('when the OS has not asked yet', () => {
    beforeEach(() => {
      mockOsStatus = NOT_DETERMINED
    })

    it('asks at launch and registers once allowed', async () => {
      mockRequestPermission.mockImplementationOnce(async () => {
        mockOsStatus = AUTHORIZED
        return AUTHORIZED
      })
      const { result } = launch()
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'fcm-token'))
      expect(mockRequestPermission).toHaveBeenCalledTimes(1)
      expect(result.current.on).toBe(true)
    })

    it('registers nothing when the user refuses', async () => {
      mockRequestPermission.mockImplementationOnce(async () => {
        mockOsStatus = DENIED
        return DENIED
      })
      const { result } = launch()
      await waitFor(() => expect(mockRemoveToken).toHaveBeenCalled())
      expect(mockSaveToken).not.toHaveBeenCalled()
      expect(result.current.on).toBe(false)
    })

    it('does not ask while turned off in the settings, and asks when turned on', async () => {
      mockStored.set('pushNotifications', 'off')
      const { result } = launch()
      await waitFor(() => expect(result.current.available).toBe(true))
      expect(mockRequestPermission).not.toHaveBeenCalled()
      act(() => result.current.setOn(true))
      await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1))
    })
  })

  describe('when the OS refused', () => {
    beforeEach(() => {
      mockOsStatus = DENIED
    })

    it('does not ask, and clears the token', async () => {
      const { result } = launch()
      await waitFor(() => expect(mockRemoveToken).toHaveBeenCalledWith(mockClient))
      expect(mockRequestPermission).not.toHaveBeenCalled()
      expect(result.current).toMatchObject({ available: true, on: false })
    })

    it('opens the OS settings when turned on, and registers once back allowed', async () => {
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
      const { result } = launch()
      await waitFor(() => expect(result.current.available).toBe(true))
      act(() => result.current.setOn(true))
      expect(openSettings).toHaveBeenCalled()
      expect(mockRequestPermission).not.toHaveBeenCalled()

      mockOsStatus = AUTHORIZED
      act(() => appStateListener?.('active'))
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'fcm-token'))
      expect(result.current.on).toBe(true)
    })

    it('opens the shares from a tap all the same', async () => {
      mockGetInitialNotification.mockResolvedValueOnce(sharingsPush)
      launch()
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared'))
    })
  })

  it('opens the shares when a share push is tapped', async () => {
    launch()
    await waitFor(() => expect(mockListeners.opened).toBeDefined())
    mockListeners.opened(sharingsPush)
    expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared')
  })

  it('opens the shares when the app was launched from a share push', async () => {
    mockGetInitialNotification.mockResolvedValueOnce(sharingsPush)
    launch()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared'))
  })

  it('ignores a push that is not about a share', async () => {
    launch()
    await waitFor(() => expect(mockListeners.opened).toBeDefined())
    mockListeners.opened({ data: { redirectLink: 'mail/#/inbox' } })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('syncs when a push lands in the foreground', async () => {
    launch()
    await waitFor(() => expect(mockListeners.message).toBeDefined())
    mockListeners.message({})
    expect(mockTriggerReplication).toHaveBeenCalledWith(mockClient)
  })

  it('stops listening on unmount', async () => {
    const { unmount } = launch()
    await waitFor(() => expect(mockListeners.message).toBeDefined())
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(3)
  })

  describe('below Android 13', () => {
    const os = Platform.OS
    const version = Platform.Version

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
      Object.defineProperty(Platform, 'Version', { value: 31, configurable: true })
    })

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
      Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
    })

    it('registers without asking while the OS lets the app notify', async () => {
      const request = jest.spyOn(PermissionsAndroid, 'request')
      const { result } = launch()
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalled())
      expect(request).not.toHaveBeenCalled()
      expect(result.current.on).toBe(true)
    })

    it('shows the row off and opens the OS settings once notifications were cut there', async () => {
      mockOsStatus = DENIED
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
      const request = jest.spyOn(PermissionsAndroid, 'request')
      const { result } = launch()
      await waitFor(() => expect(result.current.available).toBe(true))
      expect(result.current.on).toBe(false)
      expect(request).not.toHaveBeenCalled()
      expect(mockSaveToken).not.toHaveBeenCalled()
      act(() => result.current.setOn(true))
      expect(openSettings).toHaveBeenCalled()
    })
  })

  describe('on Android 13 and later', () => {
    const os = Platform.OS
    const version = Platform.Version

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
      Object.defineProperty(Platform, 'Version', { value: 33, configurable: true })
    })

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
      Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
    })

    it('asks for the notification permission at launch', async () => {
      mockOsStatus = DENIED
      const request = jest.spyOn(PermissionsAndroid, 'request').mockImplementationOnce(async () => {
        mockOsStatus = AUTHORIZED
        return 'granted'
      })
      launch()
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalled())
      expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    })

    it('does not ask again on the next launch once refused', async () => {
      mockOsStatus = DENIED
      const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied')
      const first = launch()
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      first.unmount()
      const next = launch()
      await waitFor(() => expect(next.result.current.available).toBe(true))
      expect(request).toHaveBeenCalledTimes(1)
      expect(next.result.current.on).toBe(false)
    })

    it('shows the row off once notifications were cut in the OS settings', async () => {
      mockStored.set('pushPermissionRefused', '1')
      mockOsStatus = DENIED
      const { result } = launch()
      await waitFor(() => expect(result.current.available).toBe(true))
      expect(result.current.on).toBe(false)
    })

    // Undeclared, the request is refused without a dialog and no push ever shows.
    it('declares the permission in the app manifest', () => {
      const manifest = readFileSync(
        join(__dirname, '../../android/app/src/main/AndroidManifest.xml'),
        'utf8'
      )
      expect(manifest).toMatch(
        /<uses-permission android:name="android\.permission\.POST_NOTIFICATIONS"\s*\/>/
      )
    })
  })
})
