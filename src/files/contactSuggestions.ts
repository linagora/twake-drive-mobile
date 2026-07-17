// Pure helpers for the contact email autocomplete used by ShareSheet.
// Mirrors cozy-sharing's web ShareAutosuggest filtering: client-side substring
// matching against displayName, primary email, and any secondary emails. Kept
// free of React / cozy-client so the logic is trivially unit-testable.

import { ContactQueryResult } from '@/client/queries'

export interface ContactSuggestion {
  _id: string
  displayName: string
  email: string
  secondaryEmails: string[]
}

const MAX_SUGGESTIONS = 8

const trimOrUndefined = (s: string | undefined): string | undefined => {
  if (!s) return undefined
  const trimmed = s.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const contactDisplayName = (contact: ContactQueryResult): string | undefined => {
  const full = trimOrUndefined(contact.fullname)
  if (full) return full
  const givenAndFamily = [contact.name?.givenName, contact.name?.familyName]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (givenAndFamily) return givenAndFamily
  return undefined
}

export const contactPrimaryEmail = (contact: ContactQueryResult): string | undefined => {
  const emails = contact.email ?? []
  const primary = emails.find(e => e.primary)?.address
  return primary ?? emails[0]?.address
}

export const toSuggestion = (contact: ContactQueryResult): ContactSuggestion | null => {
  const email = contactPrimaryEmail(contact)
  if (!email) return null
  const display = contactDisplayName(contact) ?? email
  const secondary = (contact.email ?? []).map(e => e.address).filter(a => !!a && a !== email)
  return { _id: contact._id, displayName: display, email, secondaryEmails: secondary }
}

const normalize = (s: string): string => s.trim().toLowerCase()

export const filterContactSuggestions = (
  contacts: readonly ContactQueryResult[],
  query: string,
  excludeEmails: readonly string[] = []
): ContactSuggestion[] => {
  const q = normalize(query)
  const exclude = new Set(excludeEmails.map(e => e.toLowerCase()))
  const all = contacts.map(toSuggestion).filter((s): s is ContactSuggestion => s !== null)
  if (q.length === 0) {
    return all.filter(s => !exclude.has(s.email.toLowerCase())).slice(0, MAX_SUGGESTIONS)
  }
  const matches = all.filter(s => {
    if (exclude.has(s.email.toLowerCase())) return false
    if (s.displayName.toLowerCase().includes(q)) return true
    if (s.email.toLowerCase().includes(q)) return true
    return s.secondaryEmails.some(e => e.toLowerCase().includes(q))
  })
  return matches.slice(0, MAX_SUGGESTIONS)
}

/**
 * Resolve a typed or selected email to an existing reachable contact's id.
 *
 * A sharing must reference a real io.cozy.contacts document; when the recipient
 * already exists in the address book (the common case for internal org users),
 * reuse its id instead of minting a throwaway contact — a fresh contact is
 * written to the local (offline) Pouch first and the stack cannot resolve it as
 * a recipient until it has replicated to the server. Full-address match only
 * (primary or any secondary email), case-insensitive.
 */
export const findContactIdByEmail = (
  contacts: readonly ContactQueryResult[],
  email: string
): string | undefined => {
  const target = normalize(email)
  if (target.length === 0) return undefined
  for (const contact of contacts) {
    const suggestion = toSuggestion(contact)
    if (!suggestion) continue
    if (suggestion.email.toLowerCase() === target) return suggestion._id
    if (suggestion.secondaryEmails.some(e => e.toLowerCase() === target)) return suggestion._id
  }
  return undefined
}
