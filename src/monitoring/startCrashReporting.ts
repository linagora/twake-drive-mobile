import { initCrashReporting } from './crashReporting'

// Imported for its side effect, before the router, so the native handlers are
// in place as early as an opted-in user can crash.
initCrashReporting()
