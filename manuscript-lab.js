(function(){
  'use strict';
  const root=document.getElementById('geul-manuscript-study');if(!root)return;
  const sheet=root.querySelector('.sheet'),column=root.querySelector('.column');
  const input=root.querySelector('input'),play=root.querySelector('.ms-play');
  // reader.html에 있는 공개 예시 글만 쓴다.
  const text='번진 자국은 생각보다 예뻤다. 동그랗게 퍼져 나간 가장자리가 마치 누군가 그 자리에서 오래 머뭇거린 흔적처럼 보였다.\n\n그날도 그랬다.\n편지를 쓰는 일은 오랜만이었다.';
  let items=[],timeline=null;
  Geulgyeol.parse(text).paragraphs.forEach(para=>{
    const box=document.createElement('div');box.className='para';const inner=document.createElement('div');inner.className='inner';box.append(inner);column.append(box);
    const built=GeulFx.buildParagraph(para,inner);items.push(...built.items);
  });
  // 시안은 처음부터 다 쓴 상태로 열고 사용자가 누를 때만 다시 쓴다.
  GeulFx.show(items);GeulManuscript.attach(sheet);
  const update=()=>{GeulManuscript.layout(sheet);root.querySelector('.ms-count').textContent=column.style.getPropertyValue('--wg-cols')+'칸 / 줄';};
  new ResizeObserver(update).observe(column);update();
  const stop=()=>{if(timeline){timeline.finish();timeline=null;}play.textContent='다시 쓰기';};
  input.addEventListener('input',()=>{stop();column.style.fontSize=input.value+'px';root.querySelector('.ms-size').textContent=input.value;update();});
  play.addEventListener('click',()=>{
    if(timeline){stop();return;}
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){GeulFx.show(items);return;}
    GeulFx.hide(items);play.textContent='모두 보기';
    timeline=GeulFx.timeline(items.map((it,i)=>({...it,t:i*42})),{onDone(){timeline=null;play.textContent='다시 쓰기';}});
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
})();
