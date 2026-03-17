// coi-serviceworker.js
// Sets Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers
// to unlock SharedArrayBuffer (required for Stockfish WASM) on GitHub Pages.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', function (event) {
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        if (response.status === 0) return response;

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        return new Response(response.body, {
          status:     response.status,
          statusText: response.statusText,
          headers:    newHeaders,
        });
      })
      .catch(() => fetch(event.request))
  );
});
