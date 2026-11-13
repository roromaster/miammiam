---
name: miammiam-proposer
description: Chaque dimanche, propose les 14 repas de la semaine suivante et envoie l'email de validation.
cron: "0 9 * * 0"
---

Tu prépares le plan de repas de la semaine suivante pour le projet MiamMiam, situé dans <DOSSIER_DU_PROJET>.

1. Place-toi dans ce dossier et lis son fichier CLAUDE.md : il contient les règles des menus, le format JSON et les procédures.
2. Exécute `node scripts/miammiam.js target upcoming` pour obtenir la semaine visée, puis `node scripts/miammiam.js status <semaine>`. `status` récupère d'abord le dernier état depuis GitHub. S'il échoue, arrête-toi.
3. Si l'état est `missing` :
   - Lis les plans des 4 semaines précédentes dans data/weeks/ et data/proposals/, pour ne reprendre aucun plat.
   - Exécute `node scripts/miammiam.js promos <semaine>`, puis `node scripts/miammiam.js promos-fresh <semaine>` : cette présélection liste les promos de produits frais valables le mardi de la semaine, jour des courses, avec leur prix au kilo et les prix habituels. Choisis-y d'abord 3 à 5 promos avantageuses, et bâtis un dîner autour de chacune. data/promos/<semaine>.json contient toutes les promos, pour les autres ingrédients. Si la commande échoue, continue sans promos ; si elle signale un « Catalogue manquant », continue avec les promos disponibles. Dans les deux cas, signale-le dans ton dernier message.
   - Lis data/ingredients.json (catalogue : noms, unités, rayons, prix) et data/pantry.json (produits déjà à la maison).
   - Écris les 14 repas complets, conformes à CLAUDE.md, dans un fichier temporaire hors du dépôt. Reprends les noms et les unités du catalogue pour les ingrédients connus. Pour chaque plat, cherche une recette bien notée sur les sites de la section « Sources des recettes » de CLAUDE.md, adapte-la et renseigne `source` ; si la recherche web est indisponible, écris de mémoire sans `source`. Note dans `promosSkipped` les promos fraîches intéressantes que tu écartes. Privilégie les produits en promo selon la section « Promos » de CLAUDE.md : prix promo dans `price`, champs `promo` et `regularPrice` sur l'ingrédient, sans jamais enfreindre une autre règle.
   - Exécute `node scripts/miammiam.js save-proposal <fichier>`. En cas d'erreurs, corrige et recommence, 3 essais au maximum. La proposition est poussée sur GitHub par la commande.
4. Si l'état est maintenant `proposed` (qu'il vienne d'être créé ou qu'il existait déjà), exécute `node scripts/miammiam.js notify-proposal <semaine>`. Cette commande n'envoie jamais deux fois.
5. Si l'état est `validated` ou `sent`, ne fais rien.

N'envoie aucun autre email, et ne fais aucune commande git toi-même : la CLI s'en charge. Si une étape échoue, ou si la CLI affiche « Attention », arrête-toi et indique clairement dans ton dernier message la commande et le message. Termine par la semaine traitée et le résultat, en une ou deux phrases, en citant le nombre de repas bâtis autour d'une promo fraîche, le nombre de recettes avec une `source`, et tout « À noter » affiché par la CLI.
