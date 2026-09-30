const mockSyncSession = jest.fn(async () => true)
const mockClearSession = jest.fn(async () => true)

jest.mock('react-native', () => ({
  NativeModules: {
    TwakeAuthBridge: {
      syncSession: () => mockSyncSession(),
      clearSession: () => mockClearSession()
    }
  },
  Platform: { OS: 'ios' }
}))

jest.mock('./fileProviderDomain', () => ({
  ensureFileProviderDomain: jest.fn(async () => undefined),
  removeFileProviderDomain: jest.fn(async () => undefined)
}))

import { mirrorSessionToNative, clearNativeSession } from './twakeAuthBridge'
import { ensureFileProviderDomain, removeFileProviderDomain } from './fileProviderDomain'
import type { Session } from '@/auth/types'

const session = { uri: 'https://alice.example.com' } as Session

beforeEach(() => jest.clearAllMocks())

test('a stored session puts Twake Drive in Files', async () => {
  await mirrorSessionToNative(session)
  expect(ensureFileProviderDomain).toHaveBeenCalledTimes(1)
  expect(mockSyncSession).not.toHaveBeenCalled()
})

test('a cleared session takes Twake Drive out of Files', async () => {
  await clearNativeSession()
  expect(removeFileProviderDomain).toHaveBeenCalledTimes(1)
  expect(mockClearSession).not.toHaveBeenCalled()
})
