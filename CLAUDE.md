# MiamMiam

Plan de repas hebdomadaire pour 4 adultes. Spec : `docs/superpowers/specs/2026-11-01-miammiam-design.md`.

La CLI s'utilise depuis la racine du projet : `node scripts/miammiam.js <commande>`. Sans argument, elle affiche ses commandes.

## Règles des menus

**Rythme de la semaine**
- 14 repas : `midi` et `soir`, du `lundi` au `dimanche`.
- Du mardi au vendredi, le midi est constitué des restes de la veille au soir.
- Le lundi midi reprend les restes du dimanche soir de la semaine précédente. S'il n'existe pas de semaine précédente, c'est une vraie recette de 4 portions avec des produits du placard.
- Le samedi et le dimanche midi sont de vrais repas.
- Du dimanche soir au jeudi soir, cuisiner 8 portions (`servings: 8`), dont 4 pour les restes du lendemain midi. Choisir des plats qui se gardent et se réchauffent bien.
- Ces dîners de 8 portions, et eux seuls, ont un `leftoverTip` : une ou deux phrases sur la conservation et le réchauffage des restes (ce qu'on garde à part, comment réchauffer sans dessécher, ce qu'on ajoute au dernier moment). Le site l'affiche sur le dîner et sur le midi du lendemain.
- Les autres repas cuisinés donnent 4 portions (`servings: 4`).
- Le vendredi soir : une pièce de viande du boucher, achetée le jour même. Son ingrédient va dans le rayon `Boucher (à acheter vendredi)`, réservé à ce repas, sans restes.

**Goûts**
- Fromage : uniquement comté, gruyère ou emmental. Surtout pas de chèvre ni de roblochon. Aucun autre fromage, pas même caché (parmesan dans un pesto, mozzarella, feta, ricotta…). Remplacer ou omettre. Le fromage blanc et la crème restent permis.
- Cuisines aimées : japonaise, chinoise, mexicaine, thaïe, française, italienne, et un burger de temps en temps (au plus un par semaine). Au moins 4 cuisines différentes par semaine.
- Rechercher des plats authentiques et variés, pas seulement des plats familiaux français.

**Accompagnements**
- Un seul accompagnement par repas cuisiné, dans le champ `side`. Ne pas en ajouter un second, ni dans le titre, ni dans les étapes.
- Le titre nomme le plat seul : « Curry jaune de lieu noir », pas « Curry jaune de lieu noir, riz jasmin ». Un féculent peut y figurer seulement s'il fait partie du plat (tortillas d'un tinga, pommes de terre braisées dans la sauce, pain d'un burger).
- Le riz et les pâtes sont permis, au plus 2 fois chacun par semaine. Les servir surtout avec les plats en sauce qui les appellent (curry, mapo tofu).
- Varier régulièrement les autres accompagnements : légumes, légumineuses, céréales. Les vouloir simples (5 ingrédients maximum, en plus de l'huile et de l'assaisonnement, sans technique difficile) et, souvent, originaux (carottes rôties au miso, concombre mariné au sésame, maïs grillé au citron vert).
- Ne pas reprendre un accompagnement de la semaine précédente, sauf le riz et les pâtes.
- Ses ingrédients sont dans `ingredients`, et sa préparation dans `steps`.

**Légumes et produits frais**
- Chaque repas cuisiné apporte une vraie part de légumes, environ 150 g par portion, dans le plat ou dans l'accompagnement. Si l'accompagnement est du riz ou des pâtes, les légumes sont dans le plat (brocoli dans un teriyaki, épinards dans une sauce). Un aromate (oignon, ail, herbes) ne compte pas.
- Herbes fraîches : 3 au plus par semaine, et chacune sert à au moins 2 repas. Sinon, prendre une herbe séchée ou s'en passer.
- Ne pas entamer un produit pour une petite quantité qui se perdra (bain de friture, pot de crème, sachet de pousses) : le réutiliser dans la semaine ou choisir une autre recette.
- Portions de référence pour 4, à doubler pour 8 : riz 320 g cru, pâtes 400 g, légumineuses sèches 320 g, viande ou poisson 600 à 700 g.

