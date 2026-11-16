import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import './style.css'
import './style-v3.css'

const vuetify = createVuetify({
  components,
  directives,
  // Keep outlined form labels above their values/placeholders on Android WebView.
  // This also covers prefilled inputs, native time controls and compact selects.
  defaults: {
    VTextField: { active: true },
    VSelect: { active: true },
    VTextarea: { active: true }
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: { primary: '#2477ee', surface: '#ffffff', background: '#f3f7fd',
          'on-surface': '#12233f', 'on-background': '#12233f', 'on-surface-variant': '#63758e',
          success: '#14aa65', error: '#dc505b' }
      },
      dark: {
        dark: true,
        colors: { primary: '#83b6ff', surface: '#182437', background: '#0f1727',
          'on-surface': '#f0f4ff', 'on-background': '#f0f4ff', 'on-surface-variant': '#a9b7cc',
          success: '#56d59b', error: '#ff8790' }
      }
    }
  }
})

createApp(App).use(vuetify).mount('#app')
