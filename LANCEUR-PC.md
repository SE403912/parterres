# Utiliser Parterres sur votre PC (sans rien déployer)

Vous pouvez tester l'application **tout de suite** sur votre ordinateur, avant
même de la mettre sur GitHub. Aucune installation compliquée.

## Méthode recommandée (lanceur double-clic)

1. Décompressez le dossier `parterres`.
2. Double-cliquez sur :
   - **`Lancer-Windows.bat`** sous Windows ;
   - **`Lancer-Mac-Linux.command`** sous Mac (ou Linux).
3. Votre navigateur s'ouvre sur `http://localhost:8000` : l'application est là.
4. Une fenêtre noire (le serveur) reste ouverte : **laissez-la ouverte** pendant
   que vous utilisez l'app. Fermez-la pour arrêter.

> Ces lanceurs utilisent **Python**, déjà présent sur la plupart des Mac/Linux.
> Sous Windows, s'il n'est pas installé : téléchargez-le sur
> https://www.python.org/downloads/ en cochant **« Add Python to PATH »**, puis
> relancez le fichier.

> Sur Mac, si le double-clic est bloqué : faites **clic droit → Ouvrir**, ou dans
> le Terminal `chmod +x Lancer-Mac-Linux.command` une première fois.

## Tester sans Google Sheets (mode local)

Sur l'écran de configuration, cliquez sur **« Utiliser en local (sans Google
Sheets) »**. L'application fonctionne alors entièrement sur le PC, sans
synchronisation — parfait pour :
- importer votre fichier **KML** et voir vos jardinières,
- dessiner, placer des plantes, relever la végétation existante,
- générer des **plans PDF A3**.

Vous pourrez connecter un Google Sheets plus tard (écran Configuration ⚙).

## Bon à savoir sur PC

- Le **dessin** se fait à la souris (cliquer-glisser).
- Le **GPS** ne fonctionne pas sur PC (pas de capteur) — sans importance, les
  coordonnées viennent de votre KML, et le téléphone géolocalise sur le terrain.
- L'**export PDF** et l'**impression A3** sont parfaits depuis le PC.
- Vos données du mode local restent sur **ce navigateur de ce PC**. Pour
  retrouver les mêmes données sur le téléphone, il faudra connecter un Google
  Sheets (même URL + jeton sur les deux appareils).
