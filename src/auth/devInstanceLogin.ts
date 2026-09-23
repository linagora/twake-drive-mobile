/**
 * Whether the app offers the "instance address" entry point.
 *
 * It exists for a development build, and for the end-to-end runs, which sign
 * into a stack created for the run and have no cloudery or OIDC discovery to
 * go through. It is on everywhere for now, so the entry point can be tried
 * from TestFlight and the Play internal track.
 */
export const isDevInstanceLoginEnabled = (): boolean => true
