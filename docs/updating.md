# Updating

New versions are published as Docker images: `ghcr.io/witaek/episodic`.

| Tag               | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `latest`          | The newest build of the `main` branch                      |
| `1.0.0`, `1.0`, … | Released versions. Pin one to update only when you choose. |
| `sha-<commit>`    | One exact build                                            |

What changed in each version is in the [changelog](../CHANGELOG.md).

**Your data is safe across updates.** It lives in the data folder, not in the container. When a new
version starts, it upgrades the database automatically. Even so, it's worth making a backup first
(**Settings → Backups → Back up now**).

## CasaOS

1. Open a terminal on the server (CasaOS Settings → Terminal, or SSH), then download the new image:
   ```bash
   sudo docker pull ghcr.io/witaek/episodic:latest
   ```
2. In the dashboard, open Episodic's ⋮ menu → **Settings** and click **Save** without changing
   anything. CasaOS recreates the container from the image you just downloaded.
3. Open Episodic. **Settings → About** shows the version.

To pin a version, change the tag in the app's settings from `latest` to, for example, `1.0.0`, and
save. CasaOS downloads that tag.

## Docker Compose

```bash
cd ~/episodic
docker compose pull
docker compose up -d
```

## Automatic updates (optional)

Tools like [Watchtower](https://containrrr.dev/watchtower/) can pull and restart containers on a
schedule. If you use one, pin a major version, or keep the nightly backups on, so an unexpected
change is easy to roll back.

## Rolling back

Set the image tag to the previous version and recreate the container. If the newer version had
already upgraded the database, also restore the backup made before the update
([backup-restore.md](backup-restore.md)), because older versions can't read a newer database.
