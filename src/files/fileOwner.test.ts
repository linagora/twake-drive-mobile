import { fileOwnerLabel } from './fileOwner'

const me = { name: 'Quentin V', email: 'q@example.test' }
const stack = 'https://mine.twake.test'

describe('fileOwnerLabel', () => {
  it('names the user for a document created on their own instance', () => {
    const file = { cozyMetadata: { createdOn: 'https://mine.twake.test/' } }
    expect(fileOwnerLabel(file, me, stack)).toBe('Quentin V')
  })

  it('names the user for a document that says nothing about its origin', () => {
    expect(fileOwnerLabel({ cozyMetadata: {} }, me, stack)).toBe('Quentin V')
  })

  it('names the instance a shared document came from', () => {
    const file = { cozyMetadata: { createdOn: 'https://benji.mycozy.cloud/' } }
    expect(fileOwnerLabel(file, me, stack)).toBe('benji.mycozy.cloud')
  })

  it('falls back to the email when the instance has no public name', () => {
    expect(fileOwnerLabel({}, { email: 'q@example.test' }, stack)).toBe('q@example.test')
  })

  it('has nothing to show when the user is unknown', () => {
    expect(fileOwnerLabel({}, {}, stack)).toBeNull()
  })
})
