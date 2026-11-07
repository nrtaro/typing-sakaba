import type { ProxyOptions } from 'vite';

/** 開発画面とローカルWorkerをつなぐ。 */
export function developmentApiProxy(target = 'http://127.0.0.1:8787'): ProxyOptions {
  return {
    target, changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        // 同じ開発画面からのOriginだけを、中継先に合わせる。他サイトの値は維持する。
        if (incoming.headers.origin === `http://${incoming.headers.host}`) {
          outgoing.setHeader('Origin', new URL(target).origin);
        }
      });
    },
  };
}
