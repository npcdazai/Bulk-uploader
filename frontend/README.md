# Lead Pusher — frontend (internal upload UI)

React 19 + TypeScript + Vite + Chakra UI v3, with react-hook-form + yup, axios and
react-router-dom. Uses a `@/` path alias (vite-tsconfig-paths).

## Features
- **Login gate** (`/login`) — client-side auth so the tool isn't left open.
- **Product selection** (`/`, protected) — first screen after login: pick the
  lender product to push leads to (Personal Loan / Gold Loan / Housing Loan).
  Selecting one opens its upload form.
- **Upload page** (`/upload/:product`, protected) — Batch Size, Delay Between
  Batches, and an `.xlsx` dropzone for the chosen product. Validates with yup,
  POSTs `multipart/form-data` (incl. `product`) to `{VITE_BASEURL}/api/upload`,
  shows success, and renders backend header-validation errors (missing / required
  / found headers — which vary per product) as a readable alert. A "Change
  product" link returns to the selection screen.

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
