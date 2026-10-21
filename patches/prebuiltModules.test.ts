import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const buildFromSource: string[] = packageJson.expo?.autolinking?.android?.buildFromSource ?? []

// Android takes a prebuilt Expo module from its local Maven repository, which
// ignores a patch to its sources unless the module is built from source.
test('every Android patch of a prebuilt Expo module is built from source', () => {
  const patchedForAndroid = readdirSync(__dirname)
    .filter(file => file.endsWith('.patch'))
    .filter(file => readFileSync(path.join(__dirname, file), 'utf8').includes('/android/'))
    .map(file => file.replace(/\+[^+]+\.patch$/, '').replace('+', '/'))
  const prebuilt = patchedForAndroid.filter(name =>
    existsSync(path.join(root, 'node_modules', name, 'local-maven-repo'))
  )
  for (const name of prebuilt) expect(buildFromSource).toContain(name)
})
