import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('legacy author URLs resolve through the generated map with base paths and anchors intact', async () => {
  const script = await readFile(new URL('../assets/js/legacy.js', import.meta.url), 'utf8');
  for (const [pathname, search, expected] of [
    ['/spip.php', '?auteur2', '/preview/auteurs/2/#biographie'],
    ['/auteur2.html', '', '/preview/auteurs/2/#biographie'],
    ['/spip.php', '?article3', '/preview/articles/3/#biographie'],
    ['/spip.php', '?rubrique4', '/preview/association/#biographie'],
    ['/spip.php/', '?lang=fr&article3', '/preview/articles/3/#biographie'],
    ['/spip.php', '?page=article&id_article=3', '/preview/articles/3/#biographie'],
    ['/spip.php', '?id_rubrique=4&lang=fr', '/preview/association/#biographie'],
    ['/spip.php', '?id_auteur=2', '/preview/auteurs/2/#biographie'],
    ['/spip.php', '?article3&article999', undefined],
    ['/spip.php', '?article999', undefined],
    ['/spip.php', '?id_article=0', undefined],
    ['/spip.php', '?page=login', undefined]
  ]) {
    let replaced;
    await runInNewContext(script, {
      document: { currentScript: { dataset: { map: '/preview/assets/legacy-urls.json' } }, querySelector: () => null },
      URLSearchParams,
      location: { pathname, search, hash: '#biographie', replace: url => { replaced = url; } },
      fetch: async () => ({
        ok: true, json: async () => ({ auteur2: '/auteurs/2/', article3: '/articles/3/', rubrique4: '/association/' })
      }),
      console
    });
    assert.equal(replaced, expected);
  }
});

test('legacy targets cannot redirect off-site and lookup failures remain graceful', async () => {
  const script = await readFile(new URL('../assets/js/legacy.js', import.meta.url), 'utf8');
  for (const target of ['https://example.org/', '//example.org/', '/articles/../secret/']) {
    let replaced;
    await runInNewContext(script, {
      document: { currentScript: { dataset: { map: '/assets/legacy-urls.json' } }, querySelector: () => null },
      URLSearchParams,
      location: { pathname: '/spip.php', search: '?article3', hash: '', replace: value => { replaced = value; } },
      fetch: async () => ({ ok: true, json: async () => ({ article3: target }) }),
      console
    });
    assert.equal(replaced, undefined);
  }
  const status = { textContent: '' };
  await runInNewContext(script, {
    document: { currentScript: { dataset: { map: '/assets/legacy-urls.json' } }, querySelector: () => status },
    URLSearchParams,
    location: { pathname: '/spip.php', search: '?article3', hash: '', replace: () => assert.fail('Unexpected redirect') },
    fetch: async () => ({ ok: false, status: 500 }),
    console: { error() {} }
  });
  assert.match(status.textContent, /a échoué/);
});
