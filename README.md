# 🧵 Threads Data Collector

**Threads(threads.com) 프로필 게시글의 좋아요, 댓글, 리포스트, 공유, 조회수를 자동으로 수집하는 Chrome 확장프로그램**

![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)

## ✨ 주요 기능

- 📊 **JSON 기반 정확한 데이터 추출** — DOM 스크래핑이 아닌 SSR + GraphQL API 응답 파싱
- 🔄 **자동 스크롤** — 프로필 피드를 끝까지 자동으로 스크롤하며 전체 게시글 수집
- 👁️ **조회수 추출** — 개별 게시물 페이지에서 SSR HTML의 view_count를 Same-Origin Fetch로 추출
- 📥 **CSV 내보내기** — 수집 데이터를 엑셀 호환 CSV 파일로 다운로드

## 📋 수집 항목

| 항목 | 소스 |
|------|------|
| 계정 ID | GraphQL / SSR |
| 글 내용 | GraphQL / SSR |
| 작성일시 | GraphQL / SSR |
| 댓글수 | GraphQL / SSR |
| 리포스트수 | GraphQL / SSR |
| 공유수 | GraphQL / SSR |
| 좋아요수 | GraphQL / SSR |
| 조회수 | 개별 게시물 SSR HTML |

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────┐
│  injected.js (MAIN world, document_start)   │
│  ├── fetch/XHR 후킹 → GraphQL 응답 감지     │
│  └── /t/{code} Same-Origin Fetch → 조회수    │
├─────────────────────────────────────────────┤
│  content.js (ISOLATED world, document_idle) │
│  ├── SSR <script> JSON 파싱 (초기 데이터)    │
│  ├── GraphQL 데이터 수신 (postMessage)       │
│  ├── 자동 스크롤 제어                        │
│  └── 조회수 요청/반영                        │
├─────────────────────────────────────────────┤
│  background.js (Service Worker)             │
│  └── chrome.storage 데이터 영속 저장         │
├─────────────────────────────────────────────┤
│  popup/ (팝업 UI)                           │
│  └── 수집 시작/중지/다운로드 인터페이스       │
└─────────────────────────────────────────────┘
```

### 조회수 추출이 어려운 이유

Threads의 프로필 피드 GraphQL 응답에는 **조회수(view_count)가 포함되지 않습니다.**  
조회수는 개별 게시물 페이지(`/t/숏코드`)의 SSR HTML에만 존재하며, **로그인 쿠키가 있어야만** 반환됩니다.

이 문제를 해결하기 위해 `injected.js`를 **MAIN world**에서 실행하여:
- Same-Origin Fetch (CORS 없음)
- 브라우저 쿠키 자동 포함 (로그인 상태 유지)
- SSR HTML에서 `view_count` / `play_count` / `ig_play_count` / `impression_count` 패턴 매칭

## 🚀 설치 방법

1. 이 저장소를 클론하거나 ZIP으로 다운로드
   ```bash
   git clone https://github.com/YOUR_USERNAME/threads-data-collector.git
   ```
2. Chrome에서 `chrome://extensions/` 접속
3. 우측 상단 **개발자 모드** 활성화
4. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
5. 다운로드한 폴더 선택

## 📖 사용법

1. [threads.com](https://www.threads.com)에 **로그인** (필수)
2. 수집할 계정의 **프로필 페이지**로 이동 (예: `threads.com/@username`)
3. 확장프로그램 아이콘 클릭 → **"수집 시작"**
4. 자동 스크롤이 끝나면 → 조회수 추출이 진행됨
5. **"CSV 다운로드"**로 데이터 저장

## 📁 프로젝트 구조

```
├── manifest.json          # Chrome Extension 설정 (Manifest V3)
├── background/
│   └── background.js      # Service Worker (데이터 저장)
├── content/
│   ├── injected.js        # MAIN world — fetch 후킹 + 조회수 추출
│   ├── content.js         # ISOLATED world — 전체 흐름 제어
│   ├── parser.js          # JSON 파서 (SSR + GraphQL)
│   ├── scroller.js        # 자동 스크롤
│   └── utils.js           # CSV 변환, 유틸리티
├── popup/
│   ├── popup.html         # 팝업 UI
│   ├── popup.css          # 다크 테마 스타일
│   └── popup.js           # 팝업 로직
├── styles/
│   └── overlay.css        # 오버레이 스타일
└── icons/                 # 확장프로그램 아이콘
```

## ⚠️ 주의사항

- **Threads 로그인 필수** — 조회수는 로그인 상태에서만 추출 가능합니다
- **개인 용도만** — Meta 서비스 이용약관을 준수하세요
- **DOM 구조 변경** — Threads 업데이트 시 JSON 필드명이 변경될 수 있습니다

## 📄 License

MIT License
