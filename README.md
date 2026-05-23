# 🌸 Parterres — Application de relevés de massifs

Application web mobile (**PWA**) pour relever des parterres sur le terrain :
sessions multi-projets, dessin de massifs à l'échelle, calcul de surface en m²,
gestion du stock de plantes — le tout **hors-ligne** et synchronisé avec
**Google Sheets**.

## ⚡ Démarrage rapide

1. **Créez votre Google Sheets** et déployez le backend (`backend/Code.gs`).
2. **Déposez ce code sur GitHub** et activez **GitHub Pages**.
3. **Ouvrez l'app sur votre téléphone**, saisissez l'URL + le jeton, installez-la.

👉 **Toutes les étapes détaillées sont dans [`GUIDE.md`](GUIDE.md).**

## 🔐 Sécurité

- **Aucune clé d'API, aucun secret n'est stocké dans ce dépôt.**
- L'URL privée et le jeton sont saisis sur le téléphone et restent en local.
- Le backend Apps Script s'exécute avec votre identité Google : la feuille
  n'est jamais exposée publiquement.

## 🧩 Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille de l'application |
| `css/styles.css` | Interface noir / blanc / bleu roi |
| `js/config.js` | Configuration sécurisée (URL + jeton) |
| `js/storage.js` | Base locale hors-ligne + file de synchro |
| `js/sync.js` | Synchronisation avec Google Sheets |
| `js/drawing.js` | Dessin canvas, lissage, échelle, surface |
| `js/app.js` | Navigation et interface |
| `service-worker.js` | Mode hors-ligne |
| `backend/Code.gs` | Proxy sécurisé Google Apps Script |

## ♻️ Réutiliser pour un autre projet

Écran **Configuration → « Réinitialiser »**, puis saisissez l'URL d'un nouveau
Google Sheets. Aucune ligne de code à modifier.

---
Code intégralement commenté en français.
