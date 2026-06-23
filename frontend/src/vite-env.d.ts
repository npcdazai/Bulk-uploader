/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASEURL?: string;
  readonly VITE_UPLOAD_API_TOKEN?: string;
  readonly VITE_AUTH_USERNAME?: string;
  readonly VITE_AUTH_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
