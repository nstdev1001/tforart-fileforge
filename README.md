# FileForge

Windows desktop task manager and file automation foundation built with Tauri v2, Rust, React, TypeScript, Tailwind CSS, shadcn/ui conventions, Zustand, React Hook Form, Zod, and SQLite.

## Phase 1 status

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
```

`npm run dev` runs the browser UI only. Native folder picking, disk-space inspection, and SQLite health are available when running `npm run tauri:dev`.

## Phase 1 file map

```text
.
├── components.json                   # shadcn/ui aliases and style configuration
├── package.json                      # frontend, test, and Tauri scripts/dependencies
├── vite.config.ts                    # Vite, React, Tailwind v4, Vitest
├── src/
│   ├── App.tsx                       # view composition
│   ├── components/
│   │   ├── layout/                   # sidebar, top bar, desktop shell
│   │   ├── tasks/task-card.tsx       # all five task states
│   │   └── ui/                       # shadcn-style primitives
│   ├── hooks/use-theme.ts            # system/light/dark synchronization
│   ├── lib/tauri.ts                  # typed Rust command client
│   ├── pages/                        # five primary application views
│   ├── store/app-store.ts            # Zustand UI/task state
│   ├── styles/globals.css            # Tailwind and design tokens
│   ├── test/setup.ts                 # Vitest DOM setup
│   └── types/                        # task and system contracts
├── src-tauri/
│   ├── capabilities/default.json     # minimum Tauri core permissions
│   ├── migrations/0001_initial.sql   # Phase 1 SQLite schema
│   ├── src/commands.rs               # folder picker, disk space, DB health
│   ├── src/database.rs               # connection, pragmas, migrations
│   ├── src/lib.rs                    # Tauri application builder
│   ├── src/main.rs                   # Windows executable entry point
│   └── tauri.conf.json               # window, security, bundle configuration
└── scripts/verify-phase1.ps1         # frontend + Rust verification
```

OAuth credentials are intentionally not part of Phase 1. They must never be committed to the repository; Phase 2 will add the secure credential flow and its environment template.

