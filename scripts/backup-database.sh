#!/usr/bin/env bash
# Run on the Linux deployment host. PostgreSQL creates a consistent online snapshot.
# Example: bash scripts/backup-database.sh /opt/shortfall/backups
set -euo pipefail
umask 077

backup_dir="${1:-/opt/shortfall/backups}"
container="${SHORTFALL_DB_CONTAINER:-shortfall-database-1}"
database="${SHORTFALL_DATABASE:-shortfall}"
database_user="${SHORTFALL_DB_USER:-shortfall}"

mkdir -p -- "$backup_dir"
archive=$(mktemp "$backup_dir/shortfall-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump")
complete=0
cleanup() {
  if [[ "$complete" != 1 ]]; then
    # This path came from mktemp in the selected backup directory.
    rm -f -- "$archive"
  fi
}
trap cleanup EXIT

docker exec "$container" pg_dump --username="$database_user" --dbname="$database" --format=custom > "$archive"
docker exec -i "$container" pg_restore --list < "$archive" > /dev/null
complete=1
printf 'Database backup saved: %s\n' "$archive"
# Copy the archive outside the VM. Verify restoration into a separate database;
# never use the running application database as a restore-check destination.
