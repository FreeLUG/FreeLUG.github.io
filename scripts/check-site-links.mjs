import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import domino from '@mixmark-io/domino';
import { parse } from 'yaml';
import { markdownFiles } from './article-collections.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const config = parse(await readFile(path.join(root, '_config.yml'), 'utf8'));
const socialLinks = parse(await readFile(path.join(root, '_data/social.yml'), 'utf8'));
const baseurl = (config.baseurl || '').replace(/\/$/, '');
const origin = new URL(config.url).origin;
const documents = new Map();
const fileStats = new Map();

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}

function targetPath(pathname) {
  assert.ok(pathname.startsWith(`${baseurl}/`), `Missing base path: ${pathname}`);
  const relative = decodeURIComponent(pathname.slice(baseurl.length));
  const file = path.resolve(output, '.' + relative, relative.endsWith('/') ? 'index.html' : '');
  assert.ok(!path.relative(output, file).startsWith('..'), `Path escapes site: ${pathname}`);
  return file;
}

for (const file of await filesIn(output)) {
  documents.set(file, domino.createWindow(await readFile(file, 'utf8')).document);
}
assert.ok(documents.size > 0, 'Build the site before running this check.');

let links = 0;
let fragments = 0;
for (const [file, document] of documents) {
  const relative = path.relative(output, file).split(path.sep).join('/');
  const pathname = relative.endsWith('index.html') ? relative.slice(0, -'index.html'.length) : relative;
  const currentUrl = new URL(`${baseurl}/${pathname}`, 'https://preview.invalid');
  const navigation = document.querySelector('.site-header nav');
  if (navigation) {
    const social = Array.from(navigation.querySelectorAll('.social-link'));
    assert.equal(social.length, socialLinks.length, `${relative}: missing social links`);
    for (const [index, item] of socialLinks.entries()) {
      const link = social[index];
      assert.equal(link.getAttribute('href'), item.url, `${relative}: wrong social account`);
      assert.equal(link.getAttribute('aria-label'), `FreeLUG sur ${item.name}`);
      assert.equal(link.getAttribute('title'), `FreeLUG sur ${item.name}`);
      const image = link.querySelector('img');
      assert.ok(image, `${relative}: missing social logo`);
      assert.equal(image.getAttribute('src'), `${baseurl}/media/social/${item.icon}.svg`);
      assert.equal(image.getAttribute('alt'), '');
    }
  }
  for (const node of Array.from(document.querySelectorAll('a[href], img[src], script[src], link[rel="stylesheet"][href]'))) {
    const raw = node.getAttribute(node.hasAttribute('src') ? 'src' : 'href');
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
    const url = new URL(raw, currentUrl);
    if (url.origin !== currentUrl.origin) continue;
    const target = targetPath(url.pathname);
    let status = fileStats.get(target);
    if (!status) {
      try { status = await stat(target); } catch { assert.fail(`${relative}: missing target ${raw}`); }
      fileStats.set(target, status);
    }
    assert.ok(status.isFile(), `${relative}: not a file: ${raw}`);
    const targetDocument = documents.get(target);
    if (url.hash && targetDocument) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      assert.ok(targetDocument.getElementById(fragment) || Array.from(targetDocument.querySelectorAll('a[name]')).some(anchor => anchor.getAttribute('name') === fragment),
        `${relative}: missing fragment ${raw}`);
      fragments++;
    }
    links++;
  }
}

