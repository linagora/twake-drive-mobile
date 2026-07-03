const { withAndroidManifest } = require('expo/config-plugins')

// Adds ACTION_SEND / ACTION_SEND_MULTIPLE intent-filters to MainActivity so the OS
// lists Twake Drive as a share target for any content type. The committed
// AndroidManifest.xml already carries the equivalent <intent-filter> blocks (this
// project never runs `expo prebuild`); this plugin keeps them reproducible if a
// prebuild is ever run. Mirrors the surgical pattern of withTwakeDocumentsProvider.js.
const SEND_ACTIONS = ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE']

function addShareIntentFilters(androidManifest) {
  const app = androidManifest.manifest.application[0]
  const mainActivity = (app.activity || []).find(a => a.$['android:name'] === '.MainActivity')
  if (!mainActivity) return androidManifest
  mainActivity['intent-filter'] = mainActivity['intent-filter'] || []
  for (const action of SEND_ACTIONS) {
    const exists = mainActivity['intent-filter'].some(f =>
      (f.action || []).some(a => a.$['android:name'] === action)
    )
    if (!exists) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': action } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': '*/*' } }]
      })
    }
  }
  return androidManifest
}

module.exports = function withTwakeShareIntent(config) {
  return withAndroidManifest(config, c => {
    c.modResults = addShareIntentFilters(c.modResults)
    return c
  })
}
