import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { importEdgePage } from './import-edge-page.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'freelug-edge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const page = path.join(directory, 'article123.html');
  const site = path.join(directory, 'site');
  await mkdir(path.join(site, '_sections'), { recursive: true });
  await mkdir(path.join(site, '_data'), { recursive: true });
  await mkdir(path.join(directory, 'article123_files'));
  await writeFile(path.join(site, '_sections', '42.md'), '---\ntitle: Train\n---\n');
  await writeFile(path.join(site, '_data', 'legacy_urls.json'), '{"rubrique42":"/rubriques/42/"}');
  const html = `<!-- saved from url=(0043)https://www.freelug.org/spip.php?article123 -->
    <nav>Do not import navigation</nav><div id="content"><div class="inner">
    <article class="article_123"><header class="cartouche"><h1>Notre train</h1>
    <time datetime="2020-03-04T12:00:00Z">4 mars 2020</time><span class="author">Auteur</span>
    <span class="category"><a href="https://www.freelug.org/spip.php?rubrique42">Train</a></span></header>
    <div class="main"><div class="chapo"><p>Un train partagé.</p></div><div class="texte">
    <p><a href="https://www.freelug.org/spip.php?rubrique42">La rubrique</a></p>
    <a href="https://www.freelug.org/IMG/jpg/original.jpg"><img src="./article123_files/train.jpg" alt="Un train"></a>
    <p>La fin du récit.</p></div></div></article></div></div><aside>Do not import sidebar</aside>`;
  await writeFile(page, html);
  return { page, site, directory, html };
}

test('individual Edge saves preserve editorial content, metadata and local displayed media', async t => {
  const { page, site, directory } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  const result = await importEdgePage(page, site);
  assert.equal(result.imagesAndFiles, 1);
  assert.deepEqual(result.originalMediaLinks, ['https://www.freelug.org/IMG/jpg/original.jpg']);
  const markdown = await readFile(path.join(site, '_articles', '123.md'), 'utf8');
  const [, metadata, body] = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const data = parse(metadata);
  assert.equal(data.section, '/rubriques/42/');
  assert.equal(data.published_at, '2020-03-04T12:00:00Z');
  assert.deepEqual(data.authors, ['Auteur']);
  assert.match(body, /Un train partagé\./);
  assert.match(body, /\[La rubrique\]\(\/rubriques\/42\/\)/);
  assert.match(body, /!\[Un train\]\(\/media\/archive\/[a-f0-9]{24}\.jpg\)/);
  assert.match(body, /La fin du récit\./);
  assert.doesNotMatch(body, /Do not import|<div|<img/);
  const [image] = await readdir(path.join(site, 'media', 'archive'));
  assert.equal(await readFile(path.join(site, 'media', 'archive', image), 'utf8'), 'fixture-image');
  const urls = JSON.parse(await readFile(path.join(site, '_data', 'legacy_urls.json'), 'utf8'));
  assert.equal(urls.article123, '/articles/123/');
  assert.equal(urls.rubrique42, '/rubriques/42/');
  await assert.rejects(importEdgePage(page, site), /refusing to overwrite/);
  assert.equal(await readFile(path.join(site, '_articles', '123.md'), 'utf8'), markdown);
});

test('missing or escaping saved media fails before publishing an incomplete article', async t => {
  const { page, site, html } = await fixture(t);
  await assert.rejects(importEdgePage(page, site), /ENOENT/);
  await assert.rejects(readFile(path.join(site, '_articles', '123.md')), /ENOENT/);
  await writeFile(page, html.replace('./article123_files/train.jpg', '../private.jpg'));
  await assert.rejects(importEdgePage(page, site), /escapes the page directory/);
  await assert.rejects(readFile(path.join(site, '_articles', '123.md')), /ENOENT/);
});

test('editorial footer notes and attached documents are preserved without comments or sidebar content', async t => {
  const { page, site, directory, html } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  await writeFile(path.join(directory, 'article123_files', 'guide.pdf'), '%PDF-fixture');
  await writeFile(page, html.replace('La fin du récit.', `La fin du récit.<span class="spip_note_ref">[<a
    href="https://www.freelug.org/spip.php?article123#nb1">1</a>]</span>`)
    .replace('</article>', `<footer><p>Do not import footer metadata</p><div class="notes"><div id="nb1">
    <p><span class="spip_note_ref">[<a class="spip_note" href="https://www.freelug.org/spip.php?article123#nh1">1</a>]</span>
    Une précision.</p></div></div></footer><aside><p>Do not import sidebar content</p>
    <div class="documents"><p><a href="./article123_files/guide.pdf"><span class="spip_document_icone">
    <span class="img" style="background:url(pdf.svg)"></span></span>Le guide<span class="read-more hide">
    <svg><title>Download decoration</title></svg></span></a></p>
    <span class="icon i-icon"><svg><use href="icons.svg#calendar"></use></svg></span></div></aside>
    <section id="comments">Do not import comments</section></article>`));
  const result = await importEdgePage(page, site);
  assert.equal(result.imagesAndFiles, 2);
  const markdown = await readFile(path.join(site, '_articles', '123.md'), 'utf8');
  assert.match(markdown, /La fin du récit\.\[\^1\]/);
  assert.match(markdown, /\[\^1\]: Une précision\./);
  assert.match(markdown, /\[Le guide\]\(\/media\/archive\/[a-f0-9]{24}\.pdf\)/);
  assert.doesNotMatch(markdown, /Do not import|Download decoration|<footer|<aside|<div/);
});

