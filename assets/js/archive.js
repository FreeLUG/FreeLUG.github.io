document.querySelectorAll('[data-archive]').forEach(archive => {
  const search = archive.querySelector('.archive-search');
  const input = search.querySelector('input');
  const entries = [...archive.querySelectorAll('[data-entry]')];
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const texts = entries.map(entry => normalize(entry.textContent));
  search.hidden = false;
  input.addEventListener('input', () => {
    const words = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let count = 0;
    entries.forEach((entry, index) => {
      entry.hidden = !words.every(word => texts[index].includes(word));
      if (!entry.hidden) count++;
    });
    archive.querySelector('.archive-result').textContent = `${count} article${count !== 1 ? 's' : ''}`;
    archive.querySelector('.archive-empty').hidden = count !== 0;
  });
});
