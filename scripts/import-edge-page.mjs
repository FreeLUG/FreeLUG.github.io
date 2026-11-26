import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import { toMarkdown } from './markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = { 1: '/regions/', 4: '/association/', 17: '/themes/' };
const json = value => JSON.stringify(value, null, 2) + '\n';

export function chromeArchive(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const headerEnd = normalized.indexOf('\n\n');
  const header = normalized.slice(0, headerEnd).replace(/\n[ \t]+/g, ' ');
  const sourceUrl = header.match(/^Snapshot-Content-Location: (.+)$/m)?.[1];
  if (!/^https:\/\/www\.freelug\.org\/spip\.php\?article\d+$/.test(sourceUrl || '')) {
    throw new Error('Expected a Chrome archive from the public https://www.freelug.org article source.');
  }
  const boundary = header.match(/boundary="([a-zA-Z0-9_-]+)"/)?.[1];
  if (!/^From: <Saved by Blink>$/m.test(header) || !/Content-Type: multipart\/related;/i.test(header) || !boundary) {
    throw new Error('Unsupported Chrome single-file archive format.');
  }
  const parts = normalized.split(new RegExp(`(?:^|\\n)--${boundary}(?=--|\\n|$)`));
  if (!parts.at(-1).startsWith('--')) throw new Error('Incomplete Chrome single-file archive.');
  const resources = new Map();
  for (const raw of parts.slice(1, -1)) {
    const part = raw.replace(/^\n/, '');
    const split = part.indexOf('\n\n');
    if (split < 0) throw new Error('Missing archive part headers.');
    const headers = part.slice(0, split).replace(/\n[ \t]+/g, ' ');
    const encoding = headers.match(/^Content-Transfer-Encoding: (.+)$/mi)?.[1].toLowerCase();
    const body = part.slice(split + 2);
    let bytes;
    if (encoding === 'base64') {
      const encoded = body.replace(/\s/g, '');
      if (encoded.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)) {
        throw new Error('Invalid base64 archive resource.');
      }
      bytes = Buffer.from(encoded, 'base64');
    } else if (encoding === 'quoted-printable') {
      if (/=(?!\n|[a-f0-9]{2})/i.test(body)) throw new Error('Invalid quoted-printable archive resource.');
      bytes = Buffer.from(body.replace(/=\n/g, '').replace(/=([a-f0-9]{2})/gi,
        (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    } else {
      throw new Error(`Unsupported archive transfer encoding: ${encoding}`);
    }
    const location = headers.match(/^Content-Location: (.+)$/mi)?.[1];
    const cid = headers.match(/^Content-ID: <([^>]+)>$/mi)?.[1];
    const type = headers.match(/^Content-Type: ([^;\n]+)/mi)?.[1].toLowerCase();
    const resource = { bytes, type, location };
    for (const key of [location, cid && `cid:${cid}`].filter(Boolean)) {
      if (resources.has(key) && !resources.get(key).bytes.equals(bytes)) throw new Error(`Conflicting archive resource: ${key}`);
      resources.set(key, resource);
    }
  }
  const main = resources.get(sourceUrl);
  if (!main || main.type !== 'text/html') throw new Error('The saved article is missing from the archive.');
  return { sourceUrl, html: main.bytes.toString('utf8'), resources };
}

export async function importEdgePage(file, destination = root) {
  const saved = await readFile(file, 'utf8');
  const archive = path.extname(file).toLowerCase() === '.mhtml' ? chromeArchive(saved) : null;
  const html = archive ? archive.html : saved;
  const source = archive
    ? archive.sourceUrl.match(/^(https:\/\/www\.freelug\.org\/spip\.php\?article(\d+))$/)
    : html.match(/<!-- saved from url=\(\d+\)(https:\/\/www\.freelug\.org\/spip\.php\?article(\d+)) -->/);
  if (!source) throw new Error('Expected an article saved individually from https://www.freelug.org in Edge or Chrome; other hosts and redirects are out of scope.');
  const [, sourceUrl, id] = source;
  const expectedId = path.basename(file).match(/^article(\d+)\.(?:html?|mhtml)$/i)?.[1];
  if (expectedId && expectedId !== id) {
    throw new Error(`Saved page is article ${id}, not expected article ${expectedId}; wait for navigation to finish in the browser.`);
  }
  const target = path.join(destination, '_articles', `${id}.md`);
  try {
    await access(target);
    throw new Error(`Article ${id} already exists; refusing to overwrite editorial content.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const document = domino.createWindow(html).document;
  const article = document.querySelector(`#content > .inner > article.article_${id}`);
  const main = article?.querySelector('.main');
  const title = article?.querySelector('.cartouche h1')?.textContent.trim();
  const sectionMatch = article?.querySelector('.category a')?.getAttribute('href')?.match(/\?rubrique(\d+)(?:&|$)/);
  const date = article?.querySelector('time')?.getAttribute('datetime');
  if (!main || !title || !sectionMatch || !date) throw new Error(`Incomplete saved article ${id}.`);
  const sectionId = sectionMatch[1];
  await access(path.join(destination, '_sections', `${sectionId}.md`));
  const editorial = main.cloneNode(true);
  for (const child of Array.from(article.children)) {
    if (!['FOOTER', 'ASIDE'].includes(child.nodeName)) continue;
    const blocks = child.matches('.notes, .documents') ? [child] : Array.from(child.querySelectorAll('.notes, .documents'));
    for (const block of blocks) {
      if (block !== child && block.parentNode.closest('.notes, .documents')) continue;
      const extra = block.cloneNode(true);
      for (const decoration of Array.from(extra.querySelectorAll('.read-more.hide, .icon.i-icon, .spip_document_icone > .img[style*="background"]'))) {
        decoration.remove();
      }
      for (const thumbnail of Array.from(extra.querySelectorAll('.logo-img-wrapper.spip_logo.spip_logos > span.img'))) {
        const match = thumbnail.getAttribute('style')?.match(/^display:block;position:relative;height:0;width:100%;padding-bottom:\d+(?:\.\d+)?%;overflow:hidden;background:url\((local\/cache-vignettes\/[a-zA-Z0-9_/?=.-]+)\) no-repeat center;background-size:100%;$/);
        if (!match || thumbnail.textContent.trim() || thumbnail.children.length) continue;
        const image = document.createElement('img');
        image.setAttribute('src', match[1]);
        image.setAttribute('alt', '');
        thumbnail.replaceWith(image);
      }
      editorial.appendChild(extra);
    }
  }
  for (const player of Array.from(editorial.querySelectorAll('video, audio'))) {
    const sources = [...new Set([player.getAttribute('src'),
      ...Array.from(player.querySelectorAll('source[src]'), node => node.getAttribute('src'))].filter(Boolean))];
    if (!sources.length) throw new Error(`Article ${id} contains media without a source URL.`);
    const container = player.closest('.mejs__container') || player;
    if (container !== player && container.querySelectorAll('video, audio').length !== 1) {
      throw new Error(`Article ${id} contains an ambiguous media player.`);
    }
    const paragraph = document.createElement('p');
    for (const raw of sources) {
      const url = new URL(raw, sourceUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'www.freelug.org' ||
          url.username || url.password || !url.pathname.startsWith('/IMG/')) {
        throw new Error(`Article ${id} contains media requiring editorial migration: ${raw}`);
      }
      const link = document.createElement('a');
      link.setAttribute('href', url.href);
      link.textContent = player.nodeName === 'VIDEO' ? 'Vidéo de la publication d’origine' : 'Audio de la publication d’origine';
      if (paragraph.childNodes.length) paragraph.appendChild(document.createTextNode(' · '));
      paragraph.appendChild(link);
    }
    container.replaceWith(paragraph);
  }
  const originals = new Set();
  const videoLink = (player, url) => {
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.textContent = 'Vidéo de la publication d’origine';
    paragraph.appendChild(link);
    player.replaceWith(paragraph);
    originals.add(url);
  };
  for (const frame of Array.from(editorial.querySelectorAll('iframe'))) {
    const resource = archive?.resources.get(frame.getAttribute('src'));
    const location = resource?.location;
    if (resource?.type !== 'text/html' ||
        !/^https:\/\/www\.youtube\.com\/embed\/[a-zA-Z0-9_-]{11}(?:\?list=[a-zA-Z0-9_-]{24})?$/.test(location || '')) continue;
    videoLink(frame, location);
  }
  for (const object of Array.from(editorial.querySelectorAll('object'))) {
    const movies = object.querySelectorAll('param[name="movie"]');
    const embeds = object.querySelectorAll('embed');
    const url = movies.length ? movies[0]?.getAttribute('value') : embeds[0]?.getAttribute('src');
    if (movies.length > 1 || embeds.length !== 1 ||
        (!movies.length && (object.hasAttribute('data') || object.querySelector('param'))) ||
        !Array.from(object.childNodes).every(node => node.nodeName === 'PARAM' ||
          node.nodeName === 'EMBED' || (node.nodeName === '#text' && !node.textContent.trim())) ||
        embeds[0].getAttribute('src') !== url ||
        embeds[0].getAttribute('type') !== 'application/x-shockwave-flash' ||
        !(/^http:\/\/www\.youtube\.com\/v\/[a-zA-Z0-9_-]{11}(?:&hl=fr(?:_FR)?&fs=1&?|\?fs=1&hl=fr_FR|\?hl=fr&fs=1)$/.test(url || '') ||
          /^https:\/\/www\.youtube\.com\/v\/[a-zA-Z0-9_-]{11}\?version=3&hl=fr_FR$/.test(url || '') ||
          /^http:\/\/www\.dailymotion\.com\/swf\/[a-zA-Z0-9]+_[a-zA-Z0-9_-]+&colors=background:[a-fA-F0-9]{6};&related=1$/.test(url || ''))) continue;
    videoLink(object, url);
  }
  for (const embed of Array.from(editorial.querySelectorAll('embed'))) {
    if (embed.parentNode.closest('object') ||
        embed.getAttribute('src') !== 'http://videos.freelug.org/flvplayer.swf') continue;
    const sources = new URLSearchParams(embed.getAttribute('flashvars') || '').getAll('file');
    if (sources.length !== 1 ||
        !/^http:\/\/videos\.freelug\.org\/uploads\/[a-zA-Z0-9]{20}\.flv$/.test(sources[0])) continue;
    videoLink(embed, sources[0]);
  }
  if (editorial.querySelector('iframe, object, embed, video, audio, source, svg, [style*="background"]')) {
    throw new Error(`Article ${id} contains embedded content requiring editorial migration.`);
  }
  const description = (main.querySelector('.chapo') || main.querySelector('p'))?.textContent.trim().replace(/\s+/g, ' ') || '';
  const authors = Array.from(article.querySelectorAll('.cartouche .author')).map(node => node.textContent.trim());
  const urlMapPath = path.join(destination, '_data', 'legacy_urls.json');
  const urlMap = JSON.parse(await readFile(urlMapPath, 'utf8'));
  urlMap[`article${id}`] = `/articles/${id}/`;
  const assets = new Map();
  const localFile = async raw => {
    let bytes;
    let extension;
    if (archive) {
      const url = new URL(raw, sourceUrl);
      const resource = archive.resources.get(url.href);
      if (!resource) throw new Error(`Media missing from the saved archive: ${raw}`);
      bytes = resource.bytes;
      extension = path.extname(url.pathname).toLowerCase();
      if (!/^\.[a-z0-9]{1,6}$/.test(extension)) {
        extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[resource.type];
      }
    } else {
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(raw.split(/[?#]/)[0]));
      const relative = path.relative(path.dirname(file), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Saved media escapes the page directory: ${raw}`);
      bytes = await readFile(resolved);
      extension = path.extname(resolved).toLowerCase();
    }
    if (!bytes.length) throw new Error(`Empty saved media: ${raw}`);
    if (!extension || !/^\.[a-z0-9]{1,6}$/.test(extension)) throw new Error(`Unknown media extension: ${raw}`);
    const name = createHash('sha256').update(bytes).digest('hex').slice(0, 24) + extension;
    assets.set(name, bytes);
    return `/media/archive/${name}`;
  };
  for (const node of Array.from(editorial.querySelectorAll('[src]'))) {
    const raw = node.getAttribute('src');
    if (!archive && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) throw new Error(`Media not saved locally: ${raw}`);
    node.setAttribute('src', await localFile(raw));
    node.removeAttribute('srcset');
  }
  for (const node of Array.from(editorial.querySelectorAll('a[href]'))) {
    const raw = node.getAttribute('href');
    if (!raw || raw.startsWith('#')) continue;
    if (/^\.\//.test(raw)) {
      node.setAttribute('href', await localFile(raw));
      continue;
    }
    const url = new URL(raw, sourceUrl);
    if (!['freelug.org', 'www.freelug.org'].includes(url.hostname)) continue;
    const key = url.search.match(/^\?(article\d+|rubrique\d+)(?:&|$)/)?.[1];
    if (key === `article${id}` && url.hash) node.setAttribute('href', url.hash);
    else if (key && urlMap[key]) node.setAttribute('href', urlMap[key] + url.hash);
    else if (url.pathname === '/' && !url.search) node.setAttribute('href', '/' + url.hash);
    else if (/^\/(?:IMG|local)\//.test(url.pathname)) originals.add(url.href);
  }
  const body = toMarkdown(editorial.outerHTML);
  if (!body.trim()) throw new Error(`No editorial content in saved article ${id}.`);
  const data = {
    title, permalink: `/articles/${id}/`,
    section: roots[sectionId] || `/rubriques/${sectionId}/`,
    published_at: date, authors, description,
    source_id: Number(id), source_url: sourceUrl
  };
  const frontmatter = '---\n' + Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n\n';
  await mkdir(path.join(destination, 'media', 'archive'), { recursive: true });
  for (const [name, bytes] of assets) await writeFile(path.join(destination, 'media', 'archive', name), bytes);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, frontmatter + body, { flag: 'wx' });
  await writeFile(urlMapPath, json(urlMap));
  return { id: Number(id), title, imagesAndFiles: assets.size, originalMediaLinks: [...originals] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts\\import-edge-page.mjs <saved-page.html|saved-page.mhtml> [output-directory]');
  console.log(json(await importEdgePage(path.resolve(process.argv[2]), process.argv[3] && path.resolve(process.argv[3]))));
}
