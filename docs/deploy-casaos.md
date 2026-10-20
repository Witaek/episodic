# Deploying on CasaOS

This guide installs Episodic as a custom app on CasaOS. It takes about five minutes.

The image supports **x86_64 (amd64)** and **ARM64** (Raspberry Pi 4/5, ZimaBoard, most ARM boards).
CasaOS picks the right one automatically.

## Before you start

- A working CasaOS server.
- A **TMDB API Read Access Token**. See [api-keys.md](api-keys.md).
- Optional, but needed to install the app on your phone: **Tailscale**. See
  [https-tailscale.md](https-tailscale.md).

## 1. Import the app

1. Open the CasaOS dashboard.
2. In the **Apps** section, click **+** (top right of the section), then **Install a customized
   app**.
3. In the window that opens, click **Import** (top right).
4. Paste the contents of
   [`docker-compose.yml`](https://raw.githubusercontent.com/Witaek/episodic/main/docker-compose.yml),
   or upload the file, then click **Submit**.

CasaOS fills the form with the app's settings. Leave the image (`ghcr.io/witaek/episodic`) and tag
(`latest`) as they are.

## 2. Fill in the settings

In the form, check these fields:

| Field                                           | What to enter                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Web UI port**                                 | `8787`, or any free port. If you change it, use the same port everywhere below.    |
| **Volumes** → `/data`                           | Keep `/DATA/AppData/episodic`. This is where your database and backups are stored. |
| **Environment variables** → `TMDB_ACCESS_TOKEN` | Your TMDB token (the long value starting with `eyJ`).                              |
| `TZ`                                            | Your time zone, e.g. `Europe/Paris`.                                               |
| `APP_URL`                                       | Leave empty for now. You'll set it in step 4 if you use Tailscale.                 |
| `ALLOWED_ORIGINS`                               | Leave empty for now.                                                               |
| `METADATA_LANGUAGE` / `METADATA_REGION`         | e.g. `en-US` / `US`, or `fr-FR` / `FR`.                                            |

`PUID` and `PGID` default to `1000`, which matches the usual CasaOS user. Every variable is
described in [configuration.md](configuration.md).

Click **Install**. The first start takes a little longer while CasaOS downloads the image.

## 3. Open Episodic and create your account

Click the Episodic icon on the dashboard, or open `http://<casaos-ip>:8787`.

The first time, Episodic asks you to **create the admin account**: choose a username and a
password (at least 8 characters). You're signed in straight away.

> Do this right after installing. Until an admin account exists, anyone who can reach the page can
> create it. To skip this step, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before installing.

To check that everything is set up, open **Settings**. Under _System status_:

- **Database** is green when `/data` is writable.
- **TMDB** is green when your token is set.
- **Anime id mapping** turns green a few seconds after the first start, once the mapping has been
  downloaded.

### Add the rest of your household

Go to **Settings → Users → Add an account**. Each person gets their own library, history and
settings, and can change their password under **Settings → Password**. As an admin you can also
reset passwords, disable accounts, or make someone else an admin.

## 4. Access from your phone with HTTPS (recommended)

Follow [https-tailscale.md](https-tailscale.md) to get an address like
`https://casaos.tail1234.ts.net`. Then:

1. In CasaOS, open the Episodic app's **Settings** (⋮ → Settings).
2. Set `APP_URL` to that HTTPS address.
3. Set `ALLOWED_ORIGINS` to your LAN address, e.g. `http://192.168.1.20:8787`, so it keeps
   working too.
4. Click **Save**. CasaOS recreates the container. Your data in `/DATA/AppData/episodic` is kept.

## Updating

Download the new image from a terminal (`sudo docker pull ghcr.io/witaek/episodic:latest`), then
open the app's ⋮ → **Settings** and click **Save**. Your data is kept, and the database is upgraded
automatically. Details, version pinning and rolling back are covered in [updating.md](updating.md).

## Where your data lives

Everything is in **`/DATA/AppData/episodic`**: the database (`episodic.db`) and nightly backups
(`backups/`). Admins can make and download backups in **Settings → Backups**, and everyone can
export their own data in **Settings → Your data**. See [backup-restore.md](backup-restore.md).

## Troubleshooting

The most common problems are below. For the full list, see [troubleshooting.md](troubleshooting.md).

| Problem                                          | Fix                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The app doesn't open or the port is in use       | Change the **Web UI port** to a free one, e.g. `8788`.                                                                                     |
| **Database** is red                              | The data folder isn't writable. Check the `/data` volume and that `PUID`/`PGID` match a real user (`id` in a CasaOS terminal shows yours). |
| **TMDB token** is red                            | The token is missing or wrong. Paste the **API Read Access Token**, not the short "API Key".                                               |
| "Cross-site request blocked"                     | Add the address in your browser's address bar to `ALLOWED_ORIGINS`.                                                                        |
| Forgot your password                             | Ask an admin to reset it in **Settings → Users**. If you were the only admin, see [troubleshooting](#lost-admin-password).                 |
| Image fails to pull ("denied" or "unauthorized") | The image package isn't public yet. See the note on image publishing in [development.md](development.md#releasing).                        |

To see logs: in CasaOS, open the app's ⋮ menu → **Logs**. Or run `docker logs episodic` in a
terminal.

### Lost admin password

Open a terminal on the CasaOS host (Settings → Terminal, or SSH) and run, with your own username
and a new password:

```bash
docker exec -it -u 1000:1000 episodic node reset-password.js yourname 'new-password-here' --admin
```

This resets the password, re-enables the account, makes it admin (`--admin`, optional) and signs
it out everywhere. If you changed `PUID`/`PGID`, use those numbers after `-u`.
