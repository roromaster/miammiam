# MiamMiam

Plan de repas hebdomadaire pour 4 adultes. Spec : `docs/superpowers/specs/2026-11-01-miammiam-design.md`.

La CLI s'utilise depuis la racine du projet : `node scripts/miammiam.js <commande>`. Sans argument, elle affiche ses commandes.

## Règles des menus

- Exactement 14 repas : `midi` et `soir`, du `lundi` au `dimanche`.
- 4 adultes, sans allergie ni régime. `servings` vaut toujours 4.
- 30 minutes maximum du lundi au vendredi, 90 minutes maximum le samedi et le dimanche.
- Lundi midi : uniquement des produits du placard, car les courses ne sont pas forcément faites.
- Aucun plat repris des 4 semaines précédentes (voir `data/weeks/` et `data/proposals/`).
- Respecter la saison, et varier les protéines et les féculents sur la semaine.
- Placer le poisson frais et les produits fragiles en début de semaine.
- Chaque repas a sa propre recette complète, sans recours aux restes.
- Écrire les noms d'ingrédients au singulier et à l'identique d'un repas à l'autre, sinon la liste de courses ne peut pas les additionner.
- Écrire les recettes en français, avec des étapes claires et les quantités réelles pour 4 personnes.

## Format d'un plan

```json
{
  "week": "2026-W46",
  "startDate": "2026-11-09",
  "status": "proposed",
  "meals": [
    {
      "day": "lundi",
      "slot": "midi",
      "title": "Pâtes au thon et aux câpres",
      "emoji": "🍝",
      "minutes": 20,
      "servings": 4,
      "ingredients": [
        { "name": "pâtes", "quantity": 400, "unit": "g", "aisle": "Épicerie", "staple": false }
      ],
      "steps": ["Faire cuire les pâtes."]
    }
  ]
}
```

- `unit` : `g`, `kg`, `ml`, `cl`, `l`, `pièce`, `c. à soupe`, `c. à café`, `gousse`, `tranche`.
- `aisle` : `Fruits et légumes`, `Viandes et poissons`, `Produits laitiers`, `Épicerie`, `Surgelés`, `Boulangerie`, `Boissons`.
- `staple` vaut `true` pour les produits de base généralement en stock (sel, poivre, huile).
- `startDate` est le lundi de la semaine ISO.

Le plan ne contient jamais la liste de courses : elle est toujours recalculée.

## Procédures

**Générer une semaine.** Écrire le plan dans un fichier temporaire, puis `save-proposal <fichier>`. En cas d'erreurs, corriger et recommencer, 3 essais au maximum. Lancer ensuite `notify-proposal <semaine>`, sans risque de doublon : l'email ne part qu'une fois.

**Remplacer un plat.**
1. Trouver la semaine avec `status <semaine>`. Le fichier est dans `data/proposals/` si elle est `proposed`, sinon dans `data/weeks/`.
2. Si elle est `sent`, l'email est déjà parti : demander d'abord une confirmation explicite. Le site sera mis à jour, sans nouvel email.
3. Modifier le plat dans le JSON, en gardant toutes les règles, puis lancer `check <fichier>`.
4. Si la semaine est `validated` ou `sent`, lancer `republish <semaine>`.

**Valider.** Lancer `validate <semaine>`, qui publie le site, puis donner le lien renvoyé.

## Sécurité

Le dépôt est public. Aucune adresse email, aucun identifiant ni jeton dans un fichier versionné. Les adresses vivent dans `config/recipients.local.json`, exclu de git.
