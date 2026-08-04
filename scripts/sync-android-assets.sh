#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WWW="$ROOT/android/app/src/main/assets/www"
echo "→ Syncing Smart Realty app into Android assets…"
rm -rf "$WWW"
mkdir -p "$WWW/js" "$WWW/images"
cp "$ROOT/m/index.html" "$WWW/"
cp "$ROOT/m/styles.css" "$WWW/"
cp "$ROOT/m/app.js" "$WWW/"
cp "$ROOT/m/manifest.webmanifest" "$WWW/"
cp "$ROOT/m/icon-192.svg" "$WWW/" 2>/dev/null || true
cp "$ROOT/m/icon-512.svg" "$WWW/" 2>/dev/null || true
cp "$ROOT/js/properties.js" "$WWW/js/"
cp "$ROOT/js/auth-client.js" "$WWW/js/"
cp "$ROOT/domain-config.js" "$WWW/"
cp -R "$ROOT/images/"* "$WWW/images/"
sed -i '' \
  -e 's|src="../domain-config.js"|src="domain-config.js"|g' \
  -e 's|src="../js/properties.js"|src="js/properties.js"|g' \
  -e 's|src="../js/auth-client.js"|src="js/auth-client.js"|g' \
  -e 's|href="../auth.html?next=m/index.html"|href="auth-stub.html"|g' \
  -e 's|href="../index.html"|href="index.html"|g' \
  "$WWW/index.html"
python3 -c "
from pathlib import Path
p = Path('$WWW') / 'app.js'
t = p.read_text()
t = t.replace('../images/mansion-1.jpg', 'images/mansion-1.jpg')
t = t.replace('return \`../\${src}\`', 'return src')
p.write_text(t)
print('patched app.js')
"
cat > "$WWW/auth-stub.html" << 'EOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sign in</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eaed;padding:2rem}a{color:#8ab4ff}</style></head>
<body><h1>Sign in</h1><p>Demo browsing works offline. Full accounts need the Auth API.</p>
<p><a href="index.html">← Back to Smart Realty</a></p></body></html>
EOF
echo "✓ files: $(find "$WWW" -type f | wc -l | tr -d ' ')"
