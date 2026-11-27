(function () {
  const stylesheet = document.getElementById('dark-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const key = 'freelug-theme';
  let choice;

  try {
    choice = localStorage.getItem(key);
  } catch (error) {
    console.warn('Impossible de lire la préférence de thème.', error);
  }
  if (choice !== 'light' && choice !== 'dark') choice = null;

  function applyTheme() {
    stylesheet.media = choice === 'dark' ? 'all' : choice === 'light' ? 'not all' : '(prefers-color-scheme: dark)';
  }

  applyTheme();
  document.addEventListener('DOMContentLoaded', function () {
    const button = document.querySelector('.theme-toggle');
    const sun = button.querySelector('.theme-icon-sun');
    const moon = button.querySelector('.theme-icon-moon');
    function updateButton() {
      const dark = choice ? choice === 'dark' : systemTheme.matches;
      const label = dark ? 'Activer le thème clair' : 'Activer le thème sombre';
      button.setAttribute('aria-label', label);
      button.title = label;
      sun.toggleAttribute('hidden', !dark);
      moon.toggleAttribute('hidden', dark);
    }

    updateButton();
    button.hidden = false;
    button.addEventListener('click', function () {
      const dark = choice ? choice === 'dark' : systemTheme.matches;
      choice = dark ? 'light' : 'dark';
      applyTheme();
      updateButton();
      try {
        localStorage.setItem(key, choice);
      } catch (error) {
        console.warn('Impossible d’enregistrer la préférence de thème.', error);
      }
    });
    systemTheme.addEventListener('change', updateButton);
    window.addEventListener('storage', function (event) {
      if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
      choice = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
      applyTheme();
      updateButton();
    });
  });
}());
