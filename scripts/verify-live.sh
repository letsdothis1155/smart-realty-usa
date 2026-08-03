#!/usr/bin/env bash
# Verify DNS + HTTPS for Smart Realty USA custom domain
set -euo pipefail

HOST="${1:-}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 <domain>"
  echo "  example: $0 smartrealty.us"
  echo "  example: $0 demo.smartrealty.us"
  exit 1
fi

# strip protocol / path if user pasted a full URL
HOST="${HOST#https://}"
HOST="${HOST#http://}"
HOST="${HOST%%/*}"

echo "═══════════════════════════════════════════"
echo " Smart Realty USA — Live domain check"
echo " Host: $HOST"
echo "═══════════════════════════════════════════"
echo ""

pass=0
fail=0
warn=0

ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }
maybe(){ echo "  ~ $1"; warn=$((warn+1)); }

echo "1) DNS A / CNAME"
A_RECS=$(dig +short "$HOST" A 2>/dev/null | grep -E '^[0-9.]+$' || true)
CNAME_RECS=$(dig +short "$HOST" CNAME 2>/dev/null || true)
AAAA_RECS=$(dig +short "$HOST" AAAA 2>/dev/null || true)

if [[ -n "$A_RECS" ]]; then
  ok "A record(s): $(echo $A_RECS | tr '\n' ' ')"
elif [[ -n "$CNAME_RECS" ]]; then
  ok "CNAME: $CNAME_RECS"
  # resolve final A
  FINAL=$(dig +short "$HOST" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)
  [[ -n "$FINAL" ]] && ok "CNAME resolves to A: $FINAL"
else
  bad "No A or CNAME found yet — DNS may still be propagating"
fi
[[ -n "$AAAA_RECS" ]] && maybe "AAAA (IPv6) present: $(echo $AAAA_RECS | tr '\n' ' ')"

echo ""
echo "2) HTTPS reachability"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${HOST}/" 2>/dev/null || echo "000")
case "$HTTP_CODE" in
  200) ok "HTTPS GET / → 200 OK" ;;
  401) ok "HTTPS GET / → 401 (Basic Auth is ON — expected for private demo)" ;;
  301|302|307|308) ok "HTTPS GET / → $HTTP_CODE redirect (follow-up manually)" ;;
  000) bad "HTTPS failed (connection/SSL/DNS). Code 000" ;;
  *) maybe "HTTPS GET / → HTTP $HTTP_CODE" ;;
esac

echo ""
echo "3) TLS certificate"
if echo | openssl s_client -servername "$HOST" -connect "${HOST}:443" 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null; then
  ok "Certificate presented on :443"
else
  bad "Could not read TLS certificate on :443"
fi

echo ""
echo "4) Key assets (may be 401 if Basic Auth is required)"
for path in /styles.css /app.js /domain-config.js /images/hero-bg.jpg; do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "https://${HOST}${path}" 2>/dev/null || echo "000")
  if [[ "$CODE" == "200" || "$CODE" == "401" ]]; then
    ok "$path → $CODE"
  else
    bad "$path → $CODE"
  fi
done

echo ""
echo "5) HTTP → HTTPS (optional redirect)"
HCODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "http://${HOST}/" 2>/dev/null || echo "000")
if [[ "$HCODE" =~ ^30[12378]$ ]]; then
  ok "HTTP redirects ($HCODE)"
elif [[ "$HCODE" == "200" || "$HCODE" == "401" ]]; then
  maybe "HTTP responds $HCODE without redirect — enable HTTPS force in .htaccess when ready"
else
  maybe "HTTP check → $HCODE"
fi

echo ""
echo "═══════════════════════════════════════════"
echo " Results: $pass passed · $warn warnings · $fail failed"
echo "═══════════════════════════════════════════"

if [[ "$fail" -gt 0 ]]; then
  echo "Next: re-check DNS, AutoSSL, and AuthUserFile path."
  echo "Full guide: CUSTOM-DOMAIN-WALKTHROUGH.md"
  exit 1
fi

echo "DNS/HTTPS look good. Complete GO-LIVE-CHECKLIST.md browser tests next."
exit 0
