# Installer MiamMiam sur le Mac mini

Le Mac mini, allumé en permanence, exécute les deux tâches planifiées et envoie les emails. Les autres machines (MacBook, sessions web, téléphone) travaillent sur leur propre clone. GitHub fait foi : chaque commande de la CLI récupère le dernier état avant d'agir, et pousse ce qu'elle modifie.

## 1. Logiciels

Sur le Mac mini :

- Claude Desktop, connecté au même compte, avec « Ouvrir à la connexion » activé.
- Node.js (même version majeure que sur le MacBook), git et Google Chrome (nécessaire au rendu de l'image).
- La CLI Google Workspace : `npm install -g @googleworkspace/cli`.
- Un accès en écriture au dépôt GitHub, par exemple avec `gh auth login`, puis `gh auth setup-git`.

## 2. Le projet

```bash
git clone https://github.com/roromaster/miammiam.git ~/Documents/dev/MiamMiam
cd ~/Documents/dev/MiamMiam && npm ci && npm test
```

## 3. Les secrets, hors de git

À copier depuis le MacBook par AirDrop, jamais par le dépôt :

- `config/recipients.local.json` → même chemin dans le clone du Mac mini.
- `~/.config/gws/client_secret.json` → même chemin sur le Mac mini.

Puis, sur le Mac mini, `gws auth login` avec le compte Gmail du propriétaire. Le fichier `credentials.enc` est chiffré pour chaque machine : il ne se copie pas.

Contrôle : `gws gmail users labels list --params '{"userId":"me"}'` doit répondre sans erreur.

## 4. Ne pas dormir

Dans Réglages Système :

- Énergie : activer « Empêcher la suspension automatique lorsque l'écran est éteint » et « Réveiller pour l'accès au réseau ».
- Utilisateurs et groupes : ouverture de session automatique, pour que Claude Desktop redémarre après une coupure de courant.

## 5. Basculer les tâches

L'ordre compte, sinon les deux Mac enverront chacun leur email.

1. **Sur le MacBook** : dans Claude Desktop, désactiver `miammiam-proposer` et `miammiam-envoyer`.
2. **Sur le Mac mini** : ouvrir une session Claude Desktop (onglet Code) dans le clone, puis demander :
   > Crée les deux tâches planifiées décrites dans `docs/taches/`, avec leur nom, leur description et leur cron, en remplaçant `<DOSSIER_DU_PROJET>` par le chemin absolu de ce dossier.
3. Lancer chaque tâche une fois avec « Run now » et accepter durablement les autorisations demandées (`gws`, `git`, `node`). Sur une semaine déjà `sent` ou déjà `proposed` et notifiée, elles ne renvoient rien.

## 6. Travailler depuis les autres machines

- **MacBook** : ouvrir une session dans le clone habituel. Remplacer un plat, `validate` et `republish` y fonctionnent comme avant, car la CLI se synchronise seule.
- **Téléphone, le plus complet** : activer Remote Control sur une session du Mac mini, puis la piloter depuis l'app Claude. Tout fonctionne, image comprise.
- **Session web (claude.ai/code)** : sur le dépôt GitHub, elle peut remplacer un plat dans une proposition, puis lancer `check` et `sync`. Faute de Chrome, `validate` et `republish` restent réservés à un Mac.

## En cas de souci

- La CLI affiche « Attention : … non poussée sur GitHub » : la modification est enregistrée localement, et la commande suivante la poussera. Lancer `node scripts/miammiam.js sync` pour réessayer tout de suite.
- Un pull échoue sur un conflit : deux machines ont modifié la même semaine. Résoudre le conflit dans `data/`, puis lancer `sync`.
