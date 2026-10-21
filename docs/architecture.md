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

## Accounts and access

- `hooks.server.ts` reads the session cookie and sets `locals.user`. Every page except `/login`,
  `/setup` and `/api/health` requires a signed-in user: pages redirect to `/login`, and API
  routes answer 401.
- Until the first account exists, everything redirects to `/setup`.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when the request came over HTTPS (directly or
  via `X-Forwarded-Proto`, as with Tailscale Serve).
- Each user's library, history and preferences are separate. Title and episode metadata is shared.

## Tracking model

- **Local titles.** Adding a title or marking anything stores the title, its seasons and its episodes
  in `titles`, `seasons` and `episodes`. Episodes are upserted by (season, number), so their ids stay
  stable when metadata is refreshed and history keeps pointing at the right rows.
- **Activity.** Every watch is one row in `activity_events`, and rewatches add more rows. "Watched"
  means at least one row exists. Unwatching removes the most recent row, and Undo removes exactly
  the rows a previous action created.
- **Next up** is the first aired, unwatched episode after the furthest watched one, so a skipped
  episode doesn't block progress. Specials (season 0) count only when the user enables it.
- **Automatic statuses** (`applyAutoStatus` in `tracking.ts`): watching moves a title to Watching;
  every aired episode of an ended or canceled show watched → Completed; a Completed show with
  unwatched aired episodes → Watching; a watched movie → Completed.

## Installable app (PWA)

- `static/manifest.webmanifest` and the icons in `static/icons/` (regenerate them with
  `npm run icons`) make the app installable. `app.html` adds the iOS meta tags.
- `src/service-worker.ts` (SvelteKit's built-in service worker):
  - precaches the app shell (JS, CSS, fonts, icons) per version;
  - pages and their `__data.json` are network-first, falling back to the last copy cached on the
    device (up to 40), then to `static/offline.html`;
  - posters and backdrops are cache-first (up to 400);
  - `/api/*` always goes to the network.
- Signing out deletes the cached pages (`clearCachedPages` in `src/lib/pwa.svelte.ts`).
- The theme (System, Dark or Light) is stored in a cookie, so the server renders the right one with
  no flash. `hooks.server.ts` fills `%episodic.theme%` in `app.html`.
- Page changes use the View Transitions API. The tapped poster morphs into the title page poster
  (`src/lib/transitions.ts`). This is skipped when the user prefers reduced motion.

## Anime franchises and book editions

- **Anime movies** (`services/franchise.ts`): entries of one franchise share a TVDB id in
  `anime_mappings`, which links TMDB movies to their TMDB show. Many films are listed there only
  as specials of their show with an IMDb id; `anime_movie_links` keeps their TMDB movie id, found
  with TMDB's `/find` (daily `anime-movie-links` job, and on the show page). Show pages list the movies,
  movie pages link to the show, and `foldAnimeMovies` (search) and the Library's `foldMovies`
  hide a movie when its show is listed next to it, adding "+N movies" to the show.
- **Book editions** (`services/books.ts`): searching with a language (Open Library's `lang` plus
  a `language:` filter) returns each work's best edition in that language. Links carry
  `?edition=`, and actions on that page save the edition (title, cover, pages, language) in
  the reader's `library_entries.progress.edition`. The work stays shared; Library, History and
  page progress show the reader's edition.

## The Read side

Books, book series and manga live under `/read/…`; everything else under `/`, `/title/…`. The two
sides share code and differ by a `Section` (`src/lib/section.ts`):

- **Which side.** `sectionFor(url, remembered)` decides from the path; History and Settings are
  shared and use `?section=` or the side remembered in the `episodic_section` cookie.
  `hooks.server.ts` sends `/` to `/read` when Read was the last side, and sets
  `<html data-section>` so `app.css` switches to the amber accent and serif headings.
- **Shared pages.** `server/library-page.ts`, `server/search-page.ts` and `server/title-page.ts`
  load Library/Shelf, Search and title pages for either side; the route files are thin wrappers
  around `LibraryPage.svelte`, `SearchPage.svelte` and `TitlePage.svelte`. `listLibrary`,
  `upNext`, `upcoming`/`scheduleBetween` and `listHistory` take a `section` filter
  (`READ_MEDIA_TYPES`); notifications and watch stats ignore read types.
- **Kinds.** `book` (Open Library work), `series` (Wikidata Q-number), `manga` (AniList id) and
  `collection` (a series grouped by hand, provider `local`, stored only in the database).
  Series and manga are shaped like shows by `services/reading.ts`: a series' numbered books are
  season 1 (extras season 0); a manga's volumes are seasons and chapters episodes, with
  `services/manga-volumes.ts` spreading chapters MangaDex doesn't place. `episodes.external_id`
  holds the book's Open Library work and `episodes.pages` its page count.
- **Books into series.** `services/book-series.ts` moves a user's events, page and status from a
  single book into its series (`absorbBook`), from the book page and the daily
  `books-into-series` job. It also creates, fills and restores hand-made series.
- **Editions and language.** `services/book-details.ts` picks the default edition in the
  reader's language (`defaultEdition`) and a summary in it (`localizedSummary`: edition blurb, then
  Wikipedia). The reader's own choice lives in `user_editions` (`services/books.ts`), applied to
  book pages, series lists, the Shelf and History.
