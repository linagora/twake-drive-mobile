const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()

/** Keeps the documents whose name contains `term`, ignoring case and accents. */
export const filterByName = <T extends { name?: string }>(items: T[], term: string): T[] => {
  const needle = fold(term.trim())
  if (!needle) return items
  return items.filter(item => fold(item.name ?? '').includes(needle))
}
