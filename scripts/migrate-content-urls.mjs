import { readFile, mkdir, writeFile, rename, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { articleSlug } from './plan-article-urls.mjs';
import { markdownFiles } from './article-collections.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = value => JSON.stringify(value, null, 2) + '\n';

export function splitContent(content) {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');
  const document = parseDocument(match[2]);
  if (document.errors.length) throw new Error(document.errors[0].message);
  return { document, body: match[4], opening: match[1], closing: match[3] };
}

export function rewriteLinks(text, mapping) {
  return text.replace(/(?<![a-zA-Z0-9_/.:-])(?:https?:\/\/(?:www\.)?freelug\.org)?\/(?:articles|rubriques)\/[a-z0-9-]+\//g,
    original => {
      const pathname = original.replace(/^https?:\/\/(?:www\.)?freelug\.org/, '');
      return mapping.get(pathname) || original;
    });
}

export function planSectionUrls(sections) {
  const byUrl = new Map(sections.map(section => [section.metadata.permalink, section]));
  if (byUrl.size !== sections.length) throw new Error('Duplicate section permalink');
  const resolved = new Map();
  const active = new Set();
  const resolve = section => {
    const old = section.metadata.permalink;
    if (resolved.has(old)) return resolved.get(old);
    if (active.has(old)) throw new Error(`Section parent cycle: ${old}`);
    active.add(old);
    let proposed;
    if (!section.metadata.parent) {
      if (!['/association/', '/regions/', '/themes/'].includes(old)) throw new Error(`Unexpected root section: ${old}`);
      proposed = old;
    } else {
      const parent = byUrl.get(section.metadata.parent);
      if (!parent) throw new Error(`Missing parent: ${old}`);
      const slug = articleSlug(section.metadata.title);
      if (!slug) throw new Error(`Invalid section title: ${old}`);
      proposed = `${resolve(parent)}${slug}/`;
    }
    active.delete(old);
    resolved.set(old, proposed);
    return proposed;
  };
  const entries = sections.map(section => {
    const proposed = resolve(section);
    return {
      title: section.metadata.title, source_id: section.metadata.source_id,
      old_file: section.file, old_url: section.metadata.permalink,
      proposed_file: `_sections/${proposed.slice(1, -1).replaceAll('/', '-')}.md`,
      proposed_url: proposed
    };
  });
  assertUnique(entries);
  return entries;
}

function assertUnique(entries) {
  const safeFile = file => /^_sections\/[a-z0-9-]+\.md$/.test(file) ||
    /^_articles\/(?:[a-z0-9-]+|(?:association|regions|themes)\/[a-z0-9-]+)\.md$/.test(file);
  for (const field of ['old_file', 'old_url', 'proposed_file', 'proposed_url']) {
    if (new Set(entries.map(entry => entry[field])).size !== entries.length) throw new Error(`Duplicate mapping ${field}`);
  }
  for (const entry of entries) {
    if (!safeFile(entry.old_file) || !safeFile(entry.proposed_file)
      || !/^\/(?:[a-z0-9-]+\/)+$/.test(entry.old_url) || !/^\/(?:[a-z0-9-]+\/)+$/.test(entry.proposed_url)) {
      throw new Error(`Unsafe mapping: ${entry.old_file}`);
    }
  }
}

export async function migrateContentUrls(destination = root) {
  const reportFile = path.join(destination, 'scripts/seo/article-url-mapping.json');
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  if (report.status === 'applied') throw new Error('Mapping already applied; refusing to rerun');
  const contentFiles = [];
  const sections = [];
  for (const collection of ['_articles', '_sections', '_authors']) {
    for (const absoluteFile of await markdownFiles(path.join(destination, collection))) {
      const file = path.relative(destination, absoluteFile).split(path.sep).join('/');
      const content = await readFile(absoluteFile, 'utf8');
      const parsed = splitContent(content);
      const entry = { file, content, parsed, metadata: parsed.document.toJS() };
      contentFiles.push(entry);
      if (collection === '_sections') sections.push(entry);
    }
  }
  const sectionEntries = planSectionUrls(sections);
  const entries = [...report.entries, ...sectionEntries];
  assertUnique(entries);
  const articles = contentFiles.filter(entry => entry.file.startsWith('_articles/'));
  if (articles.length !== report.entries.length) throw new Error('Article inventory has changed; regenerate the proposal');
  const mapping = new Map(entries.map(entry => [entry.old_url, entry.proposed_url]));
  const byFile = new Map(entries.map(entry => [entry.old_file, entry]));
  for (const entry of entries) {
    const original = contentFiles.find(file => file.file === entry.old_file);
    if (!original || original.metadata.permalink !== entry.old_url || original.metadata.title !== entry.title) {
      throw new Error(`Stale mapping: ${entry.old_file}`);
    }
    if (entry.old_file !== entry.proposed_file) {
      try {
        await access(path.join(destination, entry.proposed_file));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      throw new Error(`Destination already exists: ${entry.proposed_file}`);
    }
  }
  const edits = [];
  for (const entry of contentFiles) {
    const { document, opening, closing } = entry.parsed;
    const mapped = byFile.get(entry.file);
    if (mapped) document.set('permalink', mapped.proposed_url);
    for (const field of ['section', 'parent']) {
      const value = document.get(field);
      if (mapping.has(value)) document.set(field, mapping.get(value));
    }
    const selected = document.get('articles', true);
    if (selected?.items) {
      for (const item of selected.items) {
        if (mapping.has(item.value)) item.value = mapping.get(item.value);
      }
    }
    const body = rewriteLinks(entry.parsed.body, mapping);
    const content = opening + document.toString().replace(/\n$/, '') + closing + body;
    edits.push({ old: entry.file, target: mapped?.proposed_file || entry.file, content });
  }
  const navigationFile = path.join(destination, '_data/navigation.yml');
  const navigation = parseDocument(await readFile(navigationFile, 'utf8'));
  for (const item of navigation.contents.items) {
    const url = item.get('url');
    if (mapping.has(url)) item.set('url', mapping.get(url));
  }
  const redirects = {};
  const legacyFile = path.join(destination, '_data/legacy_urls.json');
  const legacy = JSON.parse(await readFile(legacyFile, 'utf8'));
  for (const [key, url] of Object.entries(legacy)) {
    if (mapping.has(url)) legacy[key] = mapping.get(url);
  }
  for (const edit of edits) {
    await mkdir(path.dirname(path.join(destination, edit.target)), { recursive: true });
    await writeFile(path.join(destination, edit.old), edit.content);
    if (edit.old !== edit.target) await rename(path.join(destination, edit.old), path.join(destination, edit.target));
  }
  await writeFile(navigationFile, navigation.toString());
  await writeFile(legacyFile, json(legacy));
  await writeFile(path.join(destination, '_data/url-redirects.json'), json(redirects));
  await writeFile(path.join(destination, 'scripts/seo/section-url-mapping.json'), json({ status: 'applied', entries: sectionEntries }));
  await writeFile(reportFile, json({ ...report, status: 'applied' }));
  return { articles: report.entries.length, sections: sectionEntries.length, redirects: Object.keys(redirects).length };
}

export async function removeUnpublishedRedirects(destination = root) {
  const registry = path.join(destination, '_data/url-redirects.json');
  const redirects = JSON.parse(await readFile(registry, 'utf8'));
  const removals = [];
  for (const [old, target] of Object.entries(redirects)) {
    if (!/^\/(articles|rubriques)\/[1-9]\d*\/$/.test(old)) continue;
    const file = path.join(destination, '_redirects', old.slice(1, -1).replaceAll('/', '-') + '.md');
    const metadata = splitContent(await readFile(file, 'utf8')).document.toJS();
    if (metadata.permalink !== old || metadata.redirect_to !== target || metadata.layout !== 'redirect') {
      throw new Error(`Redirect changed; refusing to delete: ${file}`);
    }
    removals.push({ file, old });
  }
  for (const { file, old } of removals) {
    await rm(file);
    delete redirects[old];
  }
  await writeFile(registry, json(redirects));
  return { removed: removals.length, remaining: Object.keys(redirects).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(process.argv[2] === '--remove-unpublished-redirects'
    ? await removeUnpublishedRedirects() : await migrateContentUrls()));
}