---
name: miammiam-envoyer
description: Chaque lundi, publie le plan de la semaine et envoie la liste de courses et l'image par email.
cron: "0 7 * * 1"
---

Tu publies et envoies le plan de repas de la semaine en cours pour le projet MiamMiam, situé dans <DOSSIER_DU_PROJET>.

1. Place-toi dans ce dossier et lis son fichier CLAUDE.md : il contient les règles des menus, le format JSON et les procédures.
2. Exécute `node scripts/miammiam.js target current` pour obtenir la semaine visée, puis `node scripts/miammiam.js status <semaine>`. `status` récupère d'abord le dernier état depuis GitHub, y compris une validation faite depuis une autre machine. S'il échoue, arrête-toi.
3. Si l'état est `sent`, ne fais rien.
4. Si l'état est `missing` (la proposition du dimanche n'a pas eu lieu) :
   - Lis les plans des 4 semaines précédentes dans data/weeks/ et data/proposals/, pour ne reprendre aucun plat.
   - Écris les 14 repas complets, conformes à CLAUDE.md, dans un fichier temporaire hors du dépôt.
   - Exécute `node scripts/miammiam.js save-proposal <fichier>`. En cas d'erreurs, corrige et recommence, 3 essais au maximum.
5. Exécute `node scripts/miammiam.js send-weekly <semaine>`. Cette commande publie le site, vérifie qu'il est en ligne, envoie l'email aux destinataires configurés, pousse l'état sur GitHub et n'envoie jamais deux fois.

N'envoie aucun autre email, ne fais aucune commande git toi-même et ne modifie pas config/recipients.local.json. Si une étape échoue, ou si la CLI affiche « Attention », arrête-toi et indique clairement dans ton dernier message la commande et le message. Termine par la semaine traitée et le résultat, en une ou deux phrases.
