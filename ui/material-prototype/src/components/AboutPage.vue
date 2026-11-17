<script setup>
import { computed } from 'vue'
import appIcon from '../../assets/qwrt-chibi-openwrt-router.webp'

const props = defineProps({
  installedVersion: { type: String, required: true },
  installedBuild: { type: String, default: '' },
  updateState: { type: Object, required: true }
})
const emit = defineEmits([
  'show-version-details', 'copy-version', 'check-updates',
  'download-latest', 'cancel-download', 'install-downloaded',
  'show-release-notes', 'show-project', 'show-issues', 'show-help',
  'show-licenses', 'show-privacy'
])
const updateStatus = computed(() => {
  const state = props.updateState
  if (state.checking) return '正在检查最新正式版本…'
  if (state.error) return state.error
  if (state.available) {
    return state.latestRelease?.apkUrl
      ? '发现新版本 v' + state.latestRelease.version + '，可下载正式版 APK'
      : '发现新版本 v' + state.latestRelease.version + '，但当前 Release 暂无可用的安装包'
  }
  if (state.checked) return state.latestRelease ? '当前已是最新版' : '未找到可用的正式版本'
  return '支持在线检查更新'
})
</script>

<template>
  <div class="about-page about-design-a" data-testid="about-page">
    <header class="about-design-hero">
      <h2>XX-WRT 管理器</h2>
      <p>v{{ installedVersion }} · 路由器管理客户端</p>
    </header>

    <section class="about-design-section">
      <h3>开发者与项目</h3>
      <div class="about-design-list">
        <button type="button" class="about-design-row" aria-label="打开 GitHub 项目"
          @click="emit('show-project')">
          <span class="about-design-icon"><v-icon icon="mdi-github" size="22"/></span>
          <span class="about-design-copy"><strong>GitHub 项目</strong><small>lmdbot/xxwrt-m-custom</small></span>
          <v-icon icon="mdi-chevron-right" size="22" class="about-design-arrow"/>
        </button>
      </div>
    </section>

    <section class="about-design-section">
      <h3>版本与更新</h3>
      <div class="about-design-list">
        <button type="button" class="about-design-row" aria-label="检查更新"
          :disabled="updateState.checking || updateState.downloading"
          @click="emit('check-updates')">
          <span class="about-design-icon"><v-icon icon="mdi-refresh" size="22"/></span>
          <span class="about-design-copy"><strong>检查更新</strong><small>阿里云优先 / GitHub 备用</small></span>
          <v-icon icon="mdi-chevron-right" size="22" class="about-design-arrow"/>
        </button>
        <button type="button" class="about-design-row" aria-label="查看版本日志"
          @click="emit('show-release-notes')">
          <span class="about-design-icon"><v-icon icon="mdi-text-box-outline" size="22"/></span>
          <span class="about-design-copy"><strong>版本日志</strong><small>查看正式版更新说明</small></span>
          <v-icon icon="mdi-chevron-right" size="22" class="about-design-arrow"/>
        </button>
      </div>
      <p v-if="updateState.checked || updateState.checking || updateState.error"
        class="about-design-status" role="status">{{ updateStatus }}
        <span v-if="updateState.latestRelease?.source === 'aliyun'" class="about-design-source">阿里云</span>
        <span v-else-if="updateState.latestRelease?.source === 'github'" class="about-design-source">GitHub</span>
      </p>
      <div v-if="updateState.available && updateState.latestRelease?.apkUrl"
        class="about-design-update-actions">
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-download"
          :disabled="updateState.downloading" @click="emit('download-latest')">
          {{ updateState.isNative ? '下载并安装新版本' : '下载最新 APK' }}
        </v-btn>
        <v-btn v-if="updateState.downloading && updateState.isNative" variant="outlined"
          color="warning" @click="emit('cancel-download')">取消下载</v-btn>
      </div>
      <div v-if="updateState.downloading" class="about-download-status" role="status">
        <div class="about-download-label"><span>正在下载并校验</span><strong>{{ updateState.percent }}%</strong></div>
        <v-progress-linear :model-value="updateState.percent" height="8" rounded color="primary"/>
        <small>{{ updateState.progressText }}</small>
      </div>
      <v-btn v-if="updateState.downloadedApkReady && updateState.isNative && !updateState.downloading"
        class="mt-2" color="primary" variant="outlined" prepend-icon="mdi-package-up"
        @click="emit('install-downloaded')">重新打开安装</v-btn>
      <p v-if="updateState.notice" class="about-design-status">{{ updateState.notice }}</p>
    </section>

    <section class="about-design-section">
      <h3>帮助与合规</h3>
      <div class="about-design-list">
        <button type="button" class="about-design-row" aria-label="查看开源许可证"
          @click="emit('show-licenses')">
          <span class="about-design-icon"><v-icon icon="mdi-text-box-outline" size="22"/></span>
          <span class="about-design-copy"><strong>开源许可证</strong><small>离线查看声明</small></span>
          <v-icon icon="mdi-chevron-right" size="22" class="about-design-arrow"/>
        </button>
        <button type="button" class="about-design-row" aria-label="查看隐私与免责声明"
          @click="emit('show-privacy')">
          <span class="about-design-icon"><v-icon icon="mdi-shield-outline" size="22"/></span>
          <span class="about-design-copy"><strong>隐私与免责声明</strong><small>本地数据与连接风险</small></span>
          <v-icon icon="mdi-chevron-right" size="22" class="about-design-arrow"/>
        </button>
      </div>
    </section>

    <details class="about-design-more">
      <summary>应用图标与详细版本信息 <v-icon icon="mdi-chevron-down" size="18"/></summary>
      <div class="about-design-more-body">
        <img class="about-app-icon" :src="appIcon" alt="XX-WRT 应用图标" width="76" height="76"/>
        <div class="about-version-row"><span>当前安装版本</span><strong>v{{ installedVersion }}</strong></div>
        <div v-if="updateState.latestRelease" class="about-version-row">
          <span>最新正式版本</span><strong>v{{ updateState.latestRelease.version }}</strong>
        </div>
        <div class="about-design-more-actions">
          <v-btn size="small" variant="tonal" @click="emit('show-version-details')">版本详情</v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="emit('copy-version')">复制版本信息</v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-lifebuoy" @click="emit('show-help')">帮助与反馈</v-btn>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.about-page{width:100%;max-width:680px;margin:0 auto;padding:0 0 22px;color:rgb(var(--v-theme-on-surface))}
