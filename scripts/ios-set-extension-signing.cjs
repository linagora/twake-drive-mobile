#!/usr/bin/env node
// Set per-target MANUAL signing (match profiles) on the app + the Share Extension
// + the File Provider extension. gym archives multiple targets; a single global
// PROVISIONING_PROFILE_SPECIFIER in the Fastfile xcargs would force the app's profile
// onto the extensions and break the archive. Instead each target carries its own match
// profile here. Run once (idempotent).
const fs = require('fs')
const xcode = require('xcode')

const PBX = 'ios/TwakeDrive.xcodeproj/project.pbxproj'
const proj = xcode.project(PBX)
proj.parseSync()

const TARGETS = {
  TwakeDrive: 'match AppStore com.linagora.twakedrive',
  TwakeDriveShareExt: 'match AppStore com.linagora.twakedrive.ShareExt',
  TwakeDriveFileProviderExt: 'match AppStore com.linagora.twakedrive.FileProvider'
}

for (const [name, profile] of Object.entries(TARGETS)) {
  // build=null -> all configs of the target; targetName filters to that target.
  proj.updateBuildProperty('CODE_SIGN_STYLE', 'Manual', null, name)
  proj.updateBuildProperty('CODE_SIGN_IDENTITY', '"Apple Distribution"', null, name)
  proj.updateBuildProperty('PROVISIONING_PROFILE_SPECIFIER', `"${profile}"`, null, name)
}

fs.writeFileSync(PBX, proj.writeSync())
console.log('per-target signing set for', Object.keys(TARGETS).join(' + '))
