#!/usr/bin/env bash
# Read-only screenshot collection from a PHYSICAL Android handset using adb.
# Requires a human to navigate the app; never operates router configuration.
set -euo pipefail

PACKAGE="com.lmdbot.xxwrt.materialpreview"
OUT="${1:-android-device-evidence}"
mkdir -p "$OUT/screenshots"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb not found. Install Android Platform Tools." >&2
  exit 1
fi
if ! adb get-state 2>/dev/null | grep -q 'device'; then
  echo "ERROR: connect and authorize an Android handset using adb." >&2
  exit 1
fi
if ! adb shell pm path "$PACKAGE" | grep -q 'package:'; then
  echo "ERROR: $PACKAGE is not installed on the connected device." >&2
  exit 1
fi

{
  printf 'Captured at UTC: '
  date -u +'%FT%TZ'
  printf '\nAndroid device identity\n'
  for property in ro.product.manufacturer ro.product.model ro.build.version.release ro.build.version.sdk; do
    printf '%s=' "$property"
    adb shell getprop "$property" | tr -d '\r'
  done
  printf '\nDisplay size and density\n'
  adb shell wm size | tr -d '\r'
  adb shell wm density | tr -d '\r'
  printf '\nInstalled package version\n'
  adb shell dumpsys package "$PACKAGE" | grep -m 2 -E 'versionCode=|versionName=' || true
} > "$OUT/device-metadata.txt"

echo "Android device metadata saved to $OUT/device-metadata.txt"
echo "Use a QA router only. Do not open private credentials or sensitive logs when capturing."
echo "Set device font scale, system bar/navigation mode, theme and orientation BEFORE recording."
echo "Press Enter after navigating to each named screen. Type SKIP to mark it missing."
views=(
  "00-overview|概览"
  "01-devices|设备 / 终端列表"
  "02-network|网络根页面"
  "03-tools|工具箱"
  "04-me|我的"
  "05-monitor|详细监控"
  "06-terminal-detail|终端详情"
  "07-network-interfaces|网络接口"
  "08-firewall|防火墙"
  "09-dns-dhcp|DNS 与 DHCP"
  "10-ddns|DDNS"
  "11-zerotier|ZeroTier"
  "12-plugin-lucky|Lucky 插件详情"
  "13-services|服务管理"
  "14-software-packages|软件包"
  "15-logs|日志中心"
  "16-diagnostics|网络诊断"
  "17-security|安全分析"
  "18-backup|备份与恢复"
  "19-settings|显示设置"
  "20-about|关于 XX-WRT"
)
printf 'id,screen,state\n' > "$OUT/checklist.csv"
for view in "${views[@]}"; do
  id="${view%%|*}"
  description="${view#*|}"
  printf '\nOpen %s (%s) and press Enter [SKIP to omit, QUIT to stop]: ' "$description" "$id"
  IFS= read -r choice || choice=QUIT
  case "${choice^^}" in
    QUIT) echo "Capture stopped"; break ;;
    SKIP) printf '%s,%s,skipped\n' "$id" "$description" >> "$OUT/checklist.csv"; continue ;;
  esac
  destination="$OUT/screenshots/$id.png"
  adb exec-out screencap -p > "$destination"
  if [[ ! -s "$destination" ]]; then
    echo "ERROR: empty Android screenshot for $id" >&2
    exit 1
  fi
  printf '%s,%s,captured\n' "$id" "$description" >> "$OUT/checklist.csv"
  echo "Saved $destination"
done
echo "Evidence directory: $OUT"
echo "Review screenshots for visible IPs, names, keys and passwords before any upload."
echo "A screenshot collection alone is NOT a passed functional or pixel-perfect acceptance test."
