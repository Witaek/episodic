# Development

## Requirements

- Node.js 22 or newer
- npm
- Docker, only for building images

## Run from source

```bash
git clone https://github.com/Witaek/episodic.git && cd episodic
npm install
cp .env.example .env            # set TMDB_ACCESS_TOKEN, and DATA_DIR=./data
npm run dev                     # http://localhost:5173
```

Database migrations run automatically on server start. The database is created at
`$DATA_DIR/episodic.db` (default `./data/episodic.db`).

## Scripts

| Command                           | What it does                                                   |
| --------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                     | Development server with hot reload                             |
| `npm run build`                   | Production build in `build/`                                   |
| `npm start`                       | Run the production build (`node build`)                        |
| `npm run check`                   | Type-check Svelte and TypeScript                               |
| `npm test`                        | Unit tests (Vitest)                                            |
| `npm run lint` / `npm run format` | Check or apply Prettier formatting                             |
| `npm run db:generate`             | Create a migration after editing `src/lib/server/db/schema.ts` |
| `npm run db:studio`               | Browse the database in Drizzle Studio                          |

## End-to-end tests

`npm run test:e2e` builds the app and starts it with a fresh database in `test-results/e2e-data`.
Background jobs are disabled. `tests/e2e/global-setup.ts` seeds AniList responses for a fixture
show into the response cache, so the tests need no network access and no TMDB token. The tests
cover:

- first-run setup and sign-in
- search, adding to the library, marking episodes
- Up Next, Upcoming and History
- separation between users
- the installed-app basics: manifest, service worker and offline pages

Each runs at desktop and phone (Pixel 7) sizes. CI runs them on every push and uploads traces when
a test fails.

## Changing the database

1. Edit `src/lib/server/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description`. This writes a SQL file to `drizzle/`.
3. Read the generated SQL, then commit it together with the schema change.

Migrations are applied in order when the app starts, both in development and in Docker.
Never edit a migration that has already been released. Add a new one instead.

## Building the Docker image

```bash
docker build -t episodic:local .
docker run --rm -p 8787:3000 -v "$PWD/data:/data" -e TMDB_ACCESS_TOKEN=... episodic:local
```

To build for both architectures:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t episodic:multi .
```

## Releasing

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **test**: formatting check, type-check, unit tests, build.
2. **image**: multi-arch build (amd64 and arm64) pushed to `ghcr.io/witaek/episodic`:
   - each push to `main` publishes `latest` and `sha-<commit>`
   - each tag like `v1.2.3` publishes `1.2.3` and `1.2`

To release a version:

```bash
npm version minor              # bumps package.json and creates the git tag
git push --follow-tags
```

Add an entry to `CHANGELOG.md` in the same commit.

**After the very first publish:** GitHub creates new container packages as **private**. Open
<https://github.com/Witaek?tab=packages>, then **episodic** → **Package settings** →
**Change visibility** → **Public**. CasaOS can't pull the image until you do this.
