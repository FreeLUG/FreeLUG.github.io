# Site FreeLUG

Site en français construit avec Jekyll et compatible avec GitHub Pages.
Les contenus de l’accueil sont modifiables avec [Pages CMS](https://pagescms.org/docs/).
Aucun serveur CMS ni JavaScript côté visiteur n’est nécessaire.

## Modifier les contenus

1. Commiter et pousser les fichiers sur GitHub.
2. Ouvrir [app.pagescms.org](https://app.pagescms.org) et se connecter avec GitHub.
3. Autoriser l’application GitHub Pages CMS pour `FreeLUG/FreeLUG.github.io`.
   L’approbation d’un propriétaire de l’organisation peut être nécessaire.
4. Sélectionner le dépôt et la branche à modifier, puis **Accueil**.
5. Modifier l’accroche, la présentation, les cartes, la sélection du forum ou le
   bloc d’adhésion, puis enregistrer.

Les contenus sont dans [index.md](index.md), le schéma de l’éditeur dans
[.pages.yml](.pages.yml) et les images téléversées dans [media](media/).
Conserver `layout: home` dans les métadonnées de la page.
La sélection du forum est éditoriale : elle n’est pas synchronisée automatiquement.

## Présentation

Le gabarit est dans [_layouts/home.html](_layouts/home.html), les styles dans
[assets/css/site.css](assets/css/site.css) et la configuration dans
[_config.yml](_config.yml). La mise en page s’adapte aux mobiles et utilise
les polices du système, sans ressources externes.

L’identité visuelle s’inspire de la page publique du
[portail des adhérents](https://adherents.freelug.org/) : bleu foncé, fond blanc,
encadrés et boutons arrondis. Le logo et l’illustration des trois briques
proviennent du portail existant et sont conservés sans modification dans
[media](media/) pour ne pas dépendre d’une connexion au portail :

- [freelug-logo.png](media/freelug-logo.png) :
  [logo du portail](https://adherents.freelug.org/images/FreeLUG_fond_rectangle_transparent_100.png) ;
- [materiel.png](media/materiel.png) :
  [illustration « Matériel »](https://adherents.freelug.org/images/navigation/materiel.png).

Aucune photographie, aucun avatar et aucun message du forum n’est recopié.
Les textes de présentation sont originaux et s’appuient sur les rubriques
publiques du [forum](https://forum.freelug.org/), notamment
[les créations](https://forum.freelug.org/c/lego/creations/11),
[la CAO](https://forum.freelug.org/c/lego/cao/12) et
[les expositions et rencontres](https://forum.freelug.org/c/communaute/communaute-expo/13).
Les cartes renvoient aux discussions sources.

## Publier

Dans **Settings > Pages > Build and deployment**, choisir **GitHub Actions**
comme source, puis pousser les fichiers sur la branche `main`.
Le site sera disponible sur <https://freelug.github.io/>.

Le workflow [pages.yml](.github/workflows/pages.yml) :

- construit le site avec les dépendances Jekyll officielles de GitHub Pages ;
- vérifie la construction des pull requests vers `main`, sans les publier ;
- publie automatiquement les modifications poussées sur `main`, y compris
  celles enregistrées avec Pages CMS ;
- peut être lancé manuellement depuis **Actions > Build and deploy GitHub Pages
  > Run workflow** ; seule la branche `main` est publiée.

Aucun secret personnalisé n’est nécessaire : le déploiement utilise les
autorisations GitHub Actions et l’environnement `github-pages`. Si cet
environnement impose une approbation, valider le déploiement dans GitHub.

## Prévisualiser localement

Avec Ruby et Bundler installés :

Sous Windows, utiliser Ruby+Devkit : certaines dépendances de GitHub Pages
nécessitent les outils de compilation MSYS2.

```shell
bundle install
bundle exec jekyll serve
```

Ouvrir ensuite <http://localhost:4000/>. Pour vérifier uniquement la construction :

```shell
bundle exec jekyll build
```
