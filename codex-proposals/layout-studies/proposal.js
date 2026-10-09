/* 저장소 예시 글로 원고와 읽기 화면의 배치를 비교한다. */
const concepts = {
  book: ['01', '펼친 책', '하나의 넓은 종이 위에 쓰는 면과 읽는 면을 나란히 둡니다. 설정은 아래로 모으고, 여백과 활자의 크기로 집중을 만듭니다. 가장 차분한 방향입니다.'],
  stage: ['02', '원고와 무대', '밝은 원고 옆에서 글이 넓은 무대를 차지합니다. 오른쪽은 선택한 낮밤을 따르고, 조작은 가장자리에 머뭅니다. 글을 쓰는 행위와 읽히는 시간이 한눈에 갈립니다.'],
  score: ['03', '글의 악보', '아래쪽에 내용이 드러나지 않는 글의 흐름을 펼칩니다. 글자 길이와 빈틈이 쪽마다 다른 모양을 만들고, 해당 쪽으로 곧바로 이동합니다. 호흡을 조율하는 데 초점을 둡니다.']
};
const editor = document.querySelector('#manuscript');
const preview = document.querySelector('#preview');
const pane = document.querySelector('.preview-pane');
let pages = [], selected = 0, timers = [], speed = 1;
const clean = text => text.replace(/^\[\[.*?\]\]\s*/gm, '').replace(/\{\{(?:[^{}:]+:)?([^{}]*)\}\}/g, '$1').trim();
function notify(text) {
  const el = document.querySelector('#notice'); el.textContent = text; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2200);
}
function setScene(scene) {
  pane.dataset.scene = scene;
  document.body.dataset.scene = scene;
  document.querySelector('#scene-name').textContent = scene === 'day' ? '낮' : '밤';
  document.querySelectorAll('[data-scene][aria-pressed]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === scene)));
}
function replay() {
  timers.forEach(clearTimeout); timers = [];
  const text = clean(editor.value);
  preview.replaceChildren();
  // 비교용 작은 무대에는 현재 쪽의 첫 문단을 표시한다.
  const excerpt = text.split('\n')[0].split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
  const words = excerpt.split(/(\s+)/);
  let index = 0;
  words.forEach(word => {
    if (/^\s+$/.test(word)) { preview.append(document.createTextNode(word)); return; }
    const span = document.createElement('span'); span.className = 'word pending'; span.textContent = word;
    preview.append(span);
    const delay = (250 + index++ * 150) / speed;
    timers.push(setTimeout(() => { span.className = 'word wet'; }, delay));
    timers.push(setTimeout(() => { span.className = 'word'; }, delay + 1100 / speed));
  });
  document.querySelector('#count').textContent = `${Array.from(clean(editor.value)).length}자 · ${selected + 1}번째 쪽`;
}
function buildMap(host, text, mini = false) {
  host.replaceChildren();
  clean(text).split(/\s+/).slice(0, mini ? 20 : 38).forEach(word => {
    if (mini) {
      Array.from(word).slice(0, 5).forEach(() => { const mark = document.createElement('i'); mark.style.height = `${9 + word.length * 2}px`;host.append(mark); });
      const gap = document.createElement('i');gap.className='gap';host.append(gap);
    } else {
      const mark=document.createElement('i');mark.style.width=`${Math.min(word.length,10)*4}px`;host.append(mark);
    }
  });
}
function selectPage(index) {
  if (pages.length) pages[selected] = editor.value;
  selected = index; editor.value = pages[index];
  document.querySelector('.page-number').textContent = `${String(index + 1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
  document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.page)===index)));
  replay();buildMap(document.querySelector('.mini-rhythm'),editor.value,true);
}
function setLayout(layout, updateURL = true) {
  document.body.dataset.layout = layout;
  document.querySelectorAll('.directions button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===layout)));
  const [number,title,description]=concepts[layout];
  document.querySelector('#concept-number').textContent=number;
  document.querySelector('#concept-title').textContent=title;
  document.querySelector('#concept-description').textContent=description;
  setScene(layout==='stage'?'night':'day');
  if(updateURL) history.replaceState(null,'',`#${layout}`);
}
document.querySelectorAll('.directions button').forEach(b=>b.addEventListener('click',()=>setLayout(b.dataset.layout)));
document.querySelectorAll('.scene-control button').forEach(b=>b.addEventListener('click',()=>setScene(b.dataset.scene)));
document.querySelector('#replay').addEventListener('click',replay);
let editTimer;
editor.addEventListener('input',()=>{clearTimeout(editTimer);editTimer=setTimeout(()=>{pages[selected]=editor.value;replay();buildMap(document.querySelector('.mini-rhythm'),editor.value,true);buildMap(document.querySelector(`.timeline [data-page="${selected}"] .word-map`),editor.value);},350);});
document.querySelector('#settings-toggle').addEventListener('click',event=>{const box=document.querySelector('#settings');box.hidden=!box.hidden;event.currentTarget.setAttribute('aria-expanded',String(!box.hidden));});
document.querySelector('#speed').addEventListener('input',event=>{speed=Number(event.target.value);document.querySelector('#speed-value').textContent=`${speed.toFixed(1)}×`;replay();});
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pages.map((p,i)=>clean(i===selected?editor.value:p).replace(/[^\s]/gu,'■')).join('\n\n\n'));notify('가린 글을 복사했어요.');}catch{notify('브라우저에서 복사를 허용해 주세요.');}});
document.querySelector('#full-preview').addEventListener('click',()=>{document.querySelector('#full-reader-text').textContent=clean(editor.value);document.querySelector('#full-reader').showModal();});
document.querySelector('#close-reader').addEventListener('click',()=>document.querySelector('#full-reader').close());
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();selectPage(0);});
fetch('sample.json').then(r=>{if(!r.ok)throw new Error('예시 글을 불러오지 못했어요.');return r.json();}).then(data=>{
  pages=data.text.split(/\n\s*\n\s*\n/).map(clean).filter(Boolean);
  pages.forEach((text,index)=>{
    const dot=document.createElement('button');dot.dataset.page=index;dot.setAttribute('aria-label',`${index+1}번째 쪽`);dot.addEventListener('click',()=>selectPage(index));document.querySelector('.page-dots').append(dot);
    const item=document.createElement('button');item.dataset.page=index;item.setAttribute('aria-label',`${index+1}번째 쪽으로 이동`);
    const label=document.createElement('span');label.textContent=`${String(index+1).padStart(2,'0')} / ${index===2||index===3?'밤':'낮'}`;
    const map=document.createElement('div');map.className='word-map';buildMap(map,text);item.append(label,map);item.addEventListener('click',()=>selectPage(index));document.querySelector('.timeline').append(item);
  });
  editor.value=pages[0];selectPage(0);setLayout(concepts[location.hash.slice(1)]?location.hash.slice(1):'stage',false);
}).catch(error=>{notify(error.message);console.error(error);});
