#!/bin/sh
# One-time root installation of XX-WRT's narrowly scoped Xiaomi RPC backend.
# Copy BOTH companion files to /tmp/ first, then run this installer as root.
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on QWRT.' >&2; exit 1; }
[ -x /etc/init.d/rpcd ] || { echo 'rpcd is not installed.' >&2; exit 1; }
[ -r /usr/share/libubox/jshn.sh ] || { echo 'jshn.sh is missing.' >&2; exit 1; }
[ -r /tmp/luci.xxwrt-xiaomi ] || {
    echo 'Copy luci.xxwrt-xiaomi to /tmp/ before installing.' >&2; exit 1;
}
mkdir -p /usr/libexec/rpcd /usr/share/rpcd/acl.d
cp /tmp/luci.xxwrt-xiaomi /usr/libexec/rpcd/luci.xxwrt-xiaomi
chmod 0755 /usr/libexec/rpcd/luci.xxwrt-xiaomi
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
/etc/init.d/rpcd restart
echo 'Installed luci.xxwrt-xiaomi.Fetch. Re-login to QWRT from the App.'
if command -v ubus >/dev/null 2>&1; then
    ubus -S list 'luci.xxwrt-xiaomi' || true
fi
