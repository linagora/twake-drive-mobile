/**
 * Whether the app offers the "instance address" entry point.
 *
 * It exists for a development build, and for the end-to-end runs, which sign
 * into a stack created for the run and have no cloudery or OIDC discovery to
 * go through. A shipped build has neither of those and never shows it.
 */
export const isDevInstanceLoginEnabled = (): boolean =>
  __DEV__ || process.env.EXPO_PUBLIC_E2E === '1'
