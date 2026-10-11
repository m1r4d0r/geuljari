// 프런트엔드를 변환하지 않고 공개 파일만 옮겨요.
import { readdir, mkdir, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of await readdir('.')) {
  if (/\.(html|css|js|svg|png|ico|webmanifest)$/.test(name)) await cp(name, `dist/${name}`);
}
for (const name of ['design', 'meokji', 'codex-proposals']) await cp(name, `dist/${name}`, { recursive: true });
