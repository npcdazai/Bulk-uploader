# Lead Pusher — frontend (internal upload UI)

React 19 + TypeScript + Vite + Chakra UI v3, with react-hook-form + yup, axios and
react-router-dom. Uses a `@/` path alias (vite-tsconfig-paths).

## Features
- **Login gate** (`/login`) — client-side auth so the tool isn't left open.
- **Upload page** (`/`, protected) — Batch Size, Delay Between Batches, and an
  `.xlsx` dropzone. Validates with yup, POSTs `multipart/form-data` to
  `{VITE_BASEURL}/api/upload`, shows success, and renders backend header-validation
  errors (missing / required / found headers) as a readable alert.

## Setup
```bash
cd frontend
cp .env.example .env       # set VITE_BASEURL + auth creds (+ token if backend uses one)
npm install
npm run dev                # http://localhost:5173
```

## Env vars
| Var | Purpose |
|-----|---------|
| `VITE_BASEURL` | Uploader API base URL (e.g. `http://localhost:4000`) |
| `VITE_UPLOAD_API_TOKEN` | Sent as `x-api-token`; must match backend `UPLOAD_API_TOKEN` if set |
| `VITE_AUTH_USERNAME` / `VITE_AUTH_PASSWORD` | Credentials for the login gate |

## Build
```bash
npm run build && npm run preview
```
