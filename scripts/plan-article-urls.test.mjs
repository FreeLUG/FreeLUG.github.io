import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { articleSlug, planArticleUrls, generateArticleUrlPlan } from './plan-article-urls.mjs';

const article = (id, title, published_at = '') => ({
  file: `_articles/${id}.md`,
  metadata: { title, permalink: `/articles/${id}/`, source_id: id, published_at }
});

test('slugs normalize accents and punctuation while preserving years and set numbers', () => {
  assert.equal(articleSlug('Briqu’Expo : créations LEGO® 2026 — 10305'), 'briqu-expo-creations-lego-2026-10305');
  assert.equal(articleSlug('Une œuvre MUJI'), 'une-oeuvre-muji');
  assert.ok(articleSlug('construction '.repeat(30)).length <= 90);
});

test('mapping is deterministic and preserves existing descriptive URLs', () => {
  const entries = [article(2, 'Train'), article(1, 'LEGO MUJI')];
  entries.push({ file: '_articles/already.md', metadata: { title: 'New title', permalink: '/articles/already/' } });
  assert.deepEqual(planArticleUrls(entries), planArticleUrls([...entries].reverse()));
  assert.equal(planArticleUrls(entries)[0].proposed_url, '/articles/lego-muji/');
  assert.equal(planArticleUrls(entries)[2].proposed_file, '_articles/already.md');
});

test('duplicate titles use distinct years or historical IDs and flag review', () => {
  const entries = planArticleUrls([article(1, 'Exposition', '2020-01-01'), article(2, 'Exposition', '2021-01-01'), article(3, 'Train'), article(4, 'Train')]);
  assert.deepEqual(entries.map(entry => entry.proposed_url), ['/articles/exposition-2020/', '/articles/exposition-2021/', '/articles/train-3/', '/articles/train-4/']);
  assert.ok(entries.every(entry => entry.review_notes.length === 2));
});

test('proposals cannot collide with an existing descriptive URL', () => {
  const entries = planArticleUrls([article(1, 'Train'), { file: '_articles/train.md', metadata: { title: 'Train', permalink: '/articles/train/' } }]);
  assert.equal(entries[0].proposed_url, '/articles/train-1/');
});

test('invalid metadata and duplicate old URLs fail rather than omit articles', () => {
  assert.throws(() => planArticleUrls([article(1, '!!!')]), /no usable slug/);
  assert.throws(() => planArticleUrls([article(1, 'Train'), article(1, 'Other')]), /Duplicate existing URL/);
});

test('generation writes only a proposal and leaves article bytes unchanged', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'freelug-url-plan-'));
  try {
    await mkdir(path.join(directory, '_articles', 'themes'), { recursive: true });
    const file = path.join(directory, '_articles', 'themes', '1285.md');
    const content = '---\ntitle: LEGO MUJI\npermalink: /articles/1285/\nsource_id: 1285\n---\nOriginal content.\n';
    await writeFile(file, content);
    const report = await generateArticleUrlPlan(directory);
    assert.equal(report.article_count, 1);
    assert.equal(report.entries[0].proposed_file, '_articles/themes/lego-muji.md');
    assert.equal(await readFile(file, 'utf8'), content);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'scripts/seo/article-url-mapping.json'), 'utf8')).status, report.status);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});