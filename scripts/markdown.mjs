import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function toMarkdown(html) {
  const noteId = /^nb(?:\d+|_[a-z0-9_]+)$/i;
  const noteReference = /^#nb(\d+|_[a-z0-9_]+)$/i;
  const noteBacklink = /^#nh(?:\d+|_[a-z0-9_]+)$/i;
  const service = new TurndownService({
    headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-'
  });
  service.use(gfm);
  service.remove(['script', 'style', 'form']);
  service.addRule('lineBreak', { filter: 'br', replacement: () => '  \n' });
  service.addRule('caption', {
    filter: ['figcaption', 'caption'],
    replacement: content => `\n\n${content}\n\n`
  });
  service.addRule('footnoteReference', {
    filter: node => node.nodeName === 'A' && noteReference.test(node.getAttribute('href') || ''),
    replacement: (_, node) => `[^${node.getAttribute('href').slice(3)}]`
  });
  service.addRule('footnoteBacklink', {
    filter: node => node.nodeName === 'A' && (noteId.test(node.id || '') ||
      (node.classList.contains('spip_note') && noteBacklink.test(node.getAttribute('href') || ''))),
    replacement: () => ''
  });
  service.addRule('footnoteWrapper', {
    filter: node => node.nodeName === 'SPAN' && node.classList.contains('spip_note_ref'),
    replacement: (content, node) => {
      const href = node.querySelector('a')?.getAttribute('href') || '';
      if (noteReference.test(href)) return `[^${href.slice(3)}]`;
      if (noteBacklink.test(href)) return '';
      return content;
    }
  });
  service.addRule('footnoteDefinition', {
    filter: node => (['DIV', 'P'].includes(node.nodeName) && noteId.test(node.id || '')) ||
      (node.nodeName === 'P' && noteId.test(node.querySelector('a[id]')?.id || '')),
    replacement: (content, node) => {
      const id = noteId.test(node.id || '') ? node.id : node.querySelector('a[id]').id;
      return `\n\n[^${id.slice(2)}]: ${content.trim().replace(/\n/g, '\n    ')}\n\n`;
    }
  });
  service.addRule('table', {
    filter: 'table',
    replacement: (_, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (node.querySelector('table') || node.querySelector('[colspan], [rowspan]')) {
        throw new Error('A complex table needs editorial conversion to Markdown before import.');
      }
      const values = rows.map(row => Array.from(row.children).map(cell =>
        service.turndown(cell.innerHTML).replace(/\|/g, '\\|').replace(/\n+/g, ' ')));
      const width = Math.max(0, ...values.map(row => row.length));
      if (!width) return '';
      // Without a source header, leave the Markdown header empty instead of promoting data.
      if (!rows[0].querySelector('th')) values.unshift(Array(width).fill(''));
      const line = cells => `| ${Array.from({ length: width }, (_, i) => cells[i] || '').join(' | ')} |`;
      const caption = node.querySelector('caption');
      return '\n\n' + (caption ? service.turndown(caption.innerHTML) + '\n\n' : '') +
        [line(values[0]), line(Array(width).fill('---')), ...values.slice(1).map(line)].join('\n') + '\n\n';
    }
  });
  // Jekyll 3 processes Liquid even inside Markdown code samples.
  return service.turndown(html).trim().replace(/\{\{|\{%/g, token => `{{ '${token}' }}`) + '\n';
}
