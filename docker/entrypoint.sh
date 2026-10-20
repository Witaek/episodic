#!/bin/sh
set -eu

# Run as PUID:PGID (default 1000:1000) so files in the data volume belong to your user.
# CasaOS and Docker create missing bind-mount folders as root, so fix ownership first.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
	if [ "$(stat -c '%u:%g' "$DATA_DIR")" != "$PUID:$PGID" ]; then
		echo "[episodic] setting owner of $DATA_DIR to $PUID:$PGID"
		chown -R "$PUID:$PGID" "$DATA_DIR"
	fi
	exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi

exec "$@"
