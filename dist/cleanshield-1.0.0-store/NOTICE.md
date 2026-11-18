# NOTICE — CleanShield 1.0.0

CleanShield는 광고·추적기·사이트·SNS 키워드·숏폼을 차단하는 독립형 Chrome
확장 프로그램입니다.

- 프로젝트: CleanShield
- 버전: 1.0.0
- 라이선스: GNU General Public License v3.0 (전체 텍스트: `LICENSE`)
- 저작권: CleanShield 기여자, 2026

이 문서는 CleanShield가 사용하거나 참고한 제3자 저작물과 그 라이선스 조건을
정리합니다.

---

## 1. CleanShield 코드

CleanShield의 소스 코드, UI, 콘텐츠 스크립트, 백그라운드 서비스 워커,
필터 변환기, 테스트는 **GPL-3.0**으로 배포됩니다.

이 프로젝트는 Adblock Plus(ABP)의 필터 문법, 필터 목록 생태계, 확장
프로그램의 일반적인 동작 개념을 참고했습니다. 그러나 CleanShield의 실행
코드는 새로 작성되었으며, ABP 확장 프로그램 코드를 포함하거나 런타임에
ABP 패키지·서비스를 불러오지 않습니다. ABP 프로젝트와 제휴 관계도
없습니다.

"Adblock Plus", "ABP"는 Eyeo GmbH의 상표입니다. CleanShield는 Eyeo GmbH의
보증이나 후원을 받지 않습니다.

---

## 2. EasyList / EasyPrivacy

- 원본: EasyList, EasyPrivacy
- 홈페이지: https://easylist.to/
- 저장소: https://github.com/easylist/easylist
- 라이선스: **GPL-3.0 및 Creative Commons Attribution-ShareAlike 3.0
  Unported (CC BY-SA 3.0) 이중 라이선스**
- 라이선스 안내: https://easylist.to/pages/licence.html

CleanShield는 위 목록을 빌드 시점에 내려받아, Chrome
`declarativeNetRequest` 형식의 JSON 규칙과 CSS 요소 숨김 데이터로
변환합니다. 변환 과정에서 지원하지 않는 옵션·절차적 선택자·중복 규칙은
제외되며, 규칙 수 한도에 맞추기 위해 일부 규칙이 선별될 수 있습니다.

이 저장소의 빌드 스냅샷:

- EasyList 버전: `202611172356`
- EasyList 커밋: `4d7214df072f964351bb6c3a9135d7a4c45e3ec6` (목록 헤더 기준)
- EasyPrivacy: 동일 빌드 시점 스냅샷
- 빌드 시각: 2026-11-18T00:18:03Z
- 필터 입력 SHA-256 앞 16자리: `43f31bc8ad0bef0f`

EasyList/EasyPrivacy에서 파생된 규칙 데이터는 해당 목록의 라이선스 조건을
따릅니다. EasyList/EasyPrivacy는 CleanShield를 보증하지 않습니다.

---

## 3. List-KR

- 원본: List-KR
- 홈페이지: https://list-kr.github.io/
- 저장소: https://github.com/List-KR/List-KR
- 라이선스: **GNU General Public License v3.0**

CleanShield는 다음 List-KR 파일을 빌드 입력으로 사용했습니다.

```text
filterslists/adblocking/filters-share/specific_URL.txt
filterslists/adblocking/filters-share/specific_ELEMHIDE.txt
filterslists/adblocking/filters-share/general_elemhide.txt
filterslists/adblocking/filters-share/general_url.txt
filterslists/adblocking/filters-share/allowlist.txt
```

이 파일들은 `tools/fetch_lists.py`로 내려받으며, 빌드 시 DNR 규칙과
코스메틱 데이터로 변환됩니다. List-KR은 CleanShield를 보증하지 않습니다.

---

## 4. Adblock Plus

- 프로젝트: Adblock Plus / adblockpluschrome
- 홈페이지: https://adblockplus.org/
- 저장소: https://github.com/adblockplus/adblockpluschrome
- 라이선스: **GNU General Public License v3.0**

Adblock Plus는 필터 문법과 광고 차단 생태계의 선행 프로젝트로서 참고
대상입니다. CleanShield는 ABP 소스 코드를 복사하거나 링크하지 않으며,
ABP가 제공하는 런타임, 필터 구독 서비스, 빌드 도구에 의존하지 않습니다.
`LICENSE` 파일은 GPL-3.0 전문을 사용하기 위해 포함되어 있습니다.

---

## 5. 아이콘과 UI

`icons/`의 아이콘은 `tools/make_icons.py`로 생성한 CleanShield 원본
저작물입니다. UI의 HTML/CSS/JavaScript 역시 CleanShield 프로젝트에서
작성했습니다.

---

## 6. 테스트 데이터

`tests/fixtures/test-cert.pem`, `tests/fixtures/test-key.pem`은 로컬
HTTPS 테스트 서버용 자체 서명 인증서입니다. 실제 도메인 인증서가 아니며
배포 패키지에 포함되지 않습니다. 테스트 페이지의 예시 텍스트와 광고
슬롯은 기능 검증용으로만 사용됩니다.

---

## 7. 보증 부인

CleanShield는 법률이 허용하는 범위에서 **어떠한 보증도 없이** 제공됩니다.
광고·추적기·숏폼 차단은 사이트 구조와 필터 목록에 따라 달라지며, 모든
광고나 콘텐츠를 100% 차단한다고 보장하지 않습니다. 자세한 조건은
`LICENSE`의 GPL-3.0 조항을 따릅니다.

---

## 8. 라이선스 전문

- CleanShield 및 GPL-3.0 구성 요소: `LICENSE`
- EasyList/EasyPrivacy: https://easylist.to/pages/licence.html
- List-KR: https://github.com/List-KR/List-KR/blob/master/LICENSE
- Adblock Plus: https://github.com/adblockplus/adblockpluschrome/blob/master/COPYING
