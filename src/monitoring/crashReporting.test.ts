const mockInit = jest.fn()
const mockClose = jest.fn().mockResolvedValue(true)
const mockCaptureException = jest.fn()

jest.mock('@sentry/react-native', () => ({
  __esModule: true,
  init: (...args: unknown[]) => mockInit(...args),
  close: () => mockClose(),
  captureException: (...args: unknown[]) => mockCaptureException(...args)
}))

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>()
  return {
    createMMKV: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value)
    })
  }
})

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.5.0' }, nativeBuildVersion: '42' }
}))

import { beforeSend, initCrashReporting, reportCaughtError, scrubUrl } from './crashReporting'
import { areCrashReportsEnabled, setCrashReportsEnabled } from './crashReportsPreference'

describe('the crash reports preference', () => {
  it('is off on a fresh install', () => {
    expect(areCrashReportsEnabled()).toBe(false)
  })
})

describe('initCrashReporting', () => {
  beforeEach(() => {
    // The fixture first, then a clean slate: turning the switch off is itself
    // something the reporting side reacts to.
    setCrashReportsEnabled(false)
    jest.clearAllMocks()
  })

  // A fresh install must have no SDK running at all, JS or native, rather than
  // one initialised and told to stay quiet.
  it('starts nothing while the switch is off', () => {
    initCrashReporting()

    expect(mockInit).not.toHaveBeenCalled()
  })

  it('starts when the user turns it on, without a restart', () => {
    initCrashReporting()

    setCrashReportsEnabled(true)

    expect(mockInit).toHaveBeenCalledTimes(1)
  })

  it('stops the native side when the user turns it off again', () => {
    initCrashReporting()
    setCrashReportsEnabled(true)

    setCrashReportsEnabled(false)

    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('asks for crashes only, never performance', () => {
    const dev = __DEV__
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = false
    initCrashReporting()
    setCrashReportsEnabled(true)
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = dev

    const options = mockInit.mock.calls[0][0] as {
      tracesSampleRate: number
      enableAutoPerformanceTracing: boolean
      sendDefaultPii: boolean
      release: string
      dist?: string
      environment: string
    }
    expect(options.tracesSampleRate).toBe(0)
    expect(options.enableAutoPerformanceTracing).toBe(false)
    expect(options.sendDefaultPii).toBe(false)
    expect(options.release).toBe('com.linagora.twakedrive@0.5.0')
    expect(options.dist).toBe('42')
    expect(options.environment).toBe('production')
  })
})

describe('scrubUrl', () => {
  it('drops the instance address, which names the user and their server', () => {
    expect(scrubUrl('https://alice.twake.app/files/download/abc')).toBe(
      'https://[instance]/files/download/abc'
    )
  })

  it('redacts a credential travelling in the query', () => {
    const scrubbed = scrubUrl('https://alice.twake.app/?session_code=s3cr3t&other=keep')

    expect(scrubbed).toContain('session_code=%5Bredacted%5D')
    expect(scrubbed).not.toContain('s3cr3t')
    expect(scrubbed).toContain('other=keep')
  })

  it('leaves something that is not a URL alone', () => {
    expect(scrubUrl('rapport annuel.docx')).toBe('rapport annuel.docx')
  })
})

describe('beforeSend', () => {
  beforeEach(() => setCrashReportsEnabled(false))

  // The last gate: a race between a toggle and an event in flight must not
  // send anything.
  it('sends nothing while the switch is off', () => {
    expect(beforeSend({ message: 'boom' } as never)).toBeNull()
  })

  it('scrubs the addresses buried in the event', () => {
    setCrashReportsEnabled(true)

    const event = beforeSend({
      message: 'failed',
      breadcrumbs: [{ data: { url: 'https://alice.twake.app/files/download/abc?code=zzz' } }],
      user: { id: 'alice' },
      server_name: 'alice.twake.app'
    } as never) as unknown as {
      breadcrumbs: { data: { url: string } }[]
      user?: unknown
      server_name?: unknown
    }

    expect(event.breadcrumbs[0].data.url).toBe(
      'https://[instance]/files/download/abc?code=%5Bredacted%5D'
    )
    expect(event.user).toBeUndefined()
    expect(event.server_name).toBeUndefined()
  })
})

describe('reportCaughtError', () => {
  beforeEach(() => {
    // The fixture first, then a clean slate: turning the switch off is itself
    // something the reporting side reacts to.
    setCrashReportsEnabled(false)
    jest.clearAllMocks()
  })

  it('keeps quiet while the switch is off', () => {
    reportCaughtError(new Error('boom'))

    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('reports once the user has opted in', () => {
    setCrashReportsEnabled(true)

    reportCaughtError(new Error('boom'), { componentStack: 'x' })

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })
})
