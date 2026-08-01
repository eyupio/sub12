/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_ANDROID_APK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
