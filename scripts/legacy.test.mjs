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
    ['/spip.php', '?page=login', undefined]
  ]) {
    let replaced;
    await runInNewContext(script, {
      document: { currentScript: { dataset: { map: '/preview/assets/legacy-urls.json' } } },
      location: { pathname, search, hash: '#biographie', replace: url => { replaced = url; } },
      fetch: async () => ({
        ok: true, json: async () => ({ auteur2: '/auteurs/2/', article3: '/articles/3/', rubrique4: '/association/' })
      }),
      console
    });
    assert.equal(replaced, expected);
  }
});
