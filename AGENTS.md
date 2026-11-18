# CleanShield — Agents

This file describes how AI agents should interact with the CleanShield extension project.

## Purpose

CleanShield is a clean-room MV3 Chrome extension for blocking ads, specific websites, SNS/community posts by keyword, and short-form content (Shorts/Reels/TikTok). This file guides agents through common tasks.

## Agent Workflow

### Installation

1. **Install from unpacked folder**
   - Open `chrome://extensions` in Chrome
   - Enable **Developer mode**
   - Click **압축해제된 확장 프로그램 로드**
   - Select `/Users/kimtongjoo/Library/Application Support/CleanShield/extension`
   - Verify extension appears enabled

2. **Persist across Chrome restarts**
   - Developer mode must be ON (persists in `Secure Preferences`)
   - Use `chrome://extensions` UI flow — CDP `Extensions.loadUnpacked` does NOT persist

### Common Tasks

#### Block YouTube Ads

1. Visit `youtube.com`
2. Right-click → **CleanShield — Block element**
3. Drag cursor over ad area
4. Click **보호기 저장**
5. Refresh page

#### Block Shorts/Reels/TikTok

1. Click CleanShield popup → **기어아이콘/설정** (gear/settings)
2. Go to **숏폼 차단** tab
3. Check/uncheck **set-shortform** toggle
4. For element-level control: right-click → **Block element** on specific Shorts/Reels

#### Add Custom Filter

1. Click CleanShield popup → **기어아이콘/설정** → **고급** tab
2. Add ABP-format filter in **사용자 필터** field
3. Click **검사** → **저장 및 적용**
4. Supported filters: `||domain^`, `@@||domain^`, `domain##selector`, `##selector`

#### View/Export Stats

1. Click CleanShield popup
2. Stats shown: network, keywords, shorts, blocked pages
3. Export: **고급** → **데이터 내보내기·가져오기** → JSON

### Debug & Verify

#### Check Extension Status

```bash
# Verify extension is enabled
python3 - <<'PY'
import json
p = '/Users/kimtongjoo/Library/Application Support/Google/Chrome/Default/Secure Preferences'
d = json.load(open(p))
s = d.get('extensions', {}).get('settings', {})
e = s.get('dnkajofpdjdonngomipcboncfgbajlcc')
print('Enabled:', bool(e))
print('Location:', e.get('location') if e else 'N/A')
print('Disable reasons:', e.get('disable_reasons') if e else 'N/A')
PY
```

#### Verify Developer Mode

```bash
python3 - <<'PY'
import json
p = '/Users/kimtongjoo/Library/Application Support/Google/Chrome/Default/Secure Preferences'
d = json.load(open(p))
print('developer_mode (ui):', d.get('extensions', {}).get('ui', {}).get('developer_mode'))
PY
```

#### Check Network Rules Count

```bash
python3 - <<'PY'
import json
with open('/Users/kimtongjoo/Library/Application Support/CleanShield/extension/rules/ads.json') as f:
    data = json.load(f)
print('Network rules:', len(data))
PY
```

### Project Structure

```
cleanshield/
├── manifest.json          # MV3 manifest
├── src/                   # Source code
├── rules/                 # Generated DNR + cosmetic rules
├── data/                  # Cosmetic data + build info
├── icons/                 # 16/32/48/128/512 icons
├─ tools/                  # Build & packaging tools
├─ tests/                  # Unit + E2E tests (22/22 pass)
├─ docs/                   # Architecture + Privacy docs
├─ README.md               # This documentation
├─ NOTICE.md               # License attributions
└─ LICENSE                # GPL-3.0
```

### Build & Packaging

```bash
# Fetch filter lists
python3 tools/fetch_lists.py

# Build DNR + cosmetic data
python3 tools/build_rules.py

# Recreate icons
python3 tools/make_icons.py

# Run unit tests
npm test    # node --test tests/*.test.mjs

# Run E2E tests
node tests/e2e.mjs    # CHROME_PATH needed for Chrome for Testing

# Package unpacked
python3 tools/package.py --zip

# Package for store (removes debugging permission)
python3 tools/package.py --store --zip
```

### Test Results (Last Build)

- **Unit tests:** 22/22 passed
- **E2E tests:** 22/22 passed

Test coverage: site adapters, keyword matching (contains/word/regex), site scope, zero-width characters, dynamic article hide/restore, manifest integrity, JS syntax, DNR rules limits/formats, cosmetic data/CSS sync, build metadata, user filter parser, domain normalization, broken config recovery.

### Known Limitations

- YouTube video-embedded ads: Cannot be removed by `declarativeNetRequest` (same for all MV3 blockers)
- Dynamic ads/DOM changes: May break element hiding; update adapters in `src/content/core.js`
- User filters: Only ABP subset supported; unsupported options show warning
- Static rules limit: Chrome 30,000 rule cap; list is curated (not full EasyList)
- Site blocking: Only top-level document navigation blocked; iframes not affected
- Keyword blocking: Only top-level frame; iframe widgets not checked
- TikTok full block: Entire platform blocked (no per-video allow)
- Statistics: Reset at midnight; network counts 0 in `--store` builds
- No sync: Use JSON export/import for multi-device transfer
- Browser support: Chrome/Chromium MV3 only; Firefox/Safari/mobile not supported
- Not web store registered: This is source + packaging tools, not a registered store listing

### Agent Do's and Don'ts

| Do | Don't |
|----|-----|
| Use `chrome://extensions` UI for installation | Rely on `Extensions.loadUnpacked` via CDP for persistence |
| Keep developer mode ON in `Secure Preferences` | Use `--load-extension` CLI switch (ignored in Chrome 137+) |
| Test element picker on YouTube for ad blocking | Assume network rules alone will block all YouTube ads |
| Use JSON export/import for settings transfer | Expect cloud sync or account integration |
| Update `tools/build_rules.py` when filter lists change | Forget to re-run after modifying `tools/lists/` |
| Keep Korean UI strings consistent | Remove or rename Korean UI elements without translation |

### Need Help?

- Check `docs/ARCHITECTURE.md` for internal architecture
- Check `docs/PRIVACY.md` for data handling policies
- Run `npm test` and `node tests/e2e.mjs` for verification
- Contact: The extension is a clean-room implementation, not affiliated with Adblock Plus or Eyeo GmbH