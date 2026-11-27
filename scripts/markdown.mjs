import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

function trainGeometryTable(node, service) {
  if (!node.classList.contains('spip') || node.querySelector('table')) return null;
  const rows = Array.from(node.querySelectorAll('tr'), row => Array.from(row.children));
  const plain = cell => cell.textContent.trim();
  const unmerged = cell => !cell.hasAttribute('rowspan') && !cell.hasAttribute('colspan');
  const wide = rows[0]?.[1]?.getAttribute('colspan') === '23';
  if (rows[0]?.length !== 2 || plain(rows[0][0]) ||
      rows[0][0].getAttribute('colspan') !== '2' || rows[0][0].getAttribute('rowspan') !== '2' ||
      plain(rows[0][1]) !== 'Largeur' || rows[0][1].hasAttribute('rowspan') ||
      rows[0][1].getAttribute('colspan') !== (wide ? '23' : '3')) return null;
  const widthCells = wide ? [rows[1]?.[0], rows[1]?.[2], rows[1]?.[4]] : rows[1];
  if (rows[1]?.length !== (wide ? 5 : 3) || !widthCells?.every(Boolean) ||
      widthCells.map(plain).join(',') !== '6,8,10' ||
      !widthCells.every(cell => !cell.hasAttribute('rowspan') &&
        (wide ? cell.getAttribute('colspan') === '7' : unmerged(cell))) ||
      (wide && ![rows[1][1], rows[1][3]].every(cell => !plain(cell) && unmerged(cell)))) return null;
  const overhang = wide ? rows[2] : null;
  if (wide && (overhang?.length !== 24 || plain(overhang[0]) !== 'Porte-à-faux' ||
      overhang[0].getAttribute('colspan') !== '2' || overhang[0].hasAttribute('rowspan') ||
      !overhang.slice(1).every(unmerged) || plain(overhang[8]) || plain(overhang[16]) ||
      ![0, 1, 2].every(group => overhang.slice(1 + group * 8, 8 + group * 8)
        .map(plain).join(',') === '4,5,6,7,8,9,10'))) return null;
  const data = rows.slice(wide ? 3 : 2);
  const marker = data[0]?.[0];
  if (!data.length || !marker || plain(marker) !== 'Empattement' ||
      marker.getAttribute('rowspan') !== String(data.length) || marker.hasAttribute('colspan')) return null;
  const values = data.map((cells, index) => index ? cells : cells.slice(1));
  if (!values.every(cells => (wide ? [23, 24].includes(cells.length) : cells.length === 4) && cells.every(cell =>
      cell.nodeName === 'TD' && unmerged(cell)) &&
      cells.every((cell, index) => wide && [8, 16].includes(index)
        ? !cell.innerHTML.trim() : /^\d+$/.test(plain(cell)))) ||
      !values.every((cells, index) => !index || Number(plain(cells[0])) === Number(plain(values[index - 1][0])) + 1) ||
      Array.from(node.querySelectorAll('[style]')).some(element => element.nodeName !== 'SPAN' ||
        element.getAttribute('style') !== 'color: #FE0109' || !/^\d+$/.test(plain(element)))) return null;
  const missingCell = 'Cellule absente dans l’original';
  const cellText = cell => cell ? service.turndown(cell.innerHTML) +
    (cell.querySelector('span[style="color: #FE0109"]') ? ' (rouge)' : '') : missingCell;
  const table = (headers, cells) => {
    const line = values => `| ${values.join(' | ')} |`;
    return [line(headers), line(headers.map(() => '---')), ...cells.map(row => line(row.map(cellText)))].join('\n');
  };
  const colorNote = node.querySelector('span[style="color: #FE0109"]')
    ? 'La mention « (rouge) » conserve le signalement en rouge du tableau d’origine.\n\n' : '';
  const missingNote = wide && values.some(row => row.length === 23)
    ? 'Une cellule finale est absente dans la source et porte la mention « Cellule absente dans l’original ». Les valeurs existantes sont conservées sans correction.\n\n' : '';
  if (!wide) {
    return '\n\n' + colorNote + table(['Empattement', ...widthCells.map(cell => `Largeur ${plain(cell)}`)], values) + '\n\n';
  }
  return '\n\n' + colorNote + missingNote + widthCells.map((cell, group) =>
    `**Largeur : ${plain(cell)}**\n\n` +
    table(['Empattement', ...overhang.slice(1 + group * 8, 8 + group * 8).map(cell => `Porte-à-faux ${plain(cell)}`)],
      values.map(row => [row[0], ...Array.from({ length: 7 }, (_, column) => row[1 + group * 8 + column] || null)]))).join('\n\n') + '\n\n';
}

export function toMarkdown(html) {
  const noteId = /^nb(?:\d+(?:-\d+)?|_[a-z0-9_]+)$/i;
  const noteReference = /^#nb(\d+(?:-\d+)?|_[a-z0-9_]+)$/i;
  const noteBacklink = /^#nh(?:\d+(?:-\d+)?|_[a-z0-9_]+)$/i;
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
        const geometry = trainGeometryTable(node, service);
        if (geometry) return geometry;
        const rounds = rows.map(row => Array.from(row.children));
        const widths = rounds.map(cells => cells.reduce((sum, cell) =>
          sum + Number(cell.getAttribute('colspan') || 1), 0));
        if (!node.querySelector('table, [rowspan]') && node.classList.contains('classement') &&
            rounds.length && rounds.every(cells => cells.length > 1 &&
              cells[0].nodeName === 'TH' && !cells[0].hasAttribute('colspan') &&
              cells[0].textContent.trim() && cells.slice(1).every(cell => cell.nodeName === 'TD' &&
                (!cell.hasAttribute('colspan') || /^[1-9]\d*$/.test(cell.getAttribute('colspan'))))) &&
            widths.every(width => Number.isSafeInteger(width) && width === widths[0])) {
          const caption = node.querySelector('caption');
          return '\n\n' + (caption ? service.turndown(caption.innerHTML) + '\n\n' : '') +
            rounds.map(cells => `**${service.turndown(cells[0].innerHTML)}**\n\n` +
              cells.slice(1).map(cell => '- ' + service.turndown(cell.innerHTML)
                .replace(/\n/g, '\n  ')).join('\n')).join('\n\n') + '\n\n';
        }
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
