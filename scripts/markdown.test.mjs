import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { toMarkdown } from './markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseDocument = text => {
  const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, 'Expected YAML frontmatter followed by Markdown content');
  const [, metadata, body] = match;
  return { data: parse(metadata), body };
};

test('CMS-managed content has valid, non-circular section relationships', async () => {
  const cms = parse(await readFile(path.join(root, '.pages.yml'), 'utf8'));
  parse(await readFile(path.join(root, '_config.yml'), 'utf8'));
  const documents = {};
  const permalinks = new Set();
  for (const name of ['sections', 'articles']) {
    const schema = cms.content.find(item => item.name === name);
    documents[name] = await Promise.all((await readdir(path.join(root, schema.path)))
      .filter(file => file.endsWith('.md')).map(async file =>
        parseDocument(await readFile(path.join(root, schema.path, file), 'utf8')).data));
    for (const document of documents[name]) {
      for (const field of schema.fields.filter(field => field.required)) {
        assert.ok(document[field.name], `${document.title}: missing ${field.name}`);
        if (field.pattern) assert.match(document[field.name], new RegExp(field.pattern));
      }
      assert.equal(permalinks.has(document.permalink), false, `Duplicate address: ${document.permalink}`);
      permalinks.add(document.permalink);
    }
  }
  const sections = new Map(documents.sections.map(section => [section.permalink, section]));
  for (const section of sections.values()) {
    const visited = new Set([section.permalink]);
    let parent = section.parent;
    while (parent) {
      assert.ok(sections.has(parent), `Missing parent ${parent}`);
      assert.equal(visited.has(parent), false, `Circular section hierarchy: ${section.title}`);
      visited.add(parent);
      parent = sections.get(parent).parent;
    }
  }
  for (const article of documents.articles) assert.ok(sections.has(article.section), `Missing section: ${article.title}`);
  const navigation = parse(await readFile(path.join(root, '_data', 'navigation.yml'), 'utf8'));
  for (const item of navigation) assert.ok(sections.has(item.url), `Missing navigation destination: ${item.url}`);
});

