# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.1.0] - 2026-10-21

### Fixed

- **More anime movies are grouped with their show** (Naruto, Naruto Shippuden and about 470
  others). The anime mapping lists many films only as specials of their show, with an IMDb id;
  Episodic now finds their TMDB movie once (daily job `anime-movie-links`, and when you open the
  show). AniList search results for those films open the movie.
- **Scanning French editions**: an ISBN Open Library doesn't know is looked up in the BnF
  catalogue (French national library) and matched to the book by its original title and author,
  e.g. _Les oiseaux du temps_ → _This Is How You Lose the Time War_.
- **Book search**: results matching your words (title or author) come first and unrelated books
  are dropped. Searching for a book of a series shows the book, labelled with its series
  ("Kingsbridge #1"), instead of hiding it behind a series card you may not recognise; searching
  the series name still bundles its books.

## [2.0.1] - 2026-10-21

### Fixed

- Sharper images again: full-width backdrops on large or high-density screens, and Up Next cards,
  use TMDB's full-size images instead of the 1280px and 300px versions 1.5.0 capped them at.
  Small thumbnails (episode lists, history) stay light. Already stored titles get the sharper
  versions too.

## [2.0.0] - 2026-10-21

Reading gets a side of its own. See [the reading guide](docs/reading.md).

### Added

- **Watch | Read switch.** Books and manga have their own Reading home, Search, Shelf, Stats and
  History, with an amber, serif look. The app remembers which side you were on.
- **Book series tracked like shows.** Search shows one card per series; the series page lists its
  books in order, you're _Reading_ the series until the last book, and the next book is one tap
  away on the Reading screen. Books you tracked on their own move into their series.
- **Manga**: volumes and chapters (AniList and MangaDex), a shelf of volume covers, "mark volume
  read" and a catch-up mode.
- **Adaptations**: films and series made from a book, anime made from a manga, and "based on" on
  anime and film pages.
- **Yearly reading goal**, with your pace on the Reading screen.
- **Barcode scanning**: scan or type an ISBN to find that exact edition and its series.
- **Series you group yourself** for books the catalog doesn't know as a series.
- Reading stats: books, manga volumes, chapters, pages, streaks, genres.
- Export and restore now include reading progress and hand-made series.

### Changed

- Books moved out of the Watch side: the main search, Library, History, Stats and Home only show
  shows, anime and movies. Book links moved from `/title/book/…` to `/read/book/…` (old links
  redirect).

### Fixed

- A page whose loading was cut off (for example by leaving it quickly) could crash the server
  since 1.5.0's compression.

## [1.5.0] - 2026-10-21

Faster, especially on phones.

### Changed

- Pages and page data are compressed (brotli/gzip): 6–36× smaller, e.g. the home page of a large
  library went from 472 KB to 13 KB. Streamed parts of a page still arrive as soon as they're ready.
- Pages you've opened before load instantly: expired show, book and trending data is shown right
  away and refreshed in the background (5 ms instead of 0.4–1.5 s).
- Search waits until you pause typing (and needs 2 characters; Enter searches right away), so
  typing no longer runs into AniList's limit of about 30 searches a minute.
- Phones download right-sized images: no more full-size originals for small episode thumbnails or
  backdrops, and Up Next cards are capped.

### Fixed

- Copying the calendar link failed on plain `http://` addresses.

## [1.4.0] - 2026-10-21

### Added

- **Mark all watched** on show pages: marks every aired episode (specials only if you count them),
  with Undo.
- Setting a show to **Completed** while aired episodes are unmarked now offers to mark them all.
  (Completed on its own is only a status; it never marks episodes.)

## [1.3.0] - 2026-10-20

### Added

- Anime movies are grouped with their show (e.g. Demon Slayer: Mugen Train with Demon Slayer):
  a **Movies** section on the show page with one-tap tracking, a "Part of …" link on the movie,
  and in search and the Library the movies fold into the show ("+2 movies") when both are listed.
- Book search in English or French (**Books → Language: Any / English / Français**), remembered
  per person. Results show that language's edition, and the edition you add (title, cover, page
  count) is what you see in your Library, History and reading progress.

## [1.2.0] - 2026-10-20

Books.

### Added

- Books, from Open Library (no API key): a Books tab in search and Library, trending books,
  book pages with author, pages and subjects, and reading statuses (Want to read, Reading, Read,
  On hold, Dropped).
- Reading progress by page, with a progress bar. Reaching the last page marks the book as read.
  "Mark as read", "Read again" and "Finished on a date…" work like movies.
- Home: a "Continue reading" row. History: finished books and rereads. Stats: books read (not
  counted in watch time). Export and restore include books.

### Fixed

- Library status counts now follow the selected type.

## [1.1.1] - 2026-10-20

### Fixed

- Signing in over a plain `http://` LAN address did nothing: the session cookie was marked
  Secure because the server assumed HTTPS, so browsers dropped it. HTTPS is now only assumed when
  a proxy says so (`X-Forwarded-Proto`/`Forwarded`) or the request is for an `https://` `APP_URL`.
  The theme and sign-out cookies had the same problem.

