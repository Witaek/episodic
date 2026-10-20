# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
