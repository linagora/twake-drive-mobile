// Ported from twake-drive web: src/modules/paste/utils.js

const parseName = (
  name: string,
  isFileItem: boolean
): { base: string; extension: string; suffix: number | null } => {
  let base = name
  let extension = ''
  let suffix: number | null = null

  if (isFileItem) {
    const lastDotIndex = name.lastIndexOf('.')
    if (lastDotIndex > 0) {
      base = name.substring(0, lastDotIndex)
      extension = name.substring(lastDotIndex)
    }
  }

  const match = base.match(/^(.*)\s\((\d+)\)$/)
  if (match) {
    base = match[1]
    suffix = parseInt(match[2], 10)
  }

  return { base, extension, suffix }
}

export const generateUniqueNameWithSuffix = (
  originalName: string,
  existingNames: Set<string>,
  isFileItem: boolean
): string => {
  if (!existingNames.has(originalName)) {
    return originalName
  }

  const { base, extension, suffix } = parseName(originalName, isFileItem)

  let counter = suffix ? suffix + 1 : 1
  let newName: string

  do {
    newName = `${base} (${counter})${extension}`
    counter++
  } while (existingNames.has(newName))

  return newName
}
