import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const articleCollectionRoots = new Map([
  ['/association/', 'association'],
  ['/regions/', 'regions'],
  ['/themes/', 'themes']
]);

export async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(file);
  }
  return files.sort();
}

export function articleCollectionForSection(sectionUrl, sections) {
  const sectionsByUrl = new Map([...sections.values()]
    .map(section => [section.metadata.permalink, section.metadata]));
  const visited = new Set();
  let section = sectionsByUrl.get(sectionUrl);
  if (!section) throw new Error(`Unknown article section: ${sectionUrl}`);
  while (section.parent) {
    if (visited.has(section.permalink)) throw new Error(`Section parent cycle: ${sectionUrl}`);
    visited.add(section.permalink);
    section = sectionsByUrl.get(section.parent);
    if (!section) throw new Error(`Missing parent section for article section: ${sectionUrl}`);
  }
  const collection = articleCollectionRoots.get(section.permalink);
  if (!collection) throw new Error(`Unsupported article section root: ${section.permalink}`);
  return collection;
}
