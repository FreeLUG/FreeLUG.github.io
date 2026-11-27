import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { chromeArchive, importEdgePage } from './import-edge-page.mjs';
import { importSectionThumbnail } from './import-section-thumbnail.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'freelug-edge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const page = path.join(directory, 'article123.html');
  const site = path.join(directory, 'site');
  await mkdir(path.join(site, '_sections'), { recursive: true });
  await mkdir(path.join(site, '_data'), { recursive: true });
  await mkdir(path.join(directory, 'article123_files'));
  await writeFile(path.join(site, '_sections', 'themes.md'), '---\ntitle: Thèmes\nsource_id: 17\npermalink: /themes/\n---\n');
  await writeFile(path.join(site, '_sections', '42.md'), '---\ntitle: Train\nsource_id: 42\npermalink: /themes/train/\nparent: /themes/\n---\n');
  await writeFile(path.join(site, '_data', 'legacy_urls.json'), '{"rubrique42":"/themes/train/"}');
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

const articleFile = (site, file = '123.md') => path.join(site, '_articles', 'themes', file);

test('individual Edge saves preserve editorial content, metadata and local displayed media', async t => {
  const { page, site, directory } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  const result = await importEdgePage(page, site);
  assert.equal(result.imagesAndFiles, 1);
  assert.deepEqual(result.originalMediaLinks, ['https://www.freelug.org/IMG/jpg/original.jpg']);
  const markdown = await readFile(articleFile(site), 'utf8');
  const [, metadata, body] = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const data = parse(metadata);
  assert.equal(data.section, '/themes/train/');
  assert.equal(data.published_at, '2020-03-04T12:00:00Z');
  assert.deepEqual(data.authors, ['Auteur']);
  assert.match(body, /Un train partagé\./);
  assert.match(body, /\[La rubrique\]\(\/themes\/train\/\)/);
  assert.match(body, /!\[Un train\]\(\/media\/archive\/[a-f0-9]{24}\.jpg\)/);
  assert.match(body, /La fin du récit\./);
  assert.doesNotMatch(body, /Do not import|<div|<img/);
  const [image] = await readdir(path.join(site, 'media', 'archive'));
  assert.equal(await readFile(path.join(site, 'media', 'archive', image), 'utf8'), 'fixture-image');
  const urls = JSON.parse(await readFile(path.join(site, '_data', 'legacy_urls.json'), 'utf8'));
  assert.equal(urls.article123, '/articles/123/');
  assert.equal(urls.rubrique42, '/themes/train/');
  await assert.rejects(importEdgePage(page, site), /refusing to overwrite/);
  assert.equal(await readFile(articleFile(site), 'utf8'), markdown);
});

test('missing or escaping saved media fails before publishing an incomplete article', async t => {
  const { page, site, html } = await fixture(t);
  await assert.rejects(importEdgePage(page, site), /ENOENT/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
  await writeFile(page, html.replace('./article123_files/train.jpg', '../private.jpg'));
  await assert.rejects(importEdgePage(page, site), /escapes the page directory/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
});

test('migrated sites import descriptive filenames and reject duplicates by historical ID', async t => {
  const { page, site, directory } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files/train.jpg'), 'fixture-image');
  await writeFile(path.join(site, '_data/url-redirects.json'), '{}');
  await rename(path.join(site, '_sections/42.md'), path.join(site, '_sections/themes-train.md'));
  await importEdgePage(page, site);
  const text = await readFile(articleFile(site, 'notre-train.md'), 'utf8');
  assert.equal(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]).permalink, '/articles/notre-train/');
  assert.match(text, /section: "\/themes\/train\/"/);
  await assert.rejects(importEdgePage(page, site), /refusing to overwrite/);
  await assert.rejects(readFile(articleFile(site, '123.md')), /ENOENT/);
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
  const markdown = await readFile(articleFile(site), 'utf8');
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
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
});

