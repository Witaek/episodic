# Deploying with Docker Compose

Use this guide on any Linux server, NAS or VM with Docker. (On CasaOS, see
[deploy-casaos.md](deploy-casaos.md).)

The image `ghcr.io/witaek/episodic` is published for **linux/amd64** and **linux/arm64**.

## Install

```bash
mkdir -p ~/episodic && cd ~/episodic
curl -fsSLO https://raw.githubusercontent.com/Witaek/episodic/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Witaek/episodic/main/.env.example -o .env
```

Edit `.env`:

```dotenv
TMDB_ACCESS_TOKEN=eyJ...        # required, see api-keys.md
DATA_DIR=./data                 # store data next to the compose file
TZ=Europe/Paris
PUID=1000                       # output of `id -u`
PGID=1000                       # output of `id -g`
```

Start it:

```bash
docker compose up -d
docker compose logs -f
```

Open `http://<server>:8787`, or check `http://<server>:8787/api/health`.

## Update

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on start.

## Build the image yourself

Clone the repository, then use the build override:

```bash
git clone https://github.com/Witaek/episodic.git && cd episodic
cp .env.example .env   # then edit it
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

This builds for your server's own architecture. To build for both architectures at once (for
example to push to your own registry):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/episodic:latest --push .
```

## Behind a reverse proxy

Episodic is a normal HTTP app on port 3000 inside the container, so any reverse proxy works
(Nginx Proxy Manager, Caddy, Traefik, Cloudflare Tunnel). Set `APP_URL` to the public address, and
list any other addresses in `ALLOWED_ORIGINS`. For Tailscale, see
[https-tailscale.md](https-tailscale.md).

## Data and permissions

- Everything is stored in `DATA_DIR` (mounted at `/data` in the container).
- On start, the container makes `/data` owned by `PUID:PGID`, then drops root privileges and runs
  as that user.
- To back up, stop the container and copy the folder. Automatic backups arrive in phase 5.