**Placard**
- `data/pantry.json` liste les produits de fond déjà à la maison (sauces, épices, vinaigres, condiments). Ils sortent de la liste de courses et de « Courses à acheter », et figurent dans « À vérifier au placard ».
- Écrire ces ingrédients exactement sous le nom du fichier, avec leur `price` et `staple: false` : le placard s'applique à l'affichage, le plan n'est pas modifié.
- Ajouter ou retirer un nom du fichier seulement à la demande, puis lancer `sync`. Un produit nouveau et rare (une pâte de piment jamais achetée) n'y entre qu'une fois acheté.

**Prix**
- Chaque ingrédient d'un repas cuisiné a un `price` : le coût estimé en euros de la quantité utilisée, au prix habituel de E.Leclerc, hors promotion, en marque Repère quand elle existe (boucher pour le vendredi soir). Seule exception : un ingrédient choisi dans les promos de la semaine (voir **Promos**).
- Estimer honnêtement, avec des prix réalistes et positifs, y compris pour les produits du placard. Les prix sont indicatifs, à ne jamais présenter comme relevés en magasin.
- Ne pas surestimer : compter au prix des grands conditionnements, et seulement la part utilisée. Repères Leclerc au kilo : poulet (haut de cuisse désossé) 8 €, bœuf haché 9 €, dinde hachée 9 €, porc (échine, côte) 7,5 €, saumon 18 €, crevette crue décortiquée surgelée 17 €, veau (jarret) 16 €, agneau (épaule désossée) 20 €, entrecôte du boucher 32 €, riz 2 à 3 €, pâtes 1,5 à 2,5 €, légumes courants 1,5 à 3 €. Repères à l'unité : oignon 0,15 €, gousse d'ail 0,06 €, oignon nouveau 0,12 €, citron vert 0,3 €, œuf 0,25 €, botte d'herbes 1 €, conserve de 400 g 0,5 à 0,8 €. Une cuillère d'épice ou de sauce coûte quelques centimes.

**Promos**
- `data/promos/<semaine>.json` liste les promos alimentaires du E.Leclerc d'Épluches (Saint-Ouen-l'Aumône) valables le mardi de la semaine (`shoppingDay`), jour des courses, tirées des catalogues en ligne du magasin. Chaque catalogue dure deux semaines et un nouveau démarre chaque mardi : une semaine en compte donc deux, celui commencé le mardi précédent et celui qui commence le mardi des courses. Le nouveau n'est publié que le dimanche d'avant. Chaque promo a `product`, `brand`, `category` (rayon Leclerc), `details` (poids, variétés, prix au kilo), `offer` (la mécanique), `price` (prix affiché par `unit`, ou par article si `unit` est vide), `effectivePrice` (prix unitaire payé une fois la mécanique appliquée), `validFrom` et `validTo`, et parfois `regularPrice`, `minQuantity` (nombre d'articles à acheter pour avoir l'offre), `cardOnly` (remise en Ticket E.Leclerc, sur la carte) et `unitPrice` (prix au kilo ou au litre).
- Privilégier les produits en promo quand ils servent un plat qui respecte déjà toutes les règles : la promo oriente le choix des plats, elle ne justifie jamais d'enfreindre une règle (fromages, saison, cuisines, accompagnements, plats récents, temps). Les produits frais en promo (viande, poisson, légumes) comptent le plus ; ignorer les produits industriels (plats cuisinés, biscuits, sodas).
- Les courses se font le mardi : toutes les promos du fichier sont valables ce jour-là (`validFrom` ≤ `shoppingDay` ≤ `validTo`). Ne retenir qu'une promo dont la quantité achetée a du sens pour la recette : si l'offre exige `minQuantity` articles, la recette doit en utiliser une bonne part, sinon compter le prix habituel sans `promo`. Si deux promos portent le même produit, prendre la moins chère.
- Une promo n'est pas toujours moins chère que les repères de prix ci-dessus : la comparer avant de la retenir.
- Pour un ingrédient en promo : `price` vaut `effectivePrice` rapporté à la quantité utilisée (au kilo si `unit` est `Le kg`, à l'article sinon, en s'aidant de `details` ou `unitPrice`), et l'ingrédient porte `promo`, un libellé court tiré de `offer` (« -34 % immédiat », « Prix promo »), ainsi que `regularPrice`, le coût de la même quantité au prix habituel estimé selon les règles **Prix** (ou d'après `regularPrice` du catalogue). Le site et l'email le signalent dans la liste de courses, avec le prix habituel et l'économie de la semaine. Sans `promo`, aucun ingrédient n'est présenté comme en promotion.
- Garder les noms d'ingrédients du projet (« pavé de saumon », pas « Filet de saumon »), au singulier, pour que la liste de courses les additionne.