test('a stale browser save cannot be mistaken for the requested article', async t => {
  const { page, site, html } = await fixture(t);
  await writeFile(page, html.replace('?article123 -->', '?article122 -->'));
  await assert.rejects(importEdgePage(page, site), /article 122, not expected article 123/);
  await assert.rejects(readFile(articleFile(site, '122.md')), /ENOENT/);
});

test('section captures require explicit opt-in and cannot enter the article importer', () => {
  const source = 'https://www.freelug.org/spip.php?rubrique25';
  const html = '<h1>Alsace</h1>';
  const saved = `From: <Saved by Blink>\nSnapshot-Content-Location: ${source}\nContent-Type: multipart/related; boundary="section-test"\n\n--section-test\nContent-Type: text/html\nContent-Location: ${source}\nContent-Transfer-Encoding: base64\n\n${Buffer.from(html).toString('base64')}\n--section-test--\n`;
  assert.equal(chromeArchive(saved, 'section').html.trim(), html);
  assert.throws(() => chromeArchive(saved), /public .* article source/);
  assert.throws(() => chromeArchive(saved.replaceAll('www.freelug.org', 'adherents.freelug.org'), 'section'), /public .* section source/);
});

test('regional section thumbnails import bundled originals without changing content or overriding editorial images', async t => {
  const { directory, site } = await fixture(t);
  const source = 'https://www.freelug.org/spip.php?rubrique25';
  const image = 'https://www.freelug.org/local/cache-vignettes/L50xH97/rubon25-51739.png?123';
  const html = `<div id="content"><header class="cartouche"><h1><img class="spip_logo" src="${image}">Alsace</h1></header></div>`;
  const archive = `From: <Saved by Blink>\nSnapshot-Content-Location: ${source}\nContent-Type: multipart/related; boundary="region-test"\n\n--region-test\nContent-Type: text/html\nContent-Location: ${source}\nContent-Transfer-Encoding: base64\n\n${Buffer.from(html).toString('base64')}\n--region-test\nContent-Type: image/png\nContent-Location: ${image}\nContent-Transfer-Encoding: base64\n\n${Buffer.from('region-image').toString('base64')}\n--region-test--\n`;
  const section = path.join(site, '_sections/regions-alsace.md');
  const body = '\nActivités en Alsace.\n';
  await writeFile(section, `---\ntitle: Alsace\nsource_id: 25\npermalink: /regions/alsace/\nparent: /regions/\n---\n${body}`);
  const file = path.join(directory, 'rubrique25.mhtml');
  await writeFile(file, archive.replace('Content-Location: ' + image, 'Content-Location: ' + image + '-missing'));
  await assert.rejects(importSectionThumbnail(file, site), /missing from the archive/);
  await writeFile(file, archive);
  const result = await importSectionThumbnail(file, site);
  assert.equal(result.image, '/media/regions/rubon25-51739.png');
  const text = await readFile(section, 'utf8');
  assert.equal(text.split('\n---\n')[1], body);
  assert.equal(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]).image_source, image);
  assert.equal(await readFile(path.join(site, 'media/regions/rubon25-51739.png'), 'utf8'), 'region-image');
  await importSectionThumbnail(file, site);
  await writeFile(section, text.replace('/media/regions/rubon25-51739.png', '/media/editorial.png'));
  await assert.rejects(importSectionThumbnail(file, site), /refusing to replace/);
});

