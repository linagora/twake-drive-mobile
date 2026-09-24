#!/usr/bin/env node
// Set per-target signing on the app + the Share Extension + the File Provider
// extension. gym archives multiple targets; a single global
// PROVISIONING_PROFILE_SPECIFIER in the Fastfile xcargs would force the app's profile
// onto the extensions and break the archive. Instead each target carries its own match
// profile here. Run once (idempotent).
//
// Release only. The match profiles are App Store distribution ones: they carry
// neither associated-domains nor the App Attest environment the app entitles,
// and a developer machine has no distribution certificate. Debug is left on
// automatic signing so `expo run:ios --device` works.
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
  proj.updateBuildProperty('CODE_SIGN_STYLE', 'Manual', 'Release', name)
  proj.updateBuildProperty('CODE_SIGN_IDENTITY', '"Apple Distribution"', 'Release', name)
  proj.updateBuildProperty('PROVISIONING_PROFILE_SPECIFIER', `"${profile}"`, 'Release', name)

  proj.updateBuildProperty('CODE_SIGN_STYLE', 'Automatic', 'Debug', name)
  proj.updateBuildProperty('CODE_SIGN_IDENTITY', '"Apple Development"', 'Debug', name)
  proj.updateBuildProperty('PROVISIONING_PROFILE_SPECIFIER', '""', 'Debug', name)
}

fs.writeFileSync(PBX, proj.writeSync())
console.log('per-target signing set (Release: match, Debug: automatic) for', Object.keys(TARGETS).join(' + '))