- **Search.** `services/read-search.ts` folds book results into series cards
  (`foldIntoSeries`, membership from `wikidata.seriesForWorks`, cached a week).
- **Adaptations.** `services/adaptations.ts` reads Wikidata "based on" (P144) with TMDB ids, and
  for manga AniList relations plus the anime mapping.
- **Reading stats** (`services/reading-stats.ts`) count finished books, finished manga volumes
  (every chapter read) and pages; the yearly goal is `prefs.readingGoal`.
- **Scanning.** `/read/scan` uses the native `BarcodeDetector` or the `barcode-detector` ponyfill,
  whose WebAssembly file is bundled (`zxing-wasm/reader/zxing_reader.wasm?url`) instead of loaded
  from a CDN. `/api/books/isbn/<isbn>` looks the edition up on Open Library.

## Calendar, notifications and stats

- `services/upcoming.ts` → `scheduleBetween(user, from, to)` is the one query behind the Upcoming
  list, the month calendar and the iCal feed (`services/calendar-feed.ts`, `server/ics.ts`).
- `/calendar/<token>.ics` is outside sign-in: `users.calendar_token` is the credential and can be
  reset or turned off.
- `services/notifications.ts` keeps destinations in `notification_targets` (Web Push subscription,
  ntfy topic or Discord webhook) and remembers delivered episodes in `notifications_sent`. The
  `notify-new-episodes` job runs every 10 minutes. The Web Push (VAPID) key pair is generated on
  first use and stored in `app_meta`. The service worker shows push messages and opens the show
  when one is tapped.
- `services/stats.ts` computes everything from `activity_events` on request. Runtimes come from
  the episode, then the title, then a default per type.

## Keeping metadata fresh

The `refresh-titles` job runs every 20 minutes and refreshes up to 25 overdue titles per run
(`services/refresh.ts`). Only titles in someone's library or history are refreshed.

| Tier    | Which titles                                                  | Refreshed every |
| ------- | ------------------------------------------------------------- | --------------- |
| hot     | An episode or release between 3 days ago and 14 days from now | 6 hours         |
| active  | Returning, in production, planned or upcoming                 | day             |
| settled | Ended, canceled, released movies                              | 30 days         |

- **Partial refreshes.** A refresh re-fetches the title and only the seasons that are new or among
  the last two. Every 30 days a full refresh fetches all seasons. This keeps TMDB requests low even
  for shows with many seasons. TMDB's `/changes` feed isn't used: it lists every change on TMDB
  (tens of pages a day), which costs more than refreshing a household-sized library directly.
- **Exact air times** (`services/airing.ts`): for anime, AniList's upcoming airing schedule is
  mapped to TMDB episodes through `anime_mappings` (season + episode offset). For other shows,
  TVmaze is looked up by TVDB/IMDb id, and the id is remembered. The times are stored in
  `episodes.air_at` and kept across refreshes unless the episode's date changes.
- **New episodes.** After a refresh, episodes that aired since the previous refresh re-open
  _Completed_ entries as _Watching_.
- A failing title is pushed back to the end of the queue, so one broken title doesn't block the
  others. The outcome of each run is under **Settings → Background jobs**.

## Metadata sources

| Provider     | Used for                                                                                 | Rate limit used                  |
| ------------ | ---------------------------------------------------------------------------------------- | -------------------------------- |
| TMDB         | Search, trending, movie and TV details, seasons and episodes (including anime structure) | 20 requests/s, 8 at once         |
| AniList      | Anime search and trending, exact airing times, AniList-only titles                       | about 27 requests/min, 2 at once |
| TVmaze       | Exact air times for TV shows (wired in during phase 3)                                   | 18 requests/10s                  |
| anime-lists  | AniList → TMDB id mapping, refreshed weekly by the `anime-mappings` job                  | —                                |
| Open Library | Book search, editions, covers and page counts, ISBN lookup                               | —                                |
| Wikidata     | Book series and their order, adaptations ("based on") with TMDB ids                      | SPARQL, cached                   |
| MangaDex     | Manga volumes, chapters and volume covers                                                | —                                |
| BnF          | ISBN lookups Open Library can't answer (French editions, original title of translations) | 2 requests/s                     |

**How anime works:** an AniList search result is looked up in `anime_mappings`. If it maps to a
TMDB show, the result links to that show at the mapped season (`/title/tv/95479?season=2`), so
anime is tracked TV-style. Several AniList entries for one show are merged into one result. Titles
without a TMDB entry, or any anime while TMDB isn't configured, open an AniList-only page
(`/title/anime/<anilist id>`) with a flat episode list.

**Cache lifetimes:** search and trending results are kept for 6 hours, title details and seasons for
12 hours. After that, `cached()` serves the expired value immediately and refreshes it in the
background (stale-while-revalidate), for up to 7 days; it is also served if a provider is down. The
daily `cleanup` job removes entries older than that.

**Responses** are compressed in `hooks.server.ts` (`server/compression.ts`, brotli or gzip, flushed
per chunk so streamed data still arrives early). Static files are precompressed at build time.

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

## Adding a media type

Books were added exactly this way: `media-types/book/`, `providers/openlibrary.ts`, a `pages`
column on `titles`, and page progress stored in `library_entries.progress`. Movies and books share
the "tracked as a whole" path (`isWholeTitle` in `services/library.ts`). Follow the same steps for
the next type (manga would use AniList and the `chapters` progress model):

### Steps

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
