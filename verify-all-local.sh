#!/data/data/com.termux/files/usr/bin/bash

set -u

PASS=0
FAIL=0
WARN=0

pass() {
  echo "✅ $1"
  PASS=$((PASS+1))
}

fail() {
  echo "❌ $1"
  FAIL=$((FAIL+1))
}

warn() {
  echo "⚠️ $1"
  WARN=$((WARN+1))
}

echo
echo "=================================================="
echo "=== JYY'R STORE — FULL LOCAL VERIFICATION ==="
echo "=================================================="

echo
echo "=== NODE / NPM ==="

node -v && pass "Node.js available" || fail "Node.js unavailable"
npm -v && pass "npm available" || fail "npm unavailable"

echo
echo "=== DEPENDENCY CHECK ==="

if [ -d "node_modules" ]; then
  pass "node_modules exists"
else
  warn "node_modules tidak ada — jalankan npm install terpisah"
fi

if npm ls --depth=0 >/dev/null 2>&1; then
  pass "npm dependency tree"
else
  fail "npm dependency tree"
  npm ls --depth=0 || true
fi

echo
echo "=== NPM TEST ==="

if npm test; then
  pass "npm test"
else
  fail "npm test"
fi

echo
echo "=== NPM VERIFY ==="

if npm run verify; then
  pass "npm run verify"
else
  fail "npm run verify"
fi

echo
echo "=== BUILD CHECK ==="

if npm run build; then
  pass "npm run build"
else
  fail "npm run build"
fi

echo
echo "=== DATABASE READ-ONLY VERIFY ==="

if npm run verify:db; then
  pass "npm run verify:db"
else
  fail "npm run verify:db"
fi

echo
echo "=== JAVASCRIPT / MJS SYNTAX ==="

JS_FAIL=0

while IFS= read -r -d '' file; do
  if node --check "$file" >/dev/null 2>&1; then
    echo "✅ PASS $file"
  else
    echo "❌ FAIL $file"
    JS_FAIL=1
  fi
done < <(
  find . -type f \( -name "*.js" -o -name "*.mjs" \) \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -print0
)

if [ "$JS_FAIL" -eq 0 ]; then
  pass "JavaScript/MJS syntax"
else
  fail "JavaScript/MJS syntax"
fi

echo
echo "=== EJS COMPILE ==="

EJS_FAIL=0

node - <<'NODE'
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });
}

const files = walk('views').filter(f => f.endsWith('.ejs'));
let failed = 0;

for (const file of files) {
  try {
    ejs.compile(fs.readFileSync(file, 'utf8'), {filename:file});
    console.log(`✅ PASS ${file}`);
  } catch (err) {
    failed++;
    console.log(`❌ FAIL ${file}`);
    console.log(err.message);
  }
}

console.log(`EJS_FILES=${files.length}`);
process.exit(failed ? 1 : 0);
NODE

if [ $? -eq 0 ]; then
  pass "EJS compile"
else
  fail "EJS compile"
fi

echo
echo "=== HTML SYNTAX ==="

if command -v xmllint >/dev/null 2>&1; then

  HTML_FAIL=0

  while IFS= read -r -d '' file; do
    if xmllint --html --noout "$file" >/dev/null 2>&1; then
      echo "✅ PASS $file"
    else
      echo "⚠️ CHECK $file"
      HTML_FAIL=1
    fi
  done < <(
    find . -type f -name "*.html" \
      -not -path "./node_modules/*" \
      -not -path "./.git/*" \
      -print0
  )

  if [ "$HTML_FAIL" -eq 0 ]; then
    pass "HTML syntax"
  else
    warn "HTML syntax has warnings"
  fi

else
  warn "xmllint belum terinstall — HTML syntax dilewati"
fi

echo
echo "=== CSS STRUCTURAL CHECK ==="

CSS_FAIL=0

