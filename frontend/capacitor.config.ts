import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'uk.sub12.benchrest',
  appName: 'sub-12',
  webDir: 'dist',
  server: {
    // Use local dev server during development
    // Comment out for production builds
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
}

export default config
