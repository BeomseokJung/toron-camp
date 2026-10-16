# 토의 캠프 (5학년 국어 · 4. 의견을 조정해요)

다양한 의견을 조정하며 토의하는 수업(5/13차시)을 위한 태블릿용 웹앱 모음입니다. 빌드 과정이 없는 정적 사이트라 GitHub Pages, Vercel, Netlify 어디에나 그대로 올릴 수 있어요.

| 경로 | 내용 |
|---|---|
| `/` | 첫 화면 (앱 안내, 수업 흐름, 서버 연결 방법) |
| `/camp3d/` | 토의 캠프 3D — 3D RPG 퀘스트 게임 (자체 WebGL 엔진, 외부 라이브러리 없음) |
| `/camp/` | 토의 캠프 — 가벼운 카드 게임 + 차시 타이머·발언 순서 뽑기 |
| `/review/` | 명품 의견 검토판 — 모둠 기준표·의견 검토·명품 의견·상호 검토·자기 평가, 교사 관리자 화면 |
| `apps-script/` | 검토판용 구글 시트 서버 (Google Apps Script) |
| `class-server/` | 검토판용 학급 PC 서버 (Node.js, 패키지 설치 없음) |

## 배포

- **GitHub Pages**: Settings → Pages → Branch `main` / `(root)`
- **Vercel**: vercel.com → Add New → Project → 이 저장소 Import → Framework `Other`, Build 명령 없음 → Deploy (`vercel.json` 포함)

## 검토판 제출 기능 켜기

정적 사이트에는 저장소가 없어서, 선생님 구글 계정의 Apps Script를 서버로 씁니다.

1. 새 구글 스프레드시트 → 확장 프로그램 → Apps Script → `apps-script/Code.gs` 붙여 넣기, `TEACHER_PIN` 변경
2. 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자)
3. `/review/` 첫 화면 → "선생님: 구글 시트 서버 연결하기"에 `…/exec` 주소 입력
4. 관리자 화면 → [학생 접속] QR 코드로 학생 태블릿 연결 (주소에 `?api=`가 붙어 자동 연결)

모든 학생 태블릿이 같은 서버를 쓰게 하려면 `review/config.js`의 `DISCUSSION_API_URL`에 주소를 적어도 됩니다.

## 태블릿 호환성

iPadOS 13+ Safari, 갤럭시탭 삼성 인터넷·크롬·웨일 기준. ES2017 문법만 사용, 터치 영역 48px 이상, 가로·세로·휴대폰 폭 대응, 다크 모드·움직임 줄이기 설정 존중.
