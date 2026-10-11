(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = window.GeulCrypto, F = window.GeulFile;
  const messages = {
    wrong_password:'비밀번호가 맞지 않아요.', not_found:'글을 찾을 수 없거나 발행이 중단됐어요.',
    conflict:'다른 곳에서 글이 바뀌었어요. 현재 글을 따로 보관한 뒤 다시 불러와 주세요.',
    storage_unavailable:'발행 서버에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    too_large:'글이나 카드 이미지가 너무 커요. 내용을 줄인 뒤 다시 시도해 주세요.', invalid_password:'비밀번호를 4~128자로 입력해 주세요.',
    invalid_og_image:'카드 이미지를 확인하지 못했어요. 다시 시도해 주세요.'
  };
  async function api(path, method, data) {
    let response;
    try { response = await fetch('/api/articles' + path, { method, headers:{'Content-Type':'application/json'}, body: data ? JSON.stringify(data) : undefined, cache:'no-store' }); }
    catch { throw new Error('연결이 끊겼어요. 입력한 내용은 남아 있으니 다시 시도해 주세요.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 429 ? '요청이 많아요. 1분 뒤 다시 시도해 주세요.' : messages[result.error] || '요청을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const valid = method === 'DELETE' ? result.deleted === true
      : /^[A-Za-z0-9_-]{22}$/.test(result.id || '') && typeof result.cipher === 'string' && typeof result.iv === 'string' && Number.isSafeInteger(result.revision);
    if (!valid) throw new Error('발행 서버의 응답을 확인할 수 없어요. 입력한 내용은 남아 있으니 잠시 뒤 다시 시도해 주세요.');
    return result;
  }
  window.GeulPublish = { mount(ctx) {
    // 발행한 글의 열쇠·비밀번호·기록은 이 브라우저(localStorage)에 남겨 새로 고침해도 발행 관리가 이어져요. 본문은 넣지 않아요.
    const KEEP = 'geul.publication';
    let active = null, pending = null, busy = false, live = true;
    const link = a => location.origin + '/t/' + a.id + '#' + a.key;
    const slim = r => { const { cipher, iv, ...rest } = r; return rest; };
    function keep() {
      try {
        if (active) localStorage.setItem(KEEP, JSON.stringify({ id:active.id, key:active.key, password:active.password, record:slim(active.record) }));
        else localStorage.removeItem(KEEP);
      } catch { /* 저장소를 쓸 수 없으면 이번 화면에서만 이어져요 */ }
    }
    function restore() {
      try {
        const d = JSON.parse(localStorage.getItem(KEEP) || 'null');
        if (d && /^[\w-]{22}$/.test(d.id) && /^[\w-]{43}$/.test(d.key) && typeof d.password === 'string' && d.record) active = d;
      } catch { active = null; }
    }
    function switchLabel() {
      const sw = $('publish-live');
      sw.setAttribute('aria-checked', String(live));
      sw.querySelector('.pub-switch-label').textContent = active ? (live ? '발행 중' : '발행 중단') : (live ? '바로 공개' : '닫아 두기');
    }
    function render() {
      $('publish-new').hidden = !!active;
      $('publish-password').required = !active;
      $('publish-delete').hidden = !active;
      $('publish-submit').textContent = active ? '고친 내용 저장' : '이대로 발행하기';
      $('publish-result').hidden = !active;
      for (const id of ['publish-share','publish-download']) $(id).hidden = !active;
      document.querySelectorAll('.pub-help-live').forEach(n => { n.hidden = !active; });
      document.querySelector('.publish-bar').classList.toggle('is-live', !!active);
      if (active) live = active.record.live;
      switchLabel();
      // 발행 상태는 편집 하단바 오른쪽에 보여요.
      const label = active ? `${active.record.live ? '발행 중' : '발행 중단'} · ${active.record.title || '제목 없는 글'} · ${new Date(active.record.updatedAt).toLocaleDateString('ko-KR')}` : '';
      document.querySelectorAll('.publication-strip').forEach(n => { n.hidden = !active; n.querySelector('.publication-label').textContent = label; });
      if (active) {
        $('publish-url').value = link(active); $('publish-visit').href = link(active);
        $('publish-visit').hidden = !active.record.live;
      }
    }
    function lock(on) {
      busy = on;
      $('publish-fields').disabled = on; $('load-fields').disabled = on;
      // 요청 중 다른 글로 바뀌는 일을 막아요.
      for (const id of ['clear','load-open','file-save','publish-submit','publish-live','publish-delete']) $(id).disabled = on;
      $('s-publish').setAttribute('aria-busy', String(on));
    }
    const say = msg => { $('publish-message').textContent = msg; };
    const reset = () => {
      active = pending = null; live = true; $('publish-password').value = '';
      say(''); keep(); render();
    };
    $('publish-title').addEventListener('input', e => ctx.title(e.target.value));
    document.querySelectorAll('.publication-manage').forEach(b => { b.onclick = ctx.manage; });
    async function publish() {
      if (busy) return;
      if (!active && !$('publish-form').reportValidity()) return;
      lock(true); say(live ? '공유 이미지를 만들고 글을 잠가서 자리에 놓고 있어요.' : '글을 잠가서 자리에 놓고 있어요.');
      try {
        const snapshot = structuredClone(ctx.snapshot());
        const password = active ? active.password : $('publish-password').value;
        // 생성·수정 응답이 유실돼도 같은 암호문과 버전으로 재시도해요.
        const signature = JSON.stringify([snapshot, live, password, active?.id, active?.record.revision]);
        if (!pending || pending.signature !== signature) {
          const id = active?.id || C.random(16), key = active?.key || C.random(32);
          pending = { id, key, signature, sealed:await C.seal(snapshot, id, key), ogImage:live ? await window.GeulOG.render(snapshot) : undefined };
        }
        const target = active || pending;
        const sealed = pending.sealed;
        const record = await api(active ? '/' + target.id : '', active ? 'PUT' : 'POST', { id:target.id, title:snapshot.title, live, ...sealed, ogImage:pending.ogImage, password, revision:active?.record.revision });
        const first = !active;
        active = { id:target.id, key:target.key, password, record:slim(record) }; pending = null;
        $('publish-password').value = '';
        keep(); render();
        say(first ? (live ? '글이 자리를 찾았어요. 링크를 누르면 복사돼요.' : '글을 닫아 둔 채로 놓았어요.') : '고친 내용을 저장했어요.');
        if (first) document.querySelector('.publish-scroll').scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      } catch (err) { say(err.message); }
      finally { lock(false); }
    }
    $('publish-form').onsubmit = e => { e.preventDefault(); publish(); };
    // 스위치: 발행 전에는 처음 상태를 고르고, 발행한 뒤에는 누르는 즉시 공개·중단만 바꿔요(본문은 그대로).
    $('publish-live').onclick = async () => {
      if (busy) return;
      live = !live;
      if (!active) { switchLabel(); return; }
      lock(true); switchLabel();
      try {
        const fresh = await api('/' + active.id + '/unlock', 'POST', { password:active.password });
        // 다시 열 때는 서버에 놓인 본문으로 공유 이미지를 새로 그려요(편집 중인 글은 올리지 않아요).
        const ogImage = live ? await window.GeulOG.render(await C.open(fresh, active.key)) : undefined;
        const record = await api('/' + active.id, 'PUT', { id:active.id, title:fresh.title, cipher:fresh.cipher, iv:fresh.iv, live, ogImage, password:active.password, revision:fresh.revision });
        active.record = slim(record); keep(); render();
        say(live ? '다시 읽을 수 있게 열었어요.' : '발행을 멈췄어요. 이미 읽거나 저장한 사본은 거둘 수 없어요.');
      } catch (err) { live = !live; switchLabel(); say(err.message); }
      finally { lock(false); }
    };
    $('publish-delete').onclick = async () => {
      if (!active || busy || !confirm('발행한 글을 삭제할까요? 되돌릴 수 없어요. 편집창의 글은 남아요.')) return;
      lock(true);
      try { await api('/' + active.id, 'DELETE', { password:active.password, revision:active.record.revision }); reset(); say('발행한 글을 삭제했어요. 편집창에는 글이 남아 있어요.'); }
      catch (err) { say(err.message); }
      finally { lock(false); }
    };
    async function copy(text, done) {
      try { await navigator.clipboard.writeText(text); ctx.notice(done); return true; }
      catch { return false; }
    }
    const copyLink = async () => {
      if (!active) return;
      if (!await copy(link(active), '링크를 클립보드에 복사했어요.')) { $('publish-url').focus(); $('publish-url').select(); say('링크를 선택했어요. 직접 복사해 주세요.'); }
    };
    $('publish-copy').onclick = copyLink;
    $('publish-url').addEventListener('click', () => { $('publish-url').select(); copyLink(); });
    const keepText = () => F.shareText(active.record.title, link(active), active.password);
    // 비밀번호 보내기: 기기의 보내기가 있으면 그것으로, 없으면 제목·링크·비밀번호를 복사해요.
    $('publish-share').onclick = async () => {
      if (!active) return;
      if (navigator.share) {
        try { await F.share(active.record.title || '글자리', keepText()); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      if (!await copy(keepText(), '제목·링크·비밀번호를 복사했어요.')) say('복사하지 못했어요. 글 파일로 받아 주세요.');
    };
    $('publish-download').onclick = () => { if (active) ctx.saveFile(); };
    // 1000px 이하: 비밀번호 보내기·파일 백업을 ⋯ 안에 접어요.
    const bar = document.querySelector('.publish-bar'), more = bar.querySelector('.pub-more-btn');
    const fold = on => { bar.classList.toggle('more-open', on); more.setAttribute('aria-expanded', String(on)); };
    more.onclick = () => fold(!bar.classList.contains('more-open'));
    bar.querySelectorAll('.pub-more button').forEach(x => x.addEventListener('click', () => fold(false)));
    document.addEventListener('pointerdown', e => { if (!bar.contains(e.target)) fold(false); });
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
        await C.open(record, target.key);
        active = { ...target, password:p.password, record:slim(record) }; pending = null;
        keep(); render(); return true;
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
        ctx.import(doc); active = { ...target, password, record:slim(record) }; pending = null;
        keep(); render(); $('load-dialog').close();
      } catch (err) { $('load-message').textContent = err.message; }
      finally { lock(false); }
    };
    restore(); render();
    // 남겨 둔 발행 기록은 서버의 지금 상태로 맞춰요. 지워진 글이면 기록을 거둬요.
    if (active) api('/' + active.id + '/unlock', 'POST', { password:active.password })
      .then(r => { if (active) { active.record = slim(r); keep(); render(); } })
      .catch(err => { if (active && /찾을 수 없|맞지 않/.test(err.message)) reset(); });
    const current = () => active && { url:link(active), password:active.password, live:active.record.live, date:new Date(active.record.updatedAt).toLocaleDateString('sv-SE') };
    return { reset, current, resume() {
      const match = /^#edit=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
      if (!match) return;
      $('load-url').value = location.origin + '/t/' + match[1] + '#' + match[2];
      history.replaceState(null, '', location.pathname + location.search);
      $('load-heading').textContent = '작성자 비밀번호를 확인해요.';
      $('load-message').textContent = '확인하면 이 글을 편집실로 불러와요. 지금 쓰던 초안은 먼저 확인하고 바꿔요.';
      $('load-dialog').showModal(); $('load-password').focus();
    }, enter() { $('publish-title').value = ctx.snapshot().title; say(''); render(); } };
  } };
})();
