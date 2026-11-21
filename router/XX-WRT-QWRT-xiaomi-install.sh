#!/bin/sh
# Install/update XX-WRT's restricted Xiaomi inventory rpcd plugin on QWRT.
# No general-purpose file.exec ACL and no Xiaomi password stored on QWRT.
set -eu
umask 077

[ "$(id -u)" -eq 0 ] || { echo "Please run as root on QWRT" >&2; exit 1; }
[ -x /etc/init.d/rpcd ] || { echo "QWRT rpcd is missing" >&2; exit 1; }
[ -x /usr/bin/curl ] || { echo "QWRT requires curl. Install it with apk/opkg first." >&2; exit 1; }
command -v jsonfilter >/dev/null 2>&1 || { echo "QWRT requires jsonfilter" >&2; exit 1; }
command -v awk >/dev/null 2>&1 || { echo "QWRT requires awk" >&2; exit 1; }

temp="$(mktemp /tmp/xxwrt-xiaomi-install.XXXXXX)" || exit 1
trap 'rm -f "$temp"' EXIT HUP INT TERM
helper_url="https://raw.githubusercontent.com/lmdbot/xxwrt-m-custom/main/router/luci.xxwrt-xiaomi"
/usr/bin/curl -q -fsSL --proto '=https' --connect-timeout 7 --max-time 30 \
  --max-filesize 20000 -- "$helper_url" -o "$temp"
[ -s "$temp" ] || { echo "Xiaomi helper download was empty" >&2; exit 1; }
sh -n "$temp" || { echo "Xiaomi helper has a syntax error" >&2; exit 1; }

mkdir -p /usr/libexec/rpcd /usr/share/rpcd/acl.d
cp "$temp" /usr/libexec/rpcd/luci.xxwrt-xiaomi
chmod 0755 /usr/libexec/rpcd/luci.xxwrt-xiaomi
cat > /usr/share/rpcd/acl.d/xxwrt-xiaomi.json <<'ACL'
{
  "xxwrt-xiaomi": {
    "description": "Restricted Xiaomi inventory via QWRT",
    "read": {
      "ubus": {
        "luci.xxwrt-xiaomi": [ "Request" ]
      }
    }
  }
}
ACL
chmod 0644 /usr/share/rpcd/acl.d/xxwrt-xiaomi.json

# Default root read="*" already includes the ACL. Attach the group to
# restricted root logins explicitly, but never to other users.
if command -v uci >/dev/null 2>&1; then
  idx=0
  changed=0
  while [ "$idx" -lt 20 ] && uci -q get "rpcd.@login[$idx]" >/dev/null 2>&1; do
    username="$(uci -q get "rpcd.@login[$idx].username" || true)"
    if [ "$username" = 'root' ]; then
      rights="$(uci -q get "rpcd.@login[$idx].read" || true)"
      if ! printf '%s\n' "$rights" | grep -Eq '(^|[[:space:]])(\*|xxwrt-xiaomi)([[:space:]]|$)'; then
        uci -q add_list "rpcd.@login[$idx].read=xxwrt-xiaomi"
        changed=1
      fi
    fi
    idx=$((idx + 1))
  done
  [ "$changed" -eq 0 ] || uci commit rpcd
fi

if [ -f /etc/sysupgrade.conf ]; then
  for f in /usr/libexec/rpcd/luci.xxwrt-xiaomi /usr/share/rpcd/acl.d/xxwrt-xiaomi.json; do
    grep -qxF "$f" /etc/sysupgrade.conf || printf '%s\n' "$f" >> /etc/sysupgrade.conf
  done
fi

/etc/init.d/rpcd restart
echo "Installed XX-WRT Xiaomi RPC bridge. Reconnect to QWRT in the App."
if command -v ubus >/dev/null 2>&1; then
  ubus -S list luci.xxwrt-xiaomi || true
fi
