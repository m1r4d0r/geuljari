/* 본문 열쇠는 URL의 # 뒤에만 두고, 서버에는 암호문과 공개 제목만 보내요. */
(function () {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  function encode(a) { let s = ''; for (const b of new Uint8Array(a)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function decode(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  const random = n => encode(crypto.getRandomValues(new Uint8Array(n)));
  async function key(k) { if (!/^[A-Za-z0-9_-]{43}$/.test(k)) throw new Error('열쇠가 포함된 전체 링크를 넣어 주세요.'); return crypto.subtle.importKey('raw', decode(k), 'AES-GCM', false, ['encrypt', 'decrypt']); }
  const params = (id, iv) => ({ name:'AES-GCM', iv, additionalData:enc.encode('geuljari:1:' + id) });
  function validate(d) {
    if (!d || d.version !== 1 || typeof d.source !== 'string' || !d.source.trim() || typeof d.title !== 'string' || d.title.length > 40 || !d.settings || typeof d.settings !== 'object') throw new Error('글 자료를 읽을 수 없어요.');
    return d;
  }
  window.GeulCrypto = {
    random, validate,
    parseLink(raw) {
      const u = new URL(raw.trim(), location.origin), m = u.pathname.match(/^\/t\/([A-Za-z0-9_-]{22})\/?$/);
      if (!['https:', 'http:'].includes(u.protocol) || !m || !/^#[A-Za-z0-9_-]{43}$/.test(u.hash)) throw new Error('열쇠(# 뒤)가 포함된 /t/ 링크를 넣어 주세요.');
      // 이전 도메인의 링크도 현재 사이트 API에서 찾아요. 비밀번호를 외부 주소로 보내지 않아요.
      return { id:m[1], key:u.hash.slice(1) };
    },
    async seal(d, id, k) {
      const bytes = enc.encode(JSON.stringify(validate(d)));
      if (bytes.length > 250000) throw new Error('글이 너무 길어요. 본문을 나누어 발행해 주세요.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return { iv:encode(iv), cipher:encode(await crypto.subtle.encrypt(params(id, iv), await key(k), bytes)) };
    },
    async open(r, k) {
      let bytes;
      try { bytes = await crypto.subtle.decrypt(params(r.id, decode(r.iv)), await key(k), decode(r.cipher)); }
      catch { throw new Error('열쇠가 맞지 않거나 글 자료가 손상됐어요. 전체 링크를 확인해 주세요.'); }
      return validate(JSON.parse(dec.decode(bytes)));
    }
  };
})();
