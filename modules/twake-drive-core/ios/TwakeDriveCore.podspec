generated = File.join(__dir__, 'generated', 'TwakeDriveCoreFFI.xcframework')
unless File.exist?(generated)
  raise "TwakeDriveCore: #{generated} is missing. Run rust/scripts/build-ios.sh before pod install."
end

Pod::Spec.new do |s|
  s.name           = 'TwakeDriveCore'
  s.version        = '0.1.0'
  s.summary        = 'Twake Drive core, written in Rust, for the app'
  s.author         = 'Linagora'
  s.homepage       = 'https://github.com/linagora/twake-drive-mobile'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Session/ links to the File Provider extension's session code: one token
  # refresh, under one lock, for the app and the extension.
  s.source_files = '*.swift', 'generated/*.swift', 'Session/*.swift'
  s.vendored_frameworks = 'generated/TwakeDriveCoreFFI.xcframework'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
