// 프런트엔드를 변환하지 않고 공개 파일만 옮겨요.
import { readdir, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { deployConfig } from './deploy-config.mjs';
await writeFile('server/deploy-config.json', JSON.stringify(deployConfig(process.env)) + '\n');
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of await readdir('.')) {
  if (/\.(html|css|js|svg|png|jpg|ico|webmanifest)$|^(robots\.txt|sitemap\.xml)$/.test(name)) await cp(name, `dist/${name}`);
}
for (const name of ['design', 'meokji', 'codex-proposals']) await cp(name, `dist/${name}`, { recursive: true });
