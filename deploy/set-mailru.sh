#!/usr/bin/env bash
# Подключение почты и Облака Mail.ru: пароли вводятся скрыто, проверяются и записываются в /opt/evotech/.env.
# Пароли не попадают в историю команд и чат. Приложение не перезапускается — это делается отдельно.
# Запуск: ssh -t root@сервер "bash /opt/evotech/deploy/set-mailru.sh [адрес@mail.ru] [visible] [mail|cloud]"
#   visible — вводимые символы видны (если скрытый ввод не работает в терминале); после ввода экран очищается;
#   mail / cloud — настроить только почту или только Облако (по умолчанию — оба).
set -uo pipefail
cd /opt/evotech
EMAIL="${1:-evotechnology@mail.ru}"
READOPT="-rsp"
[ "${2:-}" = "visible" ] && READOPT="-rp"
ONLY="${3:-}"
MAILPASS=""
CLOUDPASS=""

echo "Учётная запись: $EMAIL"
echo "Нужен «пароль для внешнего приложения» (Mail ID → Безопасность → Пароли для внешних приложений), не основной пароль."
if [ "$ONLY" != "cloud" ]; then
  read $READOPT "Пароль приложения для ПОЧТЫ (SMTP): " MAILPASS; echo
fi
if [ "$ONLY" != "mail" ]; then
  read $READOPT "Пароль приложения для ОБЛАКА (WebDAV)${MAILPASS:+, Enter — тот же}: " CLOUDPASS; echo
fi
# Очистка экрана и истории прокрутки, чтобы введённый пароль не остался на виду
[ "$READOPT" = "-rp" ] && printf '\033[2J\033[3J\033[H'
CLOUDPASS="${CLOUDPASS:-$MAILPASS}"
MAILPASS="${MAILPASS//[[:space:]]/}"
CLOUDPASS="${CLOUDPASS//[[:space:]]/}"
if [ -z "$MAILPASS" ] && [ -z "$CLOUDPASS" ]; then echo "Пароль не введён — ничего не изменено."; exit 1; fi

cp .env ".env.bak-mailru-$(date +%Y%m%d-%H%M%S)"
setvar() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env >"$tmp"
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  cat "$tmp" >.env
  rm -f "$tmp"
}

# Логин и пароль передаются curl через stdin, а не аргументами — их не видно в списке процессов
if [ -n "$MAILPASS" ]; then
  curl -sS --max-time 25 --url smtps://smtp.mail.ru:465 -X NOOP -K - >/dev/null 2>/tmp/evotech-smtp.err <<<"user = \"$EMAIL:$MAILPASS\""
  SMTP_RC=$?
  if [ "$SMTP_RC" -eq 0 ]; then
    setvar MAIL_TRANSPORT smtp
    setvar SMTP_HOST smtp.mail.ru
    setvar SMTP_PORT 465
    setvar SMTP_USER "$EMAIL"
    setvar SMTP_PASSWORD "'$MAILPASS'"
    setvar MAIL_FROM "\"ЭвоТех <$EMAIL>\""
    echo "Почта: вход выполнен, настройки сохранены."
  else
    echo "Почта: ОШИБКА входа (код curl $SMTP_RC: $(head -c 200 /tmp/evotech-smtp.err)). Настройки почты не изменены."
  fi
  rm -f /tmp/evotech-smtp.err
fi

if [ "$ONLY" != "mail" ]; then
  WEBDAV_CODE=$(curl -s --max-time 25 -o /dev/null -w "%{http_code}" -X PROPFIND -H "Depth: 0" -K - https://webdav.cloud.mail.ru/ <<<"user = \"$EMAIL:$CLOUDPASS\"")
  if [ "$WEBDAV_CODE" = "207" ]; then
    setvar WEBDAV_URL https://webdav.cloud.mail.ru
    setvar WEBDAV_USER "$EMAIL"
    setvar WEBDAV_PASSWORD "'$CLOUDPASS'"
    echo "Облако: подключение работает, настройки сохранены (хранилище включится после переноса файлов)."
  else
    echo "Облако: ОШИБКА (HTTP $WEBDAV_CODE). Неверный пароль, у пароля приложения нет доступа к Облаку или тариф Облака бесплатный (WebDAV работает только на платном). Настройки облака не изменены."
  fi
fi
