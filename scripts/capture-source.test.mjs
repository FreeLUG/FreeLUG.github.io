import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./capture-source.js', import.meta.url), 'utf8');

function harness({ status = 200, retryAfter = null, cached = [] } = {}) {
  const sourceRequests = [];
  let clock = 0;
  const holder = () => ({
    innerHTML: '', textContent: '', append() {},
    querySelectorAll: () => [], cloneNode() { return this; }
  });
  const main = {
    querySelector: selector => selector === 'h1' ? { textContent: 'Article' } : selector === '.main' ? {} : null,
    querySelectorAll: () => []
  };
  const context = {
    window: {}, URL, location: { origin: 'https://www.freelug.org' },
    document: { createElement: holder },
    DOMParser: class { parseFromString() { return { querySelector: () => main }; } },
    console: { error() {} },
    setTimeout: (callback, ms) => { clock += ms; queueMicrotask(callback); },
    fetch: async (url, options) => {
      if (url === 'http://127.0.0.1:4174/state') {
        return { ok: true, json: async () => ({ articles: cached.map(a => a.id), assets: [] }) };
      }
      if (url.startsWith('http://127.0.0.1:4174/article?id=')) {
        return { ok: true, json: async () => cached.find(article => article.id === Number(new URL(url).searchParams.get('id'))) };
      }
      if (url.startsWith('http://127.0.0.1:4174/')) {
        assert.equal(options.method, 'POST');
        return { ok: true };
      }
      sourceRequests.push({ url, time: clock });
      return {
        status, ok: status === 200, type: 'basic', text: async () => '',
        headers: { get: key => key === 'Retry-After' ? retryAfter : null }
      };
    }
  };
  vm.runInNewContext(source, context);
  return { window: context.window, sourceRequests };
}

const inventory = () => ({
  sections: {}, articles: {},
  sitemap: [1, 2, 3].map(id => `https://freelug.org/spip.php?article${id}`)
});

test('capture makes sequential source requests at least five seconds apart', async () => {
  const { window, sourceRequests } = harness();
  const report = await window.captureFreeLUG(inventory());
  assert.equal(report.errors.length, 0);
  assert.equal(sourceRequests.length, 3);
  assert.deepEqual(sourceRequests.map(request => request.time), [5000, 10000, 15000]);
  assert.deepEqual(sourceRequests.map(request => request.url), [
    '/spip.php?article1', '/spip.php?article2', '/spip.php?article3'
  ]);
  assert.equal(report.skippedArticles.length, 3);
});

for (const status of [401, 403, 429, 503]) {
  test(`HTTP ${status} stops the entire capture without another source request`, async () => {
    const { window, sourceRequests } = harness({ status, retryAfter: '120' });
    const report = await window.captureFreeLUG(inventory());
    assert.equal(sourceRequests.length, 1);
    assert.equal(report.running, false);
    assert.match(report.errors[0], new RegExp(`HTTP ${status}`));
    assert.match(report.errors[0], /Retry-After: 120/);
    assert.equal(report.completedAt, undefined);
  });
}

test('cached articles are reused without losing their known section to sitemap entries', async () => {
  const article = { id: 1, title: 'Cached', url: 'https://freelug.org/spip.php?article1', section: 4, html: '<p>Cached content</p>' };
  const { window, sourceRequests } = harness({ status: 403, cached: [article] });
  const input = inventory();
  input.sections[4] = { id: 4, html: '', articles: [1] };
  input.articles[1] = { id: 1, title: 'Cached', url: article.url, section: 4 };
  const report = await window.captureFreeLUG(input);
  assert.equal(report.articles, 1);
  assert.equal(sourceRequests.length, 1);
  assert.equal(sourceRequests[0].url, '/spip.php?article2');
  assert.equal(input.articles[1].section, 4);
});

test('a second capture cannot start while initialization is pending', async () => {
  const { window } = harness({ status: 403 });
  const first = window.captureFreeLUG(inventory());
  await assert.rejects(window.captureFreeLUG(inventory()), /already running/);
  await first;
});
