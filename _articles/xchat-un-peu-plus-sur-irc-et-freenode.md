---
title: "Xchat : un peu plus sur IRC et Freenode"
permalink: "/articles/xchat-un-peu-plus-sur-irc-et-freenode/"
section: "/association/les-outils-informatiques/"
published_at: "2003-03-04T09:51:12Z"
authors: []
description: "Que faire lorsque son nick est pris, ou lorsque le PC plante et
  que l’on se retrouve avec 2 nicks sans pouvoir reprendre son \"vrai\" nick ?
  Qui se cache sous un nick ? Voila une nouvelle série de questions auxquelles
  je vais tenter de répondre via ce nouvel article."
source_id: 75
source_url: "https://www.freelug.org/spip.php?article75"
---

Que faire lorsque son nick est pris, ou lorsque le PC plante et que l’on se retrouve avec 2 nicks sans pouvoir reprendre son "vrai" nick ? Qui se cache sous un nick ? Voila une nouvelle série de questions auxquelles je vais tenter de répondre _via_ ce nouvel article.

Un petit rappel, avant de vous lancer dans la lecture de cet article, vous devez avoir lu "[Comment on installe Xchat](/articles/x-chat-installation-rapide-et-simple/)" et "[Xchat : en savoir plus](/articles/xchat-en-savoir-plus/).

## Un peu plus sur Freenode

C’est grâce au réseau de [freenode.net](http://www.freenode.net/) que nous arrivons à tous nous retrouver. Mais en plus de fournir un lien IRC, freenode.net dispose de nombreux outils bien pratiques.

Vous avez sûrement tous vu **ChanServ** sur #freelug. Et bien il est en quelque sorte le gardien du canal. Il sait à qui il appartient, qui a le droit d’être OP (opérateur = admin).

A coté de Chanserv, il y a son grand copain (et le nôtre très bientôt) **NickServ**. NickServ est lui le gardien des nick. Et la je sens que vous avez plein de questions :))

## Comment faire pour enregistrer mon nick ?

Vous voulez que votre nick soit à vous et à personne d’autre. Et en plus vous voulez être capable de bouter celui qui vous le prend. Ah ben là, NickServ, va réellement devenir votre ami.

**–** Phase 1 : **je m’enregistre**

```
/msg NickServ REGISTER votre-mot-de-passe
```

Et vous allez recevoir une réponse (soit dans la fenêtre active SOIT dans xxx.freenode.net) du genre :

```
-NickServ- Your nickname is now registered under the hostmask [vous ...]
-NickServ- Your password is [votre-mot-de-passe] - Remember this for later use
```

Félicitations, vous êtes enregistré :) Par contre si vous avez une erreur du genre "this nickname is own by someone else" Ben ca veut dire ce que ca veut dire ... Quelqu’un a déjà enregistré ce nick. Il va falloir en trouver un autre. C’est pour cela que je vous conseillais fortement d’éviter votre prénom.

**–** Phase 2 : **je m’identifie**

Et oui, maintenant que vous êtes enregistré, il faut vous identifier à chaque fois que vous lancer Xchat, mais aussi à chaque fois que vous changez de nick et revenez à celui-là.

Au démarrage de Xchat, dans la fenêtre xx.freenode.net, vous allez avoir le message :

```
-NickServ- This nickname is owned by someone else
-NickServ- If this is your nickname, type /msg NickServ IDENTIFY <password>
```

Eh bien, on va faire ce qu’il nous demande de faire alors !

```
/msg NickServ IDENTIFY votre-mot-de-passe
```

Et le résultat doit être :

```
-NickServ- Password accepted - you are now recognized
```

**–** Phase 3 : **Identification automatique avec Xchat**

Vous voulez que ce soit automatique à chaque démarrage ?  
Bon, d’accord. On va aller changer les paramètres de connexion.

Menu X-chat -> Liste des servers (server list) (le premier) click (1 seul) sur Openprojects.net puis click (1 seul) sur FreeLUG, ensuite le bouton EDITER qui se trouve en bas.

Et on ajoute à la ligne Cmd. Connexion : /msg NickServ IDENTIFY votre-mot-de-passe

Et c’est tout. Pour faire un test, le mieux est de quitter Xchat et de le relancer. Vous devriez avoir automatiquement les messages d’identification tels que décris ci-dessus.

## Actions possibles une fois enregistré

Tout d’abord, une commande fort utile car elle permet de savoir qui est derrière un nick :

```
/whois khan
```

Evidemment, il faut remplacer Khan par le nick dont vous voulez connaître les détails.

Attention : le résultat est dans le fenêtre xxx.freenode.net

```
--- [khan] (~gael@gfrazier.net1.nerim.net) : gael
--- [khan] @#freelug @#khan  
--- [khan] adams.freenode.net :Oslo, Norway, EU
---  khan :is an identified user
--- [khan] idle 00:05:34, signon: Mon Mar  3 08:28:40
--- [khan] End of WHOIS list.
```

Quelques explications : la première ligne ce sont mes paramètres de connexion à Internet, le @ veut dire que je suis admin sur le canal en question, J’ai aussi la ligne qui dit que je suis identifié et le nom de mon server pour IRC.

Cette commande est pratique pour la suite, car elle permet de savoir dans quel cas on se trouve.

**–** Cas 1 : **On m’a pris mon nick !**

Et bien, nous allons passer en mode _pied-au-cul-thérapie_.

```
/msg NickServ RECOVER votre-nick votre-mot-de-passe
/msg NickServ RELEASE votre-nick votre-mot-de-passe
/nick votre-nick
/msg NickServ IDENTIFY votre-mot-de-passe
```

La première ligne "jette" celui qui a emprunté votre nick, ensuite vous le libérez (cette commande n’est pas utile si vous tapez assez vite car le nick est bloqué pendant un certain temps juste pour vous), ensuite on change de nick et on s’identifie.

Exemple de résulat de la première ligne :

```
Khan est parti (Killed (NickServ (Nickname Enforcement)))
```

**–** cas 2 : **Mon PC a planté, et mon nick est toujours là**

On appelle ça un fantôme (Ghost en anglais). Je l’appelle aussi Zombie, mais ce n’est pas le nom officiel :). Et, une fois de plus, merci à Freenode car NickServ a prévu ce genre de cas.

```
/msg NickServ GHOST votre-nick votre-mot-de-passe
```

Le résultat est immédiat :

```
xxx has quit (Killed (NickServ (Ghost: xxxx!xxxx.xx.xx)))
```

Et maintenant il suffit de reprendre votre joli nick

```
/nick votre nick
```

Et vala, vous devriez pouvoir retrouver votre peau :)

**–** Cas 3 : **Je veux en savoir plus**

Et bien je vais vous répondre comme un prof de la fac : il faut lire le manuel, désolé, mais je ne connais pas tout !

```
/msg NickServ help
y'a aussi
/msg NickServ help RECOVER
etc.
```

J’espère que cet article vous permettra de mieux comprendre ce qui se passe et être le maître de votre nick.

Comme d’habitude, les questions, commentaires (et corrections) sont les bienvenus, soit sur #freelug soit _via_ FreeLUG.general.
