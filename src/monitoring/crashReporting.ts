import Constants from 'expo-constants'
import * as Sentry from '@sentry/react-native'

import { areCrashReportsEnabled, onCrashReportsPreferenceChange } from './crashReportsPreference'

const DSN = 'https://17a748055f94caf46e9f1444068ac615@errors.cozycloud.cc/88'

/** An instance address names the user's server, and a token is a credential.
 *  Neither belongs in a crash report. */
const SENSITIVE_QUERY_KEYS = ['session_code', 'code', 'access_token', 'refresh_token', 'state']

const environment = (): string => {
  if (__DEV__) return 'development'
  const version = Constants.expoConfig?.version ?? ''
  return /-(rc|beta|alpha)/i.test(version) ? 'internal' : 'production'
}

/** `0.5.0-rc.1` and `0.5.0` are different releases; the build number tells two
 *  builds of the same version apart. */
const release = (): string => `com.linagora.twakedrive@${Constants.expoConfig?.version ?? '0.0.0'}`

const buildNumber = (): string | undefined => {
  const native = (Constants as unknown as { nativeBuildVersion?: string | number | null })
    .nativeBuildVersion
  return native === null || native === undefined ? undefined : String(native)
}

/**
 * Strips what identifies the user or their server out of a URL, keeping enough
 * of it to tell one route from another.
 */
export const scrubUrl = (value: string): string => {
  try {
    const url = new URL(value)
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]')
    }
    return `${url.protocol}//[instance]${url.pathname}${url.search}`
  } catch {
    return value
  }
}

const scrubStrings = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return value
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? scrubUrl(value) : value
  if (Array.isArray(value)) return value.map(item => scrubStrings(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        scrubStrings(item, depth + 1)
      ])
    )
  }
  return value
}

/**
 * Last gate before anything is sent. The defaults are not trusted with this:
 * an instance address, a session code or a document name in a breadcrumb would
 * all be ordinary strings to them.
 */
export const beforeSend = (event: Sentry.ErrorEvent): Sentry.ErrorEvent | null => {
  if (!areCrashReportsEnabled()) return null
  const scrubbed = scrubStrings(event) as Sentry.ErrorEvent
  delete scrubbed.user
  delete scrubbed.server_name
  return scrubbed
}

const options = (): Parameters<typeof Sentry.init>[0] => ({
  dsn: DSN,
  environment: environment(),
  release: release(),
  dist: buildNumber(),
  // Crashes only: no performance tracing, no spans, no profiling.
  tracesSampleRate: 0,
  enableAutoPerformanceTracing: false,
  sendDefaultPii: false,
  // React warnings are not incidents, the same reflex as the web client.
  ignoreErrors: [/^Warning: /],
  beforeSend
})

let started = false
let wired = false

/**
 * Starts crash reporting, or does not.
 *
 * Nothing is initialised while the preference is off, so a fresh install has
 * no SDK running at all, JS or native, rather than one told to stay quiet.
 */
export const initCrashReporting = (): void => {
  if (areCrashReportsEnabled()) start()
  if (wired) return
  wired = true
  onCrashReportsPreferenceChange(() => {
    if (areCrashReportsEnabled()) start()
    else stop()
  })
}

const start = (): void => {
  if (started) return
  Sentry.init(options())
  started = true
}

const stop = (): void => {
  if (!started) return
  started = false
  // Closes the client and stops the native handlers with it.
  void Sentry.close()
}

/** Reports a failure the app caught itself, e.g. the error boundary. */
export const reportCaughtError = (error: Error, context?: Record<string, unknown>): void => {
  if (!areCrashReportsEnabled()) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}
