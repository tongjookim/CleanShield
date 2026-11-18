# CleanShield 아키텍처

이 문서는 CleanShield 1.0.0의 구성 요소, 데이터 흐름, 저장소 모델, 빌드
파이프라인을 설명합니다. 사용자 문서는 [README](../README.md)를 참고하세요.

---

## 1. 설계 목표

1. **완전한 독립 실행**: ABP 확장 프로그램이나 외부 필터 서버 없이 동작한다.
2. **Manifest V3 준수**: 원격 코드·원격 설정 없이 패키지에 포함된 코드와
   데이터만 사용한다.
3. **로컬 우선**: 설정과 통계는 브라우저 밖으로 나가지 않는다.
4. **즉시 반영**: 설정을 바꾸면 열려 있는 탭에 바로 적용한다.
5. **검증 가능성**: 필터 변환 결과와 매니페스트 무결성을 테스트로 확인한다.

비목표:

- ABP의 전체 필터 문법과 모든 기능(리디렉션, CSP, 절차적 코스메틱 등)을
  재현하지 않는다.
- 모든 광고를 100% 차단하지 않는다. 특히 서버가 영상 스트림에 삽입하는
  광고는 네트워크 차단으로 제거할 수 없다.
- Firefox/Safari 호환 레이어를 제공하지 않는다.

---

## 2. 전체 구성

```text
┌─────────────────────────────────────────────────────────────┐
│ Chrome                                                      │
│                                                             │
│  정적 DNR 규칙 세트 (rules/*.json)                          │
│   ├─ ads      17,500                                       │
│   ├─ privacy   7,500                                       │
│   └─ kr          888                                       │
│                                                             │
│  서비스 워커 (src/background)                               │
│   ├─ 설정 읽기/쓰기 ← chrome.storage.local                  │
│   ├─ 동적 DNR 규칙 동기화 (사이트·숏폼·사용자 필터)         │
│   ├─ 임시 허용 세션 규칙 + 만료 알람                        │
│   ├─ 통계 배치 집계 + 배지                                  │
│   ├─ 우클릭 메뉴                                            │
│   └─ 콘텐츠 스크립트 메시지 라우터                          │
│                                                             │
│  콘텐츠 스크립트 (document_start, 최상위 프레임)            │
│   ├─ core.js       어댑터·텍스트 정규화·키워드 매처         │
│   ├─ cosmetic.js   광고 요소 CSS                            │
│   ├─ keywords.js   게시글 키워드 숨김                       │
│   ├─ shortform.js  쇼츠·릴스·틱톡                           │
│   └─ main.js       진입점·설정 적용·통계 보고               │
│                                                             │
│  UI                                                         │
│   ├─ popup   현재 사이트·오늘 통계·토글                     │
│   ├─ options 5개 탭 설정                                    │
│   └─ blocked 사이트/숏폼 차단 페이지                        │
└─────────────────────────────────────────────────────────────┘
```

정적 규칙은 `manifest.json`의 `declarative_net_request.rule_resources`에
등록되어 브라우저가 직접 평가합니다. 서비스 워커가 꺼져 있어도 정적
광고·추적기 차단은 유지됩니다.

동적 규칙(사이트 차단, 숏폼 리다이렉트, 사용자 필터)은 서비스 워커가
설정 변경을 감지해 `chrome.declarativeNetRequest.updateDynamicRules()`로
동기화합니다.

---

## 3. 네트워크 필터링

### 3.1 빌드 시점 변환

`tools/build_rules.py`가 ABP 형식 목록을 DNR 규칙으로 변환합니다.

- `||example.com^` → `urlFilter` + `domainType`/`resourceTypes`
- `@@` 예외 → `action.type: "allow"`, 우선순위 100
- `$important` → 차단 900, 예외 1000
- `$domain=` → `initiatorDomains` / `excludedInitiatorDomains`
- `$third-party` → `domainType: "thirdParty"`
- `$script`, `$image` 등 → `resourceTypes`

지원하지 않는 옵션, 정규식 필터, 절차적 코스메틱 선택자는 건너뜁니다.
목록별 규칙 수 상한과 전체 29,000개 안전 예산을 지키기 위해 점수가 높은
규칙을 우선 선별합니다. 결과는 `rules/ads.json`, `rules/privacy.json`,
`rules/kr.json`에 저장됩니다.

`data/build-info.json`에는 규칙 수, 예외 수, 건너뛴 수, 코스메틱 통계,
필터 입력 해시가 기록됩니다. `tests/manifest.test.mjs`가 이 메타데이터와
실제 파일의 일치 여부를 검사합니다.

### 3.2 요소 숨김 데이터

`build_rules.py`는 코스메틱 필터를 두 종류로 나눕니다.

- **일반 선택자**: 모든 사이트에 적용할 수 있는 선택자 상위 5,000개.
  `rules/cosmetic-generic.css`에 `{display:none!important}` 규칙으로
  생성됩니다.
- **도메인별 선택자**: `data/cosmetic.json`의 `domains` 객체에
  `도메인 → 선택자 배열`로 저장됩니다. 8,259개 도메인, 17,629개
  선택자입니다.

도메인 조회는 호스트의 접미사들을 순서대로 확인합니다.

```text
a.b.example.com
  → a.b.example.com
  → b.example.com
  → example.com
  → com
```

현재 호스트에 해당하는 선택자만 최대 1,200개를 골라 `<style>`로
주입합니다. 일반 선택자는 백그라운드에서 CSS 문자열을 한 번 받아
`<style id="cs-generic-style">`로 넣습니다. 페이지 CSP의 영향을 받지
않도록 `<link>` 대신 `<style>`을 사용합니다.

### 3.3 동적 규칙 ID와 우선순위

| ID 범위 | 용도 | 우선순위 |
| --- | --- | --- |
| 100–199 | 숏폼 리다이렉트·틱톡 차단 | 200 / 400 |
| 1000–1499 | 사용자 사이트 차단 | 500 |
| 3000–3799 | 사용자 필터 | 1(차단), 100(예외), 900/1000(`$important`) |
| 10000–14999 | 5분 임시 허용(세션 규칙) | 5000 |

- 사이트 차단은 `main_frame`만 대상으로 하며, 차단 페이지로
  `redirect`합니다. 정규식은 `https?://(서브도메인.)?도메인(:포트)?`를
  매칭합니다.
- 허용 목록은 사이트 규칙의 `excludedRequestDomains`로 들어갑니다.
- 임시 허용은 `chrome.storage.session`과 세션 DNR 규칙을 함께 사용합니다.
  브라우저를 재시작하면 세션 저장소와 규칙이 사라지므로 영구 허용이
  되지 않습니다.
- 동적 규칙 동기화 시 ID 100–7999를 제거한 뒤 다시 추가합니다. 사용자
  규칙이 5,000개를 넘으면 동기화를 중단하고 콘솔에 오류를 남깁니다.

---

## 4. 콘텐츠 스크립트

### 4.1 진입점과 설정 로드

`main.js`는 `document_start`에 실행됩니다. 백그라운드에
`cs:config` 메시지를 보내 현재 호스트의 설정을 받습니다.

```js
{
  enabled: true,
  host: "example.com",
  version: "1.0.0",
  cosmetic: { enabled: true, selectors: [".ad-slot", ...] },
  keyword: { enabled: true, items: [...] },
  shortform: { enabled: true, platforms: {...} }
}
```

설정이 바뀌면 서비스 워커가 `cs:config-updated`를 브로드캐스트하고,
콘텐츠 스크립트가 설정을 다시 불러옵니다. 전체 보호가 꺼지면 주입한
스타일·오버레이·관찰자를 모두 제거합니다.

### 4.2 키워드 필터

1. `core.js`의 `ADAPTERS`에서 호스트에 맞는 어댑터를 고릅니다.
2. 키워드를 `{ item, test(text) }` 형태로 컴파일합니다.
   - `contains`: 정규화된 부분 문자열
   - `word`: 유니코드 문자 기준 단어 경계
   - `regex`: `RegExp` (잘못된 식은 무시)
3. `MutationObserver`로 추가된 노드와 텍스트 변경을 감시합니다.
4. 120ms 디바운스 후 큐를 처리합니다. 한 번에 최대 600개 노드를
   처리하고, 큐가 3,000개를 넘으면 오래된 항목을 버립니다.
5. 게시글 요소의 텍스트를 추출해 키워드와 맞으면
   `.cs-keyword-hidden` 클래스를 붙이고 `posts` 통계를 보고합니다.
6. 설정이 바뀌면 `rescan()`으로 기존 숨김을 모두 해제한 뒤 다시
   검사합니다.

텍스트 정규화는 NFKC → 제로폭 문자 제거 → 공백 정리 순서로 수행합니다.
`minText`보다 짧은 요소는 오탐을 줄이기 위해 건너뜁니다.

### 4.3 숏폼

`shortform.js`는 플랫폼별 CSS 선택자, 링크 선택자, 가장 가까운 카드
선택자를 정의합니다.

- **숨기기**: 플랫폼 선택자에 `display:none!important`를 적용하는
  `<style>`을 주입하고, 링크를 찾아 가장 가까운 카드에
  `.cs-short-hidden`을 붙입니다.
- **리다이렉트**: `main.js`와 DNR 양쪽에서 처리합니다. DNR은 최상위
  이동을 빠르게 가로채고, 콘텐츠 스크립트는 SPA 내 이동을 보완합니다.
- **틱톡 차단**: DNR이 틱톡 전체를 차단 페이지로 보냅니다. 차단을 끄면
  콘텐츠 스크립트가 Shadow DOM 기반 오버레이를 띄우고, **5분간 보기**를
  누르면 `sessionStorage`에 만료 시각을 저장합니다.
- **네이버**: 숏폼 섹션과 링크를 숨깁니다.

### 4.4 코스메틱

`cosmetic.js`는 전달받은 도메인 선택자를 검증합니다.

- 문자열이 아니거나 비어 있으면 무시
- `{`, `}`, `;`, `@`가 포함된 선택자는 CSS 주입 거부
- 중복 제거 후 최대 1,200개
- `:is(...)` 그룹으로 120개씩 묶어 매칭 수를 세고, 실패하면 개별
  선택자로 폴백
- `::` 의사 요소는 통계 집계에서 제외

통계는 DOMContentLoaded 시점과 1.8초 후 두 번 집계합니다. 지연 로딩
요소를 일부 반영하기 위한 보조 장치입니다.

---

## 5. 저장소 모델

`chrome.storage.local`:

```text
settings  ← 사용자 설정 (defaults.js의 normalizeSettings로 보정)
stats     ← 오늘의 카운터 (date가 바뀌면 초기화)
state     ← v1 레거시 키, 최초 읽기 시 마이그레이션 후 사용하지 않음
```

`chrome.storage.session`:

```text
temporaryAllows  ← [{ host, id, expires }]
```

설정과 통계를 분리한 이유는 통계 쓰기가 설정 변경을 덮어쓰지 않도록
하기 위해서입니다. 모든 쓰기는 `updateSettings`/`updateStats`에서
읽기-수정-쓰기를 직렬화합니다.

주요 설정 필드:

```js
{
  version: 2,
  enabled, ads, tracking, korean, cosmetic,
  keyword: { enabled, items: [{ id, text, match, scopes, caseSensitive }] },
  shortform: { enabled, platforms: { youtube, instagram, facebook, tiktok, naver } },
  sites: { blocked: [{ id, domain, enabled, note }], allowed: ["example.com"] },
  customFilters: "...",
  ui: { theme, onboardingDone },
  meta: { installedAt }
}
```

