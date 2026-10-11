(function () {
  'use strict';
  window.GeulOG = { render(snapshot) {
    // 미리보기를 열지 않아도 같은 글꼴·바탕으로 그려요. 글 자료는 주소나 저장소에 넣지 않아요.
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.title = '공유 이미지 만들기'; frame.setAttribute('aria-hidden', 'true'); frame.inert = true;
      Object.assign(frame.style, { position:'fixed', left:'-10000px', top:'0', width:'1200px', height:'630px', visibility:'hidden', border:'0' });
      const finish = (error, data) => { clearTimeout(timer); frame.remove(); error ? reject(error) : resolve(data); };
      const timer = setTimeout(() => finish(new Error('카드 이미지나 글꼴을 불러오는 데 시간이 걸려요. 잠시 뒤 다시 시도해 주세요.')), 20000);
      frame.onerror = () => finish(new Error('카드 화면을 불러오지 못했어요. 다시 시도해 주세요.'));
      frame.onload = async () => {
        try {
          if (!frame.contentWindow.GeulOGRenderer) throw new Error('카드 화면을 불러오지 못했어요. 다시 시도해 주세요.');
          finish(null, await frame.contentWindow.GeulOGRenderer.render(snapshot));
        }
        catch (error) { finish(error); }
      };
      frame.src = '/og-render.html'; document.body.append(frame);
    });
  } };
})();
