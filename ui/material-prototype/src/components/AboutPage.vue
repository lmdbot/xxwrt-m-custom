<script setup>
import { computed } from 'vue'
import { getDownloadDisplay } from '../services/downloadDisplay.js'
import appIcon from '../../assets/qwrt-chibi-openwrt-router.webp'
import developerAvatar from '../../assets/developer-avatar.webp'

const props = defineProps({
  installedVersion: { type: String, required: true },
  iconSrc: { type:String, default:'' },
  installedBuild: { type: String, default: '' },
  updateState: { type: Object, required: true }
})
const emit = defineEmits([
  'show-version-details', 'copy-version', 'check-updates',
  'download-latest', 'cancel-download', 'install-downloaded',
  'show-release-notes', 'show-project', 'show-issues',
  'show-licenses', 'show-privacy'
])
const downloadDisplay = computed(() => getDownloadDisplay({
  downloading: props.updateState.downloading,
  downloadedApkReady: props.updateState.downloadedApkReady,
  outcome: props.updateState.downloadOutcome,
  receivedBytes: props.updateState.receivedBytes,
  totalBytes: props.updateState.totalBytes,
  percent: props.updateState.percent
}))
const updateStatus = computed(() => {
  const display = downloadDisplay.value
  const releaseVersion = props.updateState.latestRelease?.version
  if (display.stage === 'downloading')
    return '正在下载' + (releaseVersion ? ' v' + releaseVersion : '更新包')
  if (display.stage === 'preparing') return '正在校验并准备安装'
  if (display.stage === 'failed') return '下载失败，请重试'
  if (display.stage === 'cancelled') return '下载已取消'
  if (display.stage === 'ready' && !props.updateState.error) return '安装包已下载完成'
  const state = props.updateState
  if (state.checking) return '正在检查最新正式版本…'
  if (state.error) return state.error
  if (state.available) {
    return state.latestRelease?.apkUrl
      ? '发现新版本 v' + state.latestRelease.version
      : '发现新版本 v' + state.latestRelease.version + '，但当前 Release 暂无可用的安装包'
  }
  if (state.checked) return state.latestRelease ? '当前已是最新版' : '未找到可用的正式版本'
  return '支持在线检查更新'
})
const downloadSubtitle = computed(() => {
  const stage = downloadDisplay.value.stage
  if (stage === 'downloading') return downloadDisplay.value.sizeText
  if (stage === 'preparing') return '已下载完毕，正在处理安装包'
  if (stage === 'ready') return '可重新打开 Android 安装界面'
  if (stage === 'failed') return '检查网络连接后重试'
  if (stage === 'cancelled') return '可以重新开始下载'
  return ''
})
const updateStatusIcon = computed(() => {
  const stage = downloadDisplay.value.stage
  if (stage === 'downloading') return 'mdi-download-circle-outline'
  if (stage === 'preparing') return 'mdi-package-variant-closed-check'
  if (stage === 'ready') return 'mdi-check-circle-outline'
  if (stage === 'failed' || props.updateState.error) return 'mdi-alert-circle-outline'
  if (stage === 'cancelled') return 'mdi-information-outline'
  return props.updateState.available ? 'mdi-arrow-up-circle-outline' : 'mdi-check-circle-outline'
})
</script>

