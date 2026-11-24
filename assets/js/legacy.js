const legacyScript = document.currentScript;
const legacyKey = location.search.slice(1).match(/^(article|rubrique)(\d+)(?:&|$)/)?.[0].replace(/&$/, '') ||
  location.pathname.match(/\/((?:article|rubrique)\d+)\.html$/)?.[1];
if (legacyKey) {
  fetch(legacyScript.dataset.map)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(urls => {
      if (urls[legacyKey]) {
        const base = legacyScript.dataset.map.replace(/\/assets\/legacy-urls\.json$/, '');
        location.replace(base + urls[legacyKey] + location.hash);
      }
    })
    .catch(error => {
      console.error('FreeLUG : impossible de retrouver cette ancienne adresse.', error);
      document.querySelector('.legacy-status').textContent = 'La recherche de cette ancienne adresse a échoué. Utilisez les rubriques ci-dessus.';
    });
}
