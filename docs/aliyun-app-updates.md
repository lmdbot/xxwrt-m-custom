# XX-WRT Android：阿里云 Lucky 静态更新服务

本方案保留 GitHub Actions 编译、APK 签名和 GitHub Release，增加同步到阿里云轻量服务器的 HTTPS 静态镜像。**不需要 Nginx、Docker 或额外常驻进程**：Lucky 的「Web 服务 → 文件服务」直接提供下载。

- APP 首选版本接口：<https://update.12130812.xyz/version.json>
- APK 地址示例：<https://update.12130812.xyz/XX-WRT-Material-v2.0.21.apk>
- 备用：原 GitHub Releases API / 下载页面
- 只同步 `main` 分支正式版；预发布不上传到镜像
- 版本文件在 APK 上传完成后才会替换；确保每次更新都有完整安装包
- 配置 SSH 凭据之前，Actions 会跳过阿里云同步，不影响现有 GitHub 发布

## 1. 阿里云 Linux 一次性初始化

通过你目前的 SSH 密钥登录服务器，执行：

```bash
# 推荐为 GitHub Actions 建立独立账号，勿复用日常管理员密钥。
sudo useradd --create-home --shell /bin/bash xxwrt-updater
sudo install -d -o xxwrt-updater -g xxwrt-updater -m 755 /srv/app-updates
sudo install -d -o xxwrt-updater -g xxwrt-updater -m 700 /home/xxwrt-updater/.ssh
```

如果账号已存在，忽略 useradd 的「already exists」，继续创建目录。将**专用部署公钥**（不是私钥）作为单独一行写进：

`/home/xxwrt-updater/.ssh/authorized_keys`

然后运行：

```bash
sudo chown xxwrt-updater:xxwrt-updater /home/xxwrt-updater/.ssh/authorized_keys
sudo chmod 600 /home/xxwrt-updater/.ssh/authorized_keys
```

在你自己的 Windows 电脑生成一对独立密钥（PowerShell）：

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\xxwrt_update" -C "xxwrt-github-actions"
```

将 `xxwrt_update.pub` 的内容放入服务器的 `authorized_keys`；`xxwrt_update` 的私钥**只填写到 GitHub Actions Secret**，不要发到聊天、提交到仓库或放进 Release。

请确认云服务器安全组和系统防火墙允许 GitHub Actions Runner 连接 SSH 实际端口。GitHub 托管 Runner 的出口 IP 会变化，不要依赖永久固定的单个来源 IP 白名单。只开放必要端口并继续禁用 SSH 密码登录。

## 2. Lucky 配置

1. DNS 管理中，将 `update.12130812.xyz` 的 A/AAAA 记录指向对应阿里云服务器公网地址。
2. 在 Lucky 已有的 HTTPS 443「Web 服务规则」中新增**子规则**，避免重复监听 443。
3. 前端域名：`update.12130812.xyz`；Web 服务类型：**文件服务**。
4. 文件服务目录：`/srv/app-updates`；启用 HTTPS，使用对应该子域名有效的证书（现有通配符证书可复用）。
5. 不开启 BasicAuth 或其他需登录才能访问的保护：APK 和 JSON 必须允许 APP 直接获取。
6. 若 Lucky 已配置国家/地区访问限制，确保预期使用 APP 的地区可以访问此更新域名。
7. 仅为此服务开放必要的 GET/HEAD 访问；不要让公网用户上传或修改文件。Web 预览模式若要跨域检查，需要响应 `Access-Control-Allow-Origin: *`。

参阅 [Lucky 官方 Web 服务与文件服务说明](https://lucky666.cn/docs/modules/web/)。

## 3. GitHub Actions 凭据

打开仓库 **Settings → Secrets and variables → Actions**，新增以下 **Repository secrets**：

| Secret | 内容 |
| --- | --- |
| `XXWRT_UPDATE_SSH_HOST` | 云服务器公网 IP 或 SSH 域名（不要带 `https://`） |
| `XXWRT_UPDATE_SSH_USER` | `xxwrt-updater`（如使用其他账号，需拥有目录写权限） |
| `XXWRT_UPDATE_SSH_PRIVATE_KEY` | 专用部署私钥的完整多行内容 |
| `XXWRT_UPDATE_SSH_KNOWN_HOSTS` | 经核对的服务器 SSH 主机公钥行（OpenSSH known_hosts 格式） |

SSH 端口默认 **22**。若不是 22，在 **Variables** 中新增
`XXWRT_UPDATE_SSH_PORT`，填写实际端口（例如 `2222`）。

### 获取和核对主机指纹

服务器上执行：

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

本机用相同 SSH 端口扫描服务器公开的主机公钥：

```bash
ssh-keyscan -p 22 -t ed25519 <服务器公网IP或SSH域名>
```

**必须确认扫描得到的主机公钥与服务器上的指纹一致**，再将 `ssh-keyscan` 输出的整行内容存入 `XXWRT_UPDATE_SSH_KNOWN_HOSTS`。不能盲目信任未经核对的扫描结果。如果使用非默认端口，请两处都填写真实端口。

## 4. 发布流程和回归

1. 保持 `ui/material-prototype/package.json` 版本号为三段数字（如 `2.0.21`）。
2. 新版本创建 `docs/releases/v2.0.21.md`，包含原有工作流要求的结构化变更类别。
3. 合并改动后，推送 `main`，正式 APK 经现有构建、测试和签名并发布到 GitHub。
4. 新增的 `Sync stable APK to Aliyun Lucky file service` 步骤上传至 `/srv/app-updates`。
5. APK 文件上传成功之后，通过 `mv` 原子发布 `version.json`。
6. 手机在「关于 → 检查更新」查看更新来源是否显示「阿里云」，并测试 APK 下载。

验证：

```bash
curl -fsS https://update.12130812.xyz/version.json
curl -I "https://update.12130812.xyz/XX-WRT-Material-v2.0.21.apk"
```

返回的 JSON 含 `schemaVersion`、`version`、`tag`、`apkName`、`apkUrl`、`apkSize`、`sha256`、`releaseUrl` 和 `githubApkUrl`。

注意：`sha256` 用于公布安装包校验值；目前 APP 原生下载器由 Android 系统下载服务接管，**未在客户端实现自动 SHA-256 校验**。Android 安装时仍由操作系统验证 APK 签名。后续若要强制下载哈希校验，需要扩展原生下载模块。

## 5. 故障处理

- 没有配置全部 4 个 SSH Secret：全部缺失会**跳过镜像**；只配置一部分则**报错**，防止静默发布半成品。
- SSH 连接失败：核查端口、安全组、部署公钥、主机指纹及 /srv/app-updates 写权限。
- 镜像失败：GitHub Release 依然保留，APP 会尝试回退到 GitHub API。
- 下载慢：检查云服务器实际公网出口带宽和下载流量计费/限额。
- APP 没检测到升级：必须把 Android 版本从旧版递增（例如 2.0.20 → 2.0.21），仅替换同版本 APK 不会显示为新版本。
- GitHub Workflow 为防止重复发布，原有 webhook 通知可能因其独立 Secret 缺失报错；这与镜像同步是两个独立步骤。
