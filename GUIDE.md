# Guide complet — Application « Parterres »

> Application mobile de relevés de massifs : sessions multi-projets, dessin à
> l'échelle, calcul de surfaces, gestion de stock de plantes, **hors-ligne** et
> synchronisée avec **Google Sheets**.
>
> Ce guide vous accompagne **pas à pas**, sans aucune connaissance technique
> préalable. Comptez **30 à 45 minutes** la première fois.

---

## Sommaire

1. Comment ça marche (en une page)
2. Étape A — Préparer le Google Sheets
3. Étape B — Déployer le backend sécurisé (Apps Script)
4. Étape C — Déposer le code sur GitHub
5. Étape D — Publier l'application (GitHub Pages)
6. Étape E — Installer l'application sur le smartphone
7. Étape F — Connecter l'app à votre Sheets (sécurité)
8. Utilisation sur le terrain
9. Réutiliser l'app pour un autre projet
10. Structure du Google Sheets (référence)
11. Dépannage (FAQ)

---

## 1. Comment ça marche (en une page)

L'application est composée de **trois briques** :

- **L'application** (ce que vous voyez sur le téléphone) : du HTML/JavaScript
  pur, hébergé **gratuitement** sur GitHub Pages.
- **Le Google Sheets** : votre base de données (sessions, lieux, surfaces,
  plantes).
- **Le « pont » Apps Script** : un petit programme déployé depuis votre Sheets,
  qui reçoit les données de l'app et les écrit dans la feuille.

```
[Téléphone : l'app]  ⇄  [Pont Apps Script]  ⇄  [Google Sheets]
   (hors-ligne OK)        (sécurise l'accès)      (vos données)
```

**Le point de sécurité essentiel :** l'application **ne contient aucune clé
Google**. Le pont Apps Script s'exécute avec **votre** compte Google ; l'app se
contente de lui parler en présentant un **jeton secret** que vous choisissez.
Ce jeton n'est **jamais** écrit dans le code publié — il est saisi sur le
téléphone et y reste.

---

## 2. Étape A — Préparer le Google Sheets

