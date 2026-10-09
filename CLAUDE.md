# CLAUDE.md — 글결 작업 규칙

이 저장소에서 작업하는 Claude가 먼저 읽는 파일이다. 방향과 결정의 전말은 `README.md`, 디자인 명세는 `docs/디자인-교정쇄.md`, 단계 계획은 `docs/단계-계획.md`.

## 말과 글
- 답은 한국어로 한다. 코드 주석도 한국어.
- 주석은 지금 동작만 설명한다. 지운 코드, 되돌린 시도, "예전엔 ~했다" 같은 이력은 적지 않는다.
- 화면 문구는 해요체. 문장으로 끝나면 마침표를 찍고, 명사형(~음·~됨·~기)으로 끝나면 찍지 않는다.
- 이모지와 아이콘을 늘어놓지 않는다. 구분은 색과 자리로 한다.

## 파일과 빌드
- HTML/CSS/JS를 파일별로 나눈다. 한 파일에 몰아넣거나 번들하지 않는다. 빌드 단계 없음.
- 외부 라이브러리 없음. 글꼴만 Google Fonts(송명, 함렛, 노토 산스 KR, 나눔고딕코딩).
- 새 화면도 같은 방식: `이름.html` + `이름.css` + `이름.js`. 공용 코드는 `engine.js`·`fx.js`·`motion.js`·`flip.js`·`backdrop.js`에 둔다.

## 고치는 방식
- 원인을 먼저 짚고 고친다. 우회보다 삭제.
- 구문 검사, 헤드리스 렌더, 스모크(`tests/smoke.py`)는 Claude가 직접 돌린다. 실기기에서만 확인할 수 있는 것(터치 감, GPU 셰이더 화질, 폰 가장자리)만 사용자에게 남긴다.
- 헤드리스 Chromium은 `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`로 띄우고, 글꼴 요청(`fonts.g*`)은 끊어도 된다.
- 글 내용은 서버·관리자·Claude에게 가지 않는다. 테스트용 글은 `index.html` 안의 예시 글과 `sample.js`만 쓴다. 사용자가 주는 글은 ■로 가린 것뿐이다.

## 디자인
- 방향은 교정쇄(`docs/디자인-교정쇄.md`). 각진 모서리, 테두리보다 면과 1px 선, 모노톤. 연필색은 표시(강조·쉼·쪽 번호)에만.
- 글꼴: 송명은 본문·제목, 노토 산스 KR은 조작·안내·단추, 나눔고딕코딩은 숫자·부호.
- 조작 단추는 아래 막대, 보기 토글은 위 오른쪽. 비슷한 조작은 한 줄에 나란히. 세로 공간을 아낀다.
- 카드형 패널(테두리+둥근 모서리)과 요소마다 붙는 설명 라벨은 쓰지 않는다.

## 글 문법 (engine.js가 읽는 것)
- 빈 줄 하나 = 문단 사이. 빈 줄 둘 이상 = 페이지 나눔. 줄 앞 공백은 들여쓰기.
- 띄어쓰기 두 칸부터 쉼(한 칸마다 `TIME.restPerSpace`). 화면에는 한 칸으로 보인다.
- `{{…}}` 기본 효과(떠오름). `{{효과이름:…}}`로 지정. 효과 목록은 `engine.js`의 `BLOCKS`.
- `[[밤]]`·`[[낮]]`만 적은 줄은 장면 표시이고 그 자리에서 새 페이지가 시작된다. `[[밤:오로라]]`처럼 바탕을 붙일 수 있다(`GROUNDS`).
- `{{고쳐 씀:앞말|뒷말}}`의 `|`는 고쳐 쓰기 경계.

## 파일별 역할
- `engine.js` — 글 분석. 글자 단위 셀, 어절 역할(flow·short·drip), 시간표(`schedule`), 문단·페이지 나누기(`parse`, `pages`), 집계(`stats`), 가리기(`mask`). 전역 `Geulgyeol`.
- `fx.js` — 효과 실행. `FX`(fade·soft·rise·bleed·focus·gather·tremble·fall·type·strike·spread·drift·spot), `timeline`(rAF 시간표), `buildParagraph`(문단을 .ln/.tk/.ch로 그림), `focusBand`, `touchable`. 전역 `GeulFx`.
- `motion.js` — `spring`, `spring2`, `tween`, `bezier`, `ease`. 전역 `GeulMotion`.
- `flip.js` — 두 장 사이 넘김 그리기. `sweep`(쓸기)·`disc`(회전)·`drift`(스밈). 전역 `GeulFlip`.
- `backdrop.js` — 바탕 그리기. `window`(창빛)·`hanji`(한지)·`projector`(영사광)·`aurora`(오로라)·`caustic`(물빛). WebGL1 셰이더와 Canvas2D, 캔버스는 쓰는 장만 만든다. 전역 `GeulBackdrop`.
- `reader.js` + `reader.css` + `index.html` — 읽기 틀 2판. 페이지마다 장(.sheet), 끌기·휠·키·단추 넘김, 길게 누르기, 페이지별 폭·자리. 예시 글은 `index.html`의 `#glog-text`.
- `glyph.css` — 글자 상태(.pending·.wet·.drying)와 효과 모양. 읽기 틀과 효과 견본이 같이 쓴다.
- `flip.css` — 넘김 오버레이(바늘·축·빛·자취).
- `mask.html/js/css` + `sample.js` — 가림판. 원문을 ■로 가리고 효과·장면·페이지 표시만 남긴다. 드래그 뒤 효과 메뉴로 블록 지정.
- `effects.html/js/css` — 효과 견본. `base.css`는 가림판과 견본이 쓰는 1판 토큰(편집실을 만들 때 교정쇄 토큰으로 바꾼다).
- `flip-lab.html/js/css` — 반전·바탕 시험 페이지.
- `design/교정쇄-편집실.html` — 편집실 시안(정적). 구현의 기준.
- `tests/smoke.py` — 읽기 틀 스모크(PC·폰 크기, 쓰기→넘김→쓸기→끌기→휠→길게 누르기→처음부터).

## 지금 상태와 다음 일
- 1단계(읽기 틀 2판, 가림판, 효과 견본, 바탕·반전) 완료.
- 2단계: 편집실. `docs/단계-계획.md`의 순서대로. 가림판의 역할은 편집실 안의 "가린 글 복사"로 흡수한다.
- 3단계: 발행·불러오기·읽기 링크·관리실·문의. 서버는 Netlify Functions + Firestore, 암호화는 브라우저(WebCrypto).
