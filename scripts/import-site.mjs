import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMarkdown } from './markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, cache, destination = root] = process.argv.slice(2);
const origin = 'https://freelug.org';
const allowedOrigins = new Set([origin, 'https://www.freelug.org']);
const roots = { 4: '/association/', 1: '/regions/', 17: '/themes/' };
const sectionUrl = id => roots[id] || `/rubriques/${id}/`;
const articleUrl = id => `/articles/${id}/`;
const assetName = url => {
  const parsed = new URL(url, origin);
  const extension = path.posix.extname(parsed.pathname).toLowerCase();
  return createHash('sha256').update(parsed.origin + parsed.pathname).digest('hex').slice(0, 24) +
    (/^\.[a-z0-9]{1,6}$/.test(extension) ? extension : '.bin');
};
const json = value => JSON.stringify(value, null, 2) + '\n';
const frontmatter = data => `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;

async function serve() {
  await mkdir(path.join(cache, 'articles'), { recursive: true });
  await mkdir(path.join(cache, 'assets'), { recursive: true });
  const server = createServer(async (req, res) => {
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
      res.writeHead(403).end('Origin not allowed');
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:4174');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        res.end('FreeLUG capture ready');
      } else if (req.method === 'GET' && url.pathname === '/collector.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(path.join(root, 'scripts', 'capture-source.js')));
      } else if (req.method === 'GET' && url.pathname === '/state') {
        const articles = (await readdir(path.join(cache, 'articles'))).map(n => Number(n.replace('.json', '')));
        const assets = await readdir(path.join(cache, 'assets'));
        res.setHeader('Content-Type', 'application/json');
        const report = JSON.parse(await readFile(path.join(cache, 'report.json'), 'utf8'));
        res.end(json({
          articles, assets, skippedArticles: report.skippedArticles || [],
          unavailableAssets: report.unavailableAssets || []
        }));
      } else if (req.method === 'GET' && url.pathname === '/inventory') {
        res.setHeader('Content-Type', 'application/json');
        res.end(await readFile(path.join(cache, 'inventory.json')));
      } else if (req.method === 'GET' && url.pathname === '/article') {
        const id = Number(url.searchParams.get('id'));
        if (!Number.isSafeInteger(id) || id < 1) {
          res.writeHead(400).end('Invalid article ID');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(await readFile(path.join(cache, 'articles', `${id}.json`)));
      } else if (req.method === 'POST' && ['/inventory', '/article', '/asset', '/report'].includes(url.pathname)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        let destination;
        if (url.pathname === '/asset') {
          const source = new URL(url.searchParams.get('url'));
          if (source.origin !== origin || !/^\/(IMG|local)\//.test(source.pathname)) throw new Error('Invalid asset URL');
          destination = path.join(cache, 'assets', assetName(source.href));
        } else {
          const data = JSON.parse(body);
          if (url.pathname === '/article') {
            if (!Number.isSafeInteger(data.id) || data.id < 1) throw new Error('Invalid article ID');
            destination = path.join(cache, 'articles', `${data.id}.json`);
          } else destination = path.join(cache, `${url.pathname.slice(1)}.json`);
        }
        await writeFile(destination, body);
        res.end('Saved');
      } else res.writeHead(404).end('Not found');
    } catch (error) {
      console.error(error);
      res.writeHead(500).end(error.message);
    }
  });
  server.listen(4174, '127.0.0.1', () => console.log('Capture bridge: http://127.0.0.1:4174'));
}

async function generate() {
  try {
    await readFile(path.join(destination, '_data/url-redirects.json'), 'utf8');
    throw new Error('This site uses descriptive URLs. Use the individual importers; bulk legacy generation would overwrite migrated content.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inventory = JSON.parse(await readFile(path.join(cache, 'inventory.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(cache, 'report.json'), 'utf8'));
  if (inventory.running || inventory.queue.length || inventory.errors.length || report.running || !report.completedAt || report.errors.length) {
    throw new Error('Capture is incomplete; inspect the inventory and report before generating.');
  }
  const sections = Object.values(inventory.sections);
  const articles = await Promise.all(Object.keys(inventory.articles).map(async id =>
    JSON.parse(await readFile(path.join(cache, 'articles', `${id}.json`), 'utf8'))));
  const assets = new Set(await readdir(path.join(cache, 'assets')));
  const sectionIds = new Set(sections.map(s => s.id));
  const articleIds = new Set(articles.map(a => a.id));
  const unavailable = new Set(report.unavailableAssets.map(a => new URL(a.url).pathname));
  const missingLinks = new Set();
  const urlMap = {};
  const localAsset = raw => {
    const url = new URL(raw, origin);
    const name = assetName(url.href);
    if (!assets.has(name)) {
      if (unavailable.has(url.pathname)) return url.href;
      throw new Error(`Asset not captured: ${url.href}`);
    }
    return `/media/archive/${name}`;
  };
  const rewriteUrl = raw => {
    if (!raw || raw.startsWith('#')) return raw;
    let url;
    try { url = new URL(raw, origin + '/'); } catch { return raw; }
    if (!['http:', 'https:'].includes(url.protocol)) return raw;
    if (!['freelug.org', 'www.freelug.org'].includes(url.hostname)) return raw;
    if (/^\/(IMG|local)\//.test(url.pathname)) return localAsset(raw) + url.hash;
    const article = url.search.match(/^\?article(\d+)(?:&|$)/) || url.pathname.match(/^\/article(\d+)\.html$/);
    const section = url.search.match(/^\?rubrique(\d+)(?:&|$)/) || url.pathname.match(/^\/rubrique(\d+)\.html$/);
    if (article && articleIds.has(Number(article[1]))) return articleUrl(article[1]) + url.hash;
    if (section && sectionIds.has(Number(section[1]))) return sectionUrl(section[1]) + url.hash;
    if (url.pathname === '/' && !url.search) return '/' + url.hash;
    if (article || section) missingLinks.add(url.href);
    return url.href;
  };
  const rewrite = html => html.replace(/\b(href|src|poster)="([^"]*)"/g, (_, attr, value) => {
    const decoded = value.replace(/&amp;/g, '&');
    const rewritten = rewriteUrl(decoded).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `${attr}="${rewritten}"`;
  });
  for (const dir of ['_sections', '_articles', '_data', path.join('media', 'archive')]) {
    await mkdir(path.join(destination, dir), { recursive: true });
  }
  const parentOf = new Map();
  for (const section of sections) for (const child of section.children) parentOf.set(child, section.id);
  for (const entry of inventory.entries) {
    const id = Number(entry.url.match(/rubrique(\d+)/)[1]);
    if (!roots[id] && !parentOf.has(id)) parentOf.set(id, entry.root);
  }
  const validateParents = id => {
    const visited = new Set([id]);
    let parent = parentOf.get(id);
    while (parent) {
      if (visited.has(parent)) throw new Error(`Circular section tree: ${id}`);
      visited.add(parent);
      const section = inventory.sections[parent];
      if (!section) throw new Error(`Missing parent ${parent}`);
      parent = parentOf.get(parent);
    }
  };
  for (const section of sections) validateParents(section.id);
  const articleGroup = id => {
    let root = id;
    const visited = new Set([root]);
    while (parentOf.has(root)) {
      root = parentOf.get(root);
      if (visited.has(root)) throw new Error(`Circular section tree: ${id}`);
      visited.add(root);
    }
    const permalink = roots[root];
    if (!permalink) throw new Error(`Article section ${id} is outside the configured roots.`);
    return permalink.slice(1, -1);
  };
  const documents = [];
  for (const section of sections) {
    const permalink = sectionUrl(section.id);
    urlMap[`rubrique${section.id}`] = permalink;
    documents.push({ directory: '_sections', id: section.id, data: {
      layout: 'section', title: section.title, source_id: section.id, permalink,
      source_url: `${origin}/spip.php?rubrique${section.id}`,
      description: section.description || `Retrouvez les articles et les ressources FreeLUG : ${section.title}.`,
      parent: parentOf.has(section.id) ? sectionUrl(parentOf.get(section.id)) : ''
    }, body: toMarkdown(rewrite(section.html)) });
  }
  for (const article of articles) {
    if (!article.html.trim()) throw new Error(`Empty article ${article.id}`);
    urlMap[`article${article.id}`] = articleUrl(article.id);
    const section = inventory.sections[article.section];
    if (!section) throw new Error(`Missing section for article ${article.id}`);
    documents.push({ directory: path.join('_articles', articleGroup(article.section)), id: article.id, data: {
      layout: 'article', title: article.title, source_id: article.id,
      permalink: articleUrl(article.id), source_url: article.url,
      published_at: article.date, authors: article.authors,
      description: article.description, section: sectionUrl(section.id)
    }, body: toMarkdown(rewrite(article.html)) });
  }
  for (const document of documents) {
    await mkdir(path.join(destination, document.directory), { recursive: true });
    await writeFile(path.join(destination, document.directory, `${document.id}.md`), frontmatter(document.data) + '\n' + document.body);
  }
  for (const name of assets) await copyFile(path.join(cache, 'assets', name), path.join(destination, 'media', 'archive', name));
  await writeFile(path.join(destination, '_data', 'legacy_urls.json'), json(urlMap));
  await writeFile(path.join(destination, '_data', 'migration.json'), json({
    source: origin, captured_at: report.completedAt, sections: sections.length, articles: articles.length,
    assets: assets.size, unavailable_assets: report.unavailableAssets, external_editorial_links: [...missingLinks].sort()
  }));
  console.log(`Generated ${sections.length} sections, ${articles.length} articles, ${assets.size} assets.`);
}

if (!cache || !['serve', 'generate'].includes(command)) {
  console.error('Usage: node scripts\\import-site.mjs <serve|generate> <absolute-cache-directory> [output-directory]');
  process.exitCode = 1;
} else if (command === 'serve') await serve();
else await generate();
