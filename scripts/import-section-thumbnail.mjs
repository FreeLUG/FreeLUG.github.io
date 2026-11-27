import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import { parseDocument } from 'yaml';
import { chromeArchive } from './import-edge-page.mjs';
import { historicalContent } from './historical-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function importSectionThumbnail(file, destination = root) {
  const archive = chromeArchive(await readFile(file, 'utf8'), 'section');
  const id = Number(archive.sourceUrl.match(/rubrique(\d+)$/)[1]);
  const section = (await historicalContent(destination, '_sections')).get(id);
  if (!section) throw new Error(`Unknown section ${id}.`);
  if (!section.metadata.permalink.startsWith('/regions/')) throw new Error('Expected a regional section.');
  const document = domino.createWindow(archive.html).document;
  const images = document.querySelectorAll('#content .cartouche h1 img, #content h1 img.spip_logo');
  if (images.length !== 1) throw new Error(`Missing or ambiguous section thumbnail: ${id}.`);
  const url = new URL(images[0].getAttribute('src'), archive.sourceUrl);
  if (url.origin !== 'https://www.freelug.org' || !/^\/(?:local\/cache-vignettes|IMG)\//.test(url.pathname)) {
    throw new Error('Thumbnail must be hosted on the public www.freelug.org site.');
  }
  const resource = archive.resources.get(url.href);
  if (!resource?.bytes.length || !/^image\/(?:png|jpeg|gif|webp)$/.test(resource.type || '')) {
    throw new Error(`Thumbnail is missing from the archive: ${url.href}`);
  }
  const filename = path.posix.basename(url.pathname);
  const logo = filename.match(/^rubon(\d+)-[a-z0-9]+\.(?:png|jpg|gif|webp)$/);
  if (!logo || ![0, id].includes(Number(logo[1]))) throw new Error('Thumbnail identity does not match the section.');
  const image = `/media/regions/${filename}`;
  if (section.metadata.image && (section.metadata.image !== image || section.metadata.image_source !== url.href)) {
    throw new Error(`Section ${id} already has an editorial thumbnail; refusing to replace it.`);
  }
  const target = path.join(destination, image);
  try {
    await access(target);
    if (!(await readFile(target)).equals(resource.bytes)) throw new Error(`Conflicting thumbnail file: ${filename}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const frontmatter = section.text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/);
  const metadata = parseDocument(frontmatter[2]);
  metadata.set('image', image);
  metadata.set('image_source', url.href);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, resource.bytes);
  await writeFile(section.file, frontmatter[1] + metadata.toString().replace(/\n$/, '') + frontmatter[3] + frontmatter[4]);
  return { id, title: section.metadata.title, image, source: url.href };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/import-section-thumbnail.mjs <section.mhtml> [site-directory]');
  console.log(JSON.stringify(await importSectionThumbnail(path.resolve(process.argv[2]), process.argv[3] && path.resolve(process.argv[3]))));
}