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

| Path                         | Purpose                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks.server.ts`        | Startup (migrations, background jobs) and the cross-site check on every request                                                                 |
| `src/lib/server/config.ts`   | Reads and validates environment variables (zod). The only place that reads `process.env`.                                                       |
| `src/lib/server/security.ts` | The cross-site (CSRF) check, which accepts several URLs                                                                                         |
| `src/lib/server/db/`         | Schema (`schema.ts`) and the connection plus migration runner (`client.ts`)                                                                     |
| `src/lib/server/providers/`  | Metadata sources behind one interface: `tmdb.ts`, `anilist.ts`, `tvmaze.ts`, plus `anime-mapping.ts` and the rate-limited HTTP client `http.ts` |
| `src/lib/server/services/`   | Business logic used by pages. `catalog.ts`: search, trending, title and season lookups with caching                                             |
| `src/lib/server/cache.ts`    | `cached(key, ttl, fn)`: SQLite-backed response cache. Concurrent calls share one request, and a stale value is served if a refresh fails.       |
| `src/lib/server/jobs/`       | In-process scheduler (`scheduler.ts`) and the job list (`index.ts`). Runs are recorded in `job_runs`.                                           |
| `src/lib/catalog/`           | Provider-neutral types (`types.ts`) and airing-status logic (`airing.ts`), shared by server and UI                                              |
| `src/lib/media-types/`       | The media-type registry (see below)                                                                                                             |
| `src/lib/components/`        | UI building blocks: `PosterCard`, `MediaRow`, `EpisodeRow`, `Img`, …                                                                            |
| `src/routes/(app)/`          | Pages inside the navigation shell: home, search, title, library, upcoming, settings                                                             |
| `drizzle/`                   | Generated SQL migrations. These are committed and shipped in the image.                                                                         |
| `docker/`                    | Container entrypoint (sets ownership, drops privileges) and health check script                                                                 |

## Request flow

```
page load (+page.server.ts)
  → services/catalog.ts           search / getTitle / getSeason
    → cache.ts                    hit? return it
    → providers/<source>.ts       fetch through the rate-limited queue (http.ts)
      → map to catalog/types.ts   provider-neutral shapes
```

Pages never call providers directly, and providers never touch the UI. Everything between them uses
the types in `src/lib/catalog/types.ts`.

## Metadata sources

| Provider    | Used for                                                                                 | Rate limit used                  |
| ----------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| TMDB        | Search, trending, movie and TV details, seasons and episodes (including anime structure) | 20 requests/s, 8 at once         |
| AniList     | Anime search and trending, exact airing times, AniList-only titles                       | about 27 requests/min, 2 at once |
| TVmaze      | Exact air times for TV shows (wired in during phase 3)                                   | 18 requests/10s                  |
| anime-lists | AniList → TMDB id mapping, refreshed weekly by the `anime-mappings` job                  | —                                |

**How anime works:** an AniList search result is looked up in `anime_mappings`. If it maps to a
TMDB show, the result links to that show at the mapped season (`/title/tv/95479?season=2`), so
anime is tracked TV-style. Several AniList entries for one show are merged into one result. Titles
without a TMDB entry, or any anime while TMDB isn't configured, open an AniList-only page
(`/title/anime/<anilist id>`) with a flat episode list.

**Cache lifetimes:** search and trending results are kept for 6 hours, title details and seasons for
12 hours. Expired entries are kept for another 7 days so a stale value can be served when a provider
is down. The daily `cleanup` job removes them after that.

## Design principles

- **Built to be extended.** New media types and data sources plug into the registry and the
  `MetadataProvider` interface. The library, history, search and stats work with any registered
  media type.
- **Generic statuses and activity.** Library statuses are stored as
  `planned / in_progress / completed / on_hold / dropped`, and each media type supplies its own
  labels ("Watching" vs "Reading").
- **Local metadata for library titles only.** Full show and episode data is stored only for titles
  someone has added (phase 2). Everything else lives in the response cache.
- **Lazy database access.** `getDb()` opens the database on first use, so `vite build` never touches
  the data directory.

## Media-type registry

`src/lib/media-types/registry.ts` lists every media type. Each one, in
`src/lib/media-types/<type>/index.ts`, exports a `MediaTypeDefinition`:

```ts
export const show: MediaTypeDefinition = {
	id: 'show',
	label: 'TV show',
	pluralLabel: 'TV shows',
	searchFilter: 'tv', // the search tab it appears under
	progressModel: 'episodic', // single | episodic | chapters | pages
	statusLabels: VIDEO_STATUS_LABELS, // "Watchlist", "Watching", …
	consumedLabel: 'Watched',
	providers: { search: ['tmdb'], details: ['tmdb', 'tvmaze'] },
	formatUnit: formatEpisodeCode // { season: 2, number: 5 } → "S02E05"
};
```

The search tabs come from the registry, and so will library filters and labels.

## Adding a media type (example: books)

1. **Types:** add `'book'` to `MediaTypeId` (and a `TitleKind` and `SearchFilter` value if it gets
   its own route and tab) in `src/lib/catalog/types.ts`.
2. **Definition:** create `src/lib/media-types/book/index.ts` with `progressModel: 'pages'`, reading
   labels (`planned: 'Plan to read'`, `in_progress: 'Reading'`, `completed: 'Read'`, …) and
   `` formatUnit: ({ number }) => `p. ${number}` ``. Register it in `registry.ts`.
3. **Provider:** create `src/lib/server/providers/openlibrary.ts` implementing `MetadataProvider`
   (`search`, `getTitle`). Map responses to `SearchResult` and `TitleDetails`, use
   `createHttpClient` with the service's rate limit, and add it to `providers/index.ts`.
4. **Catalog:** route the new search filter and title kind to the provider in
   `services/catalog.ts`.
5. **Database:** only if new data is needed (e.g. chapters), add tables in `schema.ts` and run
   `npm run db:generate`. Make additive changes only.
6. **Tests:** add mapping tests next to the existing ones in `tests/unit/`.

## Adding a background job

Add an entry to `src/lib/server/jobs/index.ts`:

```ts
{ name: 'my-job', schedule: '0 5 * * *', runOnStart: false, run: async () => 'what happened' }
```

The scheduler prevents overlapping runs, records each run in `job_runs` and shows it under
**Settings → Background jobs**.
