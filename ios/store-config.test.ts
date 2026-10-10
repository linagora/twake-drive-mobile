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

  it('declares user-generated content and nothing else sensitive', () => {
    const rating = JSON.parse(read('fastlane/age_rating.json')) as Record<string, unknown>
    const { userGeneratedContent, ...others } = rating

    expect(userGeneratedContent).toBe(true)
    expect(Object.keys(others).length).toBeGreaterThan(0)
    expect(Object.values(others).every(v => v === 'NONE' || v === false)).toBe(true)
  })
})
