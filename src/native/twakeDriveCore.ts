import { requireOptionalNativeModule } from 'expo'

interface TwakeDriveCoreNative {
  md5File: (path: string) => Promise<string>
}

const native = requireOptionalNativeModule<TwakeDriveCoreNative>('TwakeDriveCore')

/** Null where the Rust core is not built in (Android, for now). */
export const md5File = async (path: string): Promise<string | null> =>
  native ? native.md5File(path) : null