test('native public media becomes editable source links without player controls', async t => {
  const { page, site, directory, html } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  await writeFile(page, html.replace('La fin du récit.', `La fin du récit.
    <figure><div class="mejs__container"><div class="mejs__mediaelement">
    <video src="https://www.freelug.org/IMG/mp4/train.mp4">
    <source src="https://www.freelug.org/IMG/mp4/train.mp4" type="video/mp4">
    <img src="./article123_files/player-icon.svg" alt="Impossible de lire la video">
    </video></div><div style="background:black"><svg><title>Player control</title></svg></div></div>
    <figcaption>Le train en mouvement.</figcaption></figure>
    <audio><source src="/IMG/mp3/train.mp3" type="audio/mpeg"></audio>`));
  const result = await importEdgePage(page, site);
  assert.deepEqual(result.originalMediaLinks, [
    'https://www.freelug.org/IMG/jpg/original.jpg',
    'https://www.freelug.org/IMG/mp4/train.mp4',
    'https://www.freelug.org/IMG/mp3/train.mp3'
  ]);
  const markdown = await readFile(articleFile(site), 'utf8');
  assert.equal(markdown.match(/train\.mp4/g)?.length, 1);
  assert.match(markdown, /\[Vidéo de la publication d’origine\]\(https:\/\/www\.freelug\.org\/IMG\/mp4\/train\.mp4\)/);
  assert.match(markdown, /\[Audio de la publication d’origine\]\(https:\/\/www\.freelug\.org\/IMG\/mp3\/train\.mp3\)/);
  assert.match(markdown, /Le train en mouvement\./);
  assert.doesNotMatch(markdown, /Player control|Impossible de lire|<video|<audio|<svg/);
});

test('media without verified public source URLs remains unpublished', async t => {
  const { page, site, html } = await fixture(t);
  for (const media of [
    '<video></video>',
    '<video src="https://adherents.freelug.org/IMG/video.mp4"></video>',
    '<video src="https://example.org/IMG/video.mp4"></video>',
    '<video src="javascript:alert(1)"></video>',
    '<div class="mejs__container"><video src="/IMG/a.mp4"></video><video src="/IMG/b.mp4"></video></div>'
  ]) {
    await writeFile(page, html.replace('La fin du récit.', media));
    await assert.rejects(importEdgePage(page, site), /media without a source URL|media requiring editorial migration|ambiguous media player/);
    await assert.rejects(readFile(articleFile(site)), /ENOENT/);
  }
});

test('the explicitly recorded historical Theora video remains an exact Markdown link without fetching its source', async t => {
  const { page, site, directory, html } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  const url = 'http://brickerik.free.fr/autre/muji_perforeuse.ogg';
  for (const raw of [url + '?extra=1', url.replace('free.fr', 'free.fr.evil.test'), url.replace('/autre/', '/other/')]) {
    await writeFile(page, html.replace('La fin du récit.', `<video src="${raw}">Player fallback</video>`));
    await assert.rejects(importEdgePage(page, site), /media requiring editorial migration/);
  }
  await writeFile(page, html.replace('La fin du récit.', `<p>Avant.</p><video src="${url}">Player fallback</video><p>Après.</p>`));
  const result = await importEdgePage(page, site);
  assert.ok(result.originalMediaLinks.includes(url));
  const markdown = await readFile(articleFile(site), 'utf8');
  assert.match(markdown, /\[Vidéo de la publication d’origine\]\(http:\/\/brickerik\.free\.fr\/autre\/muji_perforeuse\.ogg\)/);
  assert.match(markdown, /Avant\./);
  assert.match(markdown, /Après\./);
  assert.doesNotMatch(markdown, /Player fallback|<video/);
});

