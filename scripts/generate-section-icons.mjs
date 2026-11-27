import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/lucide-static');
const destination = path.join(root, 'media/section-icons');
const icons = [
  'id-card', 'users', 'presentation', 'trophy', 'lightbulb',
  'heart-handshake', 'tags', 'folder', 'message-circle-question-mark',
  'monitor-cog', 'handshake', 'users-round', 'clipboard-list',
  'calendar-days', 'file-badge', 'arrow-left-right', 'map', 'map-pin',
  'globe', 'bot', 'blocks', 'pencil-ruler', 'shield', 'contact-round',
  'clapperboard', 'route',
];

await mkdir(destination, { recursive: true });
for (const icon of icons) {
  const text = await readFile(path.join(source, 'icons', `${icon}.svg`), 'utf8');
  const document = domino.createWindow(text).document;
  const image = document.querySelector('svg');
  image.setAttribute('width', '100');
  image.setAttribute('height', '100');
  image.setAttribute('viewBox', '-4 -4 32 32');
  image.setAttribute('stroke', '#1a407e');
  image.setAttribute('stroke-width', '1.6');
  image.removeAttribute('class');
  for (const element of image.querySelectorAll('[stroke="currentColor"], [fill="currentColor"]')) {
    for (const attribute of ['stroke', 'fill']) {
      if (element.getAttribute(attribute) === 'currentColor') {
        element.setAttribute(attribute, '#1a407e');
      }
    }
  }
  image.firstElementChild.setAttribute('stroke', '#c62828');
  await writeFile(path.join(destination, `${icon}.svg`), `${image.outerHTML}\n`);
}
await writeFile(
  path.join(destination, 'LICENSE.txt'),
  await readFile(path.join(source, 'LICENSE')),
);
console.log(`Generated ${icons.length} section icons`);