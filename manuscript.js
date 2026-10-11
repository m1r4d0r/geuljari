/* 원고지: 글자 묶음을 유지하며 글 기둥 안에 정수 개의 칸을 놓는다. */
(function(global){
  'use strict';
  function layout(sheet){
    if(sheet.dataset.ground!=='wongoji')return;
    const column=sheet.querySelector('.column'),scroll=sheet.querySelector('.scroll');
    if(!column||!scroll)return;
    const font=parseFloat(getComputedStyle(column).fontSize),cell=Math.ceil(font*1.65);
    const st=getComputedStyle(scroll),available=scroll.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight);
    const columns=Math.max(1,Math.min(20,Math.floor(available/cell)));
    const signature=columns+':'+cell;
    if(column.dataset.gridSize===signature)return;
    column.dataset.gridSize=signature;
    column.style.setProperty('--wg-cell',cell+'px');column.style.setProperty('--wg-cols',columns);
    column.style.setProperty('--wg-gap',Math.round(font*.36)+'px');
    column.querySelectorAll('.ln').forEach(line=>{
      line.querySelectorAll('.wg-empty,.wg-indent').forEach(n=>n.remove());
      const indent=Math.min(columns-1,Math.max(0,Math.round(parseFloat(line.style.getPropertyValue('--indent'))||0)));
      const blank=cls=>{const n=document.createElement('span');n.className=cls;n.setAttribute('aria-hidden','true');return n;};
      for(let i=0;i<indent;i++)line.prepend(blank('wg-indent'));
      const count=line.querySelectorAll('.ch,.sp').length+indent;
      const fill=count?((columns-count%columns)%columns):columns;
      for(let i=0;i<fill;i++)line.append(blank('wg-empty'));
    });
  }
  function attach(sheet){
    if(sheet.dataset.ground!=='wongoji'||!sheet.querySelector('.ln'))return;
    layout(sheet);
    // 조판 크기 변경은 창 크기와 무관하므로 글 기둥과 스크롤 폭을 함께 관찰한다.
    const observer=new ResizeObserver(()=>layout(sheet));
    observer.observe(sheet.querySelector('.column'));observer.observe(sheet.querySelector('.scroll'));
    return ()=>observer.disconnect();
  }
  global.GeulManuscript={layout,attach};
})(window);
