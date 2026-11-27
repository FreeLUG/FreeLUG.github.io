import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { importAuthorPage } from './import-author-page.mjs';

async function fixture(t, main = '<div class="bio"><p>Des trains et des briques.</p></div><p class="hyperlien"><a href="?article3">Un récit</a></p>') {
  const directory = await mkdtemp(path.join(tmpdir(), 'freelug-author-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const site = path.join(directory, 'site');
  await mkdir(path.join(site, '_articles', 'themes'), { recursive: true });
  await mkdir(path.join(site, '_sections'), { recursive: true });
  await mkdir(path.join(site, '_data'));
  await writeFile(path.join(site, '_data', 'legacy_urls.json'), '{"article3":"/articles/recit/"}');
  await writeFile(path.join(site, '_sections', 'themes.md'), '---\ntitle: Thèmes\nsource_id: 17\npermalink: /themes/\n---\n');
  await writeFile(path.join(site, '_sections', 'themes-train.md'), '---\ntitle: Train\nsource_id: 42\npermalink: /themes/train/\nparent: /themes/\n---\n');
  await writeFile(path.join(site, '_articles', 'themes', '3.md'), '---\ntitle: Recit\nsource_id: 3\nsource_url: https://www.freelug.org/spip.php?article3\npermalink: /articles/recit/\nsection: /themes/train/\n---\nTexte.\n');
  const url = 'https://www.freelug.org/spip.php?auteur2';
  const html = `<div id="content"><div class="inner"><section class="auteur_2"><div class="vcard">
    <header class="cartouche"><h1><img src="https://www.freelug.org/portrait.png" alt="">Nom public</h1></header>
    <div class="main">${main}</div></div><aside>Do not import teasers <a href="?article999">Autre article</a></aside></section></div></div>`;
  const archive = `From: <Saved by Blink>\nSnapshot-Content-Location: ${url}\nContent-Type: multipart/related; boundary="author-fixture"\n\n--author-fixture\nContent-Type: text/html\nContent-Location: ${url}\nContent-Transfer-Encoding: base64\n\n${Buffer.from(html).toString('base64')}\n--author-fixture\nContent-Type: image/png\nContent-Location: https://www.freelug.org/portrait.png\nContent-Transfer-Encoding: base64\n\n${Buffer.from('portrait-bytes').toString('base64')}\n--author-fixture--\n`;
  const file = path.join(directory, 'auteur2.mhtml');
  await writeFile(file, archive);
  return { file, site, archive, identity: { id: 2, source_url: url, names: ['Crédit historique'], articles: [3, 4] } };
}

test('author saves preserve biography, portrait and verified published article relationships without teasers', async t => {
  const { file, site, identity } = await fixture(t);
  const result = await importAuthorPage(file, identity, site);
  assert.deepEqual(result, { id: 2, imagesAndFiles: 1, articles: 1, pendingArticles: [4] });
  const markdown = await readFile(path.join(site, '_authors', '2.md'), 'utf8');
  const [, metadata, body] = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const data = parse(metadata);
  assert.equal(data.title, 'Nom public');
  assert.deepEqual(data.source_names, ['Crédit historique']);
  assert.deepEqual(data.themes_articles, ['/articles/recit/']);
  assert.deepEqual(data.association_articles, []);
  assert.deepEqual(data.regions_articles, []);
  assert.match(data.image, /^\/media\/archive\/[a-f0-9]{24}\.png$/);
  assert.equal(await readFile(path.join(site, ...data.image.split('/').filter(Boolean)), 'utf8'), 'portrait-bytes');
  assert.match(body, /Des trains et des briques/);
  assert.match(body, /\[Un récit\]\(\/articles\/recit\/\)/);
  assert.doesNotMatch(body, /Do not import|article999|<div|<p/);
  assert.equal(JSON.parse(await readFile(path.join(site, '_data', 'legacy_urls.json'), 'utf8')).auteur2, '/auteurs/2/');
  await assert.rejects(importAuthorPage(file, identity, site), /refusing to overwrite/);
  assert.equal(await readFile(path.join(site, '_authors', '2.md'), 'utf8'), markdown);
});

test('authors without biographies accept the original public-host alias without inventing content', async t => {
  const { file, site, identity } = await fixture(t, '');
  const articleFile = path.join(site, '_articles', 'themes', '3.md');
  await writeFile(articleFile, (await readFile(articleFile, 'utf8')).replace('https://www.freelug.org/', 'https://freelug.org/'));
  await importAuthorPage(file, identity, site);
  const markdown = await readFile(path.join(site, '_authors', '2.md'), 'utf8');
  assert.equal(markdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1].trim(), '');
});

test('author relationships resolve renamed articles through historical IDs', async t => {
  const { file, site, identity } = await fixture(t);
  await rename(path.join(site, '_articles/themes/3.md'), path.join(site, '_articles/themes/recit.md'));
  const result = await importAuthorPage(file, identity, site);
  assert.equal(result.articles, 1);
  const text = await readFile(path.join(site, '_authors/2.md'), 'utf8');
  assert.deepEqual(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]).themes_articles, ['/articles/recit/']);
});

test('mismatched author identity or profile markup cannot publish a profile', async t => {
  const { file, site, archive, identity } = await fixture(t);
  await assert.rejects(importAuthorPage(file, { ...identity, id: 3 }, site), /matching source-backed public author/);
  await writeFile(file, archive.replaceAll('?auteur2', '?auteur3'));
  await assert.rejects(importAuthorPage(file, identity, site), /matching source-backed public author/);
  await writeFile(file, archive.replaceAll('?auteur2', '?article2'));
  await assert.rejects(importAuthorPage(file, identity, site), /public .* author source/);
  const encoded = archive.match(/Content-Transfer-Encoding: base64\n\n([^\n]+)/)[1];
  await writeFile(file, archive.replace(encoded, Buffer.from(Buffer.from(encoded, 'base64').toString()
    .replace('class="auteur_2"', 'class="auteur_3"')).toString('base64')));
  await assert.rejects(importAuthorPage(file, identity, site), /Incomplete saved author/);
  await assert.rejects(readFile(path.join(site, '_authors', '2.md')), /ENOENT/);
});

test('missing portraits, embedded content and unverified relationships prevent author publication', async t => {
  const { file, site, archive, identity } = await fixture(t);
  await writeFile(file, archive.replace('Content-Location: https://www.freelug.org/portrait.png', 'Content-Location: https://www.freelug.org/missing.png'));
  await assert.rejects(importAuthorPage(file, identity, site), /Media missing from the saved archive/);
  const embedded = await fixture(t, '<iframe src="https://example.test/"></iframe>');
  await assert.rejects(importAuthorPage(embedded.file, embedded.identity, embedded.site), /embedded content requiring editorial/);
  await writeFile(file, archive);
  await writeFile(path.join(site, '_articles', 'themes', '3.md'), '---\nsource_id: 99\n---\n');
  await assert.rejects(importAuthorPage(file, identity, site), /Unverified article relationship/);
  await assert.rejects(readFile(path.join(site, '_authors', '2.md')), /ENOENT/);
});