**Organisation**
- 30 minutes maximum du lundi au vendredi, 90 minutes maximum le samedi et le dimanche.
- `minutes` vaut `prepMinutes` + `cookMinutes` : le temps actif (éplucher, couper, façonner, saisir, surveiller), puis le temps de cuisson restant une fois les mains libres. Les estimer honnêtement pour les portions réelles, cuissons en plusieurs fournées comprises, sans viser pile la limite : si un plat ne tient pas en 30 minutes pour 8, en choisir un autre.
- Aucun plat repris des 4 semaines précédentes (voir `data/weeks/` et `data/proposals/`).
- Respecter la saison, et varier les protéines et les féculents sur la semaine.
- Placer le poisson frais et les produits fragiles en début de semaine.
- Écrire les noms d'ingrédients au singulier et à l'identique d'un repas à l'autre, dans la même unité, et en reprenant les noms des semaines précédentes (« tomate concassée », « crevette crue décortiquée »), sinon la liste de courses ne peut pas les additionner.
- Écrire les recettes en français, avec des étapes claires et les quantités réelles des portions indiquées.

## Format d'un plan

```json
{
  "week": "2026-W46",
  "startDate": "2026-11-09",
  "status": "proposed",
  "meals": [
    {
      "day": "lundi",
      "slot": "soir",
      "title": "Porc au gingembre façon shogayaki",
      "emoji": "🥢",
      "cuisine": "japonaise",
      "side": "Concombre mariné au sésame",
      "minutes": 25,
      "prepMinutes": 20,
      "cookMinutes": 5,
      "servings": 8,
      "leftoverTip": "Garder le concombre à part. Réchauffer le porc 2 minutes à la poêle avec une cuillère d'eau.",
      "ingredients": [
        { "name": "échine de porc", "quantity": 1200, "unit": "g", "aisle": "Viandes et poissons", "staple": false, "price": 14.4 },
        { "name": "pomme de terre", "quantity": 800, "unit": "g", "aisle": "Fruits et légumes", "staple": false, "price": 0.68, "promo": "Prix promo" }
      ],
      "steps": ["Saisir le porc."]
    },
    {
      "day": "mardi",
      "slot": "midi",
      "title": "Restes : Porc au gingembre façon shogayaki",
      "emoji": "♻️",
      "leftoversOf": "lundi",
      "ingredients": [],
      "steps": []
    }
  ]
}
```

