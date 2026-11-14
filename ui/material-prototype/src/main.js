import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import './style.css'

const vuetify = createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: { primary: '#4164d5', surface: '#ffffff', background: '#f5f6fb',
          'on-surface': '#1c283b', 'on-background': '#1c283b', 'on-surface-variant': '#526178',
          success: '#238653', error: '#bf4049' }
      },
      dark: {
        dark: true,
        colors: { primary: '#aabdfd', surface: '#1d2029', background: '#11141b',
          'on-surface': '#f0f4ff', 'on-background': '#f0f4ff', 'on-surface-variant': '#c4d1e5',
          success: '#7ddca8', error: '#ff9ca4' }
      }
    }
  }
})

createApp(App).use(vuetify).mount('#app')
