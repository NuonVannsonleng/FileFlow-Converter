# FileFlow Converter

**Convert Anything. Simply.**

A production-shaped file conversion web app for documents, images, audio, video, and archives.
Upload → choose a format → convert → download.

The defining rule: **the UI only ever offers conversions this server can actually perform.**
The client builds its entire format picker from `GET /api/formats`, which is generated from the
conversion registry filtered by which engines are installed. Nothing in the picker is a dead end.

---

## Quick start

```bash
npm install
cp .env.example .env      # optional; the defaults work as-is
npm run dev
```

- Web client: <http://localhost:5173>
- API: <http://localhost:4000>

Both must be running — `npm run dev` starts them together. The dev server proxies `/api` to the
API process, so the client is same-origin in development exactly as it is in production. That
means no CORS in dev, no `VITE_API_URL` to configure, and `localhost` and `127.0.0.1` both work.
If you start only the client, `/api` has nothing behind it and the app will say so.

`npm install` downloads a bundled FFmpeg build, so audio and video conversion work with no
system-level setup. The install scripts for `ffmpeg-static`, `sharp`, and `esbuild` are
pre-approved in the root `package.json` under `allowScripts`.

### Production

```bash
npm run build
npm start          # serves the API *and* the built client on one origin, port 4000
```

In production the API process also serves `web/dist`, so a deployment is a single Node process
with no CORS hop. In development the two run separately with Vite's HMR.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast builds, code splitting per route |
| Styling | Tailwind CSS with CSS-variable tokens | Dark mode is a real palette swap, not an inversion |
| Animation | Framer Motion | Honours `prefers-reduced-motion` throughout |
| State | Zustand (+ `persist`) | Preferences and history survive a reload |
| Backend | Node + Express + TypeScript (ESM) | Small surface, easy to reason about |
| Images | sharp (libvips) | Fast, plus `bmp-js` / `heic-convert` for what libvips omits |
| Media | FFmpeg (bundled binary) | The only sane answer for audio and video |
| Documents | Native parsers, optional LibreOffice | Works out of the box; upgrades if LibreOffice exists |
| Archives | archiver / unzipper / tar | Streaming, with zip-slip protection |

---

## Project layout

```
shared/src/index.ts      Types shared by the API and the client (the contract)
server/
  src/config/            Environment parsing and validation (zod)
  src/middleware/        Errors, rate limiting, secure upload, static client
  src/routes/            REST endpoints
  src/services/
    conversion/          Format catalogue, registry, and one module per engine
    storage.ts           Temp storage, safe filenames, cleanup sweeper
    jobStore.ts          Persistence boundary (see "Swapping in a database")
    queue.ts             Bounded-concurrency worker
    events.ts            Server-Sent Events hub
web/
  src/components/        UI system + feature components
  src/pages/             Route-level pages
  src/store/             Zustand stores
  src/i18n/              English + Khmer, instant switching
```

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/formats` | Format catalogue, conversion matrix, engine capabilities |
| `POST` | `/api/upload` | Multipart upload; validates type by magic bytes |
| `POST` | `/api/convert` | Queue one or more conversion jobs |
| `GET` | `/api/conversion/:id` | Job status |
| `DELETE` | `/api/conversion/:id` | Delete a job and its files |
| `GET` | `/api/download/:id` | Download a converted file |
| `POST` | `/api/download/batch` | Stream several results as one ZIP |
| `GET` | `/api/history` | Recent jobs |
| `GET` | `/api/events` | SSE stream of live job progress |
| `GET` | `/api/health` | Health and queue depth |

Job statuses: `queued` → `processing` → `completed` | `failed`, and `expired` once the TTL passes.

Errors always return `{ "error": { "code", "message" } }` with a friendly message. Raw engine
output is logged server-side and never returned to a client.

---

## Supported conversions

**187 conversions ship enabled** with a default install; 7 more unlock with LibreOffice.

- **Documents** - TXT->PDF/DOCX, DOCX->PDF/TXT, PDF->TXT/DOCX, ODT->PDF/TXT,
  XLSX/XLS->PDF/CSV, XLS->XLSX, CSV->XLSX/PDF

  Pictures survive both directions: `PDF -> DOCX` lifts embedded images out of the page
  content stream and places them in reading order alongside the text, and `DOCX -> PDF`
  embeds the pictures mammoth extracts. Heading levels in `PDF -> DOCX` are inferred from
  font size relative to the page's body text, since a PDF stores glyphs rather than an outline.
- **Images** — every pair among JPG, PNG, WEBP, TIFF, GIF, AVIF, plus BMP, HEIC, and SVG as sources
- **Audio** — every pair among MP3, WAV, AAC, FLAC, OGG, M4A
- **Video** — every pair among MP4, MOV, WEBM, AVI, MKV; any of them to audio; any of them to GIF
- **Archives** — TAR/TAR.GZ→ZIP, ZIP→TAR.GZ, TAR↔TAR.GZ, extract, and compress any file to ZIP

### Enabling the LibreOffice conversions

DOC, PPT, PPTX, and RTF have no reliable pure-JS parser, so they are gated behind a real
LibreOffice install. Without it, the API reports them as unavailable and the UI shows them as
**"Coming soon"** rather than letting you start a conversion that would fail.

Install LibreOffice, then either let auto-detection find it or set the path explicitly:

```bash
LIBREOFFICE_PATH="C:\Program Files\LibreOffice\program\soffice.exe"   # Windows
LIBREOFFICE_PATH=/usr/bin/soffice                                     # Linux
```

Restart the server; `GET /api/formats` will report the engine as available and the extra
conversions appear in the picker automatically.

---

## Configuration

All settings live in `.env` (see `.env.example`).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `STORAGE_DIR` | `./storage` | Where temp files live |
| `MAX_FILE_SIZE_MB` | `200` | Per-file upload cap |
| `MAX_FILES_PER_BATCH` | `20` | Files per batch |
| `FILE_TTL_MINUTES` | `60` | How long a converted file stays downloadable |
| `QUEUE_CONCURRENCY` | `2` | Simultaneous conversions |
| `RATE_LIMIT_MAX_UPLOADS` | `100` | Uploads/conversions per window |
| `LIBREOFFICE_PATH` | *(auto)* | Path to `soffice` |
| `PDF_FONT_PATH` | *(auto)* | TrueType font embedded in generated PDFs |
| `PDF_FONT_BOLD_PATH` | *(auto)* | Bold face for the above |
| `VITE_API_URL` | *(unset)* | Only for split deployments; leave unset for same-origin |
| `VITE_PROXY_TARGET` | `http://localhost:4000` | Where the dev server proxies `/api` |

