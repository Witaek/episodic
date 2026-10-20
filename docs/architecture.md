# Architecture

Episodic is a single **SvelteKit** app (Svelte 5, TypeScript) running on Node.js. It serves both
the UI and the API, and stores everything in one **SQLite** database accessed through **Drizzle
ORM**. It's one process in one container, with no Redis or separate worker.

```
Browser / installed app (PWA)
        │  HTTPS (Tailscale) or HTTP (LAN)
        ▼
SvelteKit server (adapter-node, port 3000)
  ├─ routes/          pages and /api endpoints
  ├─ hooks.server.ts  startup (migrations, scheduler), cross-site check, sessions
  ├─ services/        business logic: library, tracking, progress, airing, history
  ├─ providers/       TMDB, AniList, TVmaze clients behind one interface + rate-limited queue
  ├─ jobs/            scheduled refreshes and backups (in-process)
  └─ db/              Drizzle schema + SQLite (WAL) in $DATA_DIR/episodic.db
```

## Code layout

| Path                         | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `src/hooks.server.ts`        | Runs migrations at startup and applies the cross-site check to every request              |
| `src/lib/server/config.ts`   | Reads and validates environment variables (zod). The only place that reads `process.env`. |
| `src/lib/server/security.ts` | The cross-site (CSRF) check, which accepts several URLs                                   |
| `src/lib/server/db/`         | Schema (`schema.ts`) and the connection plus migration runner (`client.ts`)               |
| `drizzle/`                   | Generated SQL migrations. These are committed and shipped in the image.                   |
| `src/routes/api/health`      | Health endpoint used by the Docker health check                                           |
| `docker/`                    | Container entrypoint (sets ownership, drops privileges) and health check script           |

## Design principles

- **Built to be extended.** New media types (books and manga are planned) and new data sources
  plug into a **media-type registry** and a **`MetadataProvider` interface**, both introduced in
  phase 1. The library, history, search and stats features work with any registered media type.
  The registry is described in more detail below.
- **Generic statuses and activity.** Library statuses are stored as
  `planned / in_progress / completed / on_hold / dropped`, and each media type supplies its own
  labels ("Watching" vs "Reading"). Watches and reads are both stored as rows in one activity table.
- **Local metadata for library titles only.** Full show and episode data is stored only for titles
  someone has added. Search results are cached briefly.
- **Lazy database access.** `getDb()` opens the database on first use, so `vite build` never touches
  the data directory.
- **One source of configuration.** `config()` validates the environment once and fails with a
  readable message.

## Media-type registry (phase 1+)

Each media type will live in `src/lib/media-types/<type>/` and declare:

- **providers**: which metadata providers it searches and refreshes from
- **progress model**: `single` (movie, book), `episodic` (show, anime), `chapters` (manga), or `pages` (book)
- **status labels**: e.g. Watchlist / Watching / Watched, or Plan to read / Reading / Read
- **UI pieces**: card subtitle, title-page tabs, the "next up" label (`S02E05`, `Ch. 112`, `p. 240`)

Adding a media type then means adding one folder, one provider and an additive migration. A guide
will be added here when the registry lands.