test('editorial HTML becomes editable Markdown without layout wrappers', () => {
  const markdown = toMarkdown(`<div class="texte"><h2>Construire ensemble</h2>
    <p>Une <strong>passion</strong> et des <em>idées</em>.</p>
    <ul><li>Créer</li><li>Partager</li></ul>
    <blockquote><p>Bienvenue !</p></blockquote>
    <figure><a href="/media/original.jpg"><img src="/media/photo.jpg" alt="Un train"></a><figcaption>Notre train</figcaption></figure>
    <p><a href="/media/notice.pdf">La notice</a></p><pre><code>const briques = 12;</code></pre></div>`);
  assert.match(markdown, /^## Construire ensemble/);
  assert.match(markdown, /\*\*passion\*\*/);
  assert.match(markdown, /(?:\*idées\*|_idées_)/);
  assert.match(markdown, /- {1,3}Créer/);
  assert.match(markdown, /> Bienvenue !/);
  assert.match(markdown, /\[!\[Un train\]\(\/media\/photo.jpg\)\]\(\/media\/original.jpg\)/);
  assert.match(markdown, /Notre train/);
  assert.match(markdown, /\[La notice\]\(\/media\/notice.pdf\)/);
  assert.match(markdown, /```\nconst briques = 12;\n```/);
  assert.doesNotMatch(markdown, /<\/?(?:div|p|figure|img|a)\b|{% raw %}/);
});

test('tables keep headers, empty cells, pipes and headerless first rows', () => {
  const header = toMarkdown('<table><tr><th>Pièce</th><th>Stock</th></tr><tr><td>A | B</td><td></td></tr></table>');
  assert.match(header, /\| Pièce \| Stock \|\n\| --- \| --- \|\n\| A \\\| B \|  \|/);
  const noHeader = toMarkdown('<table><tr><td>Rouge</td><td>12</td></tr><tr><td>Bleu</td><td>3</td></tr></table>');
  assert.match(noHeader, /\|  \|  \|\n\| --- \| --- \|\n\| Rouge \| 12 \|\n\| Bleu \| 3 \|/);
  assert.doesNotMatch(header + noHeader, /<table/);
  assert.throws(() => toMarkdown('<table><tr><td colspan="2">Un groupe</td></tr></table>'), /complex table/);
});

test('SPIP footnotes remain linked using Markdown footnotes', () => {
  const markdown = toMarkdown('<p>Une précision<a href="#nb1" id="nh1">1</a>.</p><div class="notes"><p><a href="#nh1" id="nb1">[1]</a> Une note importante.</p></div>');
  assert.match(markdown, /Une précision\[\^1\]\./);
  assert.match(markdown, /\[\^1\]: Une note importante\./);
  assert.doesNotMatch(markdown, /#nb1|#nh1/);
});

test('labelled tournament brackets preserve rounds and scores as Markdown lists', () => {
  const html = `<table class="classement"><caption>Tournoi</caption>
    <tr><th>Quart</th><td>A - B<br>4</td><td>C - D<br>0</td></tr>
    <tr><th>Finale</th><td colspan="2"><a href="/equipe/">A - B</a><br>3</td></tr></table>`;
  const markdown = toMarkdown(`<p>Avant.</p>${html}<p>Apres.</p>`);
  assert.match(markdown, /Tournoi\n\n\*\*Quart\*\*\n\n- A - B {2}\n {2}4\n- C - D {2}\n {2}0/);
  assert.match(markdown, /\*\*Finale\*\*\n\n- \[A - B\]\(\/equipe\/\) {2}\n {2}3/);
  assert.match(markdown, /^Avant\./);
  assert.match(markdown, /Apres\.\n$/);
  assert.doesNotMatch(markdown, /<table|colspan/);
  for (const unsupported of [
    html.replace('colspan="2"', 'rowspan="2"'),
    html.replace('colspan="2"', 'colspan="0"'),
    html.replace('colspan="2"', 'colspan="3"'),
    html.replace('<th>Finale</th>', '<td>Finale</td>'),
    html.replace('A - B<br>4', '<table><tr><td>A</td></tr></table>')
  ]) assert.throws(() => toMarkdown(unsupported), /complex table/);
});

test('SPIP wrapped references and container notes preserve named and repeated footnotes', () => {
  const markdown = toMarkdown(`<p>Pièce<span class="spip_note_ref"> [<a href="#nb_2A" id="nh_2A">*</a>]</span>.
    Encore<span class="spip_note_ref"> [<a href="#nb_2A">*</a>]</span>.
    Windows<span class="spip_note_ref"> [<a href="#nb1" id="nh1">1</a>]</span>.</p>
    <div class="notes"><div id="nb_2A"><p><span class="spip_note_ref">[<a class="spip_note" href="#nh_2A">*</a>] </span>Une explication.</p><p>Une suite.</p></div>
    <div id="nb1"><p><span class="spip_note_ref">[<a class="spip_note" href="#nh1">1</a>] </span>Autres versions.</p></div></div>`);
  assert.equal((markdown.match(/\[\^_2A\](?!:)/g) || []).length, 2);
  assert.match(markdown, /\[\^_2A\]: Une explication\.\n {4}\n {4}Une suite\./);
  assert.match(markdown, /Windows\s*\[\^1\]/);
  assert.match(markdown, /\[\^1\]: Autres versions\./);
  assert.doesNotMatch(markdown, /#nb|#nh|\\\[/);
});

test('Liquid examples are protected from Jekyll evaluation', () => {
  const markdown = toMarkdown('<pre><code>{{ page.title }}\n{% endraw %}</code></pre>');
  assert.match(markdown, /\{\{ '\{\{' \}\} page.title \}\}/);
  assert.match(markdown, /\{\{ '\{%' \}\} endraw %\}/);
});

