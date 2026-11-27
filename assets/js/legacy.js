const legacyScript = document.currentScript;
const legacyParameters = new URLSearchParams(location.search);
const legacyKeys = new Set();
for (const [name, value] of legacyParameters) {
  if (/^(article|rubrique|auteur)[1-9]\d*$/.test(name) && !value) legacyKeys.add(name);
  const kind = name.match(/^id_(article|rubrique|auteur)$/)?.[1];
  if (kind && /^[1-9]\d*$/.test(value)) legacyKeys.add(kind + value);
}
const legacyPathKey = location.pathname.match(/\/((?:article|rubrique|auteur)[1-9]\d*)\.html$/)?.[1];
if (legacyPathKey) legacyKeys.add(legacyPathKey);
const legacyKey = legacyKeys.size === 1 ? [...legacyKeys][0] : undefined;
const legacyStatus = document.querySelector('.legacy-status');
if (legacyKey) {
  fetch(legacyScript.dataset.map)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(urls => {
      const target = Object.hasOwn(urls, legacyKey) && urls[legacyKey];
      if (typeof target === 'string' && /^\/([a-z0-9-]+\/)+$/.test(target)) {
        const base = legacyScript.dataset.map.replace(/\/assets\/legacy-urls\.json$/, '');
        if (legacyStatus) {
          const link = document.createElement('a');
          link.href = base + target + location.hash;
          link.textContent = 'Consulter la publication';
          legacyStatus.replaceChildren(link);
        }
        location.replace(base + target + location.hash);
      } else if (legacyStatus) {
        legacyStatus.textContent = 'Cette publication n’est pas disponible dans cette archive.';
      }
    })
    .catch(error => {
      console.error('FreeLUG : impossible de retrouver cette ancienne adresse.', error);
      if (legacyStatus) legacyStatus.textContent = 'La recherche de cette ancienne adresse a échoué.';
    });
} else if (legacyStatus && legacyKeys.size > 1) {
  legacyStatus.textContent = 'Cette adresse contient plusieurs identifiants de publication.';
}
