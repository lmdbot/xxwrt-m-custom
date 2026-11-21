#!/bin/sh
# Install and VERIFY the narrowly scoped Xiaomi RPC executable on QWRT.
# Run as root after copying luci.xxwrt-xiaomi and this installer to /tmp.
set -eu

fail() {
    printf 'ERROR: %s\n' "$1" >&2
    exit 1
}

[ "$(id -u)" -eq 0 ] || fail 'Run as root on QWRT.'
[ -x /etc/init.d/rpcd ] || fail 'rpcd is not installed.'
[ -r /usr/share/libubox/jshn.sh ] || fail 'jshn.sh is missing; install libubox/jshn.'
command -v ubus >/dev/null 2>&1 || fail 'ubus CLI is required to verify registration.'
[ -r /tmp/luci.xxwrt-xiaomi ] || fail 'Copy the companion luci.xxwrt-xiaomi to /tmp/ first.'

mkdir -p /usr/libexec/rpcd /usr/share/rpcd/acl.d
cp /tmp/luci.xxwrt-xiaomi /usr/libexec/rpcd/luci.xxwrt-xiaomi
chmod 0755 /usr/libexec/rpcd/luci.xxwrt-xiaomi

# Confirm rpcd can execute this file and read its method signature BEFORE
# changing rpcd. Missing libraries or invalid shebangs cannot pass silently.
signature="$(/usr/libexec/rpcd/luci.xxwrt-xiaomi list)" ||
    fail 'Backend list mode failed; check shebang and file permissions.'
[ "$signature" = '{"Fetch":{"address":"str","path":"str","form":"str"}}' ] ||
    fail 'Backend returned an invalid method signature.'

cat > /usr/share/rpcd/acl.d/xxwrt-xiaomi.json <<'ACL'
{
  "xxwrt-xiaomi": {
    "description": "XX-WRT Xiaomi LAN attachment metadata",
    "read": {
      "ubus": {
        "luci.xxwrt-xiaomi": ["Fetch"]
      }
    }
  }
}
ACL
chmod 0644 /usr/share/rpcd/acl.d/xxwrt-xiaomi.json
if [ -f /etc/sysupgrade.conf ]; then
    for f in /usr/libexec/rpcd/luci.xxwrt-xiaomi /usr/share/rpcd/acl.d/xxwrt-xiaomi.json; do
        grep -qxF "$f" /etc/sysupgrade.conf || printf '%s\n' "$f" >> /etc/sysupgrade.conf
    done
fi

printf '%s\n' 'Reloading rpcd and verifying Xiaomi RPC registration ...'
/etc/init.d/rpcd restart || fail 'rpcd restart failed.'

registered=0
attempt=0
while [ "$attempt" -lt 6 ]; do
    # -v proves the Fetch method exists, not merely a matching object name.
    if ubus -v list 'luci.xxwrt-xiaomi' 2>/dev/null | grep -q '"Fetch"'; then
        registered=1
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ "$registered" -ne 1 ]; then
    printf '%s\n' 'Failed to register luci.xxwrt-xiaomi.Fetch.' >&2
    printf '%s\n' 'Check whether this QWRT rpcd loads /usr/libexec/rpcd/ executables:' >&2
    ls -l /usr/libexec/rpcd/luci.xxwrt-xiaomi >&2
    if command -v logread >/dev/null 2>&1; then
        logread -e rpcd 2>/dev/null | tail -n 15 >&2 || true
    fi
    fail 'The Xiaomi ubus object is missing; App cannot work until this is resolved.'
fi

# Execute a deliberately invalid, non-routable target. A result of code 400
# proves the method runs and validates inputs without contacting any device.
# Keep the original ubus error output instead of reporting only a
# generic failure. The probe uses loopback, so it never contacts Xiaomi.
probe_input='{"address":"http://127.0.0.1","path":"/cgi-bin/luci/api/xqsystem/init_info","form":""}'
probe="$(ubus call 'luci.xxwrt-xiaomi' Fetch "$probe_input" 2>&1)" || {
    printf '%s\n' "ubus error: $probe" >&2
    # Run the same validation directly to distinguish a script crash from
    # rpcd plugin execution / ACL problems. No secrets are included.
    direct="$(printf '%s' "$probe_input" | /usr/libexec/rpcd/luci.xxwrt-xiaomi call Fetch 2>&1)" || {
        printf '%s\n' "direct backend error: $direct" >&2
        fail 'Xiaomi backend failed to execute. Check jshn support and shell errors.'
    }
    printf '%s\n' "direct backend result: $direct" >&2
    fail 'Backend works directly but rpcd failed. Check rpcd logs and method permissions.'
}
printf '%s' "$probe" | grep -Eq '"code"[[:space:]]*:[[:space:]]*400' || {
    printf '%s\n' "unexpected ubus response: $probe" >&2
    fail 'Xiaomi RPC returned an unexpected self-test result.'
}

printf '\n%s\n' 'SUCCESS: QWRT has registered and executed luci.xxwrt-xiaomi.Fetch.'
if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' 'WARNING: curl is not installed; please install curl on QWRT.'
fi
printf '%s\n' 'Reconnect QWRT in the App, then verify the Xiaomi router again.'
