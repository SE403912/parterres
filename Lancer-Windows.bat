@echo off
REM ============================================================
REM  Parterres - Lanceur local pour Windows
REM  Double-cliquez ce fichier pour utiliser l'app sur ce PC.
REM  Necessite Python (https://www.python.org -> cocher "Add to PATH").
REM ============================================================
cd /d "%~dp0"

REM Lance le serveur local dans une fenetre dediee (a laisser ouverte).
start "Serveur Parterres (laisser ouvert)" cmd /c "py -m http.server 8000 2>nul || python -m http.server 8000 2>nul || (echo. & echo [!] Python introuvable. Installez-le depuis https://www.python.org/downloads/ en cochant 'Add Python to PATH', puis relancez ce fichier. & echo. & pause)"

REM Laisse au serveur le temps de demarrer, puis ouvre le navigateur.
timeout /t 2 /nobreak >nul
start "" http://localhost:8000

REM Pour arreter : fermez la fenetre "Serveur Parterres".
exit
