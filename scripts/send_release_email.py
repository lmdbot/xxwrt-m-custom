#!/usr/bin/env python3
"""Send a new XX-WRT stable Release notification using QQ Mail SMTP.

Required GitHub Actions secrets:
  XXWRT_RELEASE_EMAIL_TO          recipient address
  XXWRT_RELEASE_SMTP_USERNAME     QQ Mail sender address
  XXWRT_RELEASE_SMTP_AUTH_CODE    QQ Mail SMTP authorization code
"""

from __future__ import annotations

import html
import os
import re
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path


def require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def main() -> None:
    recipient = require("RELEASE_EMAIL_TO")
    sender = require("SMTP_USERNAME")
    auth_code = require("SMTP_AUTH_CODE")
    repo = require("GITHUB_REPOSITORY")
    version = require("APP_VERSION")
    apk_name = require("APP_APK_NAME")

    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Unsupported stable Release version")
    if apk_name != f"XX-WRT-Material-v{version}.apk":
        raise ValueError("Unexpected APK filename")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", repo):
        raise ValueError("Unexpected repository name")
    if not sender.lower().endswith("@qq.com") or "\n" in sender or "\r" in sender:
        raise ValueError("SMTP_USERNAME must be a QQ Mail address")
    if "\n" in recipient or "\r" in recipient or "@" not in recipient:
        raise ValueError("Invalid recipient address")

    tag = f"v{version}"
    release_url = f"https://github.com/{repo}/releases/tag/{tag}"
    apk_url = f"https://github.com/{repo}/releases/download/{tag}/{apk_name}"
    build_url = f"https://github.com/{repo}/actions/runs/{require('GITHUB_RUN_ID')}"
    published_at = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S UTC+08:00")

    notes_file = Path(__file__).resolve().parents[1] / "docs" / "releases" / f"{tag}.md"
    release_notes = notes_file.read_text(encoding="utf-8").strip()

    subject = f"【XX-WRT】{tag} 正式版发布成功"
    body = (
        f"XX-WRT 管理器 {tag} 已成功发布，签名 APK 已上传。\n\n"
        f"版本：{tag}\n"
        f"通知时间：{published_at}\n"
        f"APK 下载：{apk_url}\n"
        f"Release 页面：{release_url}\n"
        f"Actions 构建记录：{build_url}\n\n"
        f"更新说明：\n{release_notes}\n"
    )

    def link(url: str, label: str) -> str:
        return f'<a href="{html.escape(url, quote=True)}">{html.escape(label)}</a>'

    html_body = (
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<body style="font-family:Arial,\'Microsoft YaHei\',sans-serif;color:#202124;line-height:1.6">'
        f'<h2>XX-WRT 管理器 {html.escape(tag)} 发布成功</h2>'
        '<p>签名 APK 已成功上传到 GitHub Release。</p>'
        f'<p><strong>版本：</strong>{html.escape(tag)}<br>'
        f'<strong>通知时间：</strong>{html.escape(published_at)}<br>'
        f'<strong>APK：</strong>{link(apk_url, "下载 Android APK")}<br>'
        f'<strong>Release：</strong>{link(release_url, "查看发布页面")}<br>'
        f'<strong>构建：</strong>{link(build_url, "查看 GitHub Actions")}</p>'
        '<h3>更新说明</h3>'
        '<pre style="font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere;'
        f'background:#f6f8fa;padding:12px;border-radius:6px">{html.escape(release_notes)}</pre>'
        '</body></html>'
    )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"XX-WRT Release <{sender}>"
    message["To"] = recipient
    message.set_content(body)
    message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP_SSL("smtp.qq.com", 465, context=ssl.create_default_context(), timeout=30) as smtp:
        smtp.login(sender, auth_code)
        smtp.send_message(message)
    print("Release email delivered to the configured recipient.")


if __name__ == "__main__":
    main()