test('pages saved from the excluded membership portal cannot be imported', async t => {
  const { page, site, html } = await fixture(t);
  await writeFile(page, html.replace('https://www.freelug.org/spip.php?article123 -->', 'https://adherents.freelug.org/adherer/FreeLUG -->'));
  await assert.rejects(importEdgePage(page, site), /other hosts and redirects are out of scope/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
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
  const markdown = await readFile(articleFile(site), 'utf8');
  assert.match(markdown, /Un train partagé\./);
  assert.match(markdown, /La fin du récit\./);
  assert.match(markdown, /!\[Un train\]\(\/media\/archive\/[a-f0-9]{24}\.jpg\)/);
  const [image] = await readdir(path.join(site, 'media', 'archive'));
  assert.equal(await readFile(path.join(site, 'media', 'archive', image), 'utf8'), 'fixture-image');
  await writeFile(file, archive.replace('Snapshot-Content-Location: https://www.freelug.org/spip.php?article123', 'Snapshot-Content-Location: https://adherents.freelug.org/'));
  await assert.rejects(importEdgePage(file, site), /public https:\/\/www\.freelug\.org/);
});

test('public author archives require explicit opt-in and cannot enter the article importer', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  const authorArchive = archive.replaceAll('?article123', '?auteur2');
  const captured = chromeArchive(authorArchive, 'author');
  assert.equal(captured.sourceUrl, 'https://www.freelug.org/spip.php?auteur2');
  assert.match(captured.html, /Notre train/);
  assert.equal(captured.resources.get('https://www.freelug.org/local/train.jpg').bytes.toString(), 'fixture-image');
  assert.throws(() => chromeArchive(authorArchive), /public https:\/\/www\.freelug\.org article source/);
  await writeFile(file, authorArchive);
  await assert.rejects(importEdgePage(file, site), /public https:\/\/www\.freelug\.org article source/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
});

test('author archive opt-in rejects unrelated sources and incomplete source provenance', async t => {
  const { archive } = await singleFileFixture(t);
  const authorArchive = archive.replaceAll('?article123', '?auteur2');
  for (const url of [
    'https://www.freelug.org/spip.php?article123',
    'https://www.freelug.org/spip.php?auteur0',
    'https://www.freelug.org/spip.php?auteur02',
    'https://www.freelug.org/spip.php?auteur2&extra=1',
    'https://www.freelug.org/spip.php?page=login',
    'https://adherents.freelug.org/spip.php?auteur2',
    'https://www.freelug.org.evil.test/spip.php?auteur2',
    'http://www.freelug.org/spip.php?auteur2'
  ]) {
    assert.throws(() => chromeArchive(authorArchive.replace(
      'Snapshot-Content-Location: https://www.freelug.org/spip.php?auteur2',
      `Snapshot-Content-Location: ${url}`), 'author'), /public https:\/\/www\.freelug\.org author source/);
  }
  assert.throws(() => chromeArchive(authorArchive.replace(
    '\r\nContent-Location: https://www.freelug.org/spip.php?auteur2\r\n',
    '\r\nContent-Location: https://www.freelug.org/spip.php?auteur1\r\n'), 'author'), /saved author is missing/);
  assert.throws(() => chromeArchive(authorArchive, 'other'), /Unsupported public archive page kind/);
});

test('large Base64 resources decode without stack overflow and malformed encodings remain blocked', async t => {
  const { archive } = await singleFileFixture(t);
  const original = Buffer.from('fixture-image').toString('base64');
  const bytes = Buffer.alloc(8 * 1024 * 1024, 0xab);
  const encoded = bytes.toString('base64');
  const captured = chromeArchive(archive.replace(original, encoded));
  assert.deepEqual(captured.resources.get('https://www.freelug.org/local/train.jpg').bytes, bytes);
  for (const invalid of ['A', 'AA=', 'A===', '=AAA', 'AA=A', 'AAA!', encoded.slice(0, -4) + 'AA=A']) {
    assert.throws(() => chromeArchive(archive.replace(original, invalid)), /Invalid base64 archive resource/);
  }
  for (const valid of ['AA==', 'AAA=', 'AAAA', '']) {
    assert.deepEqual(chromeArchive(archive.replace(original, valid)).resources.get(
      'https://www.freelug.org/local/train.jpg').bytes, Buffer.from(valid, 'base64'));
  }
});

test('incomplete single-file archives or missing bundled images cannot be published', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  await writeFile(file, archive.replace('--test-boundary--\r\n', ''));
  await assert.rejects(importEdgePage(file, site), /Incomplete Chrome single-file archive/);
  await writeFile(file, archive.replace('Content-Location: https://www.freelug.org/local/train.jpg', 'Content-Location: https://www.freelug.org/local/different.jpg'));
  await assert.rejects(importEdgePage(file, site), /Media missing from the saved archive/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
});

test('archived document CSS thumbnails become bundled Markdown images without dropping the attachment', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  const thumbnail = 'local/cache-vignettes/L300xH226/Knob-39491.jpg?1794587955';
  const edited = archive.replace('</article>', `<aside class=3D"documents"><a
    href=3D"https://www.freelug.org/IMG/pdf/Transmission_mono.pdf"><span
    class=3D"logo-img-wrapper spip_logo spip_logos"><span class=3D"img"
    style=3D"display:block;position:relative;height:0;width:100%;padding-bottom:75.33%;overflow:hidden;background:url(${thumbnail}) no-repeat center;background-size:100%;"> </span></span>transmission mono directive</a></aside></article>`);
  await writeFile(file, edited);
  await assert.rejects(importEdgePage(file, site), /Media missing from the saved archive/);
  await assert.rejects(readFile(articleFile(site)), /ENOENT/);
  const resource = `--test-boundary\r\nContent-Type: image/jpeg\r\nContent-Location: https://www.freelug.org/${thumbnail}\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('thumbnail').toString('base64')}\r\n`;
  await writeFile(file, edited.replace('--test-boundary--\r\n', resource + '--test-boundary--\r\n'));
  const result = await importEdgePage(file, site);
  assert.equal(result.imagesAndFiles, 2);
  const markdown = await readFile(articleFile(site), 'utf8');
  assert.match(markdown, /!\[\]\(\/media\/archive\/[a-f0-9]{24}\.jpg\)/);
  assert.match(markdown, /transmission mono directive\]\(https:\/\/www\.freelug\.org\/IMG\/pdf\/Transmission_mono\.pdf\)/);
  assert.doesNotMatch(markdown, /background:|<span/);
});

