/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_LEGAL_CONTACT_EMAIL?: string
  readonly VITE_OPERATOR_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