test('captures generate CMS-compatible Markdown only after capture completes', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'freelug-markdown-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cache = path.join(directory, 'cache');
  const output = path.join(directory, 'site');
  await mkdir(path.join(cache, 'articles'), { recursive: true });
  await mkdir(path.join(cache, 'assets'), { recursive: true });
  const image = 'https://freelug.org/IMG/jpg/train.jpg';
  const imageName = createHash('sha256').update(image).digest('hex').slice(0, 24) + '.jpg';
  await writeFile(path.join(cache, 'assets', imageName), 'fixture-image');
  await writeFile(path.join(cache, 'inventory.json'), JSON.stringify({
    running: false, queue: [], errors: [], entries: [],
    sections: {
      17: { id: 17, title: 'Thèmes', html: '<p>Nos thèmes.</p>', children: [42], articles: [] },
      42: { id: 42, title: 'Train', html: '<p>Les trains.</p>', children: [], articles: [100] }
    },
    articles: { 100: { id: 100 } }
  }));
  await writeFile(path.join(cache, 'report.json'), JSON.stringify({
    errors: [], unavailableAssets: [], completedAt: '2026-11-24T10:00:00Z'
  }));
  await writeFile(path.join(cache, 'articles', '100.json'), JSON.stringify({
    id: 100, section: 42, title: 'Un train', url: 'https://freelug.org/spip.php?article100',
    date: '2020-03-04T12:00:00Z', authors: ['Auteur'], description: 'Un modèle.',
    html: `<h2>Le modèle</h2><p><a href="https://freelug.org/spip.php?rubrique42">Train</a></p><img src="${image}" alt="Le train"><p><a href="https://freelug.org/spip.php?article100#modele">Ce modèle</a></p>`
  }));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'import-site.mjs'), 'generate', cache, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readdir(path.join(output, '_articles')), ['100.md']);
  const article = parseDocument(await readFile(path.join(output, '_articles', '100.md'), 'utf8'));
  const section = parseDocument(await readFile(path.join(output, '_sections', '42.md'), 'utf8'));
  assert.equal(article.data.section, '/rubriques/42/');
  assert.equal(section.data.parent, '/themes/');
  assert.equal(article.data.published_at, '2020-03-04T12:00:00Z');
  assert.deepEqual(article.data.authors, ['Auteur']);
  assert.match(article.body, /\[Train\]\(\/rubriques\/42\/\)/);
  assert.ok(article.body.includes(`![Le train](/media/archive/${imageName})`));
  assert.match(article.body, /\[Ce modèle\]\(\/articles\/100\/#modele\)/);
  assert.doesNotMatch(article.body, /<h2|<img|{% raw %}/);
  const config = parse(await readFile(path.join(root, '.pages.yml'), 'utf8'));
  for (const [name, document] of [['sections', section], ['articles', article]]) {
    const schema = config.content.find(item => item.name === name);
    assert.equal(schema.filename, '{primary}.md');
    assert.equal(schema.path, `_${name}`);
    assert.equal(schema.fields.find(field => field.name === 'body').options.format, 'markdown');
    for (const key of Object.keys(document.data)) {
      assert.ok(schema.fields.some(field => field.name === key), `${name}.${key} is missing from Pages CMS`);
    }
  }
  const reference = config.content.find(item => item.name === 'articles').fields.find(field => field.name === 'section');
  assert.equal(reference.options.collection, 'sections');
  assert.equal(reference.options.value, '{fields.permalink}');
  assert.equal('article_ids' in section.data, false);
  assert.equal('breadcrumbs' in article.data, false);
  const urls = JSON.parse(await readFile(path.join(output, '_data', 'legacy_urls.json')));
  assert.equal(urls.article100, '/articles/100/');
  await writeFile(path.join(cache, 'report.json'), JSON.stringify({ errors: [], unavailableAssets: [], running: false }));
  const pending = spawnSync(process.execPath, [path.join(root, 'scripts', 'import-site.mjs'), 'generate', cache, output], { encoding: 'utf8' });
  assert.notEqual(pending.status, 0);
  assert.match(pending.stderr, /Capture is incomplete/);
});
