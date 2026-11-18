# CleanShield 개인정보 처리방침

시행일: 2026년 11월 18일
버전: 1.0.0

CleanShield(이하 "확장 프로그램")는 광고·추적기·사이트·SNS 키워드·숏폼을
차단하는 Chrome 확장 프로그램입니다. 이 문서는 확장 프로그램이 어떤
정보를 처리하고, 어디에 저장하며, 외부로 전송하는지 설명합니다.

**요약: CleanShield는 사용자 데이터를 수집하거나 외부 서버로 전송하지
않습니다. 설정과 통계는 사용자의 브라우저 안에만 저장됩니다.**

---

## 1. 수집하지 않는 정보

CleanShield는 다음 정보를 수집·판매·공유하지 않습니다.

- 이름, 이메일, 전화번호, 주소 등 개인 식별 정보
- 계정 정보, 로그인 정보, 비밀번호
- 방문 기록, 검색 기록, 관심사 프로필
- 페이지 본문, 댓글, 게시글의 원문
- 위치 정보, 기기 식별자, 광고 ID
- 결제 정보, 금융 정보
- 생체 정보, 건강 정보

확장 프로그램에는 분석 도구, 광고 SDK, 텔레메트리, 원격 설정, A/B 테스트
도구가 포함되어 있지 않습니다.

---

## 2. 브라우저 안에서 처리하는 정보

기능 수행을 위해 다음 정보를 **브라우저 안에서만** 읽거나 저장합니다.

| 정보 | 처리 목적 | 저장 위치 | 외부 전송 |
| --- | --- | --- | --- |
| 현재 탭의 호스트·URL | 사이트 차단, 허용, 숏폼 리다이렉트, 팝업 상태 표시 | 메모리(서비스 워커) | 없음 |
| 페이지 텍스트 | 사용자가 등록한 키워드와 게시글 매칭 | 메모리(콘텐츠 스크립트) | 없음 |
| 차단 목록·허용 목록 | 사이트 차단 규칙 생성 | `chrome.storage.local` | 없음 |
| 키워드 목록 | 게시글 키워드 필터 | `chrome.storage.local` | 없음 |
| 숏폼 설정 | 쇼츠·릴스·틱톡 처리 | `chrome.storage.local` | 없음 |
| 사용자 필터 | 네트워크·코스메틱 규칙 | `chrome.storage.local` | 없음 |
| 오늘의 차단 통계 | 팝업·배지 표시 | `chrome.storage.local` | 없음 |
| 5분 임시 허용 | 차단 일시 해제 | `chrome.storage.session` | 없음 |

페이지 텍스트는 키워드 일치 여부를 판정한 뒤 메모리에서 사라집니다.
원문을 저장하거나 복사하지 않습니다. 키워드 차단 통계에는 개수만
기록되며, 어떤 텍스트가 걸렸는지는 저장하지 않습니다.

---

## 3. 저장과 보관

- 설정과 통계: `chrome.storage.local`에 저장되며, Chrome 프로필 폴더에
  위치합니다. Google 계정과 동기화되지 않습니다.
- 임시 허용: `chrome.storage.session`에 저장되며, 브라우저를 닫으면
  삭제됩니다.
- 통계: 날짜가 바뀌면 자동으로 초기화됩니다.
- 삭제: 설정 페이지의 **모든 설정 초기화**를 누르거나 확장 프로그램을
  제거하면 저장된 데이터가 삭제됩니다.
- 내보내기: 사용자가 **JSON 내보내기**를 실행할 때만 로컬 파일이
  생성됩니다. 이 파일은 사용자의 선택에 따라 저장·이동되며, 확장
  프로그램이 자동으로 전송하지 않습니다.

---

## 4. 권한 사용 목적

| 권한 | 사용 목적 |
| --- | --- |
| `declarativeNetRequest` | 광고·추적기·사이트 차단, 숏폼 리다이렉트 규칙 적용 |
| `declarativeNetRequestFeedback` | 압축 해제(개발) 빌드에서 차단 요청 수 집계. 스토어 빌드에서는 제거됨 |
| `storage` | 설정·통계·임시 허용 저장 |
| `unlimitedStorage` | 큰 필터·코스메틱 데이터 저장 |
| `tabs` | 현재 탭의 호스트 확인, 설정 변경 시 탭에 알림, 사이트 차단 후 새로고침 |
| `alarms` | 5분 임시 허용 만료, 통계 날짜 변경 확인 |
| `contextMenus` | 선택 텍스트 키워드 추가, 현재 사이트 차단 메뉴 |
| `<all_urls>` | 모든 사이트에서 광고 요소·키워드·숏폼 필터 적용 |

