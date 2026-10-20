# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
