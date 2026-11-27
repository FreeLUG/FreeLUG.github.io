# Site FreeLUG

Site en français construit avec Jekyll et compatible avec GitHub Pages.
Les contenus sont en Markdown avec métadonnées YAML et modifiables avec
[Pages CMS](https://pagescms.org/docs/), sans écrire de HTML.
Aucun serveur CMS n’est nécessaire. La recherche dans les rubriques est une
amélioration JavaScript facultative ; tous les articles restent accessibles sans elle.
Le thème clair ou sombre suit automatiquement la préférence de l'appareil,
sans JavaScript.

## Modifier les contenus

### Préparer les adresses descriptives des articles

La migration des adresses descriptives est appliquée. Les rapports
[articles](scripts/seo/article-url-mapping.json) et
[rubriques](scripts/seo/section-url-mapping.json) conservent les anciens fichiers
et adresses ainsi que leurs remplacements. Ne pas les régénérer : ils servent
de registre de migration. Les identifiants historiques, dates, signatures et
adresses des publications d’origine sont conservés dans les métadonnées.

Les articles utilisent `/articles/titre-descriptif/`, indépendamment de leur
rubrique. Les rubriques suivent leur hiérarchie : `/association/statuts/`,
`/regions/bretagne/`, `/themes/train/`. Les profils d’auteurs gardent leurs
adresses existantes. Les relations et liens Markdown utilisent les nouvelles
adresses. Ne pas changer une adresse publiée lorsque son titre change.

Les adresses numériques provisoires `/articles/123/` et `/rubriques/123/`
n’ont jamais été publiées et ne génèrent plus de pages de redirection.
Les véritables adresses historiques `spip.php?article123`, `?rubrique123`
et `?auteur123` restent prises en charge par le registre
[_data/legacy_urls.json](_data/legacy_urls.json) et le script de compatibilité.
Les formes `id_article=123`, `id_rubrique=123`, `id_auteur=123` et les anciens
chemins `article123.html`, `rubrique123.html`, `auteur123.html` sont reconnus.
Les identifiants inconnus ou contradictoires ne déclenchent aucune redirection.

La page statique `/spip.php/`, exclue du sitemap et marquée `noindex`, sert
de point d’entrée. Un hébergeur statique normalise `/spip.php?article123`
vers `/spip.php/?article123`, puis le navigateur rejoint directement la nouvelle
adresse en conservant son fragment. La page 404 utilise le même script lorsque
la normalisation n’est pas disponible. Les autres paramètres SPIP ne sont pas
transmis aux nouvelles pages statiques. Ce mécanisme nécessite JavaScript ;
GitHub Pages ne permet pas de véritables réponses HTTP 301 vers les articles
en fonction des paramètres. Pour cela, configurer un proxy ou un autre hébergement.
Les liens externes et les adresses des sources restent inchangés.

Le domaine canonique de production est `https://www.freelug.org`, défini dans
[_config.yml](_config.yml). Le sitemap exclut les redirections et la page 404.
Les articles proposent des métadonnées de partage et des données structurées
`Article`, sans inventer de date de modification ou de description d’image.
Après `bundle exec jekyll build`, exécuter `node scripts/check-site-links.mjs`
et `node scripts/check-article-previews.mjs`. Ces vérifications tournent aussi
dans le workflow GitHub Pages.

1. Commiter et pousser les fichiers sur GitHub.
2. Ouvrir [app.pagescms.org](https://app.pagescms.org) et se connecter avec GitHub.
3. Autoriser l’application GitHub Pages CMS pour `FreeLUG/FreeLUG.github.io`.
   L’approbation d’un propriétaire de l’organisation peut être nécessaire.
4. Sélectionner le dépôt et la branche à modifier.
5. Choisir **Accueil**, **Rubriques**, **Articles — Association**,
   **Articles — Régions**, **Articles — Thèmes**, **Auteurs**,
   **Navigation et cartes des rubriques** ou **Page introuvable**, puis enregistrer
   les modifications.

L’accueil est dans [index.md](index.md), les rubriques dans `_sections/*.md`,
les articles dans `_articles/association/`, `_articles/regions/` ou
`_articles/themes/`, les profils publics dans `_authors/*.md`, la navigation dans
[_data/navigation.yml](_data/navigation.yml), le schéma de l’éditeur dans
[.pages.yml](.pages.yml) et les images téléversées dans [media](media/).
Conserver `layout: home` dans les métadonnées de la page.
La sélection du forum est éditoriale : elle n’est pas synchronisée automatiquement.

Les vues des collections dans [.pages.yml](.pages.yml) utilisent `view.sort`
comme liste de champs et `view.default.sort` / `view.default.order` pour le tri
initial, conformément au [schéma Pages CMS](https://pagescms.org/docs/configuration/content/view/).
Un `view.sort` scalaire ou un `view.order` directement dans la vue invalide la
configuration et peut produire l’erreur trompeuse « items must be an array of
content entries ». Après publication d’une correction sur la branche sélectionnée,
recharger la configuration dans Pages CMS.

### Créer une rubrique ou un article

Dans **Rubriques**, ajouter un titre, une adresse unique terminée par `/`
(par exemple `/regions/alsace/`), une rubrique parente et la présentation.
Seules les rubriques principales n’ont pas de parent. Ne jamais choisir la
rubrique elle-même ou l’un de ses descendants comme parent.

Le champ facultatif **Vignette de la rubrique** permet de choisir une image
locale dans la médiathèque. Elle apparaît dans l’en-tête de la rubrique, sa
carte **Les rubriques** et les cartes de navigation de l’accueil, sans recadrage
ni déformation. Les cartes chargent les images à la demande. Une rubrique sans
vignette conserve sa présentation textuelle ; aucune image n’est inventée.
Les vignettes historiques des thèmes sont enregistrées dans `media/themes/` ;
le champ en lecture seule **Vignette d’origine** conserve leur URL source.
Les images officielles récupérées depuis le répertoire des thèmes et les
catégories de LEGO.com sont enregistrées dans ce même dossier avec le préfixe
`lego-`. Leur URL exacte figure dans `image_source` ; les vues utilisent la
copie locale, sans dépendre du site LEGO lors de la consultation.
Les images LEGO restent la propriété de leurs ayants droit ; leur présence ne
signifie pas que le site est affilié au Groupe LEGO.

Les rubriques sans image spécifique utilisent des pictogrammes contextuels
Lucide, bleus et rouges sur fond transparent, dans `media/section-icons/`.
Le bleu reprend celui du site (`#1a407e`) ; le fond blanc des pages reste visible.
Ils remplacent les anciennes vignettes génériques sans modifier les logos et
photographies spécifiques. Leur licence est conservée dans ce dossier. Après
`npm install`, les régénérer avec `node scripts/generate-section-icons.mjs`.
Ces images restent remplaçables via **Vignette de la rubrique** dans Pages CMS ;
`image_source` est réservé aux images récupérées, pas aux pictogrammes générés.

Les vignettes régionales récupérées sont enregistrées dans `media/regions/`
et utilisent les mêmes vues et champs Pages CMS. Pour importer la vignette
d’une rubrique depuis une capture MHTML enregistrée dans Chrome :

```bash
node scripts/import-section-thumbnail.mjs /chemin/rubrique25.mhtml
```

La capture doit provenir de `https://www.freelug.org/spip.php?rubriqueID` et
contenir la vignette originale. L’import conserve le texte et les relations,
ne télécharge aucun fichier supplémentaire et refuse de remplacer une vignette
éditoriale existante. Une capture incomplète n’est pas publiée.

Dans la collection d’articles correspondant à la rubrique principale
(**Association**, **Régions** ou **Thèmes**), ajouter un titre, une adresse
unique (par exemple `/articles/ma-creation/`), sélectionner la rubrique, puis
rédiger le contenu. Les fichiers restent dans `_articles/` pour former une
seule collection Jekyll, mais chaque dossier Pages CMS contient moins de
1 000 articles. Ne pas déplacer un article d’un dossier à l’autre autrement
qu’en sélectionnant la collection correspondant à sa rubrique principale.
La date, les auteurs et le résumé sont modifiables dans le même formulaire.
L’éditeur propose un mode visuel et un mode source Markdown ; les images
s’insèrent depuis la médiathèque.

Les aperçus des articles dans les rubriques et les profils d’auteurs affichent
automatiquement la première image du contenu Markdown, ou le logo FreeLUG si
le contenu ne comporte aucune image. La vignette est redimensionnée sans
recadrage ni déformation et chargée à la demande. Aucun champ supplémentaire
n’est à maintenir dans Pages CMS ; modifier les images du contenu puis
reconstruire le site suffit.

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

### Modifier les auteurs

Dans **Auteurs**, modifier le nom public, le portrait, la présentation Markdown
et les liens publics. Sélectionner les publications dans **Articles de cet
auteur — Association**, **— Régions** ou **— Thèmes**, selon leur collection.
Les trois sélections alimentent ensemble la liste du profil et les crédits des
articles ; seuls les articles déjà présents dans chaque collection sont
proposés. Elles ne prétendent pas reproduire tous les articles du site
historique, dont certains sont hors périmètre ou encore en attente.

Les crédits textuels des articles sont conservés sans changement. Un crédit
devient un lien vers un profil uniquement si cet article y est sélectionné et
si son texte correspond au nom public ou à un crédit historique vérifié.
Les correspondances ambiguës restent du texte : aucune identité n’est déduite
du seul nom. Pour un nouvel auteur, utiliser le même nom public dans le profil
et dans les crédits de ses articles, puis sélectionner ces articles dans son
profil. Les anciens noms vérifiés sont en lecture seule.

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
La vidéo Theora historique `http://brickerik.free.fr/autre/muji_perforeuse.ogg`,
explicitement présente dans sa capture, conserve également son URL exacte
sous forme de lien Markdown. Aucun fichier externe n’est récupéré et aucune
autre source multimédia externe n’est admise par cette exception.
Les vignettes CSS reconnues des documents joints deviennent des images Markdown
uniquement lorsque leurs fichiers sont présents dans la capture, sans supprimer
les liens vers les documents.
Les lecteurs YouTube dont l’URL originale est explicitement conservée dans les
métadonnées de la capture MHTML deviennent aussi des liens Markdown, avec leur
identifiant de liste de lecture lorsqu’il est reconnu, sans accès au site externe.
Les anciens lecteurs Flash YouTube, Dailymotion et `videos.freelug.org`
reconnus conservent également leurs URL vidéo explicites sous forme de liens,
sans importer ni exécuter le lecteur. Les sources ambiguës et les autres
intégrations restent en attente de traitement éditorial.
Les variantes historiques YouTube `&hl=fr_FR&fs=1`, `&hl=fr&fs=1`, `?hl=fr&fs=1` et
`?fs=1&hl=fr_FR` conservent leur URL exacte, y compris le séparateur final `&`
du premier format lorsqu’il est présent ; les paramètres supplémentaires ne
sont pas acceptés. La variante HTTP ou HTTPS `?version=3&hl=fr_FR` conserve aussi
son URL exacte. Un objet contenant uniquement un lecteur avec une URL
explicite reconnue peut être converti sans paramètre `movie`, mais les sources
concurrentes et le texte de remplacement empêchent la conversion.
Les tableaux de gabarit des trains reconnus par leurs dimensions **Largeur**,
**Empattement** et **Porte-à-faux** deviennent des tableaux Markdown sans fusion.
Les grands tableaux sont séparés par largeur ; les valeurs en gras sont conservées
et les valeurs rouges portent la mention explicite `(rouge)`. Les dimensions,
les espaces séparateurs et la continuité des lignes sont vérifiés avant conversion.
Une cellule finale absente dans la source est signalée explicitement, sans lui
attribuer de valeur. Les valeurs existantes, même celles issues d’une erreur
de mise en forme de l’original, sont conservées sans correction.
Les tableaux de tournoi `classement` avec une étiquette par ligne et des cellules
fusionnées uniquement horizontalement deviennent des listes Markdown par tour,
en conservant chaque équipe et score. Les autres tableaux complexes restent
en attente de traitement éditorial.
Les 230 profils publics identifiés dans les signatures des articles capturés
sont repris en Markdown, avec leurs portraits et leurs présentations lorsqu’elles
existent. Les liens personnels sont conservés sans consulter leurs destinations.
Un profil sans biographie garde un corps Markdown vide ; aucun texte n’est inventé.
Le parseur MHTML accepte ces captures uniquement avec l’option explicite
`chromeArchive(contenu, 'author')` et une URL publique exacte `?auteurID`.
L’import des articles reste limité aux URL `?articleID` ; cette option ne publie
pas de profil et n’autorise ni les redirections externes ni les espaces membres.
Pour convertir un profil capturé et son entrée dans l’inventaire des signatures
publiques vérifiées :

```powershell
node scripts\import-author-page.mjs C:\captures\auteur2.mhtml C:\captures\public-author-inventory.json
```

Cet inventaire associe chaque auteur à son `id`, son `source_url`, ses `names`
et aux identifiants `articles` lus dans les signatures des sources sauvegardées,
jamais aux seules listes paginées des profils. L’import préserve les médias
embarqués, refuse d’écraser un profil existant et signale les associations dont
l’article n’est pas encore publié. Après reprise de ces articles, les ajouter
dans la sélection du profil via Pages CMS.

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
Les notes SPIP, y compris les groupes numérotés, deviennent des notes Markdown
avec leurs références et leur texte.
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
node scripts/check-section-thumbnails.mjs
```