function archiveWithFrame(archive, location) {
  const frame = `--test-boundary\r\nContent-Type: text/html\r\nContent-ID: <video-frame>\r\n${
    location ? `Content-Location: ${location}\r\n` : ''
  }Content-Transfer-Encoding: base64\r\n\r\n${Buffer.from('<html><body></body></html>').toString('base64')}\r\n`;
  return archive.replace('La fin du r=c3=a9cit.', `Avant le lecteur.<iframe src=3D"cid:video-frame"></iframe><p>La fin du r=c3=a9cit.</p>`)
    .replace('--test-boundary--\r\n', frame + '--test-boundary--\r\n');
}

test('archived YouTube iframe provenance becomes a Markdown link while captions remain', async t => {
  for (const video of [
    'https://www.youtube.com/embed/e1iTxVdjk8k',
    'https://www.youtube.com/embed/ao9KO8sisGE?list=UUVl1h9UPBYDfjDrtkFBY0kQ'
  ]) {
    const { file, site, archive } = await singleFileFixture(t);
    await writeFile(file, archiveWithFrame(archive, video));
    const result = await importEdgePage(file, site);
    assert.ok(result.originalMediaLinks.includes(video));
    const markdown = await readFile(articleFile(site), 'utf8');
    assert.match(markdown, /Avant le lecteur\./);
    assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${video})`));
    assert.match(markdown, /La fin du récit\./);
    assert.doesNotMatch(markdown, /<iframe|cid:video-frame/);
  }
});

test('iframes without verified supported archive provenance remain unpublished', async t => {
  const { file, site, archive } = await singleFileFixture(t);
  for (const location of [
    undefined,
    'https://www.youtube.com.example.org/embed/e1iTxVdjk8k',
    'https://adherents.freelug.org/embed/e1iTxVdjk8k',
    'https://www.youtube.com/embed/not-a-video-id',
    'https://www.youtube.com/embed/ao9KO8sisGE?list=invalid',
    'https://www.youtube.com/embed/ao9KO8sisGE?list=UUVl1h9UPBYDfjDrtkFBY0kQ&redirect=example.org'
  ]) {
    await writeFile(file, archiveWithFrame(archive, location));
    await assert.rejects(importEdgePage(file, site), /embedded content requiring editorial migration/);
    await assert.rejects(readFile(articleFile(site)), /ENOENT/);
  }
});

test('known legacy Flash players preserve exact source links and surrounding text', async t => {
  const { page, site, directory, html } = await fixture(t);
  await writeFile(path.join(directory, 'article123_files', 'train.jpg'), 'fixture-image');
  const youtube = 'http://www.youtube.com/v/91HYV2iPpk8&hl=fr_FR&fs=1';
  const youtubeQuery = 'http://www.youtube.com/v/kYN0ua-SQGo?fs=1&hl=fr_FR';
  const youtubeEmbedOnly = 'http://www.youtube.com/v/ymmevWsavZ4&hl=fr_FR&fs=1&';
  const youtubeFrench = 'http://www.youtube.com/v/q1SoIk6BGSE&hl=fr&fs=1';
  const youtubeFrenchQuery = 'http://www.youtube.com/v/Fwy79krvjiM?hl=fr&fs=1';
  const youtubeVersion3 = 'https://www.youtube.com/v/PH2EDUXljYM?version=3&hl=fr_FR';
  const youtubeHttpVersion3 = 'http://www.youtube.com/v/bA0gXISnxoI?version=3&hl=fr_FR';
  const dailymotion = 'http://www.dailymotion.com/swf/x9v6jt_la-taverne-intergalactique_creation&colors=background:DEDEDE;&related=1';
  const video = 'http://videos.freelug.org/uploads/KnLbaymbqAiJJkIJUbDL.flv';
  await writeFile(page, html.replace('La fin du récit.', `Avant les vidéos.
    <object><param name="movie" value="${youtube}"><param name="allowFullScreen" value="true">
    <embed src="${youtube}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${youtubeQuery.replaceAll('&', '&amp;')}">
    <embed src="${youtubeQuery.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><embed src="${youtubeEmbedOnly.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${youtubeFrench.replaceAll('&', '&amp;')}">
    <embed src="${youtubeFrench.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${youtubeFrenchQuery.replaceAll('&', '&amp;')}">
    <embed src="${youtubeFrenchQuery.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${youtubeVersion3.replaceAll('&', '&amp;')}">
    <embed src="${youtubeVersion3.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${youtubeHttpVersion3.replaceAll('&', '&amp;')}">
    <embed src="${youtubeHttpVersion3.replaceAll('&', '&amp;')}" type="application/x-shockwave-flash"></object>
    <object><param name="movie" value="${dailymotion}">
    <embed src="${dailymotion}" type="application/x-shockwave-flash"></object>
    <p>Une légende.</p><embed src="http://videos.freelug.org/flvplayer.swf"
    flashvars="file=${video}&amp;autostart=false"><p>La fin du récit.</p>`));
  const result = await importEdgePage(page, site);
  assert.ok(result.originalMediaLinks.includes(youtube));
  assert.ok(result.originalMediaLinks.includes(youtubeQuery));
  assert.ok(result.originalMediaLinks.includes(youtubeEmbedOnly));
  assert.ok(result.originalMediaLinks.includes(youtubeFrench));
  assert.ok(result.originalMediaLinks.includes(youtubeFrenchQuery));
  assert.ok(result.originalMediaLinks.includes(youtubeVersion3));
  assert.ok(result.originalMediaLinks.includes(youtubeHttpVersion3));
  assert.ok(result.originalMediaLinks.includes(dailymotion));
  assert.ok(result.originalMediaLinks.includes(video));
  const markdown = await readFile(articleFile(site), 'utf8');
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtube})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeQuery})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeEmbedOnly})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeFrench})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeFrenchQuery})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeVersion3})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${youtubeHttpVersion3})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${dailymotion})`));
  assert.ok(markdown.includes(`[Vidéo de la publication d’origine](${video})`));
  assert.match(markdown, /Avant les vidéos\./);
  assert.match(markdown, /Une légende\./);
  assert.match(markdown, /La fin du récit\./);
  assert.doesNotMatch(markdown, /<object|<embed|flvplayer\.swf|autostart/);
});

