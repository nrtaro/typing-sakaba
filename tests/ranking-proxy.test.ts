import { afterEach, expect, it } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import { developmentApiProxy } from '../scripts/devProxy';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

it('開発プロキシを通して同じサイトから送信でき、他サイトのOriginは書き換えない', async () => {
  const target = createHttpServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    res.writeHead(req.headers.origin === origin ? 200 : 403);
    res.end();
  });
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => target.close(err => err ? reject(err) : resolve())));
  const targetAddress = target.address() as { port: number };
  const vite = await createServer({ configFile: false, server: {
    host: '127.0.0.1', port: 0, proxy: { '/api': developmentApiProxy(`http://127.0.0.1:${targetAddress.port}`) },
  } });
  cleanup.push(() => vite.close());
  await vite.listen();
  const address = vite.httpServer!.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${origin}/api/daily/score`, { method: 'POST', headers: { Origin: origin } });
  expect(response.status).toBe(200);
  const other = await fetch(`${origin}/api/daily/score`, { method: 'POST', headers: { Origin: 'https://other.example' } });
  expect(other.status).toBe(403);
});
