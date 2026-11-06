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

**Prix**
- Chaque ingrédient d'un repas cuisiné a un `price` : le coût estimé en euros de la quantité utilisée, au prix d'un supermarché français de gamme moyenne (boucher pour le vendredi soir).
- Estimer honnêtement, avec des prix réalistes et positifs, y compris pour les produits du placard. Les prix sont indicatifs, à ne jamais présenter comme relevés en magasin.
- Ne pas surestimer : compter au prix des grands conditionnements, et seulement la part utilisée. Repères au kilo : poulet (cuisse) 9 €, bœuf haché 10 €, dinde hachée 9,5 €, porc (échine, côte) 9 €, saumon 19 €, crevette crue surgelée 20 €, veau (jarret) 17 €, agneau (épaule) 17 €, entrecôte du boucher 32 €, riz 2,5 à 3,5 €, pâtes 2 à 3 €, légumes courants 1,5 à 3 €. Repères à l'unité : oignon 0,15 €, gousse d'ail 0,06 €, oignon nouveau 0,12 €, citron vert 0,3 €, œuf 0,3 €, botte d'herbes 1 €, conserve de 400 g 0,7 à 1 €. Une cuillère d'épice ou de sauce coûte quelques centimes.

**Organisation**
- 30 minutes maximum du lundi au vendredi, 90 minutes maximum le samedi et le dimanche.
- Aucun plat repris des 4 semaines précédentes (voir `data/weeks/` et `data/proposals/`).
- Respecter la saison, et varier les protéines et les féculents sur la semaine.
- Placer le poisson frais et les produits fragiles en début de semaine.
- Écrire les noms d'ingrédients au singulier et à l'identique d'un repas à l'autre, sinon la liste de courses ne peut pas les additionner.
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
      "servings": 8,
      "ingredients": [
        { "name": "échine de porc", "quantity": 1200, "unit": "g", "aisle": "Viandes et poissons", "staple": false, "price": 14.4 }
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
- `startDate` est le lundi de la semaine ISO.

Le plan ne contient jamais la liste de courses : elle est toujours recalculée.

## Procédures

**Générer une semaine.** Écrire le plan dans un fichier temporaire, puis `save-proposal <fichier>`. En cas d'erreurs, corriger et recommencer, 3 essais au maximum. Lancer ensuite `notify-proposal <semaine>`, sans risque de doublon : l'email ne part qu'une fois.

**Remplacer un plat.**
1. Trouver la semaine avec `status <semaine>`. Le fichier est dans `data/proposals/` si elle est `proposed`, sinon dans `data/weeks/`.
2. Si elle est `sent`, l'email est déjà parti : demander d'abord une confirmation explicite. Le site sera mis à jour, sans nouvel email.
3. Modifier le plat dans le JSON, en gardant toutes les règles, puis lancer `check <fichier>`.
4. Si la semaine est `proposed`, lancer `sync` pour la partager. Si elle est `validated` ou `sent`, lancer `republish <semaine>`.

**Valider.** Lancer `validate <semaine>`, qui publie le site, puis donner le lien renvoyé.

## Plusieurs machines

Le projet est cloné sur plusieurs machines (MacBook, Mac mini, sessions web), et GitHub fait foi.
- Chaque commande de la CLI, sauf `target`, commence par `git pull --rebase`. Ne jamais lire un plan sans être passé par la CLI juste avant, par exemple avec `status`.
- `save-proposal`, `notify-proposal`, `validate`, `send-weekly` et `republish` poussent eux-mêmes leurs changements. Après une modification manuelle d'une proposition, lancer `sync`.
- Si un pull ou un push échoue, sur un conflit par exemple, s'arrêter et le signaler. Ne jamais forcer le push.
- Seul le Mac mini exécute les tâches planifiées et envoie les emails. Ailleurs, ne lancer ni `notify-proposal` ni `send-weekly` sans demande explicite. Leurs prompts sont dans `docs/taches/`.
- Le rendu de l'image demande Google Chrome. Une session web peut modifier et contrôler un plan, mais doit laisser `validate` et `republish` à un Mac.

## Sécurité

Le dépôt est public. Aucune adresse email, aucun identifiant ni jeton dans un fichier versionné. Les adresses vivent dans `config/recipients.local.json`, exclu de git.
