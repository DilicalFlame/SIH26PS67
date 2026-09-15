#!/usr/bin/env bash
# Upload a .pmtiles file into the project's MinIO instance under
# vector/<layer>/<layer>.pmtiles, matching layers.config.ts's objectPath
# convention. Requires the `mc` CLI and a running `infra/docker` MinIO.
#
# Usage: scripts/upload-tiles.sh <path/to/file.pmtiles> <layer-id>
# Example: scripts/upload-tiles.sh data/processed/coastlines.pmtiles coastlines

set -euo pipefail

FILE="${1:?usage: upload-tiles.sh <path/to/file.pmtiles> <layer-id>}"
LAYER="${2:?usage: upload-tiles.sh <path/to/file.pmtiles> <layer-id>}"

# Pick up MinIO settings from the repo-root .env (see .env.example) rather
# than requiring the caller to export them by hand — without clobbering
# anything already set in the calling shell's environment.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
	set -a
	# shellcheck disable=SC1091
	source "$REPO_ROOT/.env"
	set +a
fi

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-thalassa}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is not set — copy .env.example to .env at the repo root}"
MINIO_BUCKET="${MINIO_BUCKET:-tiles}"

if [[ ! -f "$FILE" ]]; then
	echo "error: no such file: $FILE" >&2
	exit 1
fi

mc alias set thalassa-upload "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "thalassa-upload/$MINIO_BUCKET" >/dev/null
mc anonymous set download "thalassa-upload/$MINIO_BUCKET" >/dev/null

DEST="thalassa-upload/$MINIO_BUCKET/vector/$LAYER/$LAYER.pmtiles"
mc cp "$FILE" "$DEST"

echo "Uploaded: $DEST"
echo "Add to apps/web/src/lib/tiles/layers.config.ts:"
echo "  { id: '$LAYER', objectPath: 'vector/$LAYER/$LAYER.pmtiles', color: 0xd8d8d8, minZoom: 0, maxZoom: 10 }"
