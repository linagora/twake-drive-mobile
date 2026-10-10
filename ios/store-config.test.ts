import { readFileSync } from 'fs'
import { join } from 'path'

const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8')

describe('iOS store configuration', () => {
  it('targets iPhone only in every target', () => {
    const families = read('TwakeDrive.xcodeproj/project.pbxproj').match(
      /TARGETED_DEVICE_FAMILY = .*;/g
    )

    expect(families?.length).toBeGreaterThan(0)
    expect(new Set(families)).toEqual(new Set(['TARGETED_DEVICE_FAMILY = 1;']))
  })

  it('declares an age rating with no sensitive content', () => {
    const rating = JSON.parse(read('fastlane/age_rating.json')) as Record<string, unknown>

    expect(Object.keys(rating).length).toBeGreaterThan(0)
    expect(Object.values(rating).every(v => v === 'NONE' || v === false)).toBe(true)
  })
})
