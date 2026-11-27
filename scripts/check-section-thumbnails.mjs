import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const config = parse(await readFile(path.join(root, '_config.yml'), 'utf8'));
const baseurl = (config.baseurl || '').replace(/\/$/, '');
const sections = new Map();

for (const file of await readdir(path.join(root, '_sections'))) {
  if (!file.endsWith('.md')) continue;
  const text = await readFile(path.join(root, '_sections', file), 'utf8');
  const section = parse(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  sections.set(`${baseurl}${section.permalink}`, section);
  if (section.image) {
    assert.match(section.image, /^\/media\//, `${section.title}: thumbnail must be local`);
    await access(path.join(root, section.image));
    await access(path.join(output, section.image));
  }
}

let headings = 0;
let cards = 0;
let textOnly = 0;

function checkImage(container, section, lazy) {
  const images = container.querySelectorAll('img.section-thumbnail');
  assert.equal(images.length, section.image ? 1 : 0, `${section.title}: unexpected thumbnail count`);
  if (!section.image) {
    textOnly++;
    return;
  }
  const image = images[0];
  assert.equal(image.getAttribute('src'), `${baseurl}${section.image}`, `${section.title}: wrong thumbnail`);
  assert.equal(image.getAttribute('alt'), '', `${section.title}: image must not duplicate the visible title`);
  assert.equal(image.getAttribute('width'), '100');
  assert.equal(image.getAttribute('height'), '100');
  if (lazy) assert.equal(image.getAttribute('loading'), 'lazy', `${section.title}: card must load on demand`);
}

for (const [url, section] of [[`${baseurl}/`, null], ...sections]) {
  const file = path.join(output, url.slice(baseurl.length), 'index.html');
  const document = domino.createWindow(await readFile(file, 'utf8')).document;
  if (section) {
    const heading = document.querySelector('.page-heading');
    assert.ok(heading, `${url}: missing section heading`);
    checkImage(heading, section, false);
    if (section.image) headings++;
  }
  for (const card of Array.from(document.querySelectorAll('.category-grid .card'))) {
    const href = card.querySelector('h3 a')?.getAttribute('href');
    const child = sections.get(href);
    assert.ok(child, `${url}: card links to unknown section ${href}`);
    checkImage(card, child, true);
    if (child.image) cards++;
  }
}

assert.ok(headings > 0, 'No section heading thumbnails were checked');
assert.ok(cards > 0, 'No section card thumbnails were checked');
assert.ok(textOnly > 0, 'No sections without thumbnails were checked');
console.log(JSON.stringify({ headings, cards, textOnly, failures: 0 }));