## [1.1.0] - 2026-10-20

Calendar, notifications and stats.

### Added

- Calendar: a month view on the Upcoming page (List | Calendar), with watched episodes marked.
- iCal feed: a private, resettable calendar link per person (30 days back, 90 ahead), with exact
  times when known.
- New-episode notifications every 10 minutes: Web Push to installed apps and browsers, ntfy topics
  and Discord webhooks, with test buttons. Grouped per show, never repeated, no backlog flood.
- Preference to also be notified for shows on the watchlist.
- Stats: time watched, streaks, episodes/movies/titles/completed, hours per month (TV shows, anime,
  movies) with a table view, top genres, most-watched titles, this year or all time.
- Guide: notifications and calendar.

## [1.0.0] - 2026-10-20

First release: search, library, one-tap tracking, Up Next, history, Upcoming, airing updates,
separate accounts, installable app, backups and export.

### Added

- Nightly database backups at 03:30, kept for `BACKUP_RETENTION_DAYS` (default 14), plus
  "Back up now", download and delete in **Settings → Backups** (admins).
- JSON export of your own library and history, and a restore that merges, runs in the background
  and shows progress.
- Preference to turn automatic status changes off.
- Guides: backup and restore, updating, troubleshooting.
- Installable app: web manifest, app icons (including maskable and Apple touch icons), iOS
  full-screen mode, and an "Install the app" section in Settings.
- Offline support: the app shell is cached, recently opened pages open offline, posters are cached,
  and other pages show an offline screen. Cached pages are cleared on sign-out.
- Appearance setting: System, Dark or Light, with no flash on load.
- Episode details sheet (a bottom sheet on phones) with watch actions.
- Page transitions, with the tapped poster morphing into the title page; a navigation progress bar;
  a glow in the poster's color on title pages; the Inter font.
- Reduced-motion support and visible keyboard focus.
- End-to-end tests (Playwright, desktop and phone) that need no network access, run in CI.

### Fixed

- Tapping a search result right after typing no longer jumps back to the search page.
- History: a day-by-day timeline of everything you watched, with filters, "change date" and
  "remove", and paging.
- Upcoming: episodes and releases for the next 30 days, grouped by day, with exact times when known,
  premiere badges, and a "Coming later" list of announced seasons.
- Home: an "Airing soon" row and a "New" badge on Up Next cards for episodes from the last week.
- Background refresh of library titles in tiers (every 6 hours when airing soon, daily for running
  shows, monthly for finished ones), fetching only recent seasons between monthly full refreshes.
- Exact air times from AniList (anime) and TVmaze (other shows), kept across metadata refreshes.
- Completed shows go back to Watching when a new episode airs.
- "Refresh now" on title pages, and refresh statistics under Settings → Background jobs.
- History in the mobile tab bar; Settings moves to the button on the home screen.
- Accounts: first-run setup page (or `ADMIN_USERNAME`/`ADMIN_PASSWORD`), sign-in with throttling,
  30-day sessions, password change, "sign out other devices".
- Admin Users screen: create accounts, reset passwords, disable, change role, delete.
- Library: Watchlist, Watching, Completed, On hold, Dropped, with type filter and sorting.
- One-tap tracking: episodes, whole seasons, "mark all up to here", rewatches, custom watch dates,
  unwatch, and Undo on every action. Marking an episode offers to mark earlier ones too.
- Movies: mark watched, watch again, watched on a date.
- Home: Up Next cards with a one-tap ✓ that advances to the next episode, plus your watchlist.
- Automatic statuses: watching moves a title to Watching, finishing an ended show moves it to
  Completed, unwatched episodes move it back.
- Preference to count specials (season 0) in progress.
- Search across TV shows, anime and movies (All / TV shows / Anime / Movies), with trending titles.
- Title pages: backdrop, poster, logo, airing status, synopsis, trailer, seasons and episodes, cast,
  details and "More like this".
- Anime tracked TV-style: AniList results open the matching TMDB show at the right season, using the
  Fribb/anime-lists id mapping (refreshed weekly). AniList-only pages for anime without a TMDB entry.
- Navigation shell: sidebar on desktop, tab bar on mobile. Home with trending rows.
- Settings page with system status, background jobs and attribution.
- Media-type registry and `MetadataProvider` interface, so books and manga can be added later.
- Rate-limited, retrying HTTP client per provider, and a SQLite response cache that serves stale
  values when a provider is down.
- In-process job scheduler with run history.
- Project skeleton: SvelteKit 2, Svelte 5, Tailwind CSS 4, Drizzle ORM with SQLite (WAL).
- Database migrations applied automatically at startup.
- `/api/health` endpoint and Docker health check.
- Cross-site request check that accepts several addresses (`APP_URL`, `ALLOWED_ORIGINS`).
- Multi-arch Docker image (amd64 and arm64) that runs as `PUID`/`PGID`.
- `docker-compose.yml` with CasaOS metadata, plus a local-build override.
- GitHub Actions: tests, then publishing the image to GHCR.
- Documentation: API keys, configuration, CasaOS, Docker Compose, Tailscale HTTPS, development,
  architecture.
