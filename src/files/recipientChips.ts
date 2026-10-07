// Pure helpers behind the recipient chips of the share sheet: what counts as a
// finished recipient, and how typed text turns into chips.

import type { RecipientInput } from '@/files/sharing'

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim())

/**
 * Split typed text into the emails that are finished (valid, followed by a
 * separator: comma, semicolon or whitespace) and the text left to edit. A
 * finished token that is not a valid email stays in the text rather than being
 * dropped, so the user can fix it.
 */
export const extractEmails = (text: string): { emails: string[]; rest: string } => {
  const tokens = text.split(/[\s,;]+/)
  const endsWithSeparator = /[\s,;]$/.test(text)
  const finished = endsWithSeparator ? tokens : tokens.slice(0, -1)
  const pending = endsWithSeparator ? [] : tokens.slice(-1)
  const emails: string[] = []
  const kept: string[] = []
  for (const token of finished) {
    if (token === '') continue
    if (isValidEmail(token)) emails.push(token)
    else kept.push(token)
  }
  return { emails, rest: [...kept, ...pending].join(' ') }
}

export const hasEmail = (list: readonly string[], email: string): boolean => {
  const target = email.trim().toLowerCase()
  return list.some(e => e.trim().toLowerCase() === target)
}

/** Chips with `chip` appended, unless one for the same email is already there. */
export const appendChip = (
  chips: readonly RecipientInput[],
  chip: RecipientInput
): RecipientInput[] =>
  hasEmail(
    chips.map(c => c.email),
    chip.email
  )
    ? [...chips]
    : [...chips, { ...chip, email: chip.email.trim() }]
