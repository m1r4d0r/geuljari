# Codex 디자인 제안

원안과 구분해 보관하는 실험용 시안입니다. 저장소 루트의 기존 읽기 틀과 `design/교정쇄-편집실.html`은 그대로 두었습니다.

## 먼저 볼 것

- **최신 시안:** [글 입력 → 첫 안 → 다듬기](index.html). 화면 위의 **PC / 모바일** 버튼으로 전환하며 직접 조작할 수 있습니다.
- **이전 비교안:** [펼친 책 / 원고와 무대 / 글의 악보](layout-studies/index.html).
- **서버 없이 실행:** [독립 HTML 내려받기](downloads/geulgyeol-first-draft.html). 파일을 저장한 뒤 브라우저에서 엽니다. GitHub 파일 화면에서는 Download raw file을 사용합니다.
- **설계 의도:** [첫 안 만들기](docs/direction.md), [이전 세 방향](layout-studies/README.md).

GitHub의 저장소 파일 보기 화면은 HTML을 웹사이트처럼 실행하지 않습니다. 실제 링크로 열어 보려면 아래 GitHub Pages를 연결합니다.

## GitHub Pages 연결

`gh-pages` 브랜치에는 이 폴더의 내용만 배포합니다. 원안과 저장소의 다른 자료가 사이트 루트에 섞이지 않습니다.

1. 저장소의 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**를 **Deploy from a branch**로 고릅니다.
3. **Branch: `gh-pages`**, 폴더 **`/ (root)`**를 선택하고 **Save**를 누릅니다.
4. GitHub의 Pages 배포가 완료되면 아래 주소에서 실행합니다.

- 최신 시안: <https://m1r4d0r.github.io/geulteul/>
- 이전 세 레이아웃: <https://m1r4d0r.github.io/geulteul/layout-studies/>

위 주소는 Pages 활성화와 배포가 완료된 뒤 사용할 수 있습니다. 계정과 저장소 설정에 따라 활성화 권한이나 요금제 조건이 표시될 수 있습니다.

시안을 수정한 뒤에는 변경사항을 먼저 `main`에 커밋·푸시하고, 저장소 루트에서 다음 명령으로 배포 브랜치를 갱신합니다. 강제 푸시는 사용하지 않습니다.

```bash
bash codex-proposals/scripts/publish-pages.sh
```

## 로컬 실행

저장소 루트에서 실행합니다. 패키지 설치나 빌드 없이 정적 파일로 동작합니다.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `/codex-proposals/` 경로를 엽니다. HTML·CSS·JavaScript와 글꼴은 모두 이 폴더 안에 있습니다. 입력한 글은 문서 메모리에서만 다루고 저장하거나 외부로 전송하지 않습니다. 페이지를 새로고침하면 입력 내용도 사라집니다.

## 파일 구성과 검증

- `index.html`, `studio.css`, `studio.js`: 입력·의도 선택·첫 안·다듬기와 PC/모바일 전환.
- `intent.js`: 문장과 간격의 분석, 초안의 쪽·호흡 계산, 제안 후보.
- `sample.js`: 기존 저장소에 있던 예시 글.
- `fonts/`, `fonts.css`: 시안에 쓰는 Google Fonts 글꼴과 SIL OFL 라이선스.
- `layout-studies/`: 이전 레이아웃 비교 시안과 기록.
- `downloads/`: 독립 HTML 배포본.
- `scripts/build-standalone.py`: 독립 HTML을 다시 만드는 선택 도구. 웹사이트 실행에는 필요하지 않습니다.
- `tests/`: 분석 규칙과 실제 사용자 흐름 검증.

```bash
node codex-proposals/tests/intent.test.cjs
python3 codex-proposals/scripts/build-standalone.py --check
python3 codex-proposals/tests/check_ui.py
```

브라우저 검증에는 Python Playwright와 Chromium이 필요합니다. `CHROMIUM_EXECUTABLE`에 설치된 브라우저 경로를 지정할 수 있고, 기본값은 `/usr/bin/chromium`입니다. URL 없이 실행하면 임시 정적 서버로 실제 분리 파일을 검사한 뒤 독립 HTML도 오프라인에서 확인합니다.

이미 실행 중인 서버나 배포된 Pages를 확인할 때는 다음처럼 URL을 지정합니다.

```bash
python3 codex-proposals/tests/check_ui.py --url https://m1r4d0r.github.io/geulteul/
```

단일 파일 아티팩트를 갱신할 때만 실행합니다.

```bash
python3 codex-proposals/scripts/build-standalone.py
```

이 시안은 규칙 기반 초안 생성과 화면 흐름을 비교하는 프로토타입입니다. 기존 읽기 엔진 전체, 발행 API, 서버 저장은 연결하지 않았습니다.
