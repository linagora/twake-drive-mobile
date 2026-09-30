#!/usr/bin/env node
// Look through a Maestro recording for a screen that keeps changing on its own.
//
//   node e2e/scripts/check-recording.mjs --video FILE [--video FILE...]
//   node e2e/scripts/check-recording.mjs --dir ~/.maestro/tests
//
// A screen that swaps what it shows for a spinner and back leaves no trace in
// an assertion: the swap is shorter than the time Maestro takes to look. It
// does leave one in the frames. Record a window where nothing is being driven,
// and anything that moves in it is the app changing its mind.
//
// The measure is the difference between consecutive frames, downsampled: a
// still screen scores zero, a swap scores far above the noise. Exits 1 when a
// recording changes more than `--max-changes` times, saving the frames on both
// sides of each change next to the video so the run's artifacts carry it.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const values = name =>
  args.reduce(
    (acc, arg, i) => (arg === `--${name}` && args[i + 1] ? [...acc, args[i + 1]] : acc),
    []
  )
const value = (name, fallback) => values(name)[0] ?? fallback

const fps = Number(value('fps', 10))
// The band to watch, as a share of the height: below the app bar, the sort row
// and the sync progress bar, above the create button and the tab bar. What is
// left is what a list draws, and nothing that animates on its own.
const top = Number(value('top', 0.3))
const bottom = Number(value('bottom', 0.8))
// Mean absolute difference, on 0-255, above which two frames show different
// things. Video compression noise sits around 0, a state swap an order of
// magnitude higher.
const changeThreshold = Number(value('change-threshold', 1))
// Nothing drives the screen inside the window, so nothing should change. One
// is allowed for the frame the window opens on, which can catch a gesture.
const maxChanges = Number(value('max-changes', 1))

// Maestro files a recording under its own run directory, so this walks down.
const videosFromDir = dir =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap(entry =>
          entry.isDirectory()
            ? videosFromDir(join(dir, entry.name))
            : entry.name.endsWith('.mp4')
              ? [join(dir, entry.name)]
              : []
        )
    : []

const videos = [...values('video'), ...values('dir').flatMap(videosFromDir)]
if (videos.length === 0) {
  console.error('Nothing to check: pass --video FILE or --dir DIR holding .mp4 recordings.')
  process.exit(1)
}

const COLUMNS = 40
const ROWS = 50

/** Grey thumbnail of the watched band, small enough that noise averages out. */
const thumbnailOf = file => {
  const png = PNG.sync.read(readFileSync(file))
  const from = Math.floor(png.height * top)
  const to = Math.floor(png.height * bottom)
  const cellHeight = (to - from) / ROWS
  const cellWidth = png.width / COLUMNS
  const cells = new Array(COLUMNS * ROWS).fill(0)
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      let total = 0
      let n = 0
      const yEnd = Math.floor(from + (row + 1) * cellHeight)
      const xEnd = Math.floor((column + 1) * cellWidth)
      for (let y = Math.floor(from + row * cellHeight); y < yEnd; y += 2) {
        for (let x = Math.floor(column * cellWidth); x < xEnd; x += 2) {
          const i = (png.width * y + x) << 2
          total += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3
          n++
        }
      }
      cells[row * COLUMNS + column] = n > 0 ? total / n : 0
    }
  }
  return cells
}

const distance = (a, b) =>
  a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length

const failures = []

for (const video of videos) {
  if (!existsSync(video)) {
    failures.push(`${video}: no such recording`)
    continue
  }
  const frames = mkdtempSync(join(tmpdir(), 'twake-frames-'))
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-i',
    video,
    '-vf',
    `fps=${fps}`,
    join(frames, 'f-%04d.png')
  ])
  const files = readdirSync(frames)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => join(frames, f))
  if (files.length < 3) {
    // screenrecord only emits a frame when the screen changes: a screen that
    // never moved leaves a single frame, which is the still screen we want
    const emitted = Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-count_frames',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=nb_read_frames',
        '-of',
        'csv=p=0',
        video
      ])
        .toString()
        .trim()
    )
    if (emitted === 1) {
      console.log(`${basename(video, '.mp4')}: a single frame, the screen never changed`)
      continue
    }
    failures.push(`${video}: only ${files.length} frame(s), nothing to compare`)
    continue
  }

  const thumbnails = files.map(thumbnailOf)
  const changes = []
  for (let i = 1; i < thumbnails.length; i++) {
    const d = distance(thumbnails[i - 1], thumbnails[i])
    if (d > changeThreshold) changes.push({ frame: i + 1, distance: d })
  }

  const name = basename(video, '.mp4')
  console.log(
    `${name}: ${files.length} frames at ${fps} fps, ${changes.length} change(s) over ${changeThreshold}`
  )

  if (changes.length > maxChanges) {
    const out = join(dirname(video), `${name}-changes`)
    mkdirSync(out, { recursive: true })
    for (const { frame } of changes.slice(0, 6)) {
      for (const index of [frame - 2, frame - 1]) {
        if (files[index]) {
          writeFileSync(
            join(out, `frame-${String(index + 1).padStart(4, '0')}.png`),
            readFileSync(files[index])
          )
        }
      }
    }
    failures.push(
      `${name}: the screen changed ${changes.length} times while nothing was driving it ` +
        `(frames ${changes.map(({ frame }) => frame).join(', ')}); saved to ${out}`
    )
  }
}

if (failures.length > 0) {
  console.error('\nA recording did not hold still:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`\n${videos.length} recording(s) held still.`)