const redirects = JSON.parse(await readFile(path.join(root, '_data/url-redirects.json'), 'utf8'));
const legacy = JSON.parse(await readFile(path.join(output, 'assets/legacy-urls.json'), 'utf8'));
const legacyScript = await readFile(path.join(output, 'assets/js/legacy.js'), 'utf8');
const spipPage = documents.get(targetPath(baseurl + '/spip.php/'));
assert.ok(spipPage, 'Missing static SPIP entry page');
assert.equal(spipPage.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
for (const [key, target] of Object.entries(legacy)) {
  assert.match(key, /^(article|rubrique|auteur)[1-9]\d*$/, `Invalid legacy key: ${key}`);
  assert.ok(documents.has(targetPath(baseurl + target)), `Unbuilt SPIP target: ${key}`);
  let replaced;
  await runInNewContext(legacyScript, {
    document: { currentScript: { dataset: { map: `${baseurl}/assets/legacy-urls.json` } }, querySelector: () => null },
    URLSearchParams,
    location: { pathname: `${baseurl}/spip.php`, search: `?${key}`, hash: '#notes', replace: value => { replaced = value; } },
    fetch: async () => ({ ok: true, json: async () => legacy }),
    console
  });
  assert.equal(replaced, `${baseurl}${target}#notes`, `SPIP redirect failed: ${key}`);
}
for (const [old, target] of Object.entries(redirects)) {
  const redirect = documents.get(targetPath(baseurl + old));
  assert.ok(redirect, `Missing old URL: ${old}`);
  assert.ok(documents.has(targetPath(baseurl + target)), `Missing redirect target: ${target}`);
  assert.equal(redirect.querySelector('link[rel="canonical"]').getAttribute('href'), origin + baseurl + target);
  assert.equal(redirect.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
  let replaced;
  runInNewContext(redirect.querySelector('script').textContent, {
    location: { search: '?view=full', hash: '#notes', replace: value => { replaced = value; } }
  });
  assert.equal(replaced, `${baseurl}${target}?view=full#notes`, `Redirect loses fragment or query: ${old}`);
  const key = old.match(/^\/(articles|rubriques)\/(\d+)\/$/);
  if (key) assert.equal(legacy[(key[1] === 'articles' ? 'article' : 'rubrique') + key[2]], target);
}

const sitemap = domino.createWindow(await readFile(path.join(output, 'sitemap.xml'), 'utf8')).document;
const urls = Array.from(sitemap.querySelectorAll('loc'), node => node.textContent.trim());
const canonicalUrls = new Set(urls);
assert.ok(!canonicalUrls.has(origin + baseurl + '/spip.php/'), 'SPIP entry page must not be indexed');
assert.equal(canonicalUrls.size, urls.length, 'Sitemap contains duplicate URLs.');
for (const url of urls) {
  assert.equal(new URL(url).origin, origin, `Wrong sitemap host: ${url}`);
  const target = new URL(url).pathname;
  assert.ok(documents.has(targetPath(target)), `Unbuilt sitemap URL: ${url}`);
  assert.ok(!redirects[target.slice(baseurl.length)], `Redirect included in sitemap: ${url}`);
}

let articles = 0;
for (const collection of ['_articles', '_sections', '_authors']) {
  for (const file of await markdownFiles(path.join(root, collection))) {
    const name = path.relative(path.join(root, collection), file).split(path.sep).join('/');
    const content = await readFile(file, 'utf8');
    const metadata = parse(content.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
    const url = origin + baseurl + metadata.permalink;
    assert.ok(canonicalUrls.has(url), `Missing sitemap entry: ${url}`);
    const document = documents.get(targetPath(baseurl + metadata.permalink));
    const kind = collection === '_articles' ? 'article' : collection === '_sections' ? 'rubrique' : 'auteur';
    if (metadata.source_id) assert.equal(legacy[kind + metadata.source_id], metadata.permalink, `Stale legacy map: ${name}`);
    assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), url);
    if (collection !== '_articles') continue;
    const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    assert.equal(schema['@type'], 'Article');
    assert.equal(schema.headline, metadata.title);
    assert.equal(schema.url, url);
    if (metadata.published_at) assert.equal(schema.datePublished, metadata.published_at);
    assert.deepEqual(schema.author.map(author => author.name), metadata.authors || []);
    articles++;
  }
}
for (const reportFile of ['article-url-mapping.json', 'section-url-mapping.json']) {
  const report = JSON.parse(await readFile(path.join(root, 'scripts/seo', reportFile), 'utf8'));
  for (const entry of report.entries) {
    if (entry.old_url !== entry.proposed_url) assert.ok(!documents.has(targetPath(baseurl + entry.old_url)), `Unpublished numeric URL still built: ${entry.old_url}`);
  }
}
console.log(JSON.stringify({ pages: documents.size, links, fragments, redirects: Object.keys(redirects).length, legacy: Object.keys(legacy).length, sitemap: urls.length, articles, failures: 0 }));