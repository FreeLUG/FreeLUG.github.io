# Site FreeLUG

Site en français construit avec Jekyll et compatible avec GitHub Pages.
Les contenus sont en Markdown avec métadonnées YAML et modifiables avec
[Pages CMS](https://pagescms.org/docs/), sans écrire de HTML.
Aucun serveur CMS n’est nécessaire. La recherche dans les rubriques est une
amélioration JavaScript facultative ; tous les articles restent accessibles sans elle.

## Modifier les contenus

1. Commiter et pousser les fichiers sur GitHub.
2. Ouvrir [app.pagescms.org](https://app.pagescms.org) et se connecter avec GitHub.
3. Autoriser l’application GitHub Pages CMS pour `FreeLUG/FreeLUG.github.io`.
   L’approbation d’un propriétaire de l’organisation peut être nécessaire.
4. Sélectionner le dépôt et la branche à modifier.
5. Choisir **Accueil**, **Rubriques**, **Articles**,
   **Navigation et cartes des rubriques** ou **Page introuvable**, puis enregistrer
   les modifications.

L’accueil est dans [index.md](index.md), les rubriques dans `_sections/*.md`,
les articles dans `_articles/*.md`, la navigation dans
[_data/navigation.yml](_data/navigation.yml), le schéma de l’éditeur dans
[.pages.yml](.pages.yml) et les images téléversées dans [media](media/).
Conserver `layout: home` dans les métadonnées de la page.
La sélection du forum est éditoriale : elle n’est pas synchronisée automatiquement.

### Créer une rubrique ou un article

Dans **Rubriques**, ajouter un titre, une adresse unique terminée par `/`
(par exemple `/rubriques/alsace/`), une rubrique parente et la présentation.
Seules les rubriques principales n’ont pas de parent. Ne jamais choisir la
rubrique elle-même ou l’un de ses descendants comme parent.

Dans **Articles**, ajouter un titre, une adresse unique (par exemple
`/articles/ma-creation/`), sélectionner la rubrique, puis rédiger le contenu.
La date, les auteurs et le résumé sont modifiables dans le même formulaire.
L’éditeur propose un mode visuel et un mode source Markdown ; les images
s’insèrent depuis la médiathèque.

Les listes d’articles, compteurs, sous-rubriques et fils d’Ariane sont calculés
à partir des champs **Rubrique** et **Rubrique parente**. Il n’y a aucune liste
d’identifiants à maintenir. Une nouvelle rubrique apparaît dans son parent ;
pour l’ajouter à la navigation principale, modifier **Navigation et cartes des
rubriques**. Conserver les adresses après publication : elles servent également
aux relations entre les contenus. Avant de supprimer une rubrique, déplacer
ses articles et ses sous-rubriques et retirer son éventuel lien de navigation.

Les champs historiques sont en lecture seule et restent vides pour les nouveaux
contenus. Les gabarits HTML dans [_layouts](_layouts/) sont réservés à la mise
en page, pas à la rédaction.

### Importer le site historique

L’import complet est en cours. La lecture page par page dans Edge ou Chrome permet de
reprendre les contenus publics lorsque le navigateur intégré est bloqué.
Seul `https://www.freelug.org` est à parcourir : ne pas consulter ni importer
`https://adherents.freelug.org/`, même lorsqu’un ancien article y redirige.
Les liens externes présents dans les textes ne constituent pas une autorisation
de parcourir ou d’importer leurs destinations.
Les 77 rubriques connues sont présentes, avec leurs descriptions et leur
hiérarchie. Les articles sont ajoutés progressivement, avec leurs dates et
auteurs ; une rubrique présente ne signifie pas que tous ses articles ont
été repris. Le [plan public par rubrique](https://www.freelug.org/spip.php?page=plan&tri=par_rubrique),
enregistré depuis Chrome, référence 1 841 articles dans ces 77 rubriques.
Cette liste inclut les pages anciennes absentes des premières listes paginées ;
son état et la source sont indiqués dans `_data/migration.json`.
Les articles des autres branches du plan, notamment **Translation**, ne font
pas partie des trois rubriques retenues.
Les anciennes entrées qui redirigent hors du site sont conservées sous forme
de notices Markdown, avec le titre et la date du plan public et un lien vers
la publication d’origine. Le contenu des sites externes n’est pas recopié ;
aucun auteur n’est déduit de ces liens.
Les médias indisponibles font l’objet d’une note explicite dans le Markdown :
l’article 418 conserve le texte alternatif de son icône d’aide absente, et
l’article 1298 conserve le lien vidéo présent dans le texte à la place du lecteur
vide de la capture. Aucun contenu externe n’a été importé pour ces substitutions.
Les lecteurs vidéo et audio natifs sont remplacés par des liens Markdown vers
leurs fichiers publics sous `www.freelug.org/IMG/`, sans recopier les commandes
du lecteur ni télécharger automatiquement les fichiers multimédias.
Les lecteurs YouTube dont l’URL originale est explicitement conservée dans les
métadonnées de la capture MHTML deviennent aussi des liens Markdown, sans accès
au site externe. Les autres intégrations restent en attente de traitement éditorial.
Les profils publics des auteurs seront repris après les rubriques et articles.

La rubrique **Statuts** contient ses quatre documents. Le scan original du
récépissé est conservé dans `media/archive/`. Les textes complets déjà capturés
sans média manquant ont également été convertis ; les autres restent en attente
dans les sources de travail, hors du dépôt.

Pour une page ouverte individuellement dans Edge ou Chrome, choisir **Enregistrer sous >
Page web complète**, puis convertir le fichier local :

```shell
node scripts\import-edge-page.mjs C:\chemin\article123.html
```

Chrome propose aussi **Page web, fichier unique (*.mhtml)**. Ce format contient
la page et ses médias dans un seul fichier, sans dossier de ressources séparé :

```shell
node scripts\import-edge-page.mjs C:\chemin\article123.mhtml
```

Le résultat Markdown est le même ; l’import refuse une archive tronquée ou
une image absente de l’archive.

Attendre la fin de l’enregistrement avant de changer de page : Chrome peut
annuler un téléchargement encore en cours lors de la navigation suivante.

Cette commande ne fait aucune requête réseau. Elle conserve le texte, les
crédits, les notes et les documents joints, ainsi que les images affichées
enregistrées par le navigateur. Elle refuse d’écraser
un article existant ou de publier un article dont une image enregistrée manque.
Les liens vers des originaux haute définition sur le site historique sont
conservés et signalés dans le résultat ; ils ne sont pas téléchargés implicitement.
Les contenus incorporés et tableaux complexes nécessitent une reprise éditoriale.

Les outils dans [scripts](scripts/) nécessitent Node.js et `npm ci`.
Le générateur convertit les contenus capturés en fichiers Markdown, réécrit les
liens internes et conserve les métadonnées d’origine. Il refuse un inventaire
incomplet et les tableaux complexes qui nécessitent une adaptation éditoriale,
plutôt que de conserver du HTML ou de perdre leur structure.

```shell
node scripts\import-site.mjs generate C:\chemin\capture-complete
npm test
```

Le générateur est destiné à l’import initial : ne pas le relancer sur des
contenus déjà modifiés dans Pages CMS sans comparer les changements.

La collecte utilise une seule requête à la fois et attend cinq secondes avant
chaque nouvelle requête au site source, y compris pour les médias et les liens
de redirection. Les articles et médias déjà enregistrés sont réutilisés ;
les pages hors périmètre et les médias définitivement absents sont mémorisés.
Un point de reprise est enregistré après chaque nouvelle page ou média.

La collecte s’arrête immédiatement en cas de réponse HTTP 401, 403, 429 ou 503,
sans réessayer ni contourner les protections. Si le serveur fournit `Retry-After`,
sa valeur est conservée dans le message d’erreur avant toute reprise manuelle.
Ne pas relancer tant que l’accès n’est pas rétabli. L’appel
`window.stopFreeLUGCapture()` dans la page de collecte permet également de
demander une pause ; aucune nouvelle requête source ne démarre ensuite.

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

- teste la conversion Markdown et la compatibilité des contenus avec le schéma CMS ;
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
