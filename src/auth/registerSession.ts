import CozyClient from 'cozy-client'

import { Session } from './types'

interface RegisterParams {
  fqdn: string
  registerToken: string
}

export const registerSession = async ({
  fqdn,
  registerToken
}: RegisterParams): Promise<Session> => {
  const uri = `https://${fqdn}`
  const client = new CozyClient({ uri })

  const stackClient = client.getStackClient()
  const oauthOptions = {
    clientName: 'Twake Drive Mobile',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'twakedrive://',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files', 'io.cozy.files.shared-with-me']
  }

  await stackClient.register(oauthOptions)
  const token = await stackClient.fetchAccessToken(registerToken)

  return {
    uri,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken
  }
}
