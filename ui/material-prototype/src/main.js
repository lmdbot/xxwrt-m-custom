import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import './style.css'

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: { primary: '#4164d5', surface: '#ffffff', background: '#f5f6fb', success: '#238653', error: '#bf4049' }
      },
      dark: {
        dark: true,
        colors: { primary: '#aabdfd', surface: '#1d2029', background: '#11141b', success: '#7ddca8', error: '#ff9ca4' }
      }
    }
  }
})

createApp(App).use(vuetify).mount('#app')
