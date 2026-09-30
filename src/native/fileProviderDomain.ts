import { NativeModules, Platform } from 'react-native'

interface FileProviderDomainNative {
  ensure: () => Promise<void>
  remove: () => Promise<void>
}

const native: FileProviderDomainNative | undefined = NativeModules.TwakeFileProviderDomain as
  | FileProviderDomainNative
  | undefined

/** Registers the iOS File Provider domain, so Twake Drive shows up in Files. */
export const ensureFileProviderDomain = async (): Promise<void> => {
  if (Platform.OS !== 'ios' || !native) return
  try {
    await native.ensure()
  } catch (err) {
    console.warn('[fileProviderDomain] could not register the domain', err)
  }
}

/**
 * Removes the iOS File Provider domain: Twake Drive leaves Files, and the
 * system deletes the copies it kept for it.
 */
export const removeFileProviderDomain = async (): Promise<void> => {
  if (Platform.OS !== 'ios' || !native) return
  try {
    await native.remove()
  } catch (err) {
    console.warn('[fileProviderDomain] could not remove the domain', err)
  }
}
