#!/bin/bash
# ============================================================
#  Parterres - Lanceur local pour Mac / Linux
#  Double-cliquez ce fichier (Mac) ou lancez-le depuis le terminal.
#  Necessite Python 3 (deja present sur la plupart des Mac/Linux).
# ============================================================

# Se place dans le dossier du script (qui contient index.html).
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  Parterres - serveur local"
echo "  Application : http://localhost:8000"
echo "  Laissez cette fenetre ouverte."
echo "  Fermez-la (ou Ctrl+C) pour arreter."
echo "============================================"

# Ouvre le navigateur apres un court delai (en arriere-plan).
( sleep 2; (open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null) ) &

# Demarre le serveur (Python 3, repli sur python).
python3 -m http.server 8000 2>/dev/null || python -m http.server 8000 2>/dev/null || {
  echo
  echo "[!] Python introuvable. Installez Python 3 depuis https://www.python.org/downloads/"
  echo
  read -r -p "Appuyez sur Entree pour fermer..."
}
