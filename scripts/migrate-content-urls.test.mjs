import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrateContentUrls, rewriteLinks, planSectionUrls, splitContent, removeUnpublishedRedirects } from './migrate-content-urls.mjs';

test('article links retain fragments and queries, without rewriting external sites or unknown articles', () => {
  const mapping = new Map([['/articles/1/', '/articles/train/']]);
  assert.equal(rewriteLinks('[Train](/articles/1/?view=full#notes) <a href="/articles/1/#nb1">link</a>', mapping),
    '[Train](/articles/train/?view=full#notes) <a href="/articles/train/#nb1">link</a>');
  assert.equal(rewriteLinks('[Train](https://www.freelug.org/articles/1/#nb1)', mapping), '[Train](/articles/train/#nb1)');
  assert.equal(rewriteLinks('https://example.org/articles/1/ /articles/2/', mapping), 'https://example.org/articles/1/ /articles/2/');
});

test('sections follow their hierarchy and reject missing parents', () => {
  const sections = [
    { file: '_sections/17.md', metadata: { title: 'Thèmes', permalink: '/themes/' } },
    { file: '_sections/10.md', metadata: { title: 'Train', permalink: '/rubriques/10/', parent: '/themes/' } }
  ];
  assert.equal(planSectionUrls(sections)[1].proposed_url, '/themes/train/');
  assert.equal(planSectionUrls(sections)[1].proposed_file, '_sections/themes-train.md');
  assert.throws(() => planSectionUrls(sections.slice(1)), /Missing parent/);
});

test('migration updates relations and links, preserves sources and supports original SPIP URLs only', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'freelug-migration-'));
  try {
    for (const folder of ['_articles/themes', '_sections', '_authors', '_data', 'scripts/seo']) await mkdir(path.join(directory, folder), { recursive: true });
    const article = '---\ntitle: Train\npermalink: /articles/1/\nsection: /rubriques/10/\nsource_id: 1\nsource_url: https://www.freelug.org/spip.php?article1\n---\n[Self](/articles/1/#nb1)\n<span id="nb1">Note</span>\n';
    await writeFile(path.join(directory, '_articles/themes/1.md'), article);
    await writeFile(path.join(directory, '_sections/17.md'), '---\ntitle: Thèmes\npermalink: /themes/\n---\n');
    await writeFile(path.join(directory, '_sections/10.md'), '---\ntitle: Train\npermalink: /rubriques/10/\nparent: /themes/\n---\n[Train](/articles/1/)\n');
    await writeFile(path.join(directory, '_authors/2.md'), '---\ntitle: Author\npermalink: /auteurs/2/\narticles: ["/articles/1/"]\n---\n');
    await writeFile(path.join(directory, '_data/navigation.yml'), '- title: Train\n  url: /rubriques/10/\n');
    await writeFile(path.join(directory, '_data/legacy_urls.json'), JSON.stringify({ article1: '/articles/1/', rubrique10: '/rubriques/10/' }));
    await writeFile(path.join(directory, 'scripts/seo/article-url-mapping.json'), JSON.stringify({ status: 'proposal-only', entries: [{ title: 'Train', old_file: '_articles/themes/1.md', old_url: '/articles/1/', proposed_file: '_articles/themes/train.md', proposed_url: '/articles/train/' }] }));
    assert.deepEqual(await migrateContentUrls(directory), { articles: 1, sections: 2, redirects: 0 });
    assert.deepEqual(await readdir(path.join(directory, '_articles/themes')), ['train.md']);
    const migrated = splitContent(await readFile(path.join(directory, '_articles/themes/train.md'), 'utf8'));
    assert.equal(migrated.document.get('section'), '/themes/train/');
    assert.equal(migrated.document.get('source_id'), 1);
    assert.equal(migrated.document.get('source_url'), 'https://www.freelug.org/spip.php?article1');
    assert.equal(migrated.body, '[Self](/articles/train/#nb1)\n<span id="nb1">Note</span>\n');
    const author = splitContent(await readFile(path.join(directory, '_authors/2.md'), 'utf8'));
    assert.deepEqual(author.document.toJS().articles, ['/articles/train/']);
    await assert.rejects(readFile(path.join(directory, '_redirects/articles-1.md')), /ENOENT/);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, '_data/url-redirects.json'), 'utf8')), {});
    assert.match(await readFile(path.join(directory, '_data/navigation.yml'), 'utf8'), /\/themes\/train\//);
    assert.equal(JSON.parse(await readFile(path.join(directory, '_data/legacy_urls.json'), 'utf8')).article1, '/articles/train/');
    await assert.rejects(migrateContentUrls(directory), /already applied/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cleanup removes only verified unpublished numeric redirects and retains genuine redirects', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'freelug-cleanup-'));
  try {
    await mkdir(path.join(directory, '_data'));
    await mkdir(path.join(directory, '_redirects'));
    await writeFile(path.join(directory, '_data/url-redirects.json'), JSON.stringify({ '/articles/1/': '/articles/train/', '/articles/old-name/': '/articles/new-name/' }));
    const file = path.join(directory, '_redirects/articles-1.md');
    await writeFile(file, '---\nlayout: redirect\npermalink: /articles/1/\nredirect_to: /articles/changed/\n---\n');
    await assert.rejects(removeUnpublishedRedirects(directory), /refusing to delete/);
    await writeFile(file, '---\nlayout: redirect\npermalink: /articles/1/\nredirect_to: /articles/train/\n---\n');
    assert.deepEqual(await removeUnpublishedRedirects(directory), { removed: 1, remaining: 1 });
    await assert.rejects(readFile(file), /ENOENT/);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, '_data/url-redirects.json'), 'utf8')), { '/articles/old-name/': '/articles/new-name/' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});