<script setup>
import { computed, ref } from 'vue'
import { Browser } from '@capacitor/browser'
import { projectMitLicense, apache20License, runtimeLicenses, otherLicenses } from '../data/openSourceLicenses.js'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})
const externalError = ref('')
async function openUpstream(url) {
  if (!/^https:\/\//.test(url)) return
  externalError.value = ''
  try { await Browser.open({ url, windowName: '_blank' }) }
  catch (_) { externalError.value = '无法打开上游许可页面，请检查网络连接。' }
}
</script>

<template>
  <v-dialog v-model="visible" max-width="720" scrollable aria-label="开源许可证" class="mx-dialog-info mx-dialog-visible">
    <v-card rounded="xl">
      <v-card-title class="license-dialog-title">
        <v-icon icon="mdi-scale-balance" color="primary" size="24"/>
        <span>开源许可证</span>
      </v-card-title>
      <v-card-text class="license-dialog-content">
        <p class="license-dialog-intro">XX-WRT Material 原创代码依据 MIT License 授权，允许使用、修改、再分发及商用，分发时需保留版权与许可声明。</p>
        <p class="license-dialog-exception">第三方组件保留各自许可证。历史 UniApp 编译资源及旧 APK 的再分发权限尚未核清，不自动纳入 MIT；品牌图形也不授予第三方商标权。</p>
        <v-expansion-panels variant="accordion" class="license-dialog-panels">
          <v-expansion-panel title="MIT License · 项目原创部分">
            <v-expansion-panel-text>
              <pre class="license-full-text">{{ projectMitLicense }}</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel title="Apache License 2.0 · 第三方组件">
            <v-expansion-panel-text>
              <pre class="license-full-text">{{ apache20License }}</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <h3 class="license-dialog-section-title">主要第三方运行依赖</h3>
        <v-list density="compact" class="license-dialog-list" bg-color="transparent">
          <v-list-item v-for="item in runtimeLicenses" :key="item.packageName"
            :title="item.name" :subtitle="item.packageName + '@' + item.version">
            <template #append>
              <span class="license-dialog-kind">{{ item.license }}</span>
              <v-btn icon="mdi-open-in-new" size="x-small" variant="text"
                :aria-label="'查看 ' + item.name + ' 的许可信息'" @click="openUpstream(item.url)"/>
            </template>
          </v-list-item>
        </v-list>
        <h3 class="license-dialog-section-title">其他来源及数据</h3>
        <v-list density="compact" class="license-dialog-list" bg-color="transparent">
          <v-list-item v-for="item in otherLicenses" :key="item.name"
            :title="item.name" :subtitle="item.license">
            <template #append>
              <v-btn icon="mdi-open-in-new" size="x-small" variant="text"
                :aria-label="'查看 ' + item.name + ' 的来源信息'" @click="openUpstream(item.url)"/>
            </template>
          </v-list-item>
        </v-list>
        <v-alert v-if="externalError" type="warning" variant="tonal" density="compact">{{ externalError }}</v-alert>
        <p class="license-dialog-footnote">完整第三方版本清单、具体版权和 NOTICE：GitHub 仓库 THIRD_PARTY_NOTICES.md。上述清单不代替最终安装包的传递依赖及 Android 原生依赖审计。</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn color="primary" variant="tonal" aria-label="关闭开源许可证" @click="visible = false">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.license-dialog-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700}
.license-dialog-content{font-size:13px;line-height:1.65}
.license-dialog-intro{margin-bottom:9px}
.license-dialog-exception,.license-dialog-footnote{opacity:.8;font-size:12px}
.license-dialog-panels{margin:15px 0}
.license-full-text{font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;padding:10px 3px}
.license-dialog-section-title{font-size:14px;font-weight:700;margin:18px 0 9px}
.license-dialog-list{border:1px solid rgba(130,146,171,.17);border-radius:12px;overflow:hidden}
.license-dialog-list .v-list-item{min-width:0}
.license-dialog-list :deep(.v-list-item-title){font-size:12px;font-weight:650;white-space:normal}
.license-dialog-list :deep(.v-list-item-subtitle){font-size:11px;opacity:.8;white-space:normal}
.license-dialog-kind{max-width:116px;font-size:10px;line-height:1.4;text-align:right;white-space:normal;margin-right:4px;opacity:.75}
.license-dialog-footnote{margin-top:14px}
</style>
