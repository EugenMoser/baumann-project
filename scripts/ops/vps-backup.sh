#!/usr/bin/env bash
# Backup of the preview Supabase on the VPS: full database dump and the Storage
# files. Run by hand as root (no cron) to create the handover snapshot; see
# docs/deploy.md section 10.
# Usage: vps-backup.sh
# Env overrides: DB_CONTAINER, STORAGE_DIR, BACKUP_ROOT, KEEP_DAYS.
set -euo pipefail
umask 077

die() {
  echo "vps-backup: $*" >&2
  exit 1
}

# One run at a time: a second run would delete the first one's partial directory.
exec 9>/run/baumann-backup.lock
flock -n 9 || die "another backup run is in progress."

backup_root=${BACKUP_ROOT:-/var/backups/baumann-demo}
keep_days=${KEEP_DAYS:-7}
[[ $keep_days =~ ^[1-9][0-9]*$ ]] || die "KEEP_DAYS must be a positive whole number."

# Coolify names service containers <service>-<service-uuid>.
db=${DB_CONTAINER:-}
if [[ -z $db ]]; then
  names=$(docker ps --format '{{.Names}}') || die "docker ps failed."
  mapfile -t found < <(printf '%s\n' "$names" | grep '^supabase-db-' || true)
  case ${#found[@]} in
    1) db=${found[0]} ;;
    0) die "no running container named supabase-db-*; set DB_CONTAINER." ;;
    *) die "several running containers named supabase-db-* (${found[*]}); set DB_CONTAINER." ;;
  esac
fi
storage_dir=${STORAGE_DIR:-/data/coolify/services/${db#supabase-db-}/volumes/storage}
[[ -d $storage_dir ]] || die "storage directory $storage_dir not found; set STORAGE_DIR."

day=$(date -u +%F)
dest=$backup_root/$day
partial=$dest.partial
# Restrict the backup root only if this run creates it, so a misconfigured
# BACKUP_ROOT never changes the mode of an existing system directory.
if [[ ! -d $backup_root ]]; then
  mkdir -p -- "$backup_root"
  chmod 700 -- "$backup_root"
fi
rm -rf -- "$partial"
mkdir -- "$partial"
trap 'rm -rf -- "$partial"' EXIT

# Full dump as the superuser: an exact clone incl. auth users and storage
# metadata. The password stays inside the container.
docker exec "$db" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc' \
  >"$partial/db.dump"
[[ -s $partial/db.dump ]] || die "database dump is empty."

# --xattrs keeps the content type the file backend stores in extended attributes.
# GNU tar exits 1 when a file changed while it was read (e.g. an upload during
# the run); the archive is written, only that file may be inconsistent. Any
# other non-zero code is fatal.
tar_rc=0
tar --xattrs --xattrs-include='user.*' -czf "$partial/storage.tar.gz" -C "$storage_dir" . || tar_rc=$?
case $tar_rc in
  0) ;;
  1) echo "vps-backup: warning: some Storage files changed while tar read them (exit 1); archive kept." >&2 ;;
  *) die "tar failed with exit code $tar_rc." ;;
esac

(cd "$partial" && sha256sum db.dump storage.tar.gz >SHA256SUMS)

rm -rf -- "$dest"
mv -- "$partial" "$dest"

# Keep the newest KEEP_DAYS day directories (today included); stale partials too.
cutoff=$(date -u -d "-$((keep_days - 1)) days" +%F)
for dir in "$backup_root"/*/; do
  name=$(basename "$dir")
  name=${name%.partial}
  if [[ $name =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && $name < $cutoff ]]; then
    rm -rf -- "$dir"
  fi
done

printf '%s backup %s ok: db.dump %s, storage.tar.gz %s\n' \
  "$(date -u +%FT%TZ)" "$day" \
  "$(du -h "$dest/db.dump" | cut -f1)" "$(du -h "$dest/storage.tar.gz" | cut -f1)"
