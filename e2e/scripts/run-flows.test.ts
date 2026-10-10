import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, 'run-flows.sh')

// The fake maestro hangs or fails according to the flow's file name. A marker
// file per flow tells a first attempt from a second one.
const FAKE_MAESTRO = `#!/usr/bin/env bash
flow="\${@: -1}"
name="$(basename "$flow" .yaml)"
case "$name" in
  hang-once)
    if [ ! -e "$FAKE_STATE/$name" ]; then touch "$FAKE_STATE/$name"; exec sleep 60; fi ;;
  hang-twice*) exec sleep 60 ;;
  fail) exit 1 ;;
esac
exit 0
`

// Logs every call, and answers the boot probe the driver reset waits on.
const FAKE_ADB = `#!/usr/bin/env bash
echo "$*" >>"$FAKE_STATE/adb.log"
case "$*" in *sys.boot_completed*) echo 1 ;; esac
exit 0
`

const FAKE_OK = '#!/usr/bin/env bash\nexit 0\n'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-flows-'))
  const bin = path.join(tmp, 'bin')
  fs.mkdirSync(bin)
  fs.mkdirSync(path.join(tmp, 'state'))
  fs.mkdirSync(path.join(tmp, 'flows'))
  fs.writeFileSync(path.join(bin, 'maestro'), FAKE_MAESTRO, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'adb'), FAKE_ADB, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'docker'), FAKE_OK, { mode: 0o755 })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function runFlow(name: string) {
  const flow = path.join(tmp, 'flows', `${name}.yaml`)
  fs.writeFileSync(flow, 'appId: com.example\n---\n- launchApp\n')
  const result = spawnSync('bash', [SCRIPT, flow], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // maestro.sh puts $HOME/.maestro/bin first: an empty HOME keeps a real maestro out.
      HOME: tmp,
      PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}`,
      FAKE_STATE: path.join(tmp, 'state'),
      REPORTS_DIR: path.join(tmp, 'reports'),
      E2E_FLOW_TIMEOUT: '1s',
      INSTANCE_DOMAIN: 'alice.example',
      INSTANCE_PASSPHRASE: 'secret',
      STACK_CONTAINER: 'stack'
    }
  })
  const report = (file: string) => fs.readFileSync(path.join(tmp, 'reports', file), 'utf8')
  const adbCalls = () => fs.readFileSync(path.join(tmp, 'state', 'adb.log'), 'utf8')
  return { status: result.status, out: result.stdout, report, adbCalls }
}

describe('run-flows.sh', () => {
  it('retries a flow that hangs once and reports it as passed on retry', () => {
    const { status, out, report, adbCalls } = runFlow('hang-once')

    expect(status).toBe(0)
    expect(adbCalls()).toContain('forward --remove-all')
    expect(adbCalls()).toContain('shell am force-stop dev.mobile.maestro.test')
    expect(out).toContain('[Retried] hang-once (timed out after 1s)')
    expect(out).toContain('| hang-once | 🔁 passed on retry')
    expect(report('hang-once.attempt1.xml')).toContain('<skipped message="timed out after 1s"/>')
  })

  it('fails a flow that hangs twice', () => {
    const { status, out, report } = runFlow('hang-twice')

    expect(status).not.toBe(0)
    expect(out).toContain('[Timed out twice] hang-twice')
    expect(out).toContain('| hang-twice | ❌ timed out twice')
    expect(report('hang-twice.xml')).toContain('<failure message="timed out after 1s"/>')
  })

  it('does not retry an assertion failure', () => {
    const { status, out } = runFlow('fail')

    expect(status).not.toBe(0)
    expect(out).not.toContain('[Retried]')
    expect(out).toContain('| fail | ❌ |')
  })

  it('escapes the flow name in the report', () => {
    const { report } = runFlow('hang-twice&<x>')

    expect(report('hang-twice&<x>.xml')).toContain('classname="hang-twice&amp;&lt;x&gt;"')
  })
})
