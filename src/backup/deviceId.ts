import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

const DEVICE_ID_KEY = 'twake-drive-backup-device-id'

// THIS_DEVICE_ONLY: a phone restored from another one's backup gets its own
// id, hence its own Drive folder. The keychain keeps the id across a
// reinstall in practice, so the phone finds its folder again.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
}

/** The id this phone tags its backup folder with, created once. */
export const backupDeviceId = async (): Promise<string> => {
  const known = await SecureStore.getItemAsync(DEVICE_ID_KEY, OPTIONS)
  if (known) return known
  const created = Crypto.randomUUID()
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created, OPTIONS)
  return created
}