test('ambiguous or unsupported Flash players cannot publish incomplete content', async t => {
  const { page, site, html } = await fixture(t);
  const youtube = 'http://www.youtube.com/v/91HYV2iPpk8&hl=fr_FR&fs=1';
  const youtubeQuery = 'http://www.youtube.com/v/kYN0ua-SQGo?fs=1&hl=fr_FR&redirect=example.org';
  const youtubeVersion3 = 'https://www.youtube.com/v/PH2EDUXljYM?version=3&hl=fr_FR';
  const dailymotion = 'http://www.dailymotion.com/swf/x9v6jt_la-taverne-intergalactique_creation&colors=background:DEDEDE;&related=1';
  const video = 'http://videos.freelug.org/uploads/KnLbaymbqAiJJkIJUbDL.flv';
  for (const player of [
    '<object><param name="movie" value="http://www.youtube.com/v/bA0gXISnxoI?version=3&hl=fr_FR&redirect=example.org"><embed src="http://www.youtube.com/v/bA0gXISnxoI?version=3&hl=fr_FR&redirect=example.org" type="application/x-shockwave-flash"></object>',
    '<object><param name="movie" value="http://www.youtube.com.example.org/v/bA0gXISnxoI?version=3&hl=fr_FR"><embed src="http://www.youtube.com.example.org/v/bA0gXISnxoI?version=3&hl=fr_FR" type="application/x-shockwave-flash"></object>',
    `<object><param name="movie" value="${youtubeVersion3}&redirect=example.org"><embed src="${youtubeVersion3}&redirect=example.org" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${youtubeVersion3.replace('www.youtube.com', 'www.youtube.com.example.org')}"><embed src="${youtubeVersion3.replace('www.youtube.com', 'www.youtube.com.example.org')}" type="application/x-shockwave-flash"></object>`,
    '<object><param name="movie" value="http://www.youtube.com/v/Fwy79krvjiM?hl=fr&fs=1&redirect=example.org"><embed src="http://www.youtube.com/v/Fwy79krvjiM?hl=fr&fs=1&redirect=example.org" type="application/x-shockwave-flash"></object>',
    `<object data="https://example.org/other"><embed src="${youtube}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="other" value="unknown"><embed src="${youtube}" type="application/x-shockwave-flash"></object>`,
    `<object><embed src="${youtube}" type="application/x-shockwave-flash"><embed src="${youtube}" type="application/x-shockwave-flash"></object>`,
    `<object><embed src="${youtube}" type="application/x-shockwave-flash"><p>Editorial fallback</p></object>`,
    `<object><embed src="${youtubeQuery}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${youtubeQuery}"><embed src="${youtubeQuery}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${dailymotion}"><embed src="${dailymotion.replace('x9v6jt', 'x12345')}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${dailymotion.replace('www.dailymotion.com', 'www.dailymotion.com.example.org')}"><embed src="${dailymotion.replace('www.dailymotion.com', 'www.dailymotion.com.example.org')}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${dailymotion}&redirect=example.org"><embed src="${dailymotion}&redirect=example.org" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${youtube}"><embed src="${youtube.replace('91HYV2iPpk8', 'tZsrcXokSS8')}" type="application/x-shockwave-flash"></object>`,
    `<object><param name="movie" value="${youtube}"><embed src="${youtube}" type="application/x-shockwave-flash"><p>Editorial fallback</p></object>`,
    `<object><param name="movie" value="${youtube.replace('www.youtube.com', 'www.youtube.com.example.org')}"><embed src="${youtube}" type="application/x-shockwave-flash"></object>`,
    `<embed src="http://videos.freelug.org/flvplayer.swf" flashvars="file=${video}&amp;file=${video}">`,
    '<embed src="http://videos.freelug.org/flvplayer.swf" flashvars="file=https://adherents.freelug.org/video.flv">',
    '<embed src="http://videos.freelug.org/flvplayer.swf" flashvars="file=javascript:alert(1)">',
    `<embed src="http://videos.freelug.org.example.org/flvplayer.swf" flashvars="file=${video}">`
  ]) {
    await writeFile(page, html.replace('La fin du récit.', player));
    await assert.rejects(importEdgePage(page, site), /embedded content requiring editorial migration/);
    await assert.rejects(readFile(articleFile(site)), /ENOENT/);
  }
});
