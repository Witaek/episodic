<p align="center">
  <img src="static/icon.svg" width="96" height="96" alt="Episodic logo" />
</p>

<h1 align="center">Episodic</h1>

<p align="center">
  A self-hosted tracker for TV shows, anime and movies.<br />
  Know exactly where you are in every show, and when the next episode airs.
</p>

---

> **Status: early development (phase 0 of 5).** The server, database and Docker image work.
> Search, tracking and the rest of the UI arrive in the next phases. See the [roadmap](#roadmap).

## Features

Planned for v1.0:

- **One search for everything**: TV shows, anime and movies, with posters and backdrops.
- **Library**: Watchlist, Watching, Completed, On hold, Dropped.
- **One-tap episode tracking**: mark an episode, a whole season or "everything up to here".
- **Up Next**: always shows your next episode, for example `S02E05`.
- **Airing status**: countdown to the next episode, new-season announcements, ended or canceled shows.
- **History**: a timeline of everything you watched and when.
- **Separate accounts** for everyone in your household.
- **Installable app (PWA)** on iPhone and Android, with a native feel.
- **Your data stays yours**: one SQLite file, automatic daily backups, JSON export.

Later: calendar and iCal feed, notifications, stats, where-to-watch, Jellyfin/Plex auto-tracking,
and books and manga.

## Quick start

You need Docker and a free [TMDB API Read Access Token](docs/api-keys.md).

```bash
mkdir episodic && cd episodic
curl -fsSLO https://raw.githubusercontent.com/Witaek/episodic/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Witaek/episodic/main/.env.example -o .env
```

Edit `.env`: set `TMDB_ACCESS_TOKEN` and, if you're not on CasaOS, set `DATA_DIR=./data`. Then:

```bash
docker compose up -d
```

Open `http://<your-server>:8787`.

## Documentation

| Guide                                                  | What it covers                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| [Getting API keys](docs/api-keys.md)                   | Getting the TMDB token, and which other services need no key       |
| [Deploying on CasaOS](docs/deploy-casaos.md)           | Step-by-step install from the CasaOS dashboard                     |
| [Deploying with Docker Compose](docs/deploy-docker.md) | Any Linux server or NAS, pulling the image or building it yourself |
| [HTTPS with Tailscale](docs/https-tailscale.md)        | Secure access from your phone, and installing the app              |
| [Configuration](docs/configuration.md)                 | Every environment variable                                         |
| [Development](docs/development.md)                     | Running from source, tests, releasing                              |
| [Architecture](docs/architecture.md)                   | How the code is organized, and how to extend it                    |

## Roadmap

- [x] **Phase 0**: skeleton, database, Docker image (amd64 and arm64), docs
- [ ] **Phase 1**: catalog search (TMDB, AniList, TVmaze) and title pages
- [ ] **Phase 2**: accounts, library, one-tap tracking, Up Next
- [ ] **Phase 3**: history, airing status, Upcoming, background refresh
- [ ] **Phase 4**: installable PWA and UI polish
- [ ] **Phase 5**: backups, export and restore, settings (**v1.0**)
- [ ] Later: calendar, notifications, stats, integrations, books and manga

## Credits

Metadata comes from [TMDB](https://www.themoviedb.org), [AniList](https://anilist.co) and
[TVmaze](https://www.tvmaze.com). This product uses the TMDB API but is not endorsed or certified by
TMDB.
