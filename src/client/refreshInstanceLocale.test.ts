import { refreshInstanceLocale } from './refreshInstanceLocale'

let mockOnline = true
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))
const mockSetInstanceLocale = jest.fn()
jest.mock('@/preferences/localePreference', () => ({
  setInstanceLocale: (locale: string) => mockSetInstanceLocale(locale)
}))

const clientAnswering = (fetchJSON: jest.Mock) =>
  ({ getStackClient: () => ({ fetchJSON }) }) as never

describe('refreshInstanceLocale', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
  })

  it('reads the locale from the stack and keeps it', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({ data: { attributes: { locale: 'fr' } } })
    await expect(refreshInstanceLocale(clientAnswering(fetchJSON))).resolves.toBe('fr')
    expect(fetchJSON).toHaveBeenCalledWith('GET', '/settings/instance')
    expect(mockSetInstanceLocale).toHaveBeenCalledWith('fr')
  })

  it('asks nothing offline', async () => {
    mockOnline = false
    const fetchJSON = jest.fn()
    await expect(refreshInstanceLocale(clientAnswering(fetchJSON))).resolves.toBeUndefined()
    expect(fetchJSON).not.toHaveBeenCalled()
  })

  it('keeps what it had when the stack fails', async () => {
    const fetchJSON = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(refreshInstanceLocale(clientAnswering(fetchJSON))).resolves.toBeUndefined()
    expect(mockSetInstanceLocale).not.toHaveBeenCalled()
  })
})
