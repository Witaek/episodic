# Backup and restore

Everything Episodic knows lives in one folder, the data folder:

- **CasaOS:** `/DATA/AppData/episodic`
- **Docker Compose:** whatever you set as `DATA_DIR`, e.g. `./data`

| File                                                                 | What it is                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `episodic.db` (+ `episodic.db-wal`, `episodic.db-shm` while running) | The database: accounts, libraries, history, cached metadata        |
| `backups/`                                                           | Automatic and manual backups, each a complete copy of the database |

Episodic has two kinds of copies:

|          | **Database backup**                                                    | **JSON export**                                                |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Contains | Everything: all users, settings, metadata                              | One user's library and watch history                           |
| Made by  | Every night at 03:30, or **Settings → Backups → Back up now** (admins) | **Settings → Your data → Export** (each user)                  |
| Used for | Recovering the whole server                                            | Moving your data to another server, or keeping a personal copy |
| Restore  | Replace the database file (below)                                      | **Settings → Your data → Restore**                             |

## Automatic backups

- Every night at 03:30 (in your `TZ`), Episodic saves `backups/episodic-YYYY-MM-DD-HHMMSS.db`.
- The copy is made with SQLite's online backup, so it's safe while the app is running.
- Automatic backups older than `BACKUP_RETENTION_DAYS` (default 14) are deleted. The newest one is
  always kept.
- Backups made with **Back up now** are kept until you delete them.
- Set `BACKUP_RETENTION_DAYS=0` to turn automatic backups off.
- To download a backup, go to **Settings → Backups** and use the download button next to it.

> Backups live on the same disk as the database. For protection against disk failure, copy the
> `backups/` folder somewhere else from time to time: another machine, a NAS, or cloud storage.
> CasaOS's own backup features, or a tool like rclone, can do this on a schedule.

## Restore a database backup

This replaces the whole database (every user) with the backup.

**CasaOS:**

1. Stop Episodic in the CasaOS dashboard (app ⋮ → **Stop**).
2. Open a terminal on the server (CasaOS Settings → Terminal, or SSH), then run:
   ```bash
   cd /DATA/AppData/episodic
   sudo mkdir -p replaced && sudo mv episodic.db* replaced/
   ls backups/                                  # pick the backup you want
   sudo cp backups/episodic-2026-10-19-033000.db episodic.db
   sudo chown 1000:1000 episodic.db             # your PUID:PGID
   ```
3. Start Episodic again. If the backup comes from an older version, its database is upgraded
   automatically on start.
4. Once everything looks right, you can delete the `replaced/` folder.

**Docker Compose:** the same steps, using `docker compose stop` / `docker compose start` and your
`DATA_DIR`.

## Export and restore your own data (JSON)

- **Export:** **Settings → Your data → Export** downloads
  `episodic-<username>-<date>.json`, with your library (statuses, dates) and every watch.
  Shows and movies are referenced by their TMDB or AniList id, so the file works on any Episodic
  server.
- **Restore:** **Settings → Your data → Restore** and choose the file. The restore runs in the
  background with a progress bar, because titles the server doesn't know yet are downloaded first.
  - It **merges**: nothing is deleted, statuses from the file win, and watches already present
    (same episode, same time) aren't duplicated.
  - Episodes that no longer exist upstream (for example after a show was renumbered) are skipped
    and listed.