<template>
  <div class="about-page" data-testid="about-page">
    <header class="about-hero">
      <img class="about-app-icon" :src="iconSrc || appIcon" alt="XX-WRT 应用图标" width="104" height="104"/>
      <h2 class="about-app-name">XX-WRT</h2>
      <div class="about-version-actions">
        <button type="button" class="about-version-pill" aria-label="查看应用版本详情"
          @click="emit('show-version-details')">
          <v-icon icon="mdi-information-outline" size="15"/>
          <span>v{{ installedVersion }}</span>
          <v-icon icon="mdi-chevron-right" size="16"/>
        </button>
        <v-btn class="about-check-update" color="primary" variant="tonal" size="small"
          rounded="pill" prepend-icon="mdi-refresh" :loading="updateState.checking"
          :disabled="updateState.downloading" @click="emit('check-updates')">检查更新</v-btn>
      </div>
      <div v-if="updateState.checked || updateState.checking || updateState.error || updateState.available"
        class="about-update-status about-hero-update-status" role="status"
        :class="{ 'about-update-error': updateState.error, 'about-hero-status--action': (updateState.available && updateState.latestRelease?.apkUrl) || updateState.downloading || updateState.downloadedApkReady }">
        <span class="about-update-message">
          <v-icon :icon="updateStatusIcon" size="18"/>
          <span class="about-update-message-copy">
            <span class="about-update-message-text">{{ updateStatus }}</span>
            <small v-if="downloadSubtitle" class="about-update-message-subtitle">{{ downloadSubtitle }}</small>
          </span>
        </span>
        <div v-if="updateState.downloading && updateState.isNative"
          class="about-update-now about-download-meter"
          :class="{ 'about-download-meter--preparing': downloadDisplay.stage === 'preparing' }"
          role="progressbar"
          :aria-label="downloadDisplay.stage === 'preparing' ? '正在校验并准备安装' : '更新包下载进度'"
          aria-valuemin="0" aria-valuemax="100"
          :aria-valuenow="downloadDisplay.percent == null ? undefined : downloadDisplay.percent"
          :aria-valuetext="downloadDisplay.stage === 'preparing' ? '下载完成，正在处理安装包' : downloadDisplay.percent == null ? downloadDisplay.sizeText : downloadDisplay.percent + '%，' + downloadDisplay.sizeText">
          <span v-if="downloadDisplay.stage === 'downloading' && downloadDisplay.percent != null"
            class="about-download-meter-fill"
            :style="{ transform: 'scaleX(' + downloadDisplay.percent / 100 + ')' }" aria-hidden="true"/>
          <v-icon v-if="downloadDisplay.stage === 'preparing'" icon="mdi-loading" class="about-download-meter-spinner" size="17" aria-hidden="true"/>
          <v-icon v-else-if="downloadDisplay.percent == null" icon="mdi-loading" class="about-download-meter-spinner" size="17" aria-hidden="true"/>
          <strong class="about-download-meter-label">{{ downloadDisplay.stage === 'preparing' ? '处理中' : downloadDisplay.percent == null ? '下载中' : downloadDisplay.percent + '%' }}</strong>
        </div>
        <v-btn v-else-if="updateState.downloadedApkReady && updateState.isNative"
          class="about-update-now" color="primary" variant="flat" size="small" rounded="pill"
          prepend-icon="mdi-package-up" @click="emit('install-downloaded')">打开安装</v-btn>
        <v-btn v-else-if="updateState.available && updateState.latestRelease?.apkUrl"
          class="about-update-now" color="primary" variant="flat" size="small" rounded="pill"
          prepend-icon="mdi-download" @click="emit('download-latest')">
          {{ downloadDisplay.stage === 'failed' ? '重试下载' : downloadDisplay.stage === 'cancelled' ? '重新下载' : updateState.isNative ? '立即更新' : '下载 APK' }}
        </v-btn>
      </div>
      <p class="about-tagline">让 OpenWrt / QWRT 路由管理更简单</p>
      <p class="about-summary">轻松查看路由状态、管理网络终端与常用服务。具体功能及权限以已连接路由器为准。</p>
    </header>

    <section class="about-section" aria-labelledby="about-info-title">
      <h3 id="about-info-title" class="about-section-title">应用信息</h3>
      <div class="about-group">
        <button type="button" class="about-entry" aria-label="关于 XX-WRT" @click="emit('show-version-details')">
          <div class="about-entry-icon"><v-icon icon="mdi-router-wireless" size="23"/></div>
          <div class="about-entry-copy"><strong>关于 XX-WRT</strong><small>应用介绍、版本与构建信息</small></div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
        <button type="button" class="about-entry" aria-label="查看开发者与项目"
          @click="emit('show-project')">
          <div class="about-entry-icon about-entry-avatar"><img class="about-developer-image" :src="developerAvatar" alt="开发者头像" width="45" height="45" decoding="async"/></div>
          <div class="about-entry-copy">
            <strong>开发者与项目</strong>
            <small>lmdbot · GitHub 开源项目</small>
          </div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
      </div>
    </section>

    <section class="about-section" aria-labelledby="about-update-title">
      <h3 id="about-update-title" class="about-section-title">版本与更新</h3>
      <div class="about-group about-update-group">
        <div class="about-version-row"><span>当前安装版本</span><strong>v{{ installedVersion }}</strong></div>
        <div v-if="updateState.latestRelease" class="about-version-row">
          <span>最新正式版本</span><strong>v{{ updateState.latestRelease.version }}</strong>
        </div>
        <div v-if="updateState.latestRelease" class="about-version-row">
          <span>更新来源</span><strong>{{ updateState.latestRelease.source === 'mirror' ? '阿里云' : 'GitHub 备用' }}</strong>
        </div>
        <p v-if="updateState.notice" class="about-update-notice" role="status">{{ updateState.notice }}</p>
        <button type="button" class="about-release-note-link" aria-label="版本日志"
          :disabled="updateState.releaseNotesLoading" @click="emit('show-release-notes')">
          <span class="about-release-note-icon">
            <v-progress-circular v-if="updateState.releaseNotesLoading" indeterminate size="21" width="2" color="primary"/>
            <v-icon v-else icon="mdi-text-box-outline" size="21"/>
          </span>
          <span class="about-release-note-copy">
            <strong>版本日志</strong>
            <small>查看版本更新内容</small>
          </span>
          <v-icon icon="mdi-chevron-right" size="21" class="about-release-note-chevron"/>
        </button>
        <div v-if="updateState.downloading && updateState.isNative" class="about-update-actions">
          <v-btn variant="text" color="warning" size="small" rounded="lg"
            prepend-icon="mdi-close-circle-outline" @click="emit('cancel-download')">取消下载</v-btn>
        </div>
        <p class="about-update-hint">正式版优先通过阿里云检查更新，服务不可用时使用 GitHub 备用接口。</p>
      </div>
    </section>

    <section class="about-section" aria-labelledby="about-links-title">
      <h3 id="about-links-title" class="about-section-title">相关链接</h3>
      <div class="about-group">
        <button type="button" class="about-entry" aria-label="打开 GitHub 项目" @click="emit('show-project')">
          <div class="about-entry-icon"><v-icon icon="mdi-github" size="23"/></div>
          <div class="about-entry-copy"><strong>GitHub</strong><small>查看源代码与项目进展</small></div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
        <button type="button" class="about-entry" aria-label="查看问题与反馈（Issues）" @click="emit('show-issues')">
          <div class="about-entry-icon"><v-icon icon="mdi-lifebuoy" size="23"/></div>
          <div class="about-entry-copy"><strong>帮助与反馈</strong><small>提交问题和功能建议</small></div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
        <button type="button" class="about-entry" aria-label="查看开源许可证" @click="emit('show-licenses')">
          <div class="about-entry-icon"><v-icon icon="mdi-scale-balance" size="23"/></div>
          <div class="about-entry-copy"><strong>开源许可证</strong><small>项目授权及第三方组件许可</small></div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
        <button type="button" class="about-entry" aria-label="查看隐私与免责声明" @click="emit('show-privacy')">
          <div class="about-entry-icon"><v-icon icon="mdi-shield-check-outline" size="23"/></div>
          <div class="about-entry-copy"><strong>隐私与免责声明</strong><small>本地凭据、网络访问与操作安全</small></div>
          <v-icon icon="mdi-chevron-right" size="21" class="about-entry-chevron"/>
        </button>
      </div>
    </section>
    <footer class="about-footer">
      <span>Made for OpenWrt · QWRT</span>
      <span>XX-WRT · 2026</span>
    </footer>
  </div>
