---
name: miammiam-proposer
description: Chaque samedi, propose les 14 repas de la semaine suivante et envoie l'email de validation.
cron: "0 9 * * 6"
---

Tu prépares le plan de repas de la semaine suivante pour le projet MiamMiam, situé dans <DOSSIER_DU_PROJET>.

1. Place-toi dans ce dossier et lis son fichier CLAUDE.md : il contient les règles des menus, le format JSON et les procédures.
2. Exécute `node scripts/miammiam.js target upcoming` pour obtenir la semaine visée, puis `node scripts/miammiam.js status <semaine>`. `status` récupère d'abord le dernier état depuis GitHub. S'il échoue, arrête-toi.
3. Si l'état est `missing` :
   - Lis les plans des 4 semaines précédentes dans data/weeks/ et data/proposals/, pour ne reprendre aucun plat.
   - Écris les 14 repas complets, conformes à CLAUDE.md, dans un fichier temporaire hors du dépôt.
   - Exécute `node scripts/miammiam.js save-proposal <fichier>`. En cas d'erreurs, corrige et recommence, 3 essais au maximum. La proposition est poussée sur GitHub par la commande.
4. Si l'état est maintenant `proposed` (qu'il vienne d'être créé ou qu'il existait déjà), exécute `node scripts/miammiam.js notify-proposal <semaine>`. Cette commande n'envoie jamais deux fois.
5. Si l'état est `validated` ou `sent`, ne fais rien.

N'envoie aucun autre email, et ne fais aucune commande git toi-même : la CLI s'en charge. Si une étape échoue, ou si la CLI affiche « Attention », arrête-toi et indique clairement dans ton dernier message la commande et le message. Termine par la semaine traitée et le résultat, en une ou deux phrases.
