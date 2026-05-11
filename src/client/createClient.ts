import CozyClient from 'cozy-client'
import flag from 'cozy-flags'

import { Session } from '@/auth/types'

export const createClient = (session: Session): CozyClient => {
  console.log(
    '[createClient] uri',
    session.uri,
    'clientID',
    session.oauthOptions.clientID,
    'tokenLen',
    session.token.accessToken?.length ?? 0
  )
  const client = new CozyClient({
    uri: session.uri,
    oauth: { ...session.oauthOptions, token: session.token },
    scope: ['*'],
    appMetadata: {
      slug: 'twake-drive-mobile',
      version: '0.1.0'
    }
  })
  void client.registerPlugin(flag.plugin, null)
  return client
}
