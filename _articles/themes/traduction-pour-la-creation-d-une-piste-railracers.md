---
title: "Traduction pour la création d’une piste RailRacers"
permalink: "/articles/traduction-pour-la-creation-d-une-piste-railracers/"
section: "/themes/train/"
published_at: "2003-08-09T17:38:44Z"
authors: [ "Didier ENJARY" ]
description: "Traduction de la configuration de la piste de course des \"RailRacers\""
source_id: 137
source_url: "https://www.freelug.org/spip.php?article137"
---

**Traduction de la configuration de la piste de course des "RailRacers"**

Le document original est disponible à [www.railracers.com](http://www.railracers.com/)

**le matériel**

_Le Centre de contrôle RailRacer_

Il se compose de deux RCX et d’un connecteur électrique bidirectionnel fait maison (basé sur un inverseur de polarité).  
Le connecteur permet d’alimenter les rails soit depuis les régulateurs de vitesse soit depuis le RCX n°2.

_Les interrupteurs de contrôle_

Ils se compose de deux détecteurs de contact. Ils permettent respectivement de débuter et de réinitialiser une course.  
On peut les remplacer par la télécommande.

_La ligne de départ_

Elle se compose de deux détecteurs de lumière (un sous chaque piste) qui servent à détecter les faux départs et le retour des participants  
à la fin de la course. Ils sont reliés au RCX n°1.

_La ligne d’arrivée_

Elle se compose de deux détecteurs de lumière (un sous chaque piste) qui servent à détecter le gagnant.  
L’alimentation se fait par le dessous de la piste.  
Les rails sont isolés juste après la ligne d’arrivé ce qui évite que les trains parviennent jusqu’au bout de piste.  
L’alimentation de la partie des rails situés après la ligne d’arrivée provient du RCX n°2.  
L’alimentation de la partie des rails situés avant la ligne d’arrivée provient du centre de contrôle.

_Le feu tricolore_

Il se compose de 5 paires de feux, alimentés par les trois sorties du RCX n°1.  
La première paire de feux jaunes est alimenté par la sortie n°1 configurée en polarité + (forward).  
La deuxième paire de feux jaunes est alimenté par la sortie n°1 configurée en polarité - (reverse).  
La troisième paire de feux jaunes est alimenté par la sortie n°2 configurée en polarité + (forward).  
La paire de feux verts est alimenté par la sortie n°2 configurée en polarité - (reverse).  
Le feu rouge de droite est alimenté par la sortie n°3 configurée en polarité + (forward).  
Le feu rouge de gauche est alimenté par la sortie n°3 configurée en polarité - (reverse).

**Déroulement de la course**

_Début du programme_

Les deux RCX stockent les valeurs renvoyées par les détecteurs de lumière quand rien n’est placé au dessus  
afin de détecter le passage d’un train.

_Début de la course_

Le RCX n°1 recoit l’ordre de départ grâce à l’interrupteur de contrôle, et demande au RCX n°2 de préparer le départ.  
Le RCX n°2 bascule la puissance électrique sur les régulateurs de vitesse grâce au centre de contrôle et  
se prépare à détecter le gagnant grâce aux détecteurs de lumière de la ligne d’arrivée.  
Le RCX n°1 se prépare à détecter un faux départ grâce aux détecteurs de lumière de la ligne de départ.

_Détection des faux départs_

Si un concurrent passe la ligne de départ avant le feu vert, le RCX n°1 arrête la procédure de départ en  
allumant le feu rouge du côté du faux départ, demande au RCX n°2 de couper l’alimentation en provenance  
des régulateurs de vitesse sur les deux pistes. Les concurrents sont replacés et on recommence une porcédure  
de départ.

_Déroulement de la course_

Quand le départ est donné, le RCX n°2 attend de détecter le gagnant, signale au RCX n°1 d’indiquer le gagnant  
en allumant le feu rouge du côté du gagnant. Les compétiteurs s’arrêtent automatiquement en atteignnat la partie de  
la piste qui n’est pas aliméntée.

_Retour à la case départ_

Après que les deux compétiteurs aient atteint la ligne d’arrivé un opérateur le signal au RCX n°2 grâce à  
l’interrupteur de contrôle. Le RCX n°2 bascule stoppe l’alimentation en provenance des régulateurs de vitesse  
sur son port de sortie afin de ramener les compétiteur à la ligne d’arrivée. Le RCX n°2 signal le retour des trains  
au RCX n°1 qui les détectent sur la ligne d’arrivée et qui fait clignoter alternativement les deux feux rouges.

Quand les trains sont de retour le RCX n°1 le signal au RCX n°2 qui arrête d’alimenté les rails. Une nouvelle course  
peut commencer.
