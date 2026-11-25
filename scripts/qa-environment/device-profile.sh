# shellcheck shell=bash
# Sourced by start.sh and stop.sh: the device profile a QA run tests the Android app with, read from
# the environment, every variable optional (unset: the image's default, checked like the others).
#
#   DEVICE_FONT_SCALE  font size, e.g. 2.0 (Android's largest)
#   DEVICE_THEME       dark or light (the system's night mode, which the app's "System" theme follows)
#   DEVICE_LOCALE      the system language, e.g. de-DE (adb root: the default and google_apis images)
#   DEVICE_SIZE        screen size override, e.g. 1600x2560 for a tablet
#   DEVICE_DENSITY     screen density override, e.g. 320
#   INSTANCE_LOCALE    the instance's language, e.g. de: once signed in, the app speaks the
#                      instance's language, not the device's
#
# The emulator is shared with the e2e runs: reset_device_profile puts every setting back.

# Restarts Android's framework (a new system language needs it) and waits until it takes commands
restart_framework() {
  local old
  old="$(adb shell pidof system_server | tr -d '\r')"
  adb shell setprop ctl.restart zygote
  for _ in $(seq 1 90); do
    [ "$(adb shell pidof system_server 2>/dev/null | tr -d '\r')" != "$old" ] &&
      adb shell cmd uimode night >/dev/null 2>&1 &&
      adb shell dumpsys window 2>/dev/null | grep 'mCurrentFocus=Window' >/dev/null && return 0
    sleep 2
  done
  echo "Android's framework did not come back after a restart" >&2
  return 1
}

# adbd_as <root|unroot>: adbd restarts, and a command sent before it is back finds the device offline
adbd_as() {
  local uid
  uid="$([ "$1" = root ] && echo 'uid=0(' || echo 'uid=2000(')"
  for _ in $(seq 1 15); do
    adb "$1" >/dev/null 2>&1
    adb wait-for-device
    adb shell id 2>/dev/null | grep -F "$uid" >/dev/null && return 0
    sleep 2
  done
  echo "adb $1 did not take" >&2
  return 1
}

# set_system_locale <locale, empty for the image's own>
set_system_locale() {
  [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" = "$1" ] && return 0
  local failed=0
  adbd_as root || return 1
  adb shell "setprop persist.sys.locale '$1'" || failed=1
  restart_framework || failed=1
  adbd_as unroot || failed=1
  return "$failed"
}

# apply_device_profile <stack container> <instance domain>: after the sign-in, which selects on the
# labels of the default profile; the app is restarted to read the new settings
apply_device_profile() {
  local container="$1" domain="$2"
  if [ -n "${INSTANCE_LOCALE:-}" ]; then
    docker exec "$container" cozy-stack instances modify "$domain" --locale "$INSTANCE_LOCALE" >/dev/null
  fi
  [ -z "${DEVICE_LOCALE:-}" ] || set_system_locale "$DEVICE_LOCALE" || return 1
  [ -z "${DEVICE_FONT_SCALE:-}" ] || adb shell settings put system font_scale "$DEVICE_FONT_SCALE"
  case "${DEVICE_THEME:-}" in
    dark) adb shell cmd uimode night yes >/dev/null ;;
    light) adb shell cmd uimode night no >/dev/null ;;
  esac
  [ -z "${DEVICE_SIZE:-}" ] || adb shell wm size "$DEVICE_SIZE"
  [ -z "${DEVICE_DENSITY:-}" ] || adb shell wm density "$DEVICE_DENSITY"
  check_device_profile || return 1
  adb shell am force-stop com.linagora.twakedrive
  adb shell monkey -p com.linagora.twakedrive -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
}

# Every setting, asked for or not: one that did not take, or that an earlier run whose reset failed
# left, would leave issues blaming a profile the device did not have
check_device_profile() {
  local failed="" font size density
  [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" = "${DEVICE_LOCALE:-}" ] || failed+=" DEVICE_LOCALE"
  font="$(adb shell settings get system font_scale | tr -d '\r')"
  [ "$font" = null ] && font=1
  awk -v a="$font" -v b="${DEVICE_FONT_SCALE:-1}" 'BEGIN { exit !(a + 0 == b + 0) }' || failed+=" DEVICE_FONT_SCALE"
  adb shell cmd uimode night | grep "Night mode: $([ "${DEVICE_THEME:-}" = dark ] && echo yes || echo no)" >/dev/null ||
    failed+=" DEVICE_THEME"
  size="$(adb shell wm size | sed -n 's/^Override size: //p' | tr -d '\r')"
  [ "$size" = "${DEVICE_SIZE:-}" ] || failed+=" DEVICE_SIZE"
  density="$(adb shell wm density | sed -n 's/^Override density: //p' | tr -d '\r')"
  [ "$density" = "${DEVICE_DENSITY:-}" ] || failed+=" DEVICE_DENSITY"
  [ -z "$failed" ] || { echo "The device is not in the profile:$failed" >&2; return 1; }
}

# The language first: restarting the framework writes back the font size it had in memory. Every
# step is tried, a failed one does not keep the others from putting the shared emulator back.
reset_device_profile() {
  local failed=0
  set_system_locale "" || failed=1
  adb shell settings delete system font_scale >/dev/null || failed=1
  adb shell cmd uimode night no >/dev/null || failed=1
  adb shell wm size reset || failed=1
  adb shell wm density reset || failed=1
  return "$failed"
}
