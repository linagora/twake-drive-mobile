import { appendChip, extractEmails, hasEmail, isValidEmail } from './recipientChips'

describe('isValidEmail', () => {
  it('accepts an address and rejects free text', () => {
    expect(isValidEmail('bob@example.com')).toBe(true)
    expect(isValidEmail(' bob@example.com ')).toBe(true)
    expect(isValidEmail('bob')).toBe(false)
    expect(isValidEmail('bob@example')).toBe(false)
    expect(isValidEmail('bob @example.com')).toBe(false)
  })
})

describe('extractEmails', () => {
  it('keeps text without a separator as is', () => {
    expect(extractEmails('bob@example.com')).toEqual({ emails: [], rest: 'bob@example.com' })
  })

  it('turns an address followed by a comma into a finished one', () => {
    expect(extractEmails('bob@example.com,')).toEqual({ emails: ['bob@example.com'], rest: '' })
  })

  it('handles a pasted list and keeps the unfinished tail', () => {
    expect(extractEmails('a@x.org; b@x.org carol')).toEqual({
      emails: ['a@x.org', 'b@x.org'],
      rest: 'carol'
    })
    expect(extractEmails('a@x.org, b@x.org ')).toEqual({
      emails: ['a@x.org', 'b@x.org'],
      rest: ''
    })
  })

  it('does not drop a finished token that is not an address', () => {
    expect(extractEmails('nope ')).toEqual({ emails: [], rest: 'nope' })
  })
})

describe('appendChip', () => {
  it('adds a chip once, whatever the case', () => {
    const one = appendChip([], { email: 'Bob@Example.com' })
    expect(appendChip(one, { email: 'bob@example.com' })).toEqual(one)
    expect(appendChip(one, { email: 'al@example.com' })).toHaveLength(2)
  })
})

describe('hasEmail', () => {
  it('compares case-insensitively', () => {
    expect(hasEmail(['Bob@Example.com'], 'bob@example.com')).toBe(true)
    expect(hasEmail([], 'bob@example.com')).toBe(false)
  })
})
