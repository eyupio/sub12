import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'uk.sub12.app',
  appName: 'SUB12',
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
      // main.tsx calls SplashScreen.hide() as soon as the web layer boots, so
      // the launch image is dismissed on the app's schedule rather than a
      // fixed timer. The fade keeps that handover from reading as a flash.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0C0C0C',
      showSpinner: false,
      fadeOutDuration: 200,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: false,
    },
    Haptics: {},
  },
  android: {
    // The WebView background shows through during navigation and overscroll;
    // matching it to --gunmetal stops a white flash between screens.
    backgroundColor: '#0C0C0C',
    // Chrome-on-Android caches aggressively during development; on release
    // builds the assets are bundled so this only affects local iteration.
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#0C0C0C',
    contentInset: 'never',
  },
  server: {
    // Use local dev server during development
    // Comment out for production builds
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
}

export default config
