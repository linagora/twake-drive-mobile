import flag from 'cozy-flags'

export const useFlag = (name: string): unknown => flag(name)