1. Allez sur **[sheets.google.com](https://sheets.google.com)** et créez une
   nouvelle feuille de calcul.
2. Renommez-la, par exemple : **« Parterres – Base de données »**.
3. Laissez-la ouverte : on va y ajouter le programme à l'étape suivante, qui
   créera automatiquement les onglets.

> Vous n'avez **pas** besoin de créer les colonnes à la main : la fonction
> `initialiserLeSheet` s'en charge (étape B, point 6).

---

## 3. Étape B — Déployer le backend sécurisé (Apps Script)

C'est l'étape la plus importante pour la sécurité. Suivez-la calmement.

### B.1 — Ouvrir l'éditeur de script

1. Dans votre Google Sheets, menu **Extensions → Apps Script**.
2. Un éditeur de code s'ouvre. Supprimez le contenu par défaut.
3. Ouvrez le fichier **`backend/Code.gs`** de ce projet, copiez **tout** son
   contenu, et collez-le dans l'éditeur.
4. Cliquez sur l'icône **💾 Enregistrer**.

### B.2 — Définir votre jeton secret (le « mot de passe »)

Le jeton n'est **pas** écrit dans le code : on le range dans un coffre-fort
intégré à Apps Script.

1. Dans l'éditeur, cliquez sur l'icône ⚙️ **Paramètres du projet** (à gauche).
2. Section **Propriétés du script → Ajouter une propriété**.
3. Saisissez :
   - **Propriété** : `APP_TOKEN`
   - **Valeur** : un mot de passe long et unique que vous inventez
     (ex : `Massif-2026-9fK3pZ`). **Notez-le**, vous le saisirez sur le téléphone.
4. Cliquez **Enregistrer les propriétés du script**.

### B.3 — Créer automatiquement les onglets

1. En haut de l'éditeur, dans la liste des fonctions, choisissez
   **`initialiserLeSheet`**.
2. Cliquez sur **▶ Exécuter**.
3. Google demande une autorisation la première fois : acceptez (choisissez
   votre compte → « Avancé » → « Accéder au projet »). C'est normal : vous
   autorisez **votre propre** script à modifier **votre propre** feuille.
4. Retournez sur le Sheets : les onglets *Sessions, Lieux, Formes, Plantes,
   Placements* sont créés avec leurs colonnes. ✔

### B.4 — Publier le pont (Web App)

1. En haut à droite : **Déployer → Nouveau déploiement**.
2. Roue dentée **⚙ → Application Web**.
3. Réglez :
   - **Description** : `Pont Parterres v1`
   - **Exécuter en tant que** : **Moi** (votre compte).
   - **Qui a accès** : **Tout le monde**.
     > ⚠️ « Tout le monde » concerne l'**URL**, pas vos données : sans le bon
     > `APP_TOKEN`, toute requête est rejetée. C'est le jeton qui protège.
4. Cliquez **Déployer**, autorisez si demandé.
5. **Copiez l'URL de l'application Web** (elle finit par `/exec`). Gardez-la :
   vous la saisirez sur le téléphone.

> 🔁 **À chaque modification** du code `Code.gs`, refaites
> **Déployer → Gérer les déploiements → ✏️ Modifier → Nouvelle version**.

---

## 4. Étape C — Déposer le code sur GitHub

1. Créez un compte gratuit sur **[github.com](https://github.com)** si besoin.
2. Cliquez **New repository** (nouveau dépôt).
   - **Nom** : `parterres` (par exemple).
   - **Visibilité** : *Public* (nécessaire pour la version gratuite de Pages).
     > C'est sans risque : le code ne contient **aucun** secret.
3. Méthode simple (sans logiciel) :
   - Sur la page du dépôt vide → **« uploading an existing file »**.
   - Glissez-déposez **tout le contenu** du dossier du projet (les dossiers
     `css`, `js`, `backend`, `icons` et les fichiers `index.html`, etc.).
   - En bas : **Commit changes**.

> Le fichier `.gitignore` empêche tout fichier de secret de partir par erreur.

---

## 5. Étape D — Publier l'application (GitHub Pages)

1. Dans le dépôt : **Settings → Pages**.
2. Section **Build and deployment → Source** : choisissez **Deploy from a
   branch**.
3. **Branch** : `main`, dossier `/ (root)`, puis **Save**.
4. Patientez 1 à 2 minutes. GitHub affiche l'adresse publique de votre app :
   `https://VOTRE-NOM.github.io/parterres/`
5. Ouvrez cette adresse : l'application apparaît. 🎉

---

## 6. Étape E — Installer l'application sur le smartphone

L'app s'installe comme une vraie application, sans passer par un store.

**Sur Android (Chrome) :**
1. Ouvrez l'adresse `github.io` ci-dessus.
2. Menu **⋮ → « Ajouter à l'écran d'accueil »** (ou « Installer l'application »).
3. Confirmez. Une icône apparaît sur votre écran d'accueil.

**Sur iPhone (Safari) :**
1. Ouvrez l'adresse dans **Safari** (obligatoire, pas Chrome).
2. Bouton **Partager** (carré avec flèche) → **« Sur l'écran d'accueil »**.
3. **Ajouter**. L'icône apparaît.

> Une fois installée, l'app fonctionne **hors-ligne**. Le premier lancement doit
> se faire **avec** une connexion pour mettre les fichiers en cache.

---

## 7. Étape F — Connecter l'app à votre Sheets (sécurité)

Au premier lancement, l'écran **Configuration** s'affiche :

1. **Nom du projet** : libre (ex : `Commune 2026`).
2. **URL de l'application Web** : collez l'URL `/exec` copiée à l'étape B.4.
3. **Jeton secret** : saisissez exactement votre `APP_TOKEN`.
4. **Tester & enregistrer**. Si tout est bon : *« Connexion réussie »*. ✔

Ces informations sont stockées **uniquement sur ce téléphone** (dans le
navigateur). Elles ne partent jamais sur GitHub ni ailleurs.

---

## 8. Utilisation sur le terrain

### Créer une situation (« Mode New »)
- Écran d'accueil → **+ Nouvelle session** → nommez-la (ex : *Mon terrain*,
  *Parterres commune*). Chaque session est **indépendante**.

### Ajouter des lieux
- Ouvrez une session → **+ Ajouter un lieu** → nommez le parterre.
- L'app propose d'enregistrer votre **position GPS** : acceptez pour l'associer
  automatiquement au massif.

### Importer des relevés Google Earth (KML)
Si vous avez tracé les contours de vos parterres/jardinières sur Google Earth :
- Dans Google Earth, exportez votre projet en **fichier KML** (.kml).
- Dans l'app, ouvrez une session → **📥 Importer un KML** → choisissez le
  fichier.
- Chaque polygone devient automatiquement un **lieu** avec sa **forme exacte**,
  sa **surface en m²** (calculée par GPS) et ses **coordonnées GPS**. L'échelle
  est réglée automatiquement.
- Vous n'avez plus qu'à ouvrir chaque lieu pour **placer les plantes** sur le
  contour réel, puis sortir le **plan PDF**.

> Astuce : un fichier **.kmz** est un .kml compressé. Renommez-le en .zip,
> décompressez-le et importez le fichier `doc.kml` qu'il contient.

### Organiser les lieux par secteur
- À la création d'un lieu (ou lors d'un import KML), vous pouvez indiquer un
  **secteur** — un regroupement libre, par exemple « Rond-point de l'église ».
- Les lieux sont alors **groupés par secteur** dans la liste de la session et
  dans le tableau de bord, avec un compteur par secteur.
- Pour changer le secteur (ou le nom) d'un lieu : bouton **✎** sur sa carte.
- Lors d'un import KML, le secteur saisi s'applique à **tous** les polygones du
  fichier (pratique : les 5 jardinières d'un même rond-point d'un coup).

### Dessiner un massif
- Ouvrez un lieu pour entrer dans l'**atelier de dessin**.
- **Tracez le contour au doigt** : votre trait est automatiquement **lissé** en
  une forme géométrique nette.
- La **surface en m²** s'affiche et se met à jour **en direct**.
- **Boutons terrain** (larges) :
  - **↶ Annuler** : efface la dernière action (aussi `Ctrl+Z` au bureau).
  - **Échelle** : indiquez combien de pixels valent 1 m, pour que les
    dimensions soient fidèles à la réalité.
  - **Effacer** : repart d'un dessin vide.
  - **Enregistrer** : sauvegarde la forme et la surface.

### Relever la végétation existante (arbres, arbustes, vivaces)
- Dans l'atelier, onglet **🌳 Existant**.
- Choisissez une catégorie (Arbre, Arbuste, Vivace, Autre) — un diamètre par
  défaut est proposé, modifiable via le bouton **Ø … ✎**.
- Touchez le massif pour placer le végétal. Touchez un végétal posé pour le
  **sélectionner**, puis :
  - **✎ Renseigner** : nom (laissez vide si inconnu), diamètre précis, autres
    infos (état, hauteur, remarque) ;
  - **🔒 / 🔓 Plantation dessous** : par défaut, planter une annuelle **sous** ce
    végétal est **verrouillé** ; touchez ce bouton pour **autoriser** la
    plantation dessous (ex : sous un arbre). Le contour devient **vert**.
  - **✕ Supprimer**.

### Placer les végétaux
- Dans l'atelier, basculez sur l'onglet **🌱 Plantes**.
- La palette affiche vos plantes commandées avec leur **stock restant**. Les
  cases **« Masquer [couleur] »** retirent temporairement une couleur pour vous
  concentrer sur une harmonie.
- Touchez une plante, puis touchez le massif : un cercle à son **diamètre
  adulte réel** (à l'échelle) se pose. Les plantes **peuvent déborder** du bord
  du massif (comportement réaliste). Chaque pose **décrémente le stock**.
- La **végétation existante apparaît grisée**. Poser une annuelle **sous** un
  végétal existant est **bloqué** (un message s'affiche), sauf si vous avez
  **autorisé la plantation dessous** sur ce végétal (onglet Existant).
- Pour retirer une plante posée : touchez-la (sans plante active) puis
  **Effacer**. Le stock est recrédité.

### Sortir un plan imprimable pour les jardiniers (PDF A3)
- Bouton **📄 Plan PDF (A3)** dans l'atelier.
- Choisissez l'échelle : *Ajusté à une feuille*, **1:50 (recommandé)**, 1:20 ou
  1:100.
- Le PDF contient une **page de légende** (couleurs, espèces, diamètres,
  quantités, GPS) puis le **plan à l'échelle**.
- Si le plan dépasse une feuille, il est **découpé en plusieurs A3** : chaque
  feuille porte une étiquette *Ligne × Colonne* et un mini-repère ; les **bandes
  grises se chevauchent** — superposez-les et scotchez pour reconstituer le plan
  complet.
- Le PDF se télécharge sur le téléphone : ouvrez-le pour l'imprimer (choisir
  **A3** dans les options d'impression) ou le partager.

### Hors-ligne
- Tout est enregistré **localement, instantanément**, même sans réseau.
- Dès que la connexion revient, la **synchronisation est automatique**
  (pastille d'état en haut à droite : *En ligne / Hors-ligne / Synchro…*).

---

## 9. Réutiliser l'app pour un autre projet

Aucune ligne de code à toucher :

1. Créez un **nouveau Google Sheets** + déployez `Code.gs` (étapes A–B) → vous
   obtenez une **nouvelle URL** et un **nouveau jeton**.
2. Dans l'app : **Configuration ⚙ → Réinitialiser l'application** (vide les
   données locales), puis saisissez la nouvelle URL + jeton.

L'application est immédiatement prête pour un projet totalement différent.

---

## 10. Structure du Google Sheets (référence)

Cinq onglets. La **première ligne** de chaque onglet contient les noms de
colonnes ci-dessous (créés automatiquement par `initialiserLeSheet`). La
colonne `id` est **obligatoire** (clé unique de chaque ligne).

### Onglet `Sessions`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `nom` | Nom de la situation |
| `description` | Note libre |
| `date_creation` | Date de création (auto) |
| `archive` | `true`/`false` (masquer sans supprimer) |

### Onglet `Lieux`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `session_id` | Rattachement à une session |
| `secteur` | Regroupement libre (ex : "Rond-point de l'église") |
| `nom` | Nom du parterre |
| `adresse` | Adresse (optionnel) |
| `latitude` / `longitude` | Position GPS (auto) |
| `surface_reelle_m2` | Surface calculée du massif |
| `echelle_px_par_m` | Échelle utilisée (px = 1 m) |
| `date_visite` | Date de la visite |
| `notes` | Note libre |

### Onglet `Formes`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `lieu_id` | Lieu auquel appartient la forme |
| `points_json` | Géométrie du contour (liste de points) |
| `surface_m2` | Surface calculée |
| `date_creation` | Date |

### Onglet `Existants`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `lieu_id` | Lieu concerné |
| `categorie` | arbre / arbuste / vivace / autre |
| `nom` | Nom (facultatif, vide si inconnu) |
| `diametre_cm` | Diamètre du végétal |
| `x` / `y` | Position sur le dessin |
| `autorise_dessous` | true = plantation autorisée sous ce végétal |
| `notes` | Infos libres (état, hauteur…) |
| `date_creation` | Date |

### Onglet `Plantes`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `nom` | Nom de la plante |
| `couleur` | Couleur de la fleur (pour le filtre) |
| `diametre_adulte_cm` | Diamètre adulte (cercle à l'échelle) |
| `stock_commande` | Quantité commandée |
| `stock_pose` | Quantité déjà posée (décompte) |

> **Remplissez vous-même** cet onglet `Plantes` dans le Sheets : c'est votre
> liste de plantes commandées. L'app la chargera lors de la synchronisation.

### Onglet `Placements`
| Colonne | Description |
|---|---|
| `id` | Identifiant unique |
| `lieu_id` | Lieu concerné |
| `forme_id` | Massif concerné |
| `plante_id` | Plante posée |
| `x` / `y` | Position sur le dessin |
| `diametre_cm` | Diamètre adulte au moment de la pose |
| `couleur` | Couleur de la fleur (rendu) |
| `date_pose` | Date |

---

## 11. Dépannage (FAQ)

**« TOKEN_INVALIDE » lors du test de connexion**
→ Le jeton saisi dans l'app ne correspond pas à `APP_TOKEN`. Vérifiez les deux
(attention aux espaces et majuscules).

**« URL Apps Script invalide »**
→ L'URL doit commencer par `https://script.google.com/` et finir par `/exec`.
Recopiez-la depuis *Gérer les déploiements*.

**Les données ne remontent pas dans le Sheets**
→ Vérifiez la pastille réseau (en ligne ?). Vérifiez que vous avez bien créé un
*nouveau déploiement* après chaque modification de `Code.gs`.

**L'app ne s'installe pas sur iPhone**
→ Vous devez utiliser **Safari** (pas Chrome) pour « Ajouter à l'écran
d'accueil ».

**Je veux repartir de zéro**
→ Configuration ⚙ → *Réinitialiser l'application*.

**Le dessin « saute » ou zoome quand je trace**
→ C'est évité par la configuration de l'app. Si cela arrive, fermez puis
rouvrez l'app installée (et non l'onglet du navigateur).

---

*Document généré pour le projet « Parterres ». Le code source est intégralement
commenté en français pour faciliter vos évolutions futures.*
