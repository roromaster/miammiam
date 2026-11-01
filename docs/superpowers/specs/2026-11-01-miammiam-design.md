# MiamMiam : plan de repas hebdomadaire

Date : 2026-11-01
Statut : à relire

## 1. Objectif

Chaque semaine, proposer un plan de repas pour 4 adultes, le faire valider par le propriétaire, le publier sur le web et envoyer la liste de courses par email chaque lundi.

### Critères de réussite

- Un plan de 14 repas (midi et soir, 7 jours) est proposé chaque samedi sans intervention.
- Chaque repas a une recette complète et ses ingrédients en quantités pour 4 personnes.
- Le propriétaire peut remplacer un plat en une phrase, et la liste de courses se met à jour.
- Toute personne ayant le lien peut consulter tous les plans publiés, sans compte.
- Chaque lundi, les deux destinataires reçoivent un seul email contenant la liste de courses et une image des repas de la semaine.

## 2. Contraintes retenues

| Sujet | Décision |
|---|---|
| Convives | 4 adultes, sans allergie ni régime. Seuls le comté, le gruyère et l'emmental sont acceptés comme fromages |
| Cuisines | Japonaise, chinoise, mexicaine, thaïe, française, italienne, et un burger au plus par semaine |
| Accompagnements | Un accompagnement simple et original par repas cuisiné |
| Restes | Du lundi au vendredi, le midi reprend les restes de la veille au soir. Les dîners du dimanche au jeudi donnent 8 portions |
| Vendredi soir | Pièce de viande du boucher, achetée le jour même et listée à part |
| Repas | 14 par semaine : midi et soir, du lundi au dimanche |
| Temps de cuisine | 30 min maximum du lundi au vendredi, 90 min maximum le week-end |
| Lundi midi | Restes du dimanche soir de la semaine précédente, ou recette du placard s'il n'y a pas de semaine précédente |
| Langue | Français |
| Exécution | Tâches planifiées de Claude Desktop sur le Mac du propriétaire |
| Génération | Claude, dans la tâche planifiée, sans clé API séparée |
| Email | CLI `gws`, depuis le compte Gmail du propriétaire |
| Site | GitHub Pages, dépôt public `miammiam`, non référencé |

## 3. Architecture

```text
Samedi 9 h : tâche « proposer »
  Claude génère le plan -> validation du plan -> état "proposed"
  -> email d'invitation à valider, aux deux destinataires

Du samedi au lundi : validation dans une session Claude Desktop du projet
  « remplace mardi soir » -> plan et liste mis à jour
  « valide » -> état "validated" -> publication du site

Lundi 7 h : tâche « envoyer »
  plan absent -> génération
  construction du site et de l'image -> publication -> contrôle de l'URL
  -> email aux deux destinataires -> état "sent"
```

Claude décide du contenu : menus, recettes et remplacements. Les scripts font tout ce qui doit être exact et reproductible : contrôle, additions, rendu et envoi.

### Fichiers

| Élément | Rôle |
|---|---|
| `CLAUDE.md` | Règles des menus et procédure de modification, valables pour toute session du projet |
| `data/weeks/<semaine>.json` | Un plan par semaine ISO, par exemple `2026-W46.json` |
| `scripts/validate-plan.js` | Contrôle la structure et les règles du plan |
| `scripts/shopping-list.js` | Calcule la liste de courses à partir d'un plan |
| `scripts/build-site.js` | Génère les pages du site dans `site/` |
| `scripts/render-image.js` | Génère l'image de la semaine en PNG |
| `scripts/send-email.js` | Compose l'email et l'envoie avec `gws` |
| `config/recipients.local.json` | Adresses des destinataires, exclu de git |

## 4. Modèle de données

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

- `status` vaut `proposed`, `validated` ou `sent`.
- `unit` appartient à une liste fermée : `g`, `kg`, `ml`, `cl`, `l`, `pièce`, `c. à soupe`, `c. à café`, `gousse`, `tranche`.
- `aisle` appartient à une liste fermée : Fruits et légumes, Viandes et poissons, Produits laitiers, Épicerie, Surgelés, Boulangerie, Boissons.
- `staple` vaut `true` pour les produits de base généralement en stock, comme le sel, le poivre ou l'huile.

## 5. Règles de génération

Les règles vivent dans `CLAUDE.md`, pour que la génération et les remplacements appliquent les mêmes :

- Exactement 14 repas, un par couple jour et moment.
- Respect des temps de cuisine de la section 2.
- Aucun plat repris des 4 semaines précédentes.
- Saison respectée, et variété des protéines et des féculents sur la semaine.
- Poisson frais et produits fragiles placés en début de semaine.
- Noms d'ingrédients écrits au singulier et de façon identique d'un repas à l'autre, pour que les additions fonctionnent.
- Du lundi au vendredi, le midi est un repas de restes, sans recette ni courses propres.

## 6. Liste de courses

