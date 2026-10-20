# Configuration

Episodic is configured with environment variables:

- **CasaOS:** set them in the app's settings form.
- **Docker Compose:** set them in the `.env` file next to `docker-compose.yml`.

Restart the container after changing any of them.

## Variables

| Variable                            | Default                  | Required    | Description                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMDB_ACCESS_TOKEN`                 | —                        | **Yes**     | TMDB "API Read Access Token". See [api-keys.md](api-keys.md). Without it the app starts, but search and metadata are disabled.                                                                                                     |
| `APP_URL`                           | —                        | Recommended | The main address you open Episodic from, e.g. `https://casaos.tail1234.ts.net`. Used for links and for the cross-site request check.                                                                                               |
| `ALLOWED_ORIGINS`                   | —                        | No          | Other addresses you open Episodic from, comma separated, e.g. `http://192.168.1.20:8787,http://casaos.local:8787`.                                                                                                                 |
| `PORT`                              | `8787`                   | No          | Port on the **host**. Inside the container the app always listens on 3000.                                                                                                                                                         |
| `DATA_DIR`                          | `/DATA/AppData/episodic` | No          | Folder on the **host** that holds the database, backups and cache. Use `./data` outside CasaOS.                                                                                                                                    |
| `TZ`                                | `Etc/UTC`                | Recommended | Your time zone (e.g. `Europe/Paris`), used for air dates, "today" in History, and backup times. [List of zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).                                                     |
| `PUID` / `PGID`                     | `1000` / `1000`          | No          | User and group the app runs as. Files in `DATA_DIR` belong to this user. CasaOS's default user is usually 1000.                                                                                                                    |
| `METADATA_LANGUAGE`                 | `en-US`                  | No          | Language for titles and synopses, e.g. `fr-FR`, `ja-JP`. Falls back to English when no translation exists. Each user will be able to override it later.                                                                            |
| `METADATA_REGION`                   | `US`                     | No          | Country code for release dates and, later, where-to-watch, e.g. `FR`.                                                                                                                                                              |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | —                        | No          | Creates the first admin account on first start. If you leave them empty, the app shows a **Create the admin account** page the first time you open it. They're ignored once any account exists, so you can remove them afterwards. |
| `BACKUP_RETENTION_DAYS`             | `14`                     | No          | How many daily database backups to keep (backups arrive in phase 5). `0` disables them.                                                                                                                                            |

## Addresses and the cross-site check

Episodic rejects form submissions and other changes that come from a website it doesn't recognize.
This protects you if a malicious page tries to act on your account. A request is accepted when it
comes from:

- the address it was sent to, which covers most setups automatically,
- `APP_URL`, or
- an address listed in `ALLOWED_ORIGINS`.

If you see **"Cross-site request blocked"**, add the address shown in your browser's address bar to
`ALLOWED_ORIGINS` and restart the container.

## Variables inside the container

These are set by the image. You normally don't change them.

| Variable          | Value   | Description                                                                                              |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`        | `/data` | Data path inside the container; map a host folder to it.                                                 |
| `PORT`            | `3000`  | Port the app listens on inside the container.                                                            |
| `BODY_SIZE_LIMIT` | `50M`   | Maximum upload size (used later for restores).                                                           |
| `DISABLE_JOBS`    | unset   | Development and tests only: `1` stops background jobs, so the app makes no outgoing requests on its own. |
