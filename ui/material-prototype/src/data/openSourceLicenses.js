import packageInfo from '../../package.json'
import mitLicenseText from './LICENSE-MIT.txt?raw'
import apacheLicenseText from './LICENSE-Apache-2.0.txt?raw'

export const projectMitLicense = mitLicenseText
export const apache20License = apacheLicenseText

// Keep metadata aligned with THIRD_PARTY_NOTICES.md and package.json.
const direct = [
  {
    "name": "Vue 3",
    "packageName": "vue",
    "license": "MIT",
    "url": "https://github.com/vuejs/core/blob/main/packages/vue/LICENSE"
  },
  {
    "name": "Vuetify 3",
    "packageName": "vuetify",
    "license": "MIT",
    "url": "https://github.com/vuetifyjs/vuetify/blob/master/packages/vuetify/LICENSE.md"
  },
  {
    "name": "Material Design Icons Webfont",
    "packageName": "@mdi/font",
    "license": "Apache-2.0（字体/图标；代码 MIT）",
    "url": "https://github.com/Templarian/MaterialDesign/blob/master/LICENSE"
  },
  {
    "name": "Apache ECharts",
    "packageName": "echarts",
    "license": "Apache-2.0",
    "url": "https://github.com/apache/echarts/blob/master/LICENSE"
  },
  {
    "name": "Vue Liquid Glass",
    "packageName": "@daisigu/vue-liquid-glass",
    "license": "MIT",
    "url": "https://github.com/Daisigu/vue-liquid-glass"
  },
  {
    "name": "Capacitor Core",
    "packageName": "@capacitor/core",
    "license": "MIT",
    "url": "https://github.com/ionic-team/capacitor/blob/main/core/LICENSE"
  },
  {
    "name": "Capacitor Android",
    "packageName": "@capacitor/android",
    "license": "MIT",
    "url": "https://github.com/ionic-team/capacitor"
  },
  {
    "name": "Capacitor App",
    "packageName": "@capacitor/app",
    "license": "MIT",
    "url": "https://github.com/ionic-team/capacitor-plugins"
  },
  {
    "name": "Capacitor Browser",
    "packageName": "@capacitor/browser",
    "license": "MIT",
    "url": "https://github.com/ionic-team/capacitor-plugins"
  },
  {
    "name": "Capacitor Secure Storage",
    "packageName": "@aparajita/capacitor-secure-storage",
    "license": "MIT",
    "url": "https://github.com/aparajita/capacitor-secure-storage/blob/main/LICENSE"
  }
]
export const runtimeLicenses = direct.map(item => ({
  ...item, version: packageInfo.dependencies[item.packageName]
}))
export const otherLicenses = [
  { name: 'Carbon 主题品牌数据', license: '上游许可（需核对原始归属）', url: 'https://github.com/mrjoechen/luci-theme-carbon' },
  { name: 'Simple Icons 图形', license: 'CC0-1.0；单个品牌权利需另查', url: 'https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md' }
]
