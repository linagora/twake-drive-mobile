import { Platform } from 'react-native'
import type CozyClient from 'cozy-client'

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
  it('clears the token on the OAuth client', async () => {
    const { client, stackClient } = makeClient()
    await removeNotificationDeviceToken(client)
    expect(stackClient.updateInformation).toHaveBeenCalledWith(
      expect.objectContaining({ notificationDeviceToken: '' })
    )
  })
})