- Les lignes sont regroupées par rayon, puis par ingrédient.
- Les quantités s'additionnent quand le nom et l'unité sont identiques.
- `g` et `kg`, ainsi que `ml`, `cl` et `l`, sont convertis avant addition.
- Des unités incompatibles restent sur des lignes distinctes (par exemple `2 pièces` et `200 g`).
- Les produits `staple` vont dans une section « À vérifier au placard », sans quantité.
- Les ingrédients du lundi midi vont aussi dans cette section, car ils doivent déjà être à la maison.

La liste n'est pas stockée : elle est toujours recalculée depuis le plan, ce qui évite tout écart après un remplacement.

## 7. Validation

- L'email du samedi va aux deux destinataires. Il liste les 14 plats et leurs accompagnements, et indique comment valider.
- La validation se fait dans une session Claude Desktop du projet, en langage naturel.
- Après chaque remplacement, le plan repasse par `validate-plan.js`.
- « Valide » passe l'état à `validated` et publie le site, ce qui permet de faire les courses dès le week-end.
- Sans validation lundi 7 h, la proposition est envoyée telle quelle.
- Après l'envoi, toute modification demande une confirmation explicite, car l'email est déjà parti. Elle met à jour le site, sans renvoyer d'email.

## 8. Site web

- URL prévue : `https://roromaster.github.io/miammiam/`.
- L'accueil affiche la semaine en cours et la liste des semaines publiées.
- La page d'une semaine contient l'image, les 14 recettes et la liste de courses.
- Seuls les plans `validated` et `sent` sont publiés. Une proposition non validée reste hors du site, et son fichier n'est pas poussé sur GitHub.
- Pages statiques, adaptées au téléphone, sans JavaScript indispensable.
- `robots.txt` et balise `noindex` limitent le référencement. Le site reste public : c'est une discrétion, pas une protection.
- Le dépôt ne contient ni adresse email, ni identifiant, ni jeton.

## 9. Image et email

**Image.** Un PNG de 1200 px de large : une grille de 7 colonnes (jours) et 2 lignes (midi, soir), avec l'emoji et le nom de chaque plat. Elle est rendue depuis un gabarit HTML avec Chromium sans interface, via Playwright. Les noms longs passent sur plusieurs lignes, sans jamais être coupés.

**Email du lundi.**
- Un seul message, avec les deux destinataires en `To`.
- Objet : `🍽️ Repas de la semaine du <date>`.
- Corps : l'image intégrée, le lien vers la semaine sur le site, puis la liste de courses en texte par rayon.
- Format HTML avec une version texte de secours.

## 10. Tâches planifiées

| Tâche | Cron (heure locale) | Rôle |
|---|---|---|
| `miammiam-proposer` | `0 9 * * 6` | Prépare la semaine commençant le lundi suivant |
| `miammiam-envoyer` | `0 7 * * 1` | Publie et envoie la semaine commençant ce lundi |

Chaque prompt est autonome et donne le chemin absolu du projet, car chaque exécution démarre sans mémoire.

## 11. Pannes et reprises

Les deux tâches peuvent être relancées sans risque :

| Situation | Comportement |
|---|---|
| Plan déjà présent lors de « proposer » | Ne l'écrase pas et ne renvoie pas d'email |
| État `sent` lors de « envoyer » | Ne renvoie rien |
| Samedi manqué | « envoyer » génère le plan elle-même |
| Mac éteint ou app fermée | La tâche part au prochain lancement. L'email indique alors simplement la semaine concernée |
| Plan invalide | Claude le corrige, jusqu'à 3 essais, puis la tâche échoue visiblement |
| Échec de publication | Pas d'email, pour éviter un lien mort. La validation reste acquise (`validated`), et une relance republie |
| Échec d'envoi | L'état reste inchangé, donc une relance renvoie l'email |
| Autorisation `gws` expirée | La tâche échoue visiblement dans Claude Desktop, car aucun email d'alerte ne peut partir |

L'état `sent` n'est écrit qu'après un envoi réussi, et la publication précède toujours l'envoi. Une interruption entre l'envoi et l'écriture de l'état peut produire un doublon, ce qui est préférable à un email manquant.

## 12. Tests

- **Tests unitaires** (`node --test`) : additions et conversions de la liste, unités incompatibles, section placard, calcul de la semaine ISO, règles du validateur.
- **Rendu** : image et site générés à partir d'un plan d'exemple avec des titres longs, puis contrôlés visuellement.
- **Email et tâches** : pendant les tests, `config/recipients.local.json` ne contient que l'adresse du propriétaire. Chaque tâche est exécutée une fois avec « Run now », pour vérifier l'image intégrée dans Gmail et l'absence d'autorisation en attente. Le second destinataire n'est ajouté qu'ensuite.

## 13. Vérifications préalables

- L'autorisation de `gws` ne doit pas expirer au bout de 7 jours. Si le projet Google Cloud est en mode test, il faudra le passer en production.
- Le comportement quand le Mac est en veille à l'heure prévue doit être observé.
- Les tâches doivent pouvoir exécuter `gws`, `git`, `node` et Playwright sans demande d'autorisation.

## 14. Hors périmètre

- Photos ou illustrations générées des plats
- Comptes utilisateurs, ou validation par une page web
- Liste de courses cochable en ligne
- Prix des ingrédients et commande en ligne
- Informations nutritionnelles
- Mémorisation des plats préférés
