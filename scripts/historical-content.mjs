import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

export async function historicalContent(destination, collection) {
  let files;
  try {
    files = await readdir(path.join(destination, collection));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
  const index = new Map();
  for (const name of files.filter(name => name.endsWith('.md'))) {
    const file = path.join(destination, collection, name);
    const text = await readFile(file, 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) throw new Error(`Missing frontmatter: ${file}`);
    const metadata = parse(frontmatter[1]);
    const id = metadata.source_id ?? (name.match(/^(\d+)\.md$/)?.[1] && Number(name.slice(0, -3)));
    if (!id) continue;
    if (index.has(id)) throw new Error(`Duplicate historical ID: ${collection}/${id}`);
    index.set(id, { file, text, metadata });
  }
  return index;
}