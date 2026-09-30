jest.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'ios' } }))

import { ensureFileProviderDomain, removeFileProviderDomain } from './fileProviderDomain'

test('does nothing when the native module is absent', async () => {
  await expect(ensureFileProviderDomain()).resolves.toBeUndefined()
  await expect(removeFileProviderDomain()).resolves.toBeUndefined()
})
