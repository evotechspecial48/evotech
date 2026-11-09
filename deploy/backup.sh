#!/usr/bin/env bash
# Ежедневная резервная копия базы (cron в 03:30, /etc/cron.d/evotech-backup).
# Установка: install -m 700 deploy/backup.sh /usr/local/bin/evotech-backup
#   На сервере: дампы за 7 дней в /opt/evotech/backups.
#   В Облаке (WebDAV из .env): EvoTech/_backup/db-ДД.sql.gz — по дню месяца, перезаписывается через месяц;
#   EvoTech/_backup/monthly/db-ГГГГ-ММ.sql.gz — копия на 1-е число, хранится бессрочно.
#   Файлы хранилища архивируются локально только при STORAGE_DRIVER=local (иначе они уже в Облаке).
set -uo pipefail
cd /opt/evotech
C="docker compose -f deploy/docker-compose.prod.yml --env-file .env"
D=$(date +%F)
DUMP="backups/db-$D.sql.gz"
log() { echo "$(date -Is) $*"; }

envval() { grep -m1 "^$1=" .env | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//"; }

mkdir -p backups
if ! $C exec -T db pg_dump -U evotech -d evotech --no-owner | gzip >"$DUMP" || [ "$(gzip -cd "$DUMP" | head -c 100 | wc -c)" -lt 100 ]; then
  log "backup FAILED: дамп базы не создан"
  exit 1
fi
if [ "$(envval STORAGE_DRIVER)" = "local" ]; then
  docker run --rm -v evotech_files:/files:ro -v /opt/evotech/backups:/backup alpine tar -czf "/backup/files-$D.tar.gz" -C /files .
fi
find backups -name "db-*.sql.gz" -mtime +7 -delete
find backups -name "files-*.tar.gz" -mtime +3 -delete

URL=$(envval WEBDAV_URL)
USER_=$(envval WEBDAV_USER)
PASS=$(envval WEBDAV_PASSWORD)
ROOT=$(envval WEBDAV_ROOT)
ROOT="${ROOT:-/EvoTech}"
if [ -z "$URL" ] || [ -z "$USER_" ] || [ -z "$PASS" ]; then
  log "backup ok (только на сервере, Облако не настроено): $(du -sh backups | cut -f1)"
  exit 0
fi

# Логин и пароль передаются curl конфигом через дескриптор, а не аргументами — их не видно в списке процессов
dav() { curl -s --max-time 300 --retry 3 --retry-delay 10 -o /dev/null -w "%{http_code}" -K <(printf 'user = "%s:%s"\n' "$USER_" "$PASS") "$@"; }
BASE="${URL%/}${ROOT%/}/_backup"
for dir in "${URL%/}${ROOT%/}" "$BASE" "$BASE/monthly"; do dav -X MKCOL "$dir/" >/dev/null; done

upload() {
  local code
  code=$(dav -T "$DUMP" "$1")
  if [ "$code" = "201" ] || [ "$code" = "204" ]; then return 0; fi
  log "backup FAILED: загрузка в Облако $1 — HTTP $code"
  return 1
}
FAILED=0
upload "$BASE/db-$(date +%d).sql.gz" || FAILED=1
if [ "$(date +%d)" = "01" ]; then upload "$BASE/monthly/db-$(date +%Y-%m).sql.gz" || FAILED=1; fi
[ "$FAILED" -eq 0 ] || exit 1
log "backup ok: сервер $(du -sh backups | cut -f1), Облако _backup/db-$(date +%d).sql.gz ($(du -h "$DUMP" | cut -f1))"