정규화 한도:

- 키워드 2,000개, 키워드 길이 200자
- 차단 사이트 500개, 허용 도메인 1,000개
- 사용자 필터 120,000자
- 사이트 메모 120자

`normalizeSettings`는 알 수 없는 필드와 잘못된 타입을 버리고 기본값을
채웁니다. 스키마 변경 시 별도 마이그레이션 없이도 기존 설치가 동작합니다.

---

## 6. 메시지 API

콘텐츠 스크립트·UI → 서비스 워커:

| 메시지 | 응답 | 설명 |
| --- | --- | --- |
| `cs:config` | 설정 객체 | 현재 호스트의 콘텐츠 설정 |
| `cs:generic-css` | `{ ok, css }` | 일반 코스메틱 CSS |
| `stats:inc` | `{ ok }` | 통계 증가(배치) |
| `stats:get` | 통계 객체 | 오늘 통계 |
| `ui:state` | 설정+통계 | 팝업/설정 초기화 |
| `site:state` | 사이트 상태 | 현재 호스트 차단·허용 여부 |
| `site:block` | `{ ok, domain }` | 사이트 차단 추가 |
| `site:unblock` | `{ ok }` | 차단 해제 |
| `site:allow` | `{ ok }` | 허용 목록 추가 |
| `site:temp-allow` | `{ ok, expires }` | 5분 세션 허용 |
| `shortform:disable` | `{ ok }` | 틱톡 차단 또는 숏폼 전체 끄기 |
| `keyword:add` | `{ ok, keyword }` | 우클릭 선택 텍스트 추가 |
| `options:open` | `{ ok }` | 설정 페이지 열기 |
| `tab:reload` | `{ ok }` | 현재 탭 새로고침 |

서비스 워커 → 콘텐츠 스크립트:

- `cs:config-updated`: 설정 재로드
- `cs:toast`: 우클릭 키워드 추가 알림

모든 메시지는 `{ ok, ... }` 형태로 응답하며, 예외는 서비스 워커에서
잡아 `{ ok: false, error }`로 변환합니다.

---

## 7. 서비스 워커 수명 주기

- `onInstalled`: 우클릭 메뉴 생성, 통계 롤오버 알람(30분), 규칙 동기화
- `onStartup`: 메뉴 재생성, 만료된 임시 허용 정리, 규칙 동기화
- `storage.onChanged`:
  - `settings` 변경 → 120ms 디바운스 후 동기화
  - `stats` 변경 → 400ms 디바운스 후 배지 갱신
- `alarms`:
  - `temp-allow:<host>` → 만료된 세션 규칙 제거
  - `stats-rollover` → 날짜 변경 확인 및 배지 갱신

서비스 워커는 이벤트 기반으로 잠들 수 있으므로, 상태는 전부
`chrome.storage`에 두고 메모리 캐시는 성능 보조로만 사용합니다.

---

## 8. 빌드 파이프라인

```text
tools/fetch_lists.py
  → tools/lists/*.txt
        │
        ▼
tools/build_rules.py
  ├─ 파서: ABP 네트워크/코스메틱 필터
  ├─ 선별: 규칙 점수·한도
  ├─ 변환: DNR JSON
  ├─ 코스메틱: 일반 CSS + 도메인 JSON
  └─ 메타데이터: data/build-info.json
        │
        ▼
tools/package.py
  ├─ RUNTIME_ENTRIES만 dist/로 복사
  ├─ 매니페스트 참조 파일 존재 확인
  ├─ 규칙 세트당 30,000개 한도 확인
  ├─ node_modules/package-lock.json 유출 확인
  ├─ --store: declarativeNetRequestFeedback 제거
  └─ --zip: ZIP 생성
```

`RUNTIME_ENTRIES`:

```text
manifest.json, icons, rules, data, src,
README.md, NOTICE.md, LICENSE, docs
```

