/**
 * Whether the app offers the "instance address" entry point.
 *
 * It exists for a development build, and for the end-to-end runs, which sign
 * into a stack created for the run and have no cloudery or OIDC discovery to
 * go through.
 *
 * It stays out of a shipped build. The screen takes a free-text address and
 * runs a full OAuth dance against it, so on a store build it is a phishing
 * lever: everything downstream — server flags, shortcut targets, editor links,
 * and the documents the user goes on to upload — trusts whatever host comes
 * back. That is also why it accepts `http://`, which only makes sense against
 * a local disposable stack.
 */
export const isDevInstanceLoginEnabled = (): boolean =>
  __DEV__ || process.env.EXPO_PUBLIC_E2E === '1'
