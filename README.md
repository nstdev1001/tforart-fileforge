# FileForge

Windows desktop task manager and file automation foundation built with Tauri v2, Rust, React, TypeScript, Tailwind CSS, shadcn/ui conventions, Zustand, React Hook Form, Zod, and SQLite.

## Implementation status

Implemented:

- Tauri v2 desktop shell with a Vite + React frontend.
- SQLite database initialized in the OS app-data directory (`fileforge.db`) with transactional, versioned migration.
- `tasks`, `watchers`, `settings`, and `logs` tables, constraints, indexes, and safe defaults.
- Native Rust commands for folder selection, volume total/free space, and database health.
- Responsive desktop layout with Dashboard, Tasks, Watchers, History, and Settings views.
- Light, dark, and system theme support persisted with Zustand.
- Reusable Task Card visuals for Queued, Running, Paused, Failed, and Completed states.
- Settings form using React Hook Form + Zod.
- Frontend component/unit tests and Rust migration/command tests.
- OAuth2 Authorization Code flow for desktop with PKCE S256, CSRF state validation, a random loopback port, and a five-minute timeout.
- Access and refresh token storage in the native Windows Credential Manager; tokens are never sent into the React webview or SQLite.
- Automatic access-token refresh with a safety window and a single-flight refresh lock.
- Google Drive API commands for connection testing, folder listing, file metadata, and `webViewLink` retrieval.
- Google Drive connection UI in Settings with account/quota information and a root-folder browser.
- 7-Zip discovery through SQLite settings, standard Windows install locations, and process PATH.
- Compress-folder workflow with preflight source sizing, temporary-volume free-space validation, native 7-Zip progress parsing, and cache cleanup.
- Google Drive resumable ZIP upload using 8 MiB chunks, persisted session URI, `308 Range` recovery, retryable `429/5xx` handling, and exponential backoff.
- Pause/resume between upload chunks, live speed/ETA/bytes/retry metrics, SQLite task/log persistence, public reader permission, and final `webViewLink`.
- Safe Google Drive link/file-ID parser for common `drive.google.com` and `docs.google.com` URL forms with strict host and ID validation.
- Authenticated streaming ZIP downloads using `files.get?alt=media`, HTTP Range recovery, pause/resume, backoff, and persisted task metrics.
- ZIP metadata/capability validation, archive path traversal checks, uncompressed-size disk preflight, native 7-Zip extraction, temporary download cleanup, and automatic Explorer open.

## Requirements

- Node.js 20.19+ or 22.12+ (Node 24 is supported)
- Rust stable with the MSVC target
- Microsoft C++ Build Tools and WebView2, as required by Tauri on Windows

## Commands

```powershell
npm install
npm run dev
npm run test
npm run build
npm run tauri:dev
./scripts/verify-phase1.ps1
./scripts/verify-phase2.ps1
./scripts/verify-phase3.ps1
./scripts/verify-phase4.ps1
```

`npm run dev` runs the browser UI only. Native folder picking, disk-space inspection, and SQLite health are available when running `npm run tauri:dev`.

The Tauri npm commands use `scripts/run-tauri.ps1`, which locates Cargo in the standard rustup directory and repairs a stale process PATH locally. This prevents `cargo metadata ... program not found` after installing Rust while an existing terminal or Codex session is still open.

## Project file map

```text
.
├── components.json                   # shadcn/ui aliases and style configuration
├── package.json                      # frontend, test, and Tauri scripts/dependencies
├── vite.config.ts                    # Vite, React, Tailwind v4, Vitest
├── src/
│   ├── App.tsx                       # view composition
│   ├── components/
│   │   ├── google/                   # OAuth/Drive settings UI
│   │   ├── layout/                   # sidebar, top bar, desktop shell
│   │   ├── tasks/task-card.tsx       # all five task states
│   │   └── ui/                       # shadcn-style primitives
│   ├── hooks/use-theme.ts            # system/light/dark synchronization
│   ├── lib/tauri.ts                  # typed Rust command client
│   ├── pages/                        # five primary application views
│   ├── store/app-store.ts            # Zustand UI/task state
│   ├── styles/globals.css            # Tailwind and design tokens
│   ├── test/setup.ts                 # Vitest DOM setup
│   └── types/                        # task, Drive, and system contracts
├── src-tauri/
│   ├── capabilities/default.json     # minimum Tauri core permissions
│   ├── migrations/0001_initial.sql   # Phase 1 SQLite schema
│   ├── src/commands.rs               # folder picker, disk space, DB health
│   ├── src/database.rs               # connection, pragmas, migrations
│   ├── src/google/                    # OAuth, keyring, and Drive API client
│   ├── src/lib.rs                    # Tauri application builder
│   ├── src/main.rs                   # Windows executable entry point
│   └── tauri.conf.json               # window, security, bundle configuration
└── scripts/                          # Phase 1 and Phase 2 verification
```

## Google Drive OAuth setup

1. Create or select a Google Cloud project.
2. Enable **Google Drive API** in APIs & Services → Library.
3. Configure the Google Auth Platform consent screen, add your user as a test user while the app is in Testing, and declare the Google Drive scope.
4. Create an OAuth client with application type **Desktop app**. Loopback redirects on `127.0.0.1` use a random runtime port and do not need a fixed redirect URI entry for a Desktop client.
5. Copy `.env.example` to `.env`, then populate both values:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

6. Run `npm run tauri:dev`, open Settings, and choose **Connect Google Drive**.

FileForge currently requests `https://www.googleapis.com/auth/drive` because later phases must upload to user-selected folders, download an arbitrary Drive file supplied by link, and manage sharing permissions. This is a restricted scope for public external apps and can require Google verification. During development, keep the consent screen in Testing and explicitly add test users.

Although Google Desktop application client secrets cannot be treated as confidential once an app is distributed, this repository still accepts the provided client secret through the native process environment and never exposes it to Vite or the webview. OAuth access and refresh tokens receive the stronger at-rest protection of Windows Credential Manager.

## Compress and upload a folder

1. Run `npm run tauri:dev` and confirm Google Drive is connected in Settings.
2. Confirm the **7-Zip engine** card reports Ready. A custom `7z.exe` path can be persisted there if automatic discovery fails.
3. Open Tasks → New task, choose a source folder and Drive destination, then start **Compress & upload**.
4. Task Cards receive native progress events and expose Pause/Resume during active work. Pausing while compression is running takes effect before the upload stage; upload pauses between chunks.
5. A successful task exposes a copyable Drive link and removes its temporary ZIP from the app cache.

Resumable sessions and progress are persisted for the recovery worker scheduled in Phase 5. Phase 3 performs automatic in-process network recovery and retains a failed task's temporary ZIP for diagnostics/retry rather than deleting evidence of the failure.

## Download and extract a Drive ZIP

1. Open Tasks → **Download & extract**.
2. Paste a raw Drive file ID or a standard Google Drive sharing link.
3. Choose a local destination. **Create a new subfolder** is enabled by default to prevent accidental overwrites; duplicate names receive a numeric suffix.
4. FileForge validates Drive metadata and download permission before creating the task, downloads with byte-range recovery, and rejects ZIP entries containing absolute or parent-traversal paths.
5. After extraction, the temporary ZIP is deleted and the result folder opens in Windows Explorer. Failed tasks keep the downloaded ZIP for diagnostics.
