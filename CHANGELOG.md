# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project skeleton: SvelteKit 2, Svelte 5, Tailwind CSS 4, Drizzle ORM with SQLite (WAL).
- Database migrations applied automatically at startup.
- `/api/health` endpoint and Docker health check.
- Cross-site request check that accepts several addresses (`APP_URL`, `ALLOWED_ORIGINS`).
- Multi-arch Docker image (amd64 and arm64) that runs as `PUID`/`PGID`.
- `docker-compose.yml` with CasaOS metadata, plus a local-build override.
- GitHub Actions: tests, then publishing the image to GHCR.
- Documentation: API keys, configuration, CasaOS, Docker Compose, Tailscale HTTPS, development,
  architecture.
