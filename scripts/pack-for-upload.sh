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
for f in index.html styles.css app.js domain-config.js robots.txt .htaccess .htpasswd; do
  if [[ -f "$ROOT/$f" ]]; then
    cp "$ROOT/$f" "$STAGING/"
    echo "  + $f"
  else
    echo "  ! missing $f" >&2
  fi
done

# Images
if [[ -d "$ROOT/images" ]]; then
  cp -R "$ROOT/images/"* "$STAGING/images/" 2>/dev/null || true
  echo "  + images/ ($(find "$STAGING/images" -type f | wc -l | tr -d ' ') files)"
fi

# Optional docs (handy on server for you; not required for visitors)
for f in CUSTOM-DOMAIN-WALKTHROUGH.md GO-LIVE-CHECKLIST.md SHARE-EMAIL.txt DEPLOY-GODADDY.md README.md DUNS-AND-COMPANY-SETUP.md; do
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
echo "  Upload this zip in cPanel File Manager → Extract into public_html (or /demo)."
echo "  Then edit .htaccess AuthUserFile to your real /home/USER/... path."
ls -lh "$OUT"
