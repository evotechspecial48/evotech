#!/usr/bin/env bash
# Подключение Т-Бизнеса (T-API): токен вводится скрыто, проверяется запросом к API и записывается в /opt/evotech/.env.
# Токен выпускается в Т-Бизнесе: Интеграции → T-API → «Выпустить токен», доступы «Выставление счетов»
# и «Выставление ссылок через СБП», IP-адрес сервера в списке разрешённых.
# Запуск: ssh -t root@сервер "bash /opt/evotech/deploy/set-tbank.sh [visible]"
set -uo pipefail
cd /opt/evotech
READOPT="-rsp"
[ "${1:-}" = "visible" ] && READOPT="-rp"
URL="https://business.tbank.ru/openapi"

read $READOPT "Токен T-API Т-Бизнеса: " TOKEN; echo
[ "$READOPT" = "-rp" ] && printf '\033[2J\033[3J\033[H'
TOKEN="${TOKEN//[[:space:]]/}"
if [ -z "$TOKEN" ]; then echo "Токен не введён — ничего не изменено."; exit 1; fi

# Проверка токена: запрос информации о несуществующей QR-ссылке. 404 — токен принят, 401/403 — нет доступа.
# Сертификат API выдан НУЦ Минцифры — проверяем по связке из deploy/certs
CODE=$(curl -s --cacert /opt/evotech/deploy/certs/russian-trusted-ca.pem --max-time 25 -o /dev/null -w "%{http_code}" -K - "$URL/api/v1/b2b/qr/00000000-0000-0000-0000-000000000000/info" <<<"header = \"Authorization: Bearer $TOKEN\"")
case "$CODE" in
  200|404|400|422) ;;
  401|403) echo "Т-Бизнес: токен не принят или нет доступа «Выставление ссылок через СБП» (HTTP $CODE). Ничего не изменено."; exit 1 ;;
  *) echo "Т-Бизнес: неожиданный ответ HTTP $CODE — проверьте IP-ограничения токена. Ничего не изменено."; exit 1 ;;
esac

cp .env ".env.bak-tbank-$(date +%Y%m%d-%H%M%S)"
setvar() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env >"$tmp"
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  cat "$tmp" >.env
  rm -f "$tmp"
}
setvar TBANK_BUSINESS_TOKEN "'$TOKEN'"
setvar TBANK_BUSINESS_API_URL "$URL"
setvar PAYMENT_PROVIDER tbank-business
echo "Т-Бизнес: токен принят (HTTP $CODE), настройки сохранены. Перезапустите приложение и воркер."
