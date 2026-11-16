#!/usr/bin/env bash
# Подключение Яндекс Метрики: номер счётчика (встраивается в сайт при сборке) и OAuth-токен с правом
# «Изменение статистики» (metrika:write) — для офлайн-конверсий «квалифицированная заявка» и «заключённый договор».
# Токен проверяется запросом к API управления и записывается в /opt/evotech/.env.
# Запуск: ssh -t root@сервер "bash /opt/evotech/deploy/set-metrika.sh [visible]"
# После — пересборка: номер счётчика попадает в клиентский код только при сборке.
set -uo pipefail
cd /opt/evotech
READOPT="-rsp"
[ "${1:-}" = "visible" ] && READOPT="-rp"

read -rp "Номер счётчика Метрики (цифры): " COUNTER
COUNTER="${COUNTER//[^0-9]/}"
[ -z "$COUNTER" ] && { echo "Номер счётчика не введён — ничего не изменено."; exit 1; }
read $READOPT "OAuth-токен Метрики (Enter — пропустить, без офлайн-конверсий): " TOKEN; echo
[ "$READOPT" = "-rp" ] && printf '\033[2J\033[3J\033[H'
TOKEN="${TOKEN//[[:space:]]/}"

if [ -n "$TOKEN" ]; then
  # Заголовок с токеном — через файл конфигурации curl, токен не попадает в список процессов
  CODE=$(printf 'header = "Authorization: OAuth %s"\n' "$TOKEN" | curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -K - "https://api-metrika.yandex.net/management/v1/counter/$COUNTER")
  if [ "$CODE" != "200" ]; then
    echo "Метрика: токен не подходит к счётчику $COUNTER (HTTP $CODE). Ничего не изменено."
    exit 1
  fi
fi

cp .env ".env.bak-metrika-$(date +%Y%m%d-%H%M%S)"
setvar() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env >"$tmp"
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  cat "$tmp" >.env
  rm -f "$tmp"
}
setvar NEXT_PUBLIC_YM_ID "$COUNTER"
[ -n "$TOKEN" ] && setvar YM_OAUTH_TOKEN "'$TOKEN'"
echo "Метрика: счётчик $COUNTER сохранён${TOKEN:+, токен проверен}. Пересоберите приложение (номер счётчика встраивается при сборке)."
