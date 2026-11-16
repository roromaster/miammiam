#!/bin/bash
# Relève des réponses par email, lancée par launchd sur le Mac mini (voir docs/taches/miammiam-courrier.md).
# Vérifie la boîte sans Claude, et ne lance Claude que s'il y a des messages à traiter.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${MIAMMIAM_COURRIER_MODEL:-sonnet}"
LOCK="${TMPDIR:-/tmp}/miammiam-courrier.lock"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Une seule relève à la fois, si une réponse prend plus de 30 minutes. Un verrou de plus de 2 h est abandonné.
find "$LOCK" -maxdepth 0 -mmin +120 -exec rm -rf {} + 2>/dev/null
if ! mkdir "$LOCK" 2>/dev/null; then
  log "Relève précédente encore en cours, rien à faire"
  exit 0
fi
WORK="$HOME/Library/Caches/miammiam-courrier"
rm -rf "$WORK" && mkdir -p "$WORK"
trap 'rm -rf "$LOCK" "$WORK"' EXIT

cd "$ROOT" || exit 1
if ! INBOX="$(node scripts/miammiam.js inbox 2>&1)"; then
  log "Échec de node scripts/miammiam.js inbox :"
  echo "$INBOX"
  exit 1
fi
if grep -q "Aucun message à traiter" <<<"$INBOX"; then
  log "Aucun message à traiter"
  exit 0
fi

log "Messages à traiter, lancement de Claude ($MODEL)"
PROMPT="$(awk 'f>=2; /^---$/{f++}' docs/taches/miammiam-courrier.md | sed "s|<DOSSIER_DU_PROJET>|$ROOT|g")
Écris tes fichiers de réponse dans $WORK."

claude -p "$PROMPT" \
  --model "$MODEL" \
  --allowedTools \
    "Bash(node scripts/miammiam.js:*)" \
    "Read" "Glob" "Grep" "WebSearch" "WebFetch" \
    "Edit(data/proposals/**)" "Edit(data/weeks/**)" "Edit(data/idees.md)" "Edit(~/Library/Caches/miammiam-courrier/**)"
log "Fin de la relève (code $?)"
