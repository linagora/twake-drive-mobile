const reverse = (word: string): string => [...word].reverse().join('')

export const buildMatchQuery = (term: string): string | null => {
  const words = term
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0) return null
  return words.map(word => `(name:"${word}"* OR reversed:"${reverse(word)}"*)`).join(' AND ')
}
