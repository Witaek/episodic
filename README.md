<p align="center">
  <img src="static/icon.svg" width="96" height="96" alt="Episodic logo" />
</p>

<h1 align="center">Episodic</h1>

<p align="center">
  A self-hosted tracker for TV shows, anime, movies and books.<br />
  Know exactly where you are in every show, and when the next episode airs.
</p>

---

> **Status: v1.0.** Everything in the feature list below works. See the [roadmap](#roadmap) for
> what's next.

## Features

- **One search for everything**: TV shows, anime and movies, with posters and backdrops.
- **Library**: Watchlist, Watching, Completed, On hold, Dropped.
- **One-tap episode tracking**: mark an episode, a whole season or "everything up to here".
- **Up Next**: always shows your next episode, for example `S02E05`.
- **Airing status**: countdown to the next episode, new-season announcements, ended or canceled shows.
- **History**: a timeline of everything you watched and when.
- **Separate accounts** for everyone in your household.
- **Installable app (PWA)** on iPhone and Android, with a native feel.
- **Your data stays yours**: one SQLite file, nightly backups, and JSON export and restore for each
  person.

- **Calendar**: a month view of what's airing, plus an iCal feed for your phone's calendar.
- **Notifications** when new episodes come out, on your phone (Web Push), ntfy or Discord.
- **Stats**: watch time, streaks, monthly chart, top genres and shows.
- **Books**: search Open Library in English or French, track Want to read / Reading / Read, and
  your current page in the edition you're reading.
- **Anime franchises**: movies are grouped with their show (Demon Slayer and its movies).

Later: manga, where-to-watch, and Jellyfin/Plex auto-tracking.

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
- [x] **Phase 1**: catalog search (TMDB, AniList, TVmaze) and title pages
- [x] **Phase 2**: accounts, library, one-tap tracking, Up Next
- [x] **Phase 3**: history, airing status, Upcoming, background refresh
- [x] **Phase 4**: installable PWA and UI polish
- [x] **Phase 5**: backups, export and restore, settings (**v1.0**)
- [x] **Phase 6**: calendar view, iCal feed, notifications, stats
- [x] **Books**: Open Library search, reading statuses, page progress
- [ ] Later: manga, where to watch, spoiler mode, Jellyfin/Plex/Trakt integrations

## Credits

Metadata comes from [TMDB](https://www.themoviedb.org), [AniList](https://anilist.co) and
[TVmaze](https://www.tvmaze.com) and [Open Library](https://openlibrary.org). This product uses the TMDB API but is not endorsed or certified by
TMDB.