`<all_urls>`는 광고 차단과 키워드 필터가 동작하려면 페이지 DOM을 읽어야
하기 때문에 필요합니다. 읽은 내용은 위 목적 외에 사용하지 않습니다.

`declarativeNetRequestFeedback`는 Chrome 웹 스토어 배포용 빌드에서
제거됩니다. 이 경우 네트워크 차단 수치만 표시되지 않으며, 다른 기능과
데이터 처리는 동일합니다.

---

## 5. 제3자 서비스

CleanShield는 런타임에 제3자 서버와 통신하지 않습니다.

- 필터 목록(EasyList, EasyPrivacy, List-KR)은 **빌드 시점**에 개발자가
  내려받아 확장 프로그램에 내장합니다. 사용자의 브라우저가 목록 서버에
  접속하지 않습니다.
- 광고·추적기 차단은 Chrome의 `declarativeNetRequest` API를 통해
  브라우저가 로컬에서 수행합니다.
- 결제, 로그인, 클라우드 동기화, 외부 통계 서비스가 없습니다.

따라서 CleanShield가 사용자 데이터를 제3자에게 제공하는 경우는
없습니다.

---

## 6. 아동의 개인정보

CleanShield는 만 14세 미만 아동을 포함한 어떤 사용자로부터도 개인정보를
수집하지 않습니다. 수집하는 개인정보가 없으므로 별도의 아동 데이터
보호 절차를 두지 않습니다.

---

## 7. 사용자의 권리

사용자는 언제든지 다음을 할 수 있습니다.

- 설정 페이지에서 차단 목록·키워드·사용자 필터를 확인·수정·삭제
- **모든 설정 초기화**로 저장된 데이터 삭제
- **JSON 내보내기**로 자신의 설정 사본 확보
- 확장 프로그램 제거로 모든 로컬 데이터 삭제

서버에 저장된 데이터가 없으므로 별도의 열람·정정·삭제 요청 절차가
필요하지 않습니다.

---

## 8. 보안

- 모든 코드와 데이터는 확장 프로그램 패키지에 포함되며, 원격 코드를
  실행하지 않습니다.
- 콘텐츠 보안 정책은 `script-src 'self'; object-src 'self'`로 제한됩니다.
- 콘텐츠 스크립트는 `chrome.*` 메시지로만 백그라운드와 통신합니다.
- 사용자 필터의 위험한 CSS 선택자와 지원하지 않는 옵션은 거부합니다.
- 차단 페이지의 호스트·스킴·포트는 정규식으로 검증해 URL 파라미터
  주입을 방지합니다.

다만 어떤 소프트웨어도 완전한 보안을 보장할 수 없습니다. 확장 프로그램은
법률이 허용하는 범위에서 보증 없이 제공됩니다.

---

## 9. 방침 변경

기능 추가로 데이터 처리 방식이 바뀌면 이 문서를 갱신하고, 확장 프로그램
버전과 함께 시행일을 업데이트합니다. 중요한 변경이 있는 경우 배포 채널의
릴리스 노트에 안내합니다.

---

## 10. 문의

이 확장 프로그램은 배포 채널(저장소 또는 스토어 등록 페이지)을 통해
문의를 받습니다. 개인정보 처리와 관련한 질문은 해당 채널의 이슈 트래커
또는 개발자 연락처로 보내 주세요.

---

## English summary

CleanShield does not collect, sell, or share personal data. It has no
analytics, telemetry, ads, or remote configuration. Settings and daily
counters are stored only in `chrome.storage.local`; temporary site
allowances live in `chrome.storage.session`. Page text is inspected
locally to match user-defined keywords and is never transmitted or stored.
Filter lists are bundled at build time, so the extension makes no runtime
requests to filter-list servers. The `declarativeNetRequestFeedback`
permission is used only in unpacked development builds to count blocked
requests and is removed from Chrome Web Store builds.

Effective date: November 18, 2026.
