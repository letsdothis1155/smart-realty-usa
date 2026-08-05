#!/usr/bin/env bash
# Pack Smart Realty USA files for GoDaddy / cPanel upload
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${HOME}/Desktop/smart-realty-usa-upload.zip"
STAGING="$(mktemp -d)"

cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

echo "→ Staging from: $ROOT"

mkdir -p "$STAGING/images"

# Core site files
for f in index.html auth.html account.html admin.html styles.css app.js domain-config.js robots.txt sitemap.xml .htaccess .htpasswd CNAME; do
  if [[ -f "$ROOT/$f" ]]; then
    cp "$ROOT/$f" "$STAGING/"
    echo "  + $f"
  else
    echo "  ! missing $f" >&2
  fi
done

# Client JS (website only — skip shipping Android shell)
mkdir -p "$STAGING/js"
if [[ -d "$ROOT/js" ]]; then
  cp -R "$ROOT/js/"* "$STAGING/js/" 2>/dev/null || true
  echo "  + js/ ($(find "$STAGING/js" -type f | wc -l | tr -d ' ') files)"
fi

# PHP accounts API (GoDaddy cPanel)
if [[ -d "$ROOT/api" ]]; then
  mkdir -p "$STAGING/api/auth" "$STAGING/api/data"
  for f in config.php lib.php health.php .htaccess README.md; do
    [[ -f "$ROOT/api/$f" ]] && cp "$ROOT/api/$f" "$STAGING/api/"
  done
  for f in register.php login.php demo.php me.php change-password.php forgot-password.php reset-password.php; do
    [[ -f "$ROOT/api/auth/$f" ]] && cp "$ROOT/api/auth/$f" "$STAGING/api/auth/"
  done
  [[ -f "$ROOT/api/leads.php" ]] && cp "$ROOT/api/leads.php" "$STAGING/api/"
  [[ -f "$ROOT/api/leads-list.php" ]] && cp "$ROOT/api/leads-list.php" "$STAGING/api/"
  [[ -f "$ROOT/api/data/.htaccess" ]] && cp "$ROOT/api/data/.htaccess" "$STAGING/api/data/"
  [[ -f "$ROOT/api/data/.gitkeep" ]] && cp "$ROOT/api/data/.gitkeep" "$STAGING/api/data/"
  # never ship live user DB
  echo "  + api/ (PHP accounts + leads for GoDaddy)"
fi

# Images
if [[ -d "$ROOT/images" ]]; then
  cp -R "$ROOT/images/"* "$STAGING/images/" 2>/dev/null || true
  echo "  + images/ ($(find "$STAGING/images" -type f | wc -l | tr -d ' ') files)"
fi

# Docs that help you on the server
for f in GODADDY-ORGANIZER.md GO-LIVE-CHECKLIST.md SHARE-EMAIL.txt DEPLOY-GODADDY.md README.md CUSTOM-DOMAIN-WALKTHROUGH.md; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$STAGING/" && echo "  + $f (doc)"
done

rm -f "$OUT"
# zip from inside staging so paths are flat at zip root
(
  cd "$STAGING"
  zip -r -q "$OUT" .
)

echo ""
echo "✓ Created: $OUT"
echo "  Website + PHP accounts only (no Android app)."
echo "  cPanel → File Manager → public_html → Upload zip → Extract."
echo "  Then: set SRU_JWT_SECRET in api/config.php · AutoSSL · test /auth.html"
echo "  Full guide: GODADDY-ORGANIZER.md"
ls -lh "$OUT"
