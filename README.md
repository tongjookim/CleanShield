# CleanShield — 광고·숏폼·키워드 차단

**독립형 Chrome 확장 프로그램** — Adblock Plus와는 런타임에 의존하지 않는 클린룸 구현입니다.

## 언어 / Language

- 한국어 UI / Korean-language interface
- English documentation alongside

## 핵심 기능 / Core Features

| 기능 | 내용 |
|------|------|
| 광고 차단 | 네트워크 규칙 25,888개 + 코스메틱 선택자 22,629개 |
| 추적기 차단 | EasyPrivacy 기반 규칙 |
| 한국 사이트 필터 | List-KR 기반 888개 규칙 |
| 광고 요소 숨김 | 도메인별 17,629개 선택자 (8,259개 도메인) |
| 사이트 차단 | 도메인·하위도메인 차단, 허용 목록, 5분 임시 허용 |
| SNS 키워드 차단 | X, 페이스북, 인스타, 스레드, 유튜브, 레딧, 네이버, 다음, 18개 커뮤니티 |
| 숏폼 차단 | 유튜브 쇼츠, 인스타 릴스, 페이스북 릴스, 틱톡, 네이버 숏폼 |
| 사용자 필터 | ABP 형식 직접 입력 (네트워크·요소 숨김) |
| 통계 | 오늘 기준 네트워크·키워드·숏폼·차단 페이지 일일 집계 |
| 편의 기능 | 툴바 배지, 우클릭 메뉴, JSON 내보내기/가져오기, 테마 |

## rapidamente 설치하는 방법 / Quick Install

1. `chrome://extensions` 열기
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** 클릭
4. `/Users/kimtongjoo/Library/Application Support/CleanShield/extension` 폴더 선택
5. CleanShield가 enabled 상태이며 아이콘이 보인다면 정상 설치된 것

> **Chrome 137+**는 명령줄 `--load-extension`을 무시합니다. `chrome://extensions` UI로 설치해야 정상 persists 됩니다.

## 플랫폼별 숏폼 차단

| 플랫폼 | 설정 | 설명 |
|--------|------|------|
| 유튜브 쇼츠 | 숨기기 | 피드·사이드바 쇼츠 선반 및 링크 숨김 |
| 인스타그램 릴스 | 숨기기 | 릴스 카드 및 탐색 링크 숨김 |
| 페이스북 릴스 | 숨기기 | 릴스 카드 및 탐색 링크 숨김 |
| 틱톡 | 일반 | 피드·추천 목록 요소 숨김 |
| 틱톡 | 전체 차단 | 틱톡 접속 시 차단 페이지 표시 (5분간 허용 가능) |
| 네이버 숏폼 | 숨기기 | 숏폼 섹션 및 링크 숨김 |

## 유튜브 광고 차단 방법

YouTube는 anti-adblock 조치가 강하므로 다음과 같이 사용하세요:

1. 유튜브 방문 후 우클릭 → **CleanShield — Block element**
2. 광고 영역 드래그하여 선택 후 **보호기 저장**
3. 페이지 새로고침 (F5)

또는 **고급** 탭에 사용자 필터를 직접 추가할 수 있습니다.

## 설치된 위치

- `/Users/kimtongjoo/Library/Application Support/CleanShield/extension`
- Chrome `chrome://extensions`에서 확인 가능

## 개발자 모드 확인

확장 프로그램이 정상 작동하려면 Chrome 개발자 모드가 ON이어야 합니다. `chrome://extensions`에서 확인하거나 다음과 같이 확인:

```python
import json
p = '/Users/kimtongjoo/Library/Application Support/Google/Chrome/Default/Secure Preferences'
d = json.load(open(p))
print('developer_mode:', d.get('extensions', {}).get('ui', {}).get('developer_mode'))
```

## 라이선스

GPL-3.0 — `LICENSE` 파일 참조

필터 데이터 출처: EasyList, EasyPrivacy, List-KR (각각 GPL-3.0 / CC BY-SA 3.0)

"Adblock Plus", "ABP"는 각 소유자의 상표이며, CleanShield는 ABP 코드를 포함하거나 런타임에 의존하지 않는 클린룸 구현입니다.

## 문서

- `docs/ARCHITECTURE.md` — 내부 구조 및 DNR 규칙 파이프라인
- `docs/PRIVACY.md` — 개인정보 처리방침 (외부 전송 없음, storage 로컬만 사용)
- `NOTICE.md` — 라이선스 및 저작권 정보

## 테스트

- 단위 테스트: 22/22 통과
- E2E 테스트: 22/22 통과

## 문의

확장 프로그램 문의나 기능 요청은 저장소 이슈를 이용해 주세요.
청-language UI이며, 한국 사용자환경을 최우선으로 설계되었습니다.