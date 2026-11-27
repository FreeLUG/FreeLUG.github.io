import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const config = parse(await readFile(path.join(root, '_config.yml'), 'utf8'));
const baseurl = (config.baseurl || '').replace(/\/$/, '');
const logo = `${baseurl}/media/freelug-logo.png`;
const documents = new Map();

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}

for (const file of await htmlFiles(output)) {
  documents.set(file, domino.createWindow(await readFile(file, 'utf8')).document);
}

let previews = 0;
let articleImages = 0;
let logoFallbacks = 0;
for (const [file, document] of documents) {
  for (const entry of Array.from(document.querySelectorAll('[data-entry]'))) {
    const link = entry.querySelector('h3 a');
    assert.ok(link, `${file}: missing article title link`);
    const url = new URL(link.getAttribute('href'), 'https://preview.invalid');
    assert.equal(url.origin, 'https://preview.invalid', `${file}: article must be local`);
    assert.ok(url.pathname.startsWith(`${baseurl}/`), `${file}: missing base path`);
    const target = path.resolve(output, '.' + decodeURIComponent(url.pathname.slice(baseurl.length)), 'index.html');
    assert.ok(path.relative(output, target).startsWith('..') === false, `${file}: article escapes output directory`);
    const article = documents.get(target);
    assert.ok(article, `${file}: article was not built: ${url.pathname}`);
    const image = article.querySelector('.article-body img');
    const expected = image ? image.getAttribute('src') : logo;
    const thumbnails = entry.querySelectorAll('img.archive-thumbnail');
    assert.equal(thumbnails.length, 1, `${url.pathname}: missing or duplicate thumbnail`);
    assert.equal(thumbnails[0].getAttribute('src'), expected, `${url.pathname}: thumbnail must use the first article image or logo`);
    assert.equal(thumbnails[0].getAttribute('alt'), '', `${url.pathname}: thumbnail duplicates the visible title`);
    assert.equal(thumbnails[0].getAttribute('loading'), 'lazy', `${url.pathname}: thumbnail must load on demand`);
    previews++;
    if (image) articleImages++;
    else logoFallbacks++;
  }
}

assert.ok(previews > 0, 'No article previews were built.');
assert.ok(articleImages > 0, 'No previews with article images were checked.');
assert.ok(logoFallbacks > 0, 'No logo fallbacks were checked.');
console.log(JSON.stringify({ previews, articleImages, logoFallbacks, failures: 0 }));
