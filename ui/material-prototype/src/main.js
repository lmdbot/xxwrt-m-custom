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
        colors: { primary: '#2869e8', surface: '#ffffff', background: '#f5f8fe',
          'on-surface': '#1c283b', 'on-background': '#1c283b', 'on-surface-variant': '#526178',
          success: '#238653', error: '#bf4049' }
      },
      dark: {
        dark: true,
        colors: { primary: '#a9c8ff', surface: '#1b2537', background: '#101826',
          'on-surface': '#f0f4ff', 'on-background': '#f0f4ff', 'on-surface-variant': '#c4d1e5',
          success: '#7ddca8', error: '#ff9ca4' }
      }
    }
  }
})

createApp(App).use(vuetify).mount('#app')
