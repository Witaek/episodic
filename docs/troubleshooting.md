# Troubleshooting

## Where to look first

- **Settings → System status**: database, TMDB token and anime id mapping, each green or red.
- **Settings → Background jobs** (admins): the last run of each job, and any error.
- **Logs:**
  - CasaOS: app ⋮ → **Logs**
  - Docker: `docker logs episodic` (add `-f` to follow)

  Lines start with `[episodic]`, `[jobs]`, `[refresh]` or `[catalog]`.

- **Health check:** `http://<server>:8787/api/health` should return `"status":"ok"`.

## Installing and starting

| Problem                                                             | Fix                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Image won't download ("denied", "unauthorized", "manifest unknown") | The GHCR package must be public. See [development.md](development.md#releasing). Also check the tag exists.               |
| "exec format error"                                                 | The image is built for amd64 and arm64. 32-bit ARM (armv7, e.g. Raspberry Pi OS 32-bit) isn't supported: use a 64-bit OS. |
| Port already in use                                                 | Change the host port (CasaOS: **Web UI port**; Compose: `PORT`).                                                          |
| Container keeps restarting, logs show `SQLITE_CANTOPEN` or `EACCES` | The data folder isn't writable. Check the `/data` volume and that `PUID`/`PGID` match a real user (`id` shows yours).     |
| Logs show "Invalid configuration"                                   | A variable has a bad value, for example an `APP_URL` without `http://` or `https://`. The message names it.               |

## Signing in

| Problem                                   | Fix                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lands on "Create the admin account"       | No account exists yet. Create one now, or set `ADMIN_USERNAME`/`ADMIN_PASSWORD`.                                                                                      |
| "Wrong username or password"              | Usernames are lowercase. An admin can reset passwords in **Settings → Users**.                                                                                        |
| Locked out as the only admin              | Run `docker exec -it -u 1000:1000 episodic node reset-password.js <username> '<new password>' --admin`. See [deploy-casaos.md](deploy-casaos.md#lost-admin-password). |
| "Too many attempts"                       | 5 wrong passwords lock that username for a minute from that address. Wait and try again.                                                                              |
| Signed out every time the app is reopened | Check the clock on the server, and that you always use the same address. Cookies are per address.                                                                     |
| "Cross-site request blocked"              | You're using an address Episodic doesn't know. Add exactly what's in the address bar (e.g. `http://192.168.1.20:8787`) to `ALLOWED_ORIGINS`, or set it as `APP_URL`.  |

## Search and metadata

| Problem                                                       | Fix                                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TV and movie search returns nothing, "TMDB isn't set up yet"  | Set `TMDB_ACCESS_TOKEN` to the **API Read Access Token** (long, starts with `eyJ`), not the short API key.                                                             |
| Logs show `tmdb responded 401`                                | The token is wrong or was regenerated. Copy it again from TMDB.                                                                                                        |
| Anime opens an AniList-only page instead of the TV-style show | Either TMDB isn't configured, or the anime id mapping isn't downloaded yet. Check **Settings → System status**. The mapping downloads at first start and every Monday. |
| Wrong episode numbering for an anime                          | It comes from TMDB's season structure and the community mapping. Open an issue with the show's name.                                                                   |
| Air dates look a day off                                      | Set `TZ` to your time zone (e.g. `Europe/Paris`). Exact times come from AniList or TVmaze when available.                                                              |
| A show's new season doesn't appear                            | Shows airing soon refresh every 6 hours and others daily. To refresh one immediately, use **Refresh now** under _Details_ on its page.                                 |

## Phone and installed app

| Problem                                  | Fix                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| No "Install" option                      | You need an `https://` address (see [https-tailscale.md](https-tailscale.md)). On iPhone, use Safari's **Share → Add to Home Screen**. |
| The installed app shows "You're offline" | The phone can't reach the server. Check Wi-Fi or that Tailscale is connected. Pages you opened recently still work offline.            |
| The app looks outdated after an update   | Close it completely and reopen it. The new version installs itself in the background.                                                  |