.about-hero{display:flex;align-items:center;flex-direction:column;text-align:center;padding:22px 12px 20px}
.about-app-icon{display:block;width:104px;height:104px;object-fit:contain;border-radius:24px;box-shadow:0 8px 22px rgba(17,43,78,.13)}
.about-app-name{font-size:30px;font-weight:750;line-height:1.25;letter-spacing:-.7px;margin:18px 0 8px}
.about-version-actions{display:flex;align-items:center;gap:3px}
.about-version-pill{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:99px;background:rgba(var(--v-theme-primary),.12);color:rgb(var(--v-theme-primary));font-family:inherit;line-height:1.5;font-size:12px;font-weight:650;padding:5px 10px;cursor:pointer}
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
.about-update-actions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:14px}
.about-update-actions :deep(.v-btn){letter-spacing:0;max-width:100%;white-space:normal}
.about-update-hint{margin-top:11px;font-size:11px;line-height:1.6;color:var(--ui-text-muted)}
.about-footer{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 0 2px;color:var(--ui-text-muted);font-size:11px}
button.about-entry:focus-visible,.about-version-pill:focus-visible{outline:2px solid rgb(var(--v-theme-primary));outline-offset:-2px}
@media(max-width:380px){.about-hero{padding-top:12px}.about-entry{padding:12px}.about-update-group{padding:13px}.about-app-icon{width:94px;height:94px}}

/* Design A About page: grouped 65px entries, no oversized icon in the hero. */
.about-design-a{max-width:760px;padding-bottom:20px}
.about-design-hero{border-radius:20px;padding:15px;border:1px solid var(--ui-border);
  background:linear-gradient(128deg,#daefff,#e6e6ff);
  box-shadow:0 10px 30px rgba(36,74,120,.06);color:#183150}
.about-design-hero h2{font-size:17px;font-weight:700;line-height:1.4;margin:0 0 8px}
.about-design-hero p{font-size:12px;line-height:1.6;color:#627994;margin:0}
.about-design-section{margin:23px 0 0}
.about-design-section h3{font-size:16px;line-height:23px;margin:0 3px 11px;font-weight:750}
.about-design-list{border-radius:18px;border:1px solid var(--ui-border);
  background:var(--ui-surface);overflow:hidden;
  box-shadow:0 10px 30px rgba(36,74,120,.04);padding:0 12px}
.about-design-row{display:flex;align-items:center;gap:12px;min-height:65px;
  padding:9px 6px;width:100%;background:transparent;border:0;
  border-bottom:1px solid var(--ui-border);cursor:pointer;
  color:var(--ui-text);text-align:left;font-family:inherit}
.about-design-row:last-child{border-bottom:0}
.about-design-row:active{background:var(--ui-surface-2)}
.about-design-row:focus-visible{outline:2px solid var(--ui-primary);outline-offset:-2px}
.about-design-row:disabled{opacity:.5;cursor:default}
.about-design-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;
  border-radius:13px;background:var(--ui-surface-2);color:var(--ui-primary)}
.about-design-copy{display:flex;flex:1;flex-direction:column;min-width:0;gap:5px}
.about-design-copy strong{font-size:13px;line-height:1.4;font-weight:700}
.about-design-copy small{font-size:11px;line-height:1.4;color:var(--ui-muted)}
.about-design-arrow{color:var(--ui-muted);flex:none;margin-left:auto}
.about-design-status{padding:11px;font-size:11px;line-height:1.6;
  border-radius:12px;background:var(--ui-surface-2);color:var(--ui-muted);margin:10px 0 0}
.about-design-update-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.about-design-more{margin-top:23px;color:var(--ui-muted);font-size:11px}
.about-design-more>summary{display:flex;align-items:center;justify-content:space-between;
  min-height:44px;padding:10px 12px;border:1px solid var(--ui-border);
  border-radius:12px;background:var(--ui-surface);cursor:pointer;list-style:none}
.about-design-more>summary::-webkit-details-marker{display:none}
.about-design-more[open]>summary .v-icon{transform:rotate(180deg)}
.about-design-more-body{margin-top:10px;padding:13px;border:1px solid var(--ui-border);
  background:var(--ui-surface);border-radius:14px}
.about-design-more-body .about-app-icon{width:76px;height:76px;margin:0 auto 15px}
.about-design-more-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
:global(.theme-is-dark) .about-design-hero{
  background:linear-gradient(128deg,#25486c,#27344f);color:#eef7ff}
:global(.theme-is-dark) .about-design-hero p{color:#aab9ce}

</style>

<style>
.about-design-source{display:inline-block;margin-left:8px;vertical-align:baseline;
  color:rgb(var(--v-theme-primary));font-size:11px;font-weight:700}
</style>