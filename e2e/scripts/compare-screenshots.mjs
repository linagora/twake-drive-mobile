#!/usr/bin/env node
// Pixel-diff a Maestro screenshot run against the committed baseline.
//
//   node e2e/scripts/compare-screenshots.mjs --current DIR [--update]
//
// Exits 1 when a shot drifts past the tolerance, when the baseline is missing,
// or when a baseline has no matching shot in the run (a renamed or deleted
// step must be an explicit baseline update, not a silent pass).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHOTS = join(ROOT, 'e2e/maestro/screenshots')

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const currentDir = value('current', join(SHOTS, 'current'))
const baselineDir = value('baseline', join(SHOTS, 'baseline'))
const diffDir = value('diff', join(SHOTS, 'diff'))
const update = flag('update')
// The status bar clock changes every minute, so the top band would make every
// run differ. Expressed in device pixels, matching the raw simulator capture.
const maskTop = Number(value('mask-top', 120))
// Share of pixels allowed to differ before a shot is called a regression. Small
// but non-zero: font rasterisation and shadow dithering wobble by a few pixels.
const tolerance = Number(value('tolerance', 0.005))

const pngsIn = dir =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(f => f.endsWith('.png'))
        .sort()
    : []

const maskBand = png => {
  // Neutralise the band on both sides so pixelmatch sees identical pixels there.
  for (let y = 0; y < Math.min(maskTop, png.height); y++) {
    for (let x = 0; x < png.width; x++) {
      png.data.fill(0, (png.width * y + x) << 2, ((png.width * y + x) << 2) + 4)
    }
  }
  return png
}

const read = file => maskBand(PNG.sync.read(readFileSync(file)))

const shots = pngsIn(currentDir)
if (shots.length === 0) {
  console.error(`No screenshot found in ${currentDir}. Did the flow run?`)
  process.exit(1)
}

if (update) {
  mkdirSync(baselineDir, { recursive: true })
  for (const name of shots) {
    writeFileSync(join(baselineDir, name), readFileSync(join(currentDir, name)))
  }
  console.log(`Baseline updated: ${shots.length} screenshot(s) in ${baselineDir}`)
  process.exit(0)
}

mkdirSync(diffDir, { recursive: true })
const failures = []

for (const name of shots) {
  const baselineFile = join(baselineDir, name)
  if (!existsSync(baselineFile)) {
    failures.push(`${name}: no baseline (run with --update to accept it)`)
    continue
  }

  const current = read(join(currentDir, name))
  const baseline = read(baselineFile)

  if (current.width !== baseline.width || current.height !== baseline.height) {
    failures.push(
      `${name}: size ${current.width}x${current.height} vs baseline ` +
        `${baseline.width}x${baseline.height} (different simulator?)`
    )
    continue
  }

  const diff = new PNG({ width: current.width, height: current.height })
  const changed = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    current.width,
    current.height,
    { threshold: 0.1 }
  )
  const ratio = changed / (current.width * current.height)

  if (ratio > tolerance) {
    writeFileSync(join(diffDir, name), PNG.sync.write(diff))
    failures.push(
      `${name}: ${(ratio * 100).toFixed(2)}% of pixels differ ` +
        `(tolerance ${(tolerance * 100).toFixed(2)}%) -> ${join(diffDir, name)}`
    )
  } else {
    console.log(`  ok   ${name}  (${(ratio * 100).toFixed(2)}%)`)
  }
}

// A baseline with no shot means the flow no longer produces it.
const orphans = pngsIn(baselineDir).filter(name => !shots.includes(name))
for (const name of orphans) {
  failures.push(`${name}: baseline has no matching screenshot in this run`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} screenshot(s) failed:`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)
  console.error(`\nReview the diffs, then accept them with:`)
  console.error(`  node ${basename(process.argv[1])} --current ${currentDir} --update`)
  process.exit(1)
}

console.log(`\n${shots.length} screenshot(s) match the baseline.`)