---

## Fonts in generated PDFs

PDF's built-in fonts only cover Latin-1, so anything outside it (Khmer, Thai, CJK, and much
of Cyrillic and Greek) would be written as `?`. To avoid that, a broad system font is
detected and embedded automatically - Arial or Segoe UI on Windows, DejaVu or Liberation on
Linux, Arial on macOS.

Those cover Latin, Cyrillic and Greek but **not** Khmer or CJK. For those, point the server
at a font that actually contains the glyphs:

```bash
PDF_FONT_PATH=C:/Windows/Fonts/KhmerOS.ttf        # Khmer, on Windows
PDF_FONT_BOLD_PATH=C:/Windows/Fonts/KhmerOSmuol.ttf
```

Character substitution only happens when no embeddable font is found at all.

---

## Security and privacy

- **Type validation by content, not extension.** Every upload is sniffed with `file-type`; a
  renamed executable is rejected. Container formats that legitimately share a signature (OOXML is
  a ZIP, legacy Office is a CFB, `.tar.gz` is gzip) are handled by an explicit equivalence table.
- **Filenames never touch the filesystem.** Stored files are named by a generated UUID; the
  display name lives in the job record. Path traversal has no surface.
- **Uploaded files are never executed.** They are only ever read by a conversion engine.
- **Zip-slip protection.** Archive entries resolving outside the extraction root are skipped.
- **Bounded settings.** Codec names and every numeric option are validated against a strict zod
  schema before reaching FFmpeg or sharp.
- **Automatic cleanup.** Source files are deleted the moment a job settles. Converted files are
  swept on a timer once `FILE_TTL_MINUTES` passes, and the job is marked `expired`.
- **Rate limiting** on all API routes, with a tighter budget for uploads and conversions.
- **Helmet** security headers; downloads are sent `no-store` with `nosniff`.

---

## Accessibility

- Full keyboard operation, including a keyboard path into the dropzone (drag is never the only
  way to add a file).
- Focus trap and focus restoration in modals; Escape closes.
- ARIA roles on progress bars, toasts (`alert` for errors, `status` otherwise), switches, and
  radio groups.
- Skip-to-content link, visible focus rings, and semantic landmarks.
- `prefers-reduced-motion` collapses every animation and transition.

---

## Internationalisation

English and Khmer, switching instantly with no reload.

Adding a language takes two steps: create `web/src/i18n/<code>.ts` exporting a
`DeepPartial<Translations>`, and add it to `LANGUAGES` and `BUNDLES` in `web/src/i18n/index.ts`.
Translation keys are a typed union derived from the English bundle, so a typo is a build error,
and any key a locale omits falls back to English one string at a time.

---

## Swapping in a database

The app runs with no external services: jobs live in memory with a JSON snapshot on disk, which
suits artefacts that expire within the hour. Everything goes through the `JobStore` interface in
`server/src/services/jobStore.ts` — implementing it against PostgreSQL and swapping the exported
instance is the entire change. Nothing in the routes or the queue touches storage directly.

Likewise, `ConversionQueue` exposes `enqueue` plus events, the same shape a BullMQ worker would,
so moving conversions into a separate process is a swap rather than a rewrite.

---

## Not implemented

- **User accounts.** CLAUDE.md lists these as optional, and every conversion feature works
  anonymously. Conversion history is kept privately in the browser's own storage instead.
- **Paid plans.** The pricing page shows Pro and Team as roadmap items, clearly marked as not
  purchasable, with disabled controls. There is no billing code.