</template>

<style scoped>
.about-page{width:100%;max-width:680px;margin:0 auto;padding:0 0 22px;color:rgb(var(--v-theme-on-surface))}
.about-hero{display:flex;align-items:center;flex-direction:column;text-align:center;padding:22px 12px 20px}
.about-app-icon{display:block;width:104px;height:104px;object-fit:contain;border-radius:24px;box-shadow:0 8px 22px rgba(17,43,78,.13)}
.about-app-name{font-size:30px;font-weight:750;line-height:1.25;letter-spacing:-.7px;margin:18px 0 8px}
.about-version-actions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;column-gap:6px;row-gap:8px;max-width:100%}
.about-version-pill{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:99px;background:rgba(var(--v-theme-primary),.12);color:rgb(var(--v-theme-primary));font-family:inherit;line-height:1.5;font-size:12px;font-weight:650;padding:7px 11px;min-height:34px;cursor:pointer}
.about-check-update{min-height:34px!important;font-size:12px!important;letter-spacing:0!important;font-weight:700!important}
.about-hero-update-status{
  display:flex;align-items:center;justify-content:center;gap:9px;
  width:fit-content;max-width:100%;margin:12px auto 0!important;
  padding:9px 12px!important;text-align:left
}
.about-update-message{display:flex;align-items:center;justify-content:flex-start;gap:7px;min-width:0;flex:1 1 auto}
.about-update-message .v-icon{flex:0 0 auto}
.about-update-message-copy{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0}
.about-update-message-text{min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:1.45}
.about-update-message-subtitle{display:block;font-size:10px;line-height:1.4;color:var(--ui-text-muted);overflow-wrap:anywhere}
.about-hero-status--action{width:min(100%,410px);justify-content:space-between;flex-wrap:nowrap}
.about-update-now{flex:none;min-height:34px!important;font-size:12px!important;letter-spacing:0!important}
.about-download-meter{
  position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;
  gap:5px;flex:0 0 98px;width:98px;height:35px;min-height:35px;
  overflow:hidden;border-radius:99px;background:#194e84;color:#fff;
  font-variant-numeric:tabular-nums;white-space:nowrap
}
.about-download-meter-fill{
  position:absolute;z-index:-1;inset:0;background:#0867c0;
  transform-origin:left center;transition:transform .28s ease-out;
  pointer-events:none
}
.about-download-meter-label{position:relative;z-index:1;color:#fff;font-size:12px;font-weight:750;line-height:1}
.about-hero .about-update-status .about-download-meter-spinner{color:#fff;animation:about-download-spin 1.1s linear infinite}
@keyframes about-download-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){
  .about-download-meter-fill{transition:none}
  .about-download-meter-spinner{animation:none}
}
@media(max-width:380px){
  .about-hero-status--action{gap:5px;padding:8px 9px!important}
  .about-update-message{gap:5px}
  .about-update-message-text{font-size:11px}
  .about-download-meter{flex-basis:84px;width:84px}
  .about-update-now{padding-inline:10px!important}
}
.about-tagline{margin:14px 0 6px;font-size:14px;font-weight:650;line-height:1.55}
.about-summary{max-width:370px;font-size:12px;line-height:1.75;color:var(--ui-text-muted)}
.about-section{margin:12px 0 23px}
.about-section-title{font-size:15px;font-weight:750;line-height:1.5;padding:0 4px 11px}
.about-group{overflow:hidden;border-radius:18px;background:rgb(var(--v-theme-surface));border:1px solid rgba(127,143,169,.14)}
.about-entry{display:flex;align-items:center;gap:13px;width:100%;min-height:74px;padding:13px 16px;background:transparent;border:0;text-align:left;color:inherit;cursor:pointer}
.about-entry+.about-entry{border-top:1px solid rgba(127,143,169,.13)}
button.about-entry:hover{background:rgba(var(--v-theme-primary),.055)}
button.about-entry:active{background:rgba(var(--v-theme-primary),.11)}
.about-entry-static{cursor:default}
.about-entry-icon{display:flex;align-items:center;justify-content:center;flex:none;width:45px;height:45px;border-radius:14px;background:rgba(var(--v-theme-primary),.12);color:rgb(var(--v-theme-primary))}
.about-entry-avatar{overflow:hidden;background:transparent}
.about-developer-image{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}
.about-entry-copy{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.about-entry-copy strong{font-size:14px;line-height:1.4;font-weight:700}
.about-entry-copy small{font-size:12px;line-height:1.45;color:var(--ui-text-muted);overflow-wrap:anywhere}
.about-entry-chevron{color:var(--ui-text-muted);flex:none}
.about-update-group{padding:16px}
.about-version-row{display:flex;gap:14px;justify-content:space-between;padding:6px 0;font-size:12px;line-height:1.6}
.about-version-row span{color:var(--ui-text-muted)}
.about-version-row strong{font-weight:650;text-align:right}
.about-update-status{display:flex;align-items:center;gap:8px;border-radius:12px;background:rgba(var(--v-theme-primary),.09);padding:10px 11px;margin-top:12px;color:rgb(var(--v-theme-on-surface));font-size:12px;line-height:1.6}
.about-update-status .v-icon{flex:none;color:rgb(var(--v-theme-primary))}
.about-update-error{background:rgba(var(--v-theme-error),.10)}
.about-update-error .v-icon{color:rgb(var(--v-theme-error))}
.about-update-notice{font-size:12px;line-height:1.55;margin-top:10px;overflow-wrap:anywhere}
.about-download-status{margin-top:14px}
.about-download-label{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:8px}
.about-download-status small{display:block;margin-top:6px;color:var(--ui-text-muted);font-size:11px}
.about-release-note-link{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;margin-top:14px;padding:11px 12px;border:1px solid rgba(var(--v-theme-primary),.13);border-radius:14px;background:rgba(var(--v-theme-primary),.055);color:rgb(var(--v-theme-on-surface));font:inherit;text-align:left;cursor:pointer;transition:background .15s,border-color .15s}
.about-release-note-link:hover{background:rgba(var(--v-theme-primary),.095);border-color:rgba(var(--v-theme-primary),.23)}
.about-release-note-link:active{background:rgba(var(--v-theme-primary),.13)}
.about-release-note-link:disabled{opacity:.65;cursor:progress}
.about-release-note-link:focus-visible{outline:2px solid rgb(var(--v-theme-primary));outline-offset:2px}
.about-release-note-icon{display:flex;align-items:center;justify-content:center;flex:none;width:38px;height:38px;border-radius:12px;background:rgba(var(--v-theme-primary),.12);color:rgb(var(--v-theme-primary))}
.about-release-note-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.about-release-note-copy strong{font-size:13px;font-weight:700;line-height:1.4}
.about-release-note-copy small{font-size:11px;line-height:1.45;color:var(--ui-text-muted)}
.about-release-note-chevron{flex:none;color:var(--ui-text-muted)}
.about-update-actions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:14px}
.about-update-actions :deep(.v-btn){letter-spacing:0;max-width:100%;white-space:normal}
.about-update-hint{margin-top:11px;font-size:11px;line-height:1.6;color:var(--ui-text-muted)}
.about-footer{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 0 2px;color:var(--ui-text-muted);font-size:11px}
button.about-entry:focus-visible,.about-version-pill:focus-visible{outline:2px solid rgb(var(--v-theme-primary));outline-offset:-2px}
@media(max-width:380px){.about-hero{padding-top:12px}.about-entry{padding:12px}.about-update-group{padding:13px}.about-app-icon{width:94px;height:94px}}
</style>