- Des restes ont `leftoversOf` (le jour du dîner d'origine), un titre citant ce dîner, et ni ingrédient ni étape.
- `cuisine` : `japonaise`, `chinoise`, `mexicaine`, `thaïe`, `française`, `italienne`, `burger`.
- `unit` : `g`, `kg`, `ml`, `cl`, `l`, `pièce`, `c. à soupe`, `c. à café`, `gousse`, `tranche`.
- `aisle` : `Fruits et légumes`, `Viandes et poissons`, `Produits laitiers`, `Épicerie`, `Surgelés`, `Boulangerie`, `Boissons`, `Boucher (à acheter vendredi)`.
- `staple` vaut `true` pour les produits de base généralement en stock (sel, poivre, huile).
- `promo`, facultatif, signale un ingrédient pris en promo, et `regularPrice` donne alors son coût au prix habituel (voir **Promos**).
- `startDate` est le lundi de la semaine ISO.
- `prepMinutes`, `cookMinutes`, `leftoverTip`, la limite de 3 herbes fraîches et l'unité unique par ingrédient sont contrôlés à partir de 2026-W47 ; les semaines antérieures restent valides sans eux.

Le plan ne contient jamais la liste de courses : elle est toujours recalculée.

## Procédures

**Générer une semaine.** Lancer d'abord `promos <semaine>`, qui enregistre les promos des deux catalogues de la semaine dans `data/promos/<semaine>.json` et les pousse ; s'il échoue, le signaler et générer sans promos. S'il signale un « Catalogue manquant » (celui du mardi des courses, avant sa publication le dimanche), générer avec les promos disponibles et le mentionner. Lire ce fichier et en tirer parti selon les règles **Promos**. Écrire le plan dans un fichier temporaire, puis le relire plat par plat avant de l'enregistrer : légumes présents, temps tenable pour les portions réelles, restes qui se réchauffent bien, herbes et produits entamés réutilisés. Lancer ensuite `save-proposal <fichier>`. En cas d'erreurs, corriger et recommencer, 3 essais au maximum. Lancer ensuite `notify-proposal <semaine>`, sans risque de doublon : l'email ne part qu'une fois.

**Remplacer un plat.**
1. Trouver la semaine avec `status <semaine>`. Le fichier est dans `data/proposals/` si elle est `proposed`, sinon dans `data/weeks/`.
2. Si elle est `sent`, l'email est déjà parti : demander d'abord une confirmation explicite. Le site sera mis à jour, sans nouvel email.
3. Modifier le plat dans le JSON, en gardant toutes les règles, puis lancer `check <fichier>`.
4. Si la semaine est `proposed`, lancer `sync` pour la partager. Si elle est `validated` ou `sent`, lancer `republish <semaine>`.
5. Si on demande à renvoyer l'email des courses d'une semaine `sent`, lancer `resend-weekly <semaine>` après confirmation explicite : il republie le site et renvoie l'email de la semaine, marqué « mise à jour », à chaque appel.
6. Si on demande à recevoir la proposition modifiée, lancer `renotify <semaine>` : il renvoie l'email de proposition, marqué « mise à jour », à chaque appel. Seulement sur demande explicite, et seulement pour une semaine `proposed`.

**Valider.** Lancer `validate <semaine>`, qui publie le site, puis donner le lien renvoyé.

## Plusieurs machines

Le projet est cloné sur plusieurs machines (MacBook, Mac mini, sessions web), et GitHub fait foi.
- Chaque commande de la CLI, sauf `target`, commence par `git pull --rebase`. Ne jamais lire un plan sans être passé par la CLI juste avant, par exemple avec `status`.
- `promos`, `save-proposal`, `notify-proposal`, `validate`, `send-weekly` et `republish` poussent eux-mêmes leurs changements. Après une modification manuelle d'une proposition ou de `data/pantry.json`, lancer `sync`.
- Si un pull ou un push échoue, sur un conflit par exemple, s'arrêter et le signaler. Ne jamais forcer le push.
- Seul le Mac mini exécute les tâches planifiées et envoie les emails. Ailleurs, ne lancer ni `notify-proposal`, ni `renotify`, ni `send-weekly`, ni `resend-weekly` sans demande explicite. Leurs prompts sont dans `docs/taches/`.
- Le rendu de l'image demande Google Chrome. Une session web peut modifier et contrôler un plan, mais doit laisser `validate` et `republish` à un Mac.

## Sécurité

Le dépôt est public. Aucune adresse email, aucun identifiant ni jeton dans un fichier versionné. Les adresses vivent dans `config/recipients.local.json`, exclu de git.
