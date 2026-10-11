(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = window.GeulCrypto, F = window.GeulFile;
  const messages = {
    wrong_password:'비밀번호가 맞지 않아요.', not_found:'글을 찾을 수 없거나 발행이 중단됐어요.',
    conflict:'다른 곳에서 글이 바뀌었어요. 현재 글을 따로 보관한 뒤 다시 불러와 주세요.',
    storage_unavailable:'발행 서버에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    too_large:'글이 너무 길어요. 나누어 발행해 주세요.', invalid_password:'비밀번호를 4~128자로 입력해 주세요.'
  };
  async function api(path, method, data) {
    let response;
    try { response = await fetch('/api/articles' + path, { method, headers:{'Content-Type':'application/json'}, body: data ? JSON.stringify(data) : undefined, cache:'no-store' }); }
    catch { throw new Error('연결이 끊겼어요. 입력한 내용은 남아 있으니 다시 시도해 주세요.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 429 ? '요청이 많아요. 1분 뒤 다시 시도해 주세요.' : messages[result.error] || '요청을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    return result;
  }
  window.GeulPublish = { mount(ctx) {
    // 비밀번호와 열쇠는 메모리에만 두어요. 편집실 저장 자료에는 넣지 않아요.
    let active = null, pending = null, busy = false;
    const link = a => location.origin + '/t/' + a.id + '#' + a.key;
    function render() {
      $('publish-new').hidden = !!active;
      $('publish-password').required = !active;
      $('publish-delete').hidden = !active;
      $('publish-submit').textContent = active ? '고친 내용 저장' : '이대로 발행하기';
      $('publish-result').hidden = !active;
      // 발행 상태는 편집·발행 하단바 오른쪽에 같은 모양으로 보여요.
      const label = active ? `${active.record.live ? '발행 중' : '발행 중단'} · ${active.record.title || '제목 없는 글'} · ${new Date(active.record.updatedAt).toLocaleDateString('ko-KR')}` : '';
      document.querySelectorAll('.publication-strip').forEach(n => { n.hidden = !active; n.querySelector('.publication-label').textContent = label; });
      if (active) {
        $('publish-url').value = link(active); $('publish-visit').href = link(active);
        $('publish-visit').hidden = !active.record.live;
      }
      // 머리말은 지금 상태를 말해요: 아직 · 자리를 찾음 · 닫아 둠
      const live = active && active.record.live;
      $('publish-heading').textContent = !active ? '글의 자리를 찾아요.' : live ? '글이 자리를 찾았어요.' : '글이 자리에서 쉬고 있어요.';
      $('publish-intro').textContent = !active ? '다듬은 모습 그대로 링크 하나에 놓아 둬요.'
        : live ? '아래 링크로 읽을 수 있어요. 글을 고친 뒤 저장하면 같은 링크에 바로 반영돼요.'
        : '지금은 아무도 읽을 수 없어요. 다시 열려면 아래에서 열어 두기를 고르고 저장해 주세요.';
    }
    function lock(on) {
      busy = on;
      $('publish-fields').disabled = on; $('load-fields').disabled = on;
      // 요청 중 다른 글로 바뀌는 일을 막아요.
      for (const id of ['clear','load-open','file-save']) $(id).disabled = on;
      $('s-publish').setAttribute('aria-busy', String(on));
    }
    const reset = () => {
      active = pending = null; $('publish-password').value = '';
      $('publish-live').checked = true;
      $('publish-message').textContent = ''; render();
    };
    $('publish-title').addEventListener('input', e => ctx.title(e.target.value));
    document.querySelectorAll('.publication-manage').forEach(b => { b.onclick = ctx.manage; });
    $('publish-form').onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      lock(true); $('publish-message').textContent = '글을 잠가서 자리에 놓고 있어요.';
      try {
        const snapshot = structuredClone(ctx.snapshot()), live = $('publish-live').checked;
        const password = active ? active.password : $('publish-password').value;
        // 응답이 유실돼도 같은 생성 요청을 재사용해 중복 글을 만들지 않아요.
        const signature = JSON.stringify([snapshot, live, password]);
        if (!active && (!pending || pending.signature !== signature)) {
          const id = C.random(16), key = C.random(32);
          pending = { id, key, signature, sealed:await C.seal(snapshot, id, key) };
        }
        const target = active || pending;
        const sealed = active ? await C.seal(snapshot, target.id, target.key) : pending.sealed;
        const record = await api(active ? '/' + target.id : '', active ? 'PUT' : 'POST', { id:target.id, title:snapshot.title, live, ...sealed, password, revision:active?.record.revision });
        const first = !active;
        active = { id:target.id, key:target.key, password, record }; pending = null;
        $('publish-password').value = '';
        render();
        // 처음 발행하면 맨 위에 생긴 링크 면으로 올라가요.
        if (first) document.querySelector('.publish-scroll').scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); $('publish-message').textContent = live ? '저장했어요. 링크와 비밀번호를 남겨 두세요.' : '저장했어요. 지금은 닫혀 있어요.';
      } catch (err) { $('publish-message').textContent = err.message; }
      finally { lock(false); }
    };
    $('publish-delete').onclick = async () => {
      if (!active || busy || !confirm('발행한 글을 삭제할까요? 되돌릴 수 없어요. 편집창의 글은 남아요.')) return;
      lock(true);
      try { await api('/' + active.id, 'DELETE', { password:active.password, revision:active.record.revision }); reset(); $('publish-message').textContent = '발행한 글을 삭제했어요. 편집창에는 글이 남아 있어요.'; }
      catch (err) { $('publish-message').textContent = err.message; }
      finally { lock(false); }
    };
    async function copy(text, done) {
      try { await navigator.clipboard.writeText(text); $('publish-message').textContent = done; return true; }
      catch { return false; }
    }
    $('publish-copy').onclick = async () => {
      if (!await copy(link(active), '전체 링크를 복사했어요.')) { $('publish-url').focus(); $('publish-url').select(); $('publish-message').textContent = '링크를 선택했어요. 직접 복사해 주세요.'; }
    };
    const keepText = () => F.shareText(active.record.title, link(active), active.password);
    $('publish-share').hidden = !navigator.share;
    $('publish-share').onclick = async () => {
      try { await F.share(active.record.title || '글자리', keepText()); }
      catch { if (!await copy(keepText(), '보낼 수 없어서 대신 복사했어요.')) $('publish-message').textContent = '보내지 못했어요. 글 파일로 받아 주세요.'; }
    };
    $('publish-copy-all').onclick = async () => {
      if (!await copy(keepText(), '제목·링크·비밀번호를 복사했어요.')) $('publish-message').textContent = '복사하지 못했어요. 글 파일로 받아 주세요.';
    };
    $('publish-download').onclick = () => { if (active) ctx.saveFile(); };
    $('load-open').onclick = () => { if (!busy) { $('load-message').textContent = ''; $('load-dialog').showModal(); } };
    $('load-close').onclick = () => $('load-dialog').close();
    $('load-dialog').addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    $('load-dialog').addEventListener('close', () => { $('load-password').value = ''; $('load-file').value = ''; });
    // 글 파일에 든 링크·비밀번호로 발행한 글과 다시 이어요. 본문은 파일의 것을 그대로 둬요.
    async function connect(p) {
      if (!p) return false;
      lock(true);
      try {
        const target = C.parseLink(p.url);
        const record = await api('/' + target.id + '/unlock', 'POST', { password:p.password });
        active = { ...target, password:p.password, record }; pending = null;
        $('publish-live').checked = record.live; render(); return true;
      } catch { return false; }
      finally { lock(false); }
    }
    // 글 파일이면 바로 편집실로 가져오고, 예전 관리 파일이면 링크와 비밀번호 칸을 채워요.
    async function readFile(file) {
      if (!file || busy) return;
      let got = null;
      try { if (file.size <= 2097152) got = F.read(await file.text()); } catch { got = null; }
      if (got && got.kind === 'doc') {
        if (ctx.snapshot().source.trim() && !confirm('편집 중인 글을 파일의 글로 바꿀까요?')) { $('load-message').textContent = '불러오기를 취소했어요.'; return; }
        reset(); ctx.import(got.doc); $('load-dialog').close();
        ctx.notice(await connect(got.doc.publication) ? '글 파일을 불러왔어요. 발행한 글과 이어졌어요.' : '글 파일을 불러왔어요.');
        return;
      }
      try {
        if (!got || got.password.length < 4 || got.password.length > 128) throw new Error();
        C.parseLink(got.url); $('load-url').value = got.url; $('load-password').value = got.password;
        $('load-message').textContent = '관리 파일을 읽었어요. 불러오기를 눌러 주세요.';
      } catch { $('load-message').textContent = '글자리 글 파일을 읽을 수 없어요.'; }
    }
    $('load-file').onchange = e => readFile(e.target.files[0]);
    $('load-drop').ondragover = e => e.preventDefault();
    $('load-drop').ondrop = e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); };
    $('load-form').onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      lock(true); $('load-message').textContent = '글을 불러오고 있어요.';
      try {
        const target = C.parseLink($('load-url').value), password = $('load-password').value;
        const record = await api('/' + target.id + '/unlock', 'POST', { password });
        const doc = await C.open(record, target.key);
        if (ctx.snapshot().source.trim() && !confirm('편집 중인 글을 불러온 글로 바꿀까요?')) { $('load-message').textContent = '불러오기를 취소했어요.'; return; }
        ctx.import(doc); active = { ...target, password, record }; pending = null;
        $('publish-live').checked = record.live; render(); $('load-dialog').close();
      } catch (err) { $('load-message').textContent = err.message; }
      finally { lock(false); }
    };
    render();
    const current = () => active && { url:link(active), password:active.password, live:active.record.live, date:new Date(active.record.updatedAt).toLocaleDateString('sv-SE') };
    return { reset, current, resume() {
      const match = /^#edit=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
      if (!match) return;
      $('load-url').value = location.origin + '/t/' + match[1] + '#' + match[2];
      history.replaceState(null, '', location.pathname + location.search);
      $('load-heading').textContent = '작성자 비밀번호를 확인해요.';
      $('load-message').textContent = '확인하면 이 글을 편집실로 불러와요. 지금 쓰던 초안은 먼저 확인하고 바꿔요.';
      $('load-dialog').showModal(); $('load-password').focus();
    }, enter() { $('publish-title').value = ctx.snapshot().title; $('publish-message').textContent = ''; render(); } };
  } };
})();
