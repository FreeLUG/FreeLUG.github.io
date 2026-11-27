import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import { parse } from 'yaml';
import { archiveMedia, chromeArchive } from './import-edge-page.mjs';
import { toMarkdown } from './markdown.mjs';
import { historicalContent } from './historical-content.mjs';
import { articleCollectionForSection } from './article-collections.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function importAuthorPage(file, identity, destination = root) {
  const archive = chromeArchive(await readFile(file, 'utf8'), 'author');
  const id = Number(archive.sourceUrl.match(/\?auteur([1-9]\d*)$/)[1]);
  if (path.basename(file) !== `auteur${id}.mhtml` || identity?.id !== id ||
      identity.source_url !== archive.sourceUrl || !Array.isArray(identity.names) ||
      !identity.names.length || !identity.names.every(name => typeof name === 'string' && name.trim()) ||
      !Array.isArray(identity.articles) || !identity.articles.every(id => Number.isSafeInteger(id) && id > 0 && id !== 18)) {
    throw new Error('Expected the matching source-backed public author inventory entry and archive filename.');
  }
  const target = path.join(destination, '_authors', `${id}.md`);
  try {
    await access(target);
    throw new Error(`Author ${id} already exists; refusing to overwrite editorial content.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const document = domino.createWindow(archive.html).document;
  const profile = document.querySelector(`#content > .inner > section.auteur_${id} > .vcard`);
  const heading = profile?.querySelector('.cartouche h1');
  const main = profile?.querySelector('.main');
  const title = heading?.textContent.trim();
  if (!main || !title) throw new Error(`Incomplete saved author ${id}.`);
  const editorial = main.cloneNode(true);
  if (editorial.querySelector('iframe, object, embed, video, audio, source, svg, script, style, form, [style*="background"]')) {
    throw new Error(`Author ${id} contains embedded content requiring editorial migration.`);
  }
  const assets = new Map();
  const localImage = raw => {
    const asset = archiveMedia(archive, raw);
    if (!asset.type?.startsWith('image/')) throw new Error(`Author ${id} has a non-image resource: ${raw}`);
    assets.set(asset.name, asset.bytes);
    return asset.url;
  };
  const portraits = Array.from(heading.querySelectorAll('img'));
  if (portraits.length > 1) throw new Error(`Ambiguous portrait for author ${id}.`);
  const image = portraits.length ? localImage(portraits[0].getAttribute('src')) : '';
  for (const node of Array.from(editorial.querySelectorAll('[src]'))) {
    if (node.nodeName !== 'IMG') throw new Error(`Unsupported author resource: ${node.nodeName}`);
    node.setAttribute('src', localImage(node.getAttribute('src')));
    node.removeAttribute('srcset');
  }
  const mapPath = path.join(destination, '_data', 'legacy_urls.json');
  const urlMap = JSON.parse(await readFile(mapPath, 'utf8'));
  urlMap[`auteur${id}`] = `/auteurs/${id}/`;
  for (const link of Array.from(editorial.querySelectorAll('a[href]'))) {
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#')) continue;
    const url = new URL(raw, archive.sourceUrl);
    const key = url.search.match(/^\?(article\d+|rubrique\d+|auteur\d+)(?:&|$)/)?.[1];
    link.setAttribute('href', ['www.freelug.org', 'freelug.org'].includes(url.hostname) && key && urlMap[key]
      ? urlMap[key] + url.hash : url.href);
  }
  const articles = [];
  const selectedArticles = {
    association_articles: [],
    regions_articles: [],
    themes_articles: []
  };
  const pendingArticles = [];
  const published = await historicalContent(destination, '_articles');
  const sections = await historicalContent(destination, '_sections');
  for (const articleId of new Set(identity.articles)) {
    const entry = published.get(articleId) || [...published.values()].find(item => path.basename(item.file) === `${articleId}.md`);
    if (!entry) {
      pendingArticles.push(articleId);
      continue;
    }
    const text = entry.text;
    const metadata = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const article = metadata && parse(metadata[1]);
    if (!article || article.source_id !== articleId ||
        ![`https://www.freelug.org/spip.php?article${articleId}`,
          `https://freelug.org/spip.php?article${articleId}`].includes(article.source_url) ||
        !/^\/([a-z0-9-]+\/)+$/.test(article.permalink || '')) {
      throw new Error(`Unverified article relationship: ${articleId}`);
    }
    const collection = articleCollectionForSection(article.section, sections);
    articles.push(article.permalink);
    selectedArticles[`${collection}_articles`].push(article.permalink);
  }
  const data = {
    title, permalink: `/auteurs/${id}/`, image,
    description: main.querySelector('.bio')?.textContent.trim().replace(/\s+/g, ' ') || '',
    ...selectedArticles,
    source_names: [...new Set(identity.names)], source_id: id, source_url: archive.sourceUrl
  };
  const body = toMarkdown(editorial.outerHTML);
  const frontmatter = '---\n' + Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n\n';
  await mkdir(path.join(destination, 'media', 'archive'), { recursive: true });
  for (const [name, bytes] of assets) await writeFile(path.join(destination, 'media', 'archive', name), bytes);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, frontmatter + body, { flag: 'wx' });
  await writeFile(mapPath, JSON.stringify(urlMap, null, 2) + '\n');
  return { id, imagesAndFiles: assets.size, articles: articles.length, pendingArticles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , file, inventoryFile, destination] = process.argv;
  if (!file || !inventoryFile) throw new Error('Usage: node scripts\\import-author-page.mjs <auteurID.mhtml> <public-author-inventory.json> [output-directory]');
  const inventory = JSON.parse(await readFile(inventoryFile, 'utf8'));
  const id = Number(path.basename(file).match(/^auteur([1-9]\d*)\.mhtml$/)?.[1]);
  console.log(JSON.stringify(await importAuthorPage(path.resolve(file), inventory.authors.find(author => author.id === id),
    destination && path.resolve(destination)), null, 2));
}
