#!/usr/bin/env bash
# Pack a GoDaddy-ready DEMO upload for Smart Realty USA
# Includes: static site + PHP api (works on Linux Web Hosting / cPanel)
# Plus clear Airo vs Hosting instructions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d)"
OUT="${HOME}/Downloads/SmartRealty-USA-GoDaddy-Demo-${STAMP}.zip"
OUT_STABLE="${HOME}/Downloads/SmartRealty-USA-GoDaddy-Demo.zip"
STAGING="$(mktemp -d)"

cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

echo "→ Building GoDaddy demo package from: $ROOT"
mkdir -p "$STAGING/images" "$STAGING/js" "$STAGING/api/auth" "$STAGING/api/data"

# Core pages
for f in index.html auth.html account.html admin.html privacy.html terms.html 404.html \
         styles.css app.js robots.txt sitemap.xml .htaccess .htpasswd CNAME; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$STAGING/" && echo "  + $f"
done

# Demo-tuned domain config (easier first upload)
cat > "$STAGING/domain-config.js" << 'EOF'
/* Smart Realty USA — GoDaddy demo config
   After upload you can edit this file on the server. */
window.SRU_CONFIG = {
  siteName: "Smart Realty USA",
  tagline: "Exclusive homes. Transparent prices. Bitcoin ready.",
  siteUrl: "https://smartrealty.us",
  canonicalHost: "smartrealty.us",
  contactEmail: "ai@smartrealty.us",
  phoneDisplay: "1-800-SMART-USA",
  phoneTel: "+18007627879",
  legalName: "Smart Realty USA LLC",
  organizerName: "Andrew Iredale",
  formationState: "Kentucky",
  dunsNumber: "",
  ein: "",
  businessAddress: "",
  isPrivateDemo: true,
  seo: {
    index: true,
    ogImage: "https://smartrealty.us/images/hero-bg.jpg",
    twitterHandle: "@JrIredale43143",
  },
  presenterMode: true,
  demoPasswordHint: false,
  auth: {
    /* "demo" = password gate only (works without PHP).
       "accounts" = full sign-up when api/ PHP is live on cPanel.
       "open" = no gate (public marketing). */
    mode: "demo",
    apiUrl: "",
    usePhp: true,
    demoPassword: "SmartRealty2026",
    allowDemoAccess: true,
  },
  analytics: { enabled: true },
  social: {},
};
EOF
echo "  + domain-config.js (demo-tuned)"

# Client JS
cp -R "$ROOT/js/"* "$STAGING/js/" 2>/dev/null || true
echo "  + js/"

# Images
cp -R "$ROOT/images/"* "$STAGING/images/" 2>/dev/null || true
echo "  + images/"

# PHP API (for Web Hosting / cPanel — ignored by pure Website Builder)
if [[ -d "$ROOT/api" ]]; then
  for f in config.php config.sample.php lib.php health.php security-status.php \
           leads.php leads-list.php events.php .htaccess README.md; do
    [[ -f "$ROOT/api/$f" ]] && cp "$ROOT/api/$f" "$STAGING/api/"
  done
  for f in register.php login.php demo.php me.php change-password.php \
           forgot-password.php reset-password.php; do
    [[ -f "$ROOT/api/auth/$f" ]] && cp "$ROOT/api/auth/$f" "$STAGING/api/auth/"
  done
  [[ -f "$ROOT/api/data/.htaccess" ]] && cp "$ROOT/api/data/.htaccess" "$STAGING/api/data/"
  [[ -f "$ROOT/api/data/.gitkeep" ]] && cp "$ROOT/api/data/.gitkeep" "$STAGING/api/data/"
  echo "  + api/ (accounts + leads — needs Linux hosting)"
fi

# Guides
for f in UPLOAD-GODADDY-AIRO.md GODADDY-ORGANIZER.md SECRETS.md GO-LIVE-CHECKLIST.md README.md; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$STAGING/" && echo "  + $f"
done

# Always write the Airo guide into the package
cp "$ROOT/UPLOAD-GODADDY-AIRO.md" "$STAGING/README-UPLOAD-FIRST.txt" 2>/dev/null || true
cp "$ROOT/UPLOAD-GODADDY-AIRO.md" "$STAGING/UPLOAD-GODADDY-AIRO.md"

rm -f "$OUT" "$OUT_STABLE"
(
  cd "$STAGING"
  zip -r -q "$OUT" .
  zip -r -q "$OUT_STABLE" .
)

echo ""
echo "✓ GoDaddy demo packages ready:"
echo "  $OUT"
echo "  $OUT_STABLE"
ls -lh "$OUT" "$OUT_STABLE"
echo ""
echo "Open UPLOAD-GODADDY-AIRO.md inside the zip first."
echo "Demo password: SmartRealty2026"
