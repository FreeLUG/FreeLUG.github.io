import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { markdownFiles } from './article-collections.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function articleSlug(title) {
  const words = title.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (words.length <= 90) return words;
  return words.slice(0, 91).replace(/-[^-]*$/, '').replace(/-$/, '');
}

export function planArticleUrls(articles) {
  const entries = [...articles].sort((first, second) => first.file.localeCompare(second.file, 'en'))
    .map(({ file, metadata }) => {
      if (typeof metadata.title !== 'string' || !/^\/articles\/[a-z0-9-]+\/$/.test(metadata.permalink || '')) {
        throw new Error(`Invalid title or article permalink: ${file}`);
      }
      const slug = articleSlug(metadata.title);
      if (!slug) throw new Error(`Title has no usable slug: ${file}`);
      const historical = /^\/articles\/\d+\/$/.test(metadata.permalink);
      return {
        title: metadata.title,
        source_id: metadata.source_id ?? null,
        old_file: file,
        old_url: metadata.permalink,
        proposed_file: historical ? `${path.posix.dirname(file)}/${slug}.md` : file,
        proposed_url: historical ? `/articles/${slug}/` : metadata.permalink,
        review_notes: historical ? ['Review automatically generated wording before approval.'] : ['Existing descriptive URL preserved.'],
        year: String(metadata.published_at || '').match(/^\d{4}/)?.[0]
      };
    });
  const oldUrls = new Set();
  for (const entry of entries) {
    if (oldUrls.has(entry.old_url)) throw new Error(`Duplicate existing URL: ${entry.old_url}`);
    oldUrls.add(entry.old_url);
  }
  const reservedUrls = new Set(entries.filter(entry => entry.old_url === entry.proposed_url).map(entry => entry.old_url));
  const reservedFiles = new Set(entries.filter(entry => entry.old_url === entry.proposed_url).map(entry => entry.old_file));
  const groups = new Map();
  for (const entry of entries.filter(entry => entry.old_url !== entry.proposed_url)) {
    const group = groups.get(entry.proposed_url) || [];
    group.push(entry);
    groups.set(entry.proposed_url, group);
  }
  for (const group of groups.values()) {
    for (const entry of group) {
      const base = entry.proposed_url.slice('/articles/'.length, -1);
      let slug = base;
      if (group.length > 1 || reservedUrls.has(entry.proposed_url) || reservedFiles.has(entry.proposed_file)) {
        const distinctYear = entry.year && group.filter(other => other.year === entry.year).length === 1;
        const suffix = distinctYear ? entry.year : entry.old_url.match(/\d+/)[0];
        slug = `${base}-${suffix}`;
        entry.review_notes.push(distinctYear ? 'Collision: publication year added; verify it describes the subject.' : 'Collision: historical ID added; choose a meaningful qualifier if possible.');
      }
      if (reservedUrls.has(`/articles/${slug}/`) || reservedFiles.has(`${path.posix.dirname(entry.old_file)}/${slug}.md`)) {
        slug = `${base}-${entry.old_url.match(/\d+/)[0]}`;
        entry.review_notes.push('Additional collision: historical ID added.');
      }
      if (reservedUrls.has(`/articles/${slug}/`) || reservedFiles.has(`_articles/${slug}.md`)) {
        throw new Error(`Unresolved proposal collision: ${entry.old_file}`);
      }
      entry.proposed_url = `/articles/${slug}/`;
      entry.proposed_file = `${path.posix.dirname(entry.old_file)}/${slug}.md`;
      reservedUrls.add(entry.proposed_url);
      reservedFiles.add(entry.proposed_file);
    }
  }
  return entries.map(({ year, ...entry }) => entry);
}

export async function generateArticleUrlPlan(destination = root) {
  try {
    const previous = JSON.parse(await readFile(path.join(destination, 'scripts/seo/article-url-mapping.json'), 'utf8'));
    if (previous.status === 'applied') throw new Error('Mapping already applied; preserve it as the migration record.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const articles = [];
  for (const file of await markdownFiles(path.join(destination, '_articles'))) {
    const content = await readFile(file, 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const relative = path.relative(destination, file).split(path.sep).join('/');
    if (!frontmatter) throw new Error(`Missing YAML frontmatter: ${relative}`);
    articles.push({ file: relative, metadata: parse(frontmatter[1]) });
  }
  const entries = planArticleUrls(articles);
  const report = {
    status: 'proposal-only; not approved or applied',
    article_count: entries.length,
    changed_url_count: entries.filter(entry => entry.old_url !== entry.proposed_url).length,
    collision_count: entries.filter(entry => entry.review_notes.some(note => /collision/i.test(note))).length,
    entries
  };
  const output = path.join(destination, 'scripts', 'seo', 'article-url-mapping.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await generateArticleUrlPlan();
  console.log(`${report.article_count} articles; ${report.changed_url_count} proposed URL changes; ${report.collision_count} collision reviews. No articles modified.`);
}