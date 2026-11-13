#!/bin/sh
# XX-WRT M v1.0.6 telemetry compatibility for OpenWrt/QWRT.
# Install: copy the file to your router, then run: sh /tmp/XX-WRT-QWRT-telemetry-install.sh
set -eu
if [ "$(id -u)" != 0 ]; then
    echo 'Please run this installer as root.' >&2
    exit 1
fi
if [ ! -x /etc/init.d/rpcd ]; then
    echo 'rpcd is not installed on this system.' >&2
    exit 1
fi
mkdir -p /usr/libexec/rpcd /usr/share/rpcd/acl.d
cat > /usr/libexec/rpcd/luci.xxwrt-telemetry <<'BACKEND'
#!/bin/sh
# Read-only rpcd backend: no shell commands accepted from ubus requests.
case "$1:$2" in
    list:)
        printf '%s\n' '{"GetTemperature":{}}'
        exit 0
        ;;
    call:GetTemperature)
        ;;
    *)
        printf '%s\n' '{}'
        exit 0
        ;;
esac

read_temperature() {
    # The kernel exposes most Linux thermal readings in millidegrees Celsius.
    [ -r "$1" ] || return 1
    IFS= read -r value < "$1" || [ -n "$value" ] || return 1
    case "$value" in
        ''|*[!0-9]*) return 1 ;;
    esac
    if [ "$value" -ge 1000 ]; then
        whole=$((value / 1000))
        decimal=$(((value % 1000) / 100))
        TEMP="$whole.$decimal"
        value="$whole"
    else
        TEMP="$value"
    fi
    [ "$value" -ge 1 ] && [ "$value" -le 120 ] || return 1
    return 0
}

# Prefer actual CPU package sensors, not unrelated chipset/NVMe hwmon readings.
for class in coretemp k10temp zenpower amd_energy cpu_thermal soc_thermal; do
    for d in /sys/class/hwmon/hwmon*; do
        [ -r "$d/name" ] || continue
        IFS= read -r name < "$d/name" || continue
        [ "$name" = "$class" ] || continue
        for path in "$d"/temp1_input "$d"/temp2_input; do
            if read_temperature "$path"; then
                printf '{"temperature":%s,"source":"%s"}\n' "$TEMP" "$class"
                exit 0
            fi
        done
    done
done

# If labels are absent, a thermal-zone sensor is a safer fallback.
for path in /sys/class/thermal/thermal_zone*/temp; do
    if read_temperature "$path"; then
        printf '{"temperature":%s,"source":"thermal"}\n' "$TEMP"
        exit 0
    fi
done

# Last resort: unlabeled hwmon temperature (e.g. generic ARM platform).
for path in /sys/class/hwmon/hwmon*/temp1_input; do
    if read_temperature "$path"; then
        printf '{"temperature":%s,"source":"hwmon"}\n' "$TEMP"
        exit 0
    fi
done

printf '%s\n' '{"temperature":null,"source":"unavailable"}'
BACKEND
chmod 0755 /usr/libexec/rpcd/luci.xxwrt-telemetry
cat > /usr/share/rpcd/acl.d/xxwrt-telemetry.json <<'ACL'
{
  "xxwrt-telemetry": {
    "description": "Read-only CPU/system temperature for XX-WRT M",
    "read": {
      "ubus": {
        "luci.xxwrt-telemetry": ["GetTemperature"]
      }
    }
  }
}
ACL
# Persist custom plugin files across sysupgrade on systems honoring sysupgrade.conf.
if [ -f /etc/sysupgrade.conf ]; then
    for f in /usr/libexec/rpcd/luci.xxwrt-telemetry /usr/share/rpcd/acl.d/xxwrt-telemetry.json; do
        grep -qxF "$f" /etc/sysupgrade.conf || printf '%s\n' "$f" >> /etc/sysupgrade.conf
    done
fi
/etc/init.d/rpcd restart
printf '\nInstalled. Checking hardware temperature backend:\n'
if command -v ubus >/dev/null 2>&1; then
    ubus call luci.xxwrt-telemetry GetTemperature || true
fi
printf '\nAPP will pick up the temperature via read-only ubus RPC after refreshing.\n'
