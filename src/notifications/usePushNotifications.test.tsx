import { renderHook, waitFor, act } from '@testing-library/react-native'
import { PermissionsAndroid, Platform } from 'react-native'
import flag from 'cozy-flags'

const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }))

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

type Listener = (arg: unknown) => void
const mockListeners: Record<string, Listener> = {}
const mockUnsubscribe = jest.fn()
const listen = (name: string) => (_m: unknown, listener: Listener) => {
  mockListeners[name] = listener
  return mockUnsubscribe
}
const mockGetMessaging = jest.fn(() => ({}))
const mockGetToken = jest.fn(async () => 'fcm-token')
const mockRequestPermission = jest.fn(async () => 1)
const mockGetInitialNotification = jest.fn(async (): Promise<unknown> => null)
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: () => mockGetMessaging(),
  getToken: () => mockGetToken(),
  requestPermission: () => mockRequestPermission(),
  getInitialNotification: () => mockGetInitialNotification(),
  onTokenRefresh: listen('tokenRefresh'),
  onNotificationOpenedApp: listen('opened'),
  onMessage: listen('message')
}))

import { usePushNotifications } from './usePushNotifications'

const FLAG = 'drive.mobile.push-notifications.enabled'
const sharingsPush = { data: { redirectLink: 'drive/#/sharings' } }

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const name of Object.keys(mockListeners)) delete mockListeners[name]
    flag(FLAG, true)
  })

  afterEach(() => {
    flag(FLAG, null)
    jest.restoreAllMocks()
  })

  it('does nothing while the instance has not turned push on', async () => {
    flag(FLAG, null)
    renderHook(() => usePushNotifications())
    await act(async () => undefined)
    expect(mockGetMessaging).not.toHaveBeenCalled()
    expect(mockSaveToken).not.toHaveBeenCalled()
  })

  it('does nothing in a build without a Firebase configuration', async () => {
    mockGetMessaging.mockImplementationOnce(() => {
      throw new Error("No Firebase App '[DEFAULT]' has been created")
    })
    renderHook(() => usePushNotifications())
    await act(async () => undefined)
    expect(mockSaveToken).not.toHaveBeenCalled()
  })

  it('registers the device token on the OAuth client', async () => {
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'fcm-token'))
  })

  it('registers the token the OS rotates to', async () => {
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockListeners.tokenRefresh).toBeDefined())
    mockListeners.tokenRefresh('rotated')
    expect(mockSaveToken).toHaveBeenLastCalledWith(mockClient, 'rotated')
  })

  it('clears the token when notifications are not allowed', async () => {
    mockRequestPermission.mockResolvedValueOnce(0)
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockRemoveToken).toHaveBeenCalledWith(mockClient))
    expect(mockSaveToken).not.toHaveBeenCalled()
  })

  it('opens the shares when a share push is tapped', async () => {
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockListeners.opened).toBeDefined())
    mockListeners.opened(sharingsPush)
    expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared')
  })

  it('opens the shares when the app was launched from a share push', async () => {
    mockGetInitialNotification.mockResolvedValueOnce(sharingsPush)
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared'))
  })

  it('syncs when a push lands in the foreground', async () => {
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockListeners.message).toBeDefined())
    mockListeners.message({})
    expect(mockTriggerReplication).toHaveBeenCalledWith(mockClient)
  })

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockListeners.message).toBeDefined())
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(3)
  })

  it('asks Android 13 and later for the notification permission', async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValueOnce('granted')
    const os = Platform.OS
    const version = Platform.Version
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    Object.defineProperty(Platform, 'Version', { value: 33, configurable: true })
    try {
      renderHook(() => usePushNotifications())
      await waitFor(() => expect(mockSaveToken).toHaveBeenCalled())
      expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
      Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
    }
  })

  it('registers a token that could not be had at first once it arrives', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('SERVICE_NOT_AVAILABLE'))
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockListeners.tokenRefresh).toBeDefined())
    await act(async () => undefined)
    expect(mockSaveToken).not.toHaveBeenCalled()
    mockListeners.tokenRefresh('late-token')
    expect(mockSaveToken).toHaveBeenCalledWith(mockClient, 'late-token')
  })

  it('opens the shares from a tap even when notifications are not allowed any more', async () => {
    mockRequestPermission.mockResolvedValueOnce(0)
    mockGetInitialNotification.mockResolvedValueOnce(sharingsPush)
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(drive)/shared'))
  })
})