test('missing media in an attached document block prevents publication', async t => {
  const { page, site, directory, html } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  await writeFile(page, html.replace('</article>', `<aside class="documents">
    <img src="./article123_files/missing.png" alt="Un document"></aside></article>`));
  await assert.rejects(importEdgePage(page, site), /ENOENT/);
  await assert.rejects(readFile(path.join(site, '_articles', '123.md')), /ENOENT/);
});

test('a stale browser save cannot be mistaken for the requested article', async t => {
  const { page, site, html } = await fixture(t);
  await writeFile(page, html.replace('?article123 -->', '?article122 -->'));
  await assert.rejects(importEdgePage(page, site), /article 122, not expected article 123/);
  await assert.rejects(readFile(path.join(site, '_articles', '122.md')), /ENOENT/);
});

test('pages saved from the excluded membership portal cannot be imported', async t => {
  const { page, site, html } = await fixture(t);
  await writeFile(page, html.replace('https://www.freelug.org/spip.php?article123 -->', 'https://adherents.freelug.org/adherer/FreeLUG -->'));
  await assert.rejects(importEdgePage(page, site), /other hosts and redirects are out of scope/);
  await assert.rejects(readFile(path.join(site, '_articles', '123.md')), /ENOENT/);
});

async function singleFileFixture(t) {
  const { directory, site, html } = await fixture(t);
  const file = path.join(directory, 'article123.mhtml');
  const content = html.replace('./article123_files/train.jpg', 'https://www.freelug.org/local/train.jpg');
  const encoded = Buffer.from(content).toString('latin1').replace(/[^\x20-\x3c\x3e-\x7e\r\n]/g,
    char => '=' + char.charCodeAt(0).toString(16).padStart(2, '0'));
  const archive = `From: <Saved by Blink>\r\nSnapshot-Content-Location: https://www.freelug.org/spip.php?article123\r\nContent-Type: multipart/related;\r\n boundary="test-boundary"\r\n\r\n--test-boundary\r\nContent-Type: text/html\r\nContent-Location: https://www.freelug.org/spip.php?article123\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${encoded}\r\n--test-boundary\r\nContent-Type: image/jpeg\r\nContent-Location: https://www.freelug.org/local/train.jpg\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('fixture-image').toString('base64')}\r\n--test-boundary--\r\n`;
  await writeFile(file, archive);
  return { file, site, archive };
}

test('Chrome single-file saves preserve UTF-8 editorial text and bundled binary media', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  const result = await importEdgePage(file, site);
  assert.equal(result.imagesAndFiles, 1);
  const markdown = await readFile(path.join(site, '_articles', '123.md'), 'utf8');
  assert.match(markdown, /Un train partagé\./);
  assert.match(markdown, /La fin du récit\./);
  assert.match(markdown, /!\[Un train\]\(\/media\/archive\/[a-f0-9]{24}\.jpg\)/);
  const [image] = await readdir(path.join(site, 'media', 'archive'));
  assert.equal(await readFile(path.join(site, 'media', 'archive', image), 'utf8'), 'fixture-image');
  await writeFile(file, archive.replace('Snapshot-Content-Location: https://www.freelug.org/spip.php?article123', 'Snapshot-Content-Location: https://adherents.freelug.org/'));
  await assert.rejects(importEdgePage(file, site), /public https:\/\/www\.freelug\.org/);
});

test('incomplete single-file archives or missing bundled images cannot be published', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  await writeFile(file, archive.replace('--test-boundary--\r\n', ''));
  await assert.rejects(importEdgePage(file, site), /Incomplete Chrome single-file archive/);
  await writeFile(file, archive.replace('Content-Location: https://www.freelug.org/local/train.jpg', 'Content-Location: https://www.freelug.org/local/different.jpg'));
  await assert.rejects(importEdgePage(file, site), /Media missing from the saved archive/);
  await assert.rejects(readFile(path.join(site, '_articles', '123.md')), /ENOENT/);
});
