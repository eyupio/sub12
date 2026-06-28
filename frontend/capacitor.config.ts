import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'uk.sub12.app',
  appName: 'sub12',
  webDir: 'dist',
  plugins: {
    // Route fetch/XHR through the native HTTP stack. This lets the WebView talk
    // to https://sub12.io without browser CORS preflight and lets the native
    // cookie manager handle Set-Cookie, which a sandboxed WebView origin
    // (capacitor://localhost / https://localhost) otherwise can't persist.
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0C0C0C',
      showSpinner: false,
    },
  },
  server: {
    // Use local dev server during development
    // Comment out for production builds
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
}

export default config