`tools/lists/`, `tests/`, `tools/`, `node_modules/`, `package-lock.json`,
`_metadata/`, `dist/`는 배포물에 들어가지 않습니다.

---

## 9. 테스트 전략

### 단위 테스트 (`npm test`)

- `tests/core.test.mjs`: 어댑터 선택, 키워드 매칭, 사이트 범위, 제로폭
  문자, jsdom 동적 게시글 숨김·복원
- `tests/parse.test.mjs`: 네트워크·코스메틱 필터 변환, 예외, 요청 유형,
  `$important`, `$match-case`, 위험 선택자 제거, 중복·한도, 도메인 정규화,
  손상 설정 복구
- `tests/manifest.test.mjs`: 매니페스트 참조 파일, JS 구문, DNR 규칙
  한도·형식, 코스메틱 데이터/CSS 동기화, 빌드 메타데이터, 원격 스크립트
  부재

### E2E (`node tests/e2e.mjs`)

Puppeteer + Chrome for Testing으로 실제 확장을 로드합니다. HTTPS 로컬
서버와 `host-resolver-rules`로 `x.com`, `youtube.com`, `tiktok.com`,
`blocked.test`를 매핑해 실제 사이트에 접속하지 않습니다.

검증 항목:

1. 설정 페이지 렌더링
2. UI를 통한 키워드 추가
3. UI를 통한 사이트 추가
4. 사용자 필터 검사 결과
5. 사이트 차단 동적 규칙
6. 사용자 네트워크 규칙
7. 유튜브 쇼츠 리다이렉트 규칙
8. 사용자 코스메틱 선택자 적용
9. 키워드 게시글 숨김/정상 글 유지
10. 사용자 네트워크 필터의 실제 요청 차단
11. 일반 코스메틱 CSS 주입
12. 통계 기록
13. 차단 페이지 이동
14. 차단 페이지 도메인 표시
15. 5분 허용 우회
16. 틱톡 차단 페이지 이동
17. 틱톡 숏폼 사유 표시
18. 틱톡 피드 요소 숨김
19. 차단 해제 시 오버레이 비표시
20. 팝업 렌더링
21. 페이지 오류 없음
22. 서비스 워커 오류 없음

E2E는 확장 ID가 실행마다 달라질 수 있으므로 서비스 워커 URL에서 ID를
얻어 사용합니다.

---

## 10. 성능 고려 사항

- 정적 규칙은 브라우저가 평가하므로 콘텐츠 스크립트 비용이 없습니다.
- 키워드 관찰은 120ms 디바운스, 큐 상한 3,000, 배치 상한 600으로
  무한 스크롤 페이지에서 비용을 제한합니다.
- 코스메틱은 현재 호스트 선택자만 최대 1,200개 주입합니다.
- 도메인 선택자 조회 결과는 호스트별로 캐시하고, 캐시가 60개를 넘으면
  비웁니다.
- 통계는 콘텐츠 스크립트에서 700ms, 서비스 워커에서 600ms 배치로
  기록합니다.
- 설정 브로드캐스트는 250ms 스로틀을 적용합니다.
- DNR 동기화는 120ms 디바운스로 연속 변경을 합칩니다.

---

## 11. 알려진 기술 부채

- `ADAPTERS`와 숏폼 CSS 선택자는 사이트 DOM 변경에 수동 대응이 필요합니다.
- EasyList 전체를 변환하지 않으므로 일부 광고가 남을 수 있습니다.
- 코스메틱 통계는 주입 시점 기준이라 지연 로딩 요소를 완전히 반영하지
  못할 수 있습니다.
- 서비스 워커가 잠든 상태에서 첫 메시지가 실패하면 콘텐츠 스크립트가
  800ms 후 한 번 재시도합니다.
- 스토어 빌드에서는 네트워크 통계가 0입니다. 이를 보완하려면 별도
  카운터(예: `onRuleMatchedDebug` 대체)가 필요하지만, MV3에는 공개적인
  대체 API가 없습니다.
