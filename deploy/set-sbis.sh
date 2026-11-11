#!/usr/bin/env bash
# Подключение ЭДО СБИС (Saby): логин и пароль пользователя с правами на ЭДО вводятся на сервере,
# проверяются входом в API (СБИС.Аутентифицировать) и записываются в /opt/evotech/.env.
# Запуск: ssh -t root@сервер "bash /opt/evotech/deploy/set-sbis.sh [visible]"
set -uo pipefail
cd /opt/evotech
READOPT="-rsp"
[ "${1:-}" = "visible" ] && READOPT="-rp"
URL="https://online.sbis.ru"

read -rp "Логин Saby (СБИС): " LOGIN
read $READOPT "Пароль Saby: " PASS; echo
[ "$READOPT" = "-rp" ] && printf '\033[2J\033[3J\033[H'
LOGIN="${LOGIN//[[:space:]]/}"
if [ -z "$LOGIN" ] || [ -z "$PASS" ]; then echo "Логин или пароль не введены — ничего не изменено."; exit 1; fi
case "$PASS$LOGIN" in *"'"*) echo "Пароль или логин содержит апостроф — смените пароль в Saby или сообщите разработчику. Ничего не изменено."; exit 1 ;; esac

json() { local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
# Тело запроса — через stdin, пароль не попадает в список процессов
RESP=$(printf '{"jsonrpc":"2.0","method":"СБИС.Аутентифицировать","params":{"Параметр":{"Логин":"%s","Пароль":"%s"}},"protocol":4,"id":0}' "$(json "$LOGIN")" "$(json "$PASS")" |
  curl -sS --max-time 30 -H "Content-Type: application/json-rpc;charset=utf-8" --data @- "$URL/auth/service/")
if ! printf '%s' "$RESP" | grep -q '"result":"'; then
  MSG=$(printf '%s' "$RESP" | grep -o '"details":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "СБИС: вход не выполнен — ${MSG:-нет ответа}. Ничего не изменено."
  exit 1
fi

cp .env ".env.bak-sbis-$(date +%Y%m%d-%H%M%S)"
setvar() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env >"$tmp"
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  cat "$tmp" >.env
  rm -f "$tmp"
}
setvar SBIS_LOGIN "'$LOGIN'"
setvar SBIS_PASSWORD "'$PASS'"
setvar SBIS_API_URL "$URL"
echo "СБИС: вход выполнен, настройки сохранены. Перезапустите приложение и воркер."