while IFS= read -r -d '' file; do

  result=$(
    python3 - "$file" <<'PY'
import sys

path = sys.argv[1]

try:
    text = open(path, "r", encoding="utf-8").read()
except Exception as e:
    print(f"READ_ERROR: {e}")
    sys.exit(1)

depth = 0
line = 1
in_string = None
escaped = False
in_comment = False
i = 0

while i < len(text):
    ch = text[i]
    nxt = text[i + 1] if i + 1 < len(text) else ""

    if ch == "\n":
        line += 1

    if in_comment:
        if ch == "*" and nxt == "/":
            in_comment = False
            i += 2
            continue
        i += 1
        continue

    if in_string:
        if escaped:
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == in_string:
            in_string = None
        i += 1
        continue

    if ch == "/" and nxt == "*":
        in_comment = True
        i += 2
        continue

    if ch in ("'", '"'):
        in_string = ch
    elif ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth < 0:
            print(f"UNBALANCED_CLOSING_BRACE line {line}")
            sys.exit(1)

    i += 1

if in_comment:
    print("UNTERMINATED_COMMENT")
    sys.exit(1)

if in_string:
    print("UNTERMINATED_STRING")
    sys.exit(1)

if depth != 0:
    print(f"UNBALANCED_BRACES depth={depth}")
    sys.exit(1)

print("PASS")
PY
  )

  if [ "$result" = "PASS" ]; then
    echo "✅ PASS $file"
  else
    echo "❌ FAIL $file — $result"
    CSS_FAIL=1
  fi

done < <(
  find . -type f -name "*.css" \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -print0
)

if [ "$CSS_FAIL" -eq 0 ]; then
  pass "CSS structural check"
else
  fail "CSS structural check"
fi

echo
echo "=== OWNER ROUTE / SIDEBAR CONSISTENCY ==="

node - <<'NODE'
const fs = require('fs');

const routes = fs.readFileSync('src/routes/index.js', 'utf8');
const sidebar = fs.readFileSync('views/partials/owner-sidebar.ejs', 'utf8');

const routeMatch = routes.match(
  /const ownerSections=\[([^\]]+)\]/
);

if (!routeMatch) {
  console.error('❌ ownerSections tidak ditemukan');
  process.exit(1);
}

const routeSections = [...routeMatch[1].matchAll(/'([^']+)'/g)]
  .map(m => m[1]);

const navMatch = sidebar.match(
  /const ownerNav=\[([\s\S]*?)\];/
);

if (!navMatch) {
  console.error('❌ ownerNav tidak ditemukan');
  process.exit(1);
}

const navSections = [...navMatch[1].matchAll(/\['([^']+)'/g)]
  .map(m => m[1]);

const missing = navSections.filter(x => !routeSections.includes(x));

if (missing.length) {
  console.error('❌ Sidebar memiliki route Owner yang belum terdaftar:');
  console.error(missing.join(', '));
  process.exit(1);
}

console.log(`✅ ${navSections.length} Owner sidebar sections memiliki route`);
NODE

if [ $? -eq 0 ]; then
  pass "Owner route/sidebar consistency"
else
  fail "Owner route/sidebar consistency"
fi

echo
echo "=== STALE CSS REFERENCES ==="

STALE_CSS=0

while IFS= read -r line; do
  case "$line" in
    *'/css/components/modal.css'*|*'/css/components/toast.css'*)
      echo "❌ $line"
      STALE_CSS=1
      ;;
  esac
done < <(
  grep -RniE 'components/modal\.css|components/toast\.css' \
    views public src server.js 2>/dev/null || true
)

if [ "$STALE_CSS" -eq 0 ]; then
  pass "No stale modal/toast CSS references"
else
  fail "Stale modal/toast CSS references found"
fi

echo
echo "=== SERVICE WORKER REFERENCES ==="

if grep -RniE \
  'service-worker\.js|navigator\.serviceWorker|serviceWorker' \
  views public/js src server.js 2>/dev/null; then
  warn "Service worker reference ditemukan"
else
  pass "No active service-worker reference in source"
fi

echo
echo "=== GIT SANITY ==="

if git diff --check; then
  pass "git diff --check"
else
  fail "git diff --check"
fi

echo
git status --short

echo
echo "=================================================="
echo "=== VERIFICATION SUMMARY ==="
echo "=================================================="

echo "PASS : $PASS"
echo "FAIL : $FAIL"
echo "WARN : $WARN"

echo
echo "ⓘ Migration tidak dijalankan oleh verification ini."
echo "ⓘ npm run verify:db bersifat read-only."
echo "ⓘ Tidak ada npm migrate / SQL migration yang dijalankan."

if [ "$FAIL" -eq 0 ]; then
  echo
  echo "🎉 FULL LOCAL VERIFICATION PASSED"
  exit 0
else
  echo
  echo "❌ FULL LOCAL VERIFICATION FAILED"
  exit 1
fi
