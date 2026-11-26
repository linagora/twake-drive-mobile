import { Platform } from 'react-native'
import type CozyClient from 'cozy-client'

// What the app keeps across launches.
const mockStored = new Map<string, string>()
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    remove: (key: string) => mockStored.delete(key)
  })
}))

import {
  removeNotificationDeviceToken,
  saveNotificationDeviceToken
} from './notificationDeviceToken'

const oauthOptions = {
  clientID: 'cid',
  clientSecret: 'secret',
  clientName: 'Twake Drive Mobile',
  softwareID: 'twake-drive-mobile',
  redirectURI: 'twakedrive://',
  clientKind: 'mobile',
  clientURI: 'https://twake.app',
  scopes: ['io.cozy.files'],
  registrationAccessToken: 'rat'
}

interface FakeStackClient {
  oauthOptions: Record<string, unknown>
  updateInformation: jest.Mock<Promise<Record<string, unknown>>, [Record<string, string>]>
}

const makeClient = (): { client: CozyClient; stackClient: FakeStackClient } => {
  const stackClient: FakeStackClient = {
    oauthOptions: { ...oauthOptions },
    updateInformation: jest.fn(async (_information: Record<string, string>) => {
      // What cozy-stack-client does with the stack's answer: it replaces its
      // options, and the answer has no registration token.
      stackClient.oauthOptions = {
        client_id: 'cid',
        client_secret: 'secret',
        redirect_uris: ['twakedrive://']
      }
      return stackClient.oauthOptions
    })
  }
  const client = { getStackClient: () => stackClient } as unknown as CozyClient
  return { client, stackClient }
}

describe('saveNotificationDeviceToken', () => {
  it('sends the token with the fields the stack would otherwise blank, never the secret', async () => {
    const { client, stackClient } = makeClient()
    await saveNotificationDeviceToken(client, 'fcm-token')
    expect(stackClient.updateInformation).toHaveBeenCalledWith({
      notificationPlatform: Platform.OS,
      notificationDeviceToken: 'fcm-token',
      clientKind: 'mobile',
      clientURI: 'https://twake.app'
    })
  })

  // A second update (a rotated token, the clear at logout) needs the
  // registration token, and a refresh needs the client secret.
  it('keeps the client options the update would have lost', async () => {
    const { client, stackClient } = makeClient()
    await saveNotificationDeviceToken(client, 'fcm-token')
    expect(stackClient.oauthOptions).toEqual({
      ...oauthOptions,
      notificationPlatform: Platform.OS,
      notificationDeviceToken: 'fcm-token'
    })
  })
})

describe('removeNotificationDeviceToken', () => {
  beforeEach(() => mockStored.clear())

  it('clears a registered token on the OAuth client, once', async () => {
    const { client, stackClient } = makeClient()
    await saveNotificationDeviceToken(client, 'fcm-token')
    stackClient.updateInformation.mockClear()
    await removeNotificationDeviceToken(client)
    expect(stackClient.updateInformation).toHaveBeenCalledWith(
      expect.objectContaining({ notificationDeviceToken: '' })
    )
    await removeNotificationDeviceToken(client)
    expect(stackClient.updateInformation).toHaveBeenCalledTimes(1)
  })

  // Push off, or not allowed: every launch would otherwise update the client.
  it('sends nothing when no token was registered', async () => {
    const { client, stackClient } = makeClient()
    await removeNotificationDeviceToken(client)
    expect(stackClient.updateInformation).not.toHaveBeenCalled()
  })

  it('keeps the token to clear when the stack could not be reached', async () => {
    const { client, stackClient } = makeClient()
    await saveNotificationDeviceToken(client, 'fcm-token')
    stackClient.updateInformation.mockRejectedValueOnce(new Error('offline'))
    await expect(removeNotificationDeviceToken(client)).rejects.toThrow('offline')
    await removeNotificationDeviceToken(client)
    expect(stackClient.updateInformation).toHaveBeenLastCalledWith(
      expect.objectContaining({ notificationDeviceToken: '' })
    )
  })
})
