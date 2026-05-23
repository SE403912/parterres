/**
 * =============================================================================
 *  app.js — INTERFACE & NAVIGATION
 * =============================================================================
 *
 *  Écrans :
 *    1. config     — connexion sécurisée au Google Sheets
 *    2. sessions   — situations de relevés ("Mode New")
 *    3. lieux      — parterres d'une session (multi-lieux)
 *    4. dessin     — atelier : tracé du massif + placement des végétaux
 *    5. plantes    — gestion de la liste/stock des plantes commandées
 *    6. dashboard  — vue globale de tous les parterres (par session)
 *
 *  Tout passe par App.Storage (local, offline-first) et App.Sync (Google Sheets).
 * =============================================================================
 */

window.App = window.App || {};

App.UI = (function () {
  var vue = 'sessions';
  var sessionActive = null;
  var lieuActif = null;

  // État vivant de l'atelier de dessin (ne réinitialise pas le canvas à chaque
  // rafraîchissement de la palette).
  var etatDessin = { lieu: null, formeId: null, couleursMasquees: [] };

  var racine;

  /* ------------------------------ Démarrage ------------------------------ */

  function demarrer() {
    racine = document.getElementById('app');
    App.Sync.demarrer();
    if (!App.Config.isConfigured()) vue = 'config';

    // Ctrl+Z = annuler (utile en test bureau).
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && vue === 'dessin') {
        e.preventDefault(); App.Drawing.annuler();
      }
    });

    rafraichir();
    if (App.Config.isConfigured() && App.Sync.estEnLigne()) App.Sync.synchroniser(true);
  }

  /* --------------------------- Aiguillage des vues ----------------------- */

  function rafraichir() {
    switch (vue) {
      case 'config': vueConfig(); break;
      case 'sessions': vueSessions(); break;
      case 'lieux': vueLieux(); break;
      case 'dessin': vueDessin(); break;
      case 'plantes': vuePlantes(); break;
      case 'dashboard': vueDashboard(); break;
      default: vueSessions();
    }
  }
  function aller(v) { vue = v; rafraichir(); }

  /* --------------------- Utilitaires de rendu ---------------------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function entete(titre, retourVers) {
    var retour = retourVers
      ? '<button class="btn-icone" id="btn-retour" aria-label="Retour">‹</button>'
      : '<span class="btn-icone btn-icone--vide"></span>';
    return '<header class="entete">' + retour
      + '<h1 class="titre">' + esc(titre) + '</h1>'
      + '<span id="statut-reseau" class="statut"></span></header>';
  }

  /* ------------------------------ Vue : Config --------------------------- */

  function vueConfig() {
    var c = App.Config.get();
    racine.innerHTML = entete('Configuration', App.Config.isConfigured() ? 'sessions' : null)
      + '<main class="contenu">'
      + '<p class="aide">Reliez l\'application à votre Google Sheets. Ces informations restent '
      + '<strong>sur cet appareil</strong> et ne sont jamais publiées.</p>'
      + '<label class="champ">Nom du projet<input id="cfg-projet" type="text" value="' + esc(c.projet) + '" placeholder="Ex : Parterres commune 2026"></label>'
      + '<label class="champ">URL de l\'application Web (Apps Script)<input id="cfg-url" type="url" value="' + esc(c.url) + '" placeholder="https://script.google.com/macros/s/.../exec"></label>'
      + '<label class="champ">Jeton secret (TOKEN)<input id="cfg-token" type="password" value="' + esc(c.token) + '" placeholder="Votre mot de passe partagé"></label>'
      + '<button class="btn-principal" id="cfg-tester">Tester &amp; enregistrer</button>'
      + '<p id="cfg-message" class="message"></p><hr>'
      + '<button class="btn-secondaire" id="cfg-local">Utiliser en local (sans Google Sheets)</button>'
      + '<p class="aide">Pour tester sur PC ou travailler hors-ligne : les données restent sur cet appareil, sans synchronisation. Vous pourrez connecter un Google Sheets plus tard.</p><hr>'
      + '<button class="btn-danger" id="cfg-reset">Réinitialiser l\'application (nouveau projet)</button>'
      + '<p class="aide">Efface la configuration et toutes les données locales pour repartir à zéro.</p>'
      + '</main>';

    var r = document.getElementById('btn-retour'); if (r) r.onclick = function () { aller('sessions'); };

    document.getElementById('cfg-tester').onclick = function () {
      var msg = document.getElementById('cfg-message');
      var res = App.Config.save({
        projet: document.getElementById('cfg-projet').value,
        url: document.getElementById('cfg-url').value,
        token: document.getElementById('cfg-token').value
      });
      if (!res.ok) { msg.textContent = '✖ ' + res.error; msg.className = 'message message--erreur'; return; }
      msg.textContent = 'Test de connexion…'; msg.className = 'message';
      App.Sync.tester().then(function (t) {
        if (t.ok) {
          msg.textContent = '✔ Connexion réussie. Configuration enregistrée.'; msg.className = 'message message--ok';
          App.Sync.synchroniser(true);
          setTimeout(function () { aller('sessions'); }, 800);
        } else { msg.textContent = '✖ ' + t.error; msg.className = 'message message--erreur'; }
      });
    };
    document.getElementById('cfg-local').onclick = function () {
      App.Config.activerModeLocal(document.getElementById('cfg-projet').value);
      aller('sessions');
    };
    document.getElementById('cfg-reset').onclick = function () {
      if (confirm('Tout effacer (configuration + données locales) ?')) {
        App.Config.resetAll(); sessionActive = lieuActif = null; aller('config');
      }
    };
  }

  /* ----------------------------- Vue : Sessions -------------------------- */

  function vueSessions() {
    var sessions = App.Storage.all('sessions').filter(function (s) { return !s.archive; });
    var liste = sessions.length === 0
      ? '<p class="aide">Aucune session. Créez votre première situation de relevé.</p>'
      : sessions.map(function (s) {
          var nb = App.Storage.where('lieux', 'session_id', s.id).length;
          return '<div class="carte carte--lieu">'
            + '<button class="lieu-zone" data-open="' + esc(s.id) + '">'
            + '<span class="carte-titre">' + esc(s.nom) + '</span>'
            + '<span class="carte-sous">' + nb + ' lieu(x)</span></button>'
            + '<button class="btn-mini-suppr" data-delsession="' + esc(s.id) + '" aria-label="Supprimer">✕</button>'
            + '</div>';
        }).join('');

    racine.innerHTML = entete(App.Config.get().projet || 'Mes relevés', null)
      + '<main class="contenu">'
      + '<div class="barre-actions">'
      + '<button class="btn-principal" id="btn-new">+ Nouvelle session</button>'
      + '<button class="btn-secondaire" id="btn-config">⚙</button></div>'
      + '<div class="barre-actions">'
      + '<button class="btn-secondaire" id="btn-dash">▦ Tableau de bord</button>'
      + '<button class="btn-secondaire" id="btn-plantes">🌱 Plantes</button></div>'
      + '<div class="liste">' + liste + '</div></main>';

    document.getElementById('btn-new').onclick = creerSession;
    document.getElementById('btn-config').onclick = function () { aller('config'); };
    document.getElementById('btn-dash').onclick = function () { aller('dashboard'); };
    document.getElementById('btn-plantes').onclick = function () { aller('plantes'); };
    [].forEach.call(racine.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { sessionActive = b.getAttribute('data-open'); aller('lieux'); };
    });
    [].forEach.call(racine.querySelectorAll('[data-delsession]'), function (b) {
      b.onclick = function (e) { e.stopPropagation(); supprimerSession(b.getAttribute('data-delsession')); };
    });
  }

  /**
   * Supprime une session ET tout son contenu (lieux, formes, végétaux existants,
   * plantes posées). Chaque suppression est répercutée dans le Google Sheets.
   */
  function supprimerSession(id) {
    var s = App.Storage.find('sessions', id);
    if (!s) return;
    if (!confirm('Supprimer la session « ' + s.nom + ' » et TOUT son contenu (lieux, formes, plantes posées) ?\n\nCette action est définitive.')) return;

    App.Storage.where('lieux', 'session_id', id).forEach(function (l) {
      App.Storage.where('placements', 'lieu_id', l.id).forEach(function (p) { App.Storage.remove('placements', p.id); });
      App.Storage.where('existants', 'lieu_id', l.id).forEach(function (e) { App.Storage.remove('existants', e.id); });
      App.Storage.where('formes', 'lieu_id', l.id).forEach(function (f) { App.Storage.remove('formes', f.id); });
      App.Storage.remove('lieux', l.id);
    });
    App.Storage.remove('sessions', id);

    // Le stock des plantes posées peut avoir changé : on recalcule.
    App.Plantes.liste().forEach(function (p) { App.Plantes.rafraichirStockPose(p.id); });

    if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
    rafraichir();
  }

  function creerSession() {
    var nom = prompt('Nom de la session (situation) :');
    if (!nom) return;
    var s = App.Storage.upsert('sessions', {
      nom: nom, description: '', date_creation: new Date().toISOString(), archive: false
    });
    sessionActive = s.id;
    if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
    aller('lieux');
  }

  /* ------------------------------ Vue : Lieux ---------------------------- */

  function vueLieux() {
    var session = App.Storage.find('sessions', sessionActive);
    if (!session) { aller('sessions'); return; }
    var lieux = App.Storage.where('lieux', 'session_id', sessionActive);

    // Regroupe les lieux par secteur (les lieux sans secteur vont à la fin).
    var groupes = {};
    lieux.forEach(function (l) {
      var sec = (l.secteur || '').trim() || 'Sans secteur';
      (groupes[sec] = groupes[sec] || []).push(l);
    });
    var ordre = Object.keys(groupes).sort(function (a, b) {
      if (a === 'Sans secteur') return 1;
      if (b === 'Sans secteur') return -1;
      return a.localeCompare(b);
    });

    var liste = lieux.length === 0
      ? '<p class="aide">Aucun lieu. Ajoutez un parterre ou importez un KML.</p>'
      : ordre.map(function (sec) {
          var cartes = groupes[sec].map(carteLieu).join('');
          return '<div class="groupe-secteur">'
            + '<h2 class="titre-secteur">' + esc(sec)
            + ' <span class="compte">' + groupes[sec].length + '</span></h2>'
            + cartes + '</div>';
        }).join('');

    racine.innerHTML = entete(session.nom, 'sessions')
      + '<main class="contenu">'
      + '<button class="btn-principal" id="btn-add-lieu">+ Ajouter un lieu</button>'
      + '<button class="btn-secondaire" id="btn-import-kml">📥 Importer un KML (Google Earth)</button>'
      + '<input type="file" id="fichier-kml" accept=".kml" hidden>'
      + '<div class="liste">' + liste + '</div></main>';

    document.getElementById('btn-retour').onclick = function () { aller('sessions'); };
    document.getElementById('btn-add-lieu').onclick = ajouterLieu;
    document.getElementById('btn-import-kml').onclick = function () {
      document.getElementById('fichier-kml').click();
    };
    document.getElementById('fichier-kml').onchange = importerKML;

    // Ouvrir un lieu.
    [].forEach.call(racine.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { lieuActif = b.getAttribute('data-open'); aller('dessin'); };
    });
    // Éditer un lieu (nom + secteur).
    [].forEach.call(racine.querySelectorAll('[data-edit]'), function (b) {
      b.onclick = function (e) { e.stopPropagation(); editerLieu(b.getAttribute('data-edit')); };
    });
  }

  /** Génère la carte HTML d'un lieu (zone cliquable + bouton éditer). */
  function carteLieu(l) {
    var nbPl = App.Storage.where('placements', 'lieu_id', l.id).length;
    return '<div class="carte carte--lieu">'
      + '<button class="lieu-zone" data-open="' + esc(l.id) + '">'
      + '<span class="carte-titre">' + esc(l.nom) + '</span>'
      + '<span class="carte-sous">' + (l.surface_reelle_m2 || '?') + ' m² · '
      + nbPl + ' plante(s)' + (l.latitude ? ' · 📍' : '') + '</span></button>'
      + '<button class="btn-mini-edit" data-edit="' + esc(l.id) + '" aria-label="Modifier">✎</button>'
      + '</div>';
  }

  /** Liste les secteurs déjà utilisés dans la session courante (pour aider la saisie). */
  function secteursExistants() {
    var vus = {};
    App.Storage.where('lieux', 'session_id', sessionActive).forEach(function (l) {
      var s = (l.secteur || '').trim();
      if (s) vus[s] = true;
    });
    return Object.keys(vus);
  }

  /** Modifie le nom et le secteur d'un lieu. */
  function editerLieu(id) {
    var lieu = App.Storage.find('lieux', id);
    if (!lieu) return;
    var nom = prompt('Nom du lieu :', lieu.nom);
    if (nom === null) return;
    var existants = secteursExistants();
    var indice = existants.length ? '\nSecteurs existants : ' + existants.join(', ') : '';
    var secteur = prompt('Secteur (laisser vide si aucun) :' + indice, lieu.secteur || '');
    if (secteur === null) return;
    lieu.nom = nom.trim() || lieu.nom;
    lieu.secteur = secteur.trim();
    App.Storage.upsert('lieux', lieu);
    if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
    rafraichir();
  }

  function ajouterLieu() {
    var nom = prompt('Nom du lieu / parterre :');
    if (!nom) return;
    var existants = secteursExistants();
    var indice = existants.length ? '\nSecteurs existants : ' + existants.join(', ') : '';
    var secteur = prompt('Secteur (laisser vide si aucun) :' + indice, existants[existants.length - 1] || '');
    if (secteur === null) secteur = '';
    var enreg = App.Storage.upsert('lieux', {
      session_id: sessionActive, secteur: secteur.trim(), nom: nom, adresse: '', latitude: '', longitude: '',
      surface_reelle_m2: '', echelle_px_par_m: 50, date_visite: new Date().toISOString(), notes: ''
    });
    lieuActif = enreg.id;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        enreg.latitude = pos.coords.latitude.toFixed(6);
        enreg.longitude = pos.coords.longitude.toFixed(6);
        App.Storage.upsert('lieux', enreg);
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
        if (vue === 'dessin') rafraichir();
      });
    }
    aller('dessin');
  }

  /**
   * Importe un fichier KML (Google Earth) : chaque polygone devient un lieu
   * avec sa forme exacte, sa surface en m² et ses coordonnées GPS.
   */
  function importerKML(e) {
    var fichier = e.target.files && e.target.files[0];
    if (!fichier) return;

    var lecteur = new FileReader();
    lecteur.onload = function () {
      try {
        var polygones = App.KML.parser(lecteur.result);
        if (polygones.length === 0) {
          alert('Aucun polygone trouvé dans ce fichier KML.');
          return;
        }
        // Secteur appliqué à tous les lieux importés (ex : "Rond-point de l'église").
        var existants = secteursExistants();
        var indice = existants.length ? '\nSecteurs existants : ' + existants.join(', ') : '';
        var secteur = prompt('Regrouper ces ' + polygones.length
          + ' lieu(x) dans quel secteur ? (laisser vide si aucun)' + indice, '');
        if (secteur === null) return; // import annulé
        secteur = secteur.trim();
        var n = 0;
        polygones.forEach(function (poly) {
          var conv = App.KML.versForme(poly.coords);
          // 1) Crée le lieu (avec secteur, GPS et surface réelle).
          var lieu = App.Storage.upsert('lieux', {
            session_id: sessionActive, secteur: secteur, nom: poly.nom, adresse: '',
            latitude: conv.latitude, longitude: conv.longitude,
            surface_reelle_m2: conv.surface_m2,
            echelle_px_par_m: conv.echelle_px_par_m,
            date_visite: new Date().toISOString(),
            notes: 'Importé depuis Google Earth (KML)'
          });
          // 2) Enregistre la forme (contour) de ce lieu.
          App.Storage.upsert('formes', {
            lieu_id: lieu.id,
            points_json: JSON.stringify(conv.points),
            surface_m2: conv.surface_m2,
            date_creation: new Date().toISOString()
          });
          n++;
        });
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
        alert(n + ' lieu(x) importé(s) depuis le KML.');
        rafraichir();
      } catch (err) {
        alert('Erreur de lecture du KML : ' + err.message);
      } finally {
        e.target.value = ''; // permet de réimporter le même fichier au besoin
      }
    };
    lecteur.readAsText(fichier);
  }

  function vueDessin() {
    var lieu = App.Storage.find('lieux', lieuActif);
    if (!lieu) { aller('lieux'); return; }
    etatDessin.lieu = lieu;
    etatDessin.couleursMasquees = etatDessin.couleursMasquees || [];

    racine.innerHTML = entete(lieu.nom, 'lieux')
      + '<main class="contenu contenu--dessin">'
      + '<div class="bandeau-infos">'
      + '<span class="info-bloc"><span class="info-val" id="info-surface">0</span> m²</span>'
      + '<span class="info-bloc"><span class="info-val" id="info-reste">0</span> m² restants</span>'
      + '<span class="info-bloc"><span class="info-val" id="info-plantes">0</span> plantes</span>'
      + '<span class="info-bloc"><span class="info-val" id="info-existants">0</span> existants</span>'
      + '<span class="info-bloc"><span class="info-val" id="info-echelle">' + (lieu.echelle_px_par_m || 50) + '</span> px/m</span>'
      + '</div>'
      + '<div class="onglets">'
      + '<button class="onglet onglet--actif" id="onglet-massif">✏ Massif</button>'
      + '<button class="onglet" id="onglet-existant">🌳 Existant</button>'
      + '<button class="onglet" id="onglet-plantes">🌱 Plantes</button></div>'
      + '<div class="zone-canvas"><canvas id="canvas-massif"></canvas></div>'
      + '<div id="zone-palette"></div>'
      + '<div class="palette-outils">'
      + '<button class="btn-tactile btn-undo" id="btn-undo">↶ Annuler</button>'
      + '<button class="btn-tactile" id="btn-echelle">Échelle</button>'
      + '<button class="btn-tactile" id="btn-effacer">Effacer</button>'
      + '<button class="btn-tactile btn-tactile--accent" id="btn-enregistrer">Enregistrer</button>'
      + '<button class="btn-tactile btn-pdf" id="btn-pdf">📄 Plan PDF (A3)</button>'
      + '</div></main>';

    document.getElementById('btn-retour').onclick = function () { aller('lieux'); };

    // --- Initialisation du canvas avec tous les rappels (callbacks). ---
    var canvas = document.getElementById('canvas-massif');
    App.Drawing.init(canvas, {
      pixelsParMetre: lieu.echelle_px_par_m || 50,
      onChange: function (etat) {
        document.getElementById('info-surface').textContent = etat.surface_m2;
        document.getElementById('info-reste').textContent = etat.surface_restante_m2;
        document.getElementById('info-plantes').textContent = etat.nb_plantes;
        document.getElementById('info-existants').textContent = etat.nb_existants;
        document.getElementById('info-echelle').textContent = etat.echelle;
      },
      onPlace: function (res) {
        if (res.refuse) {
          if (res.raison === 'sous_vegetal') {
            flashBouton('btn-undo', 'Sous ' + libelleCat(res.categorie) + ' : verrouillé');
          }
          return;
        }
        App.Storage.upsert('placements', {
          id: res.placement.id, lieu_id: lieuActif, forme_id: etatDessin.formeId || '',
          plante_id: res.placement.plante_id, x: res.placement.x, y: res.placement.y,
          diametre_cm: res.placement.diametre_cm, couleur: res.placement.couleur,
          date_pose: new Date().toISOString()
        });
        App.Plantes.rafraichirStockPose(res.placement.plante_id);
        rendrePalette();
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
      },
      onRetrait: function (placement) {
        App.Storage.remove('placements', placement.id);
        App.Plantes.rafraichirStockPose(placement.plante_id);
        rendrePalette();
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
      },
      onPlaceExistant: function (ex) {
        // Crée ou met à jour le végétal existant.
        App.Storage.upsert('existants', {
          id: ex.id, lieu_id: lieuActif, categorie: ex.categorie, nom: ex.nom,
          diametre_cm: ex.diametre_cm, x: ex.x, y: ex.y,
          autorise_dessous: ex.autorise_dessous, notes: ex.notes,
          date_creation: new Date().toISOString()
        });
        rendrePalette();
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
      },
      onRetraitExistant: function (ex) {
        App.Storage.remove('existants', ex.id);
        rendrePalette();
        if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
      },
      onSelection: function (sel) { rendrePalette(); }
    });

    // Recharge la forme et les placements déjà enregistrés pour ce lieu.
    var forme = App.Storage.where('formes', 'lieu_id', lieuActif)[0];
    etatDessin.formeId = forme ? forme.id : null;
    if (forme && forme.points_json) {
      try { App.Drawing.charger({ points: JSON.parse(forme.points_json), echelle: lieu.echelle_px_par_m }); }
      catch (e) {}
    }
    App.Drawing.chargerPlacements(App.Storage.where('placements', 'lieu_id', lieuActif));
    App.Drawing.chargerExistants(App.Storage.where('existants', 'lieu_id', lieuActif));

    // --- Onglets Massif / Existant / Plantes ---
    var ongMassif = document.getElementById('onglet-massif');
    var ongExistant = document.getElementById('onglet-existant');
    var ongPlantes = document.getElementById('onglet-plantes');
    function activer(onglet) {
      [ongMassif, ongExistant, ongPlantes].forEach(function (o) { o.classList.remove('onglet--actif'); });
      onglet.classList.add('onglet--actif');
    }
    ongMassif.onclick = function () {
      App.Drawing.setMode('dessin'); activer(ongMassif); rendrePalette();
    };
    ongExistant.onclick = function () {
      sauverForme(true);
      App.Drawing.setMode('existant'); activer(ongExistant); rendrePalette();
    };
    ongPlantes.onclick = function () {
      sauverForme(true);
      App.Drawing.setMode('plantes'); activer(ongPlantes); rendrePalette();
    };

    // --- Boutons terrain ---
    document.getElementById('btn-undo').onclick = function () { App.Drawing.annuler(); };
    document.getElementById('btn-effacer').onclick = function () {
      if (App.Drawing.getMode() === 'plantes' && App.Drawing.getSelection()) {
        App.Drawing.supprimerSelection();
      } else { App.Drawing.effacer(); }
    };
    document.getElementById('btn-echelle').onclick = function () {
      var v = prompt('Combien de pixels représentent 1 mètre ?', App.Drawing.getEchelle());
      var n = parseFloat(v);
      if (n > 0) { App.Drawing.definirEchelle(n); lieu.echelle_px_par_m = n; App.Storage.upsert('lieux', lieu); }
    };
    document.getElementById('btn-enregistrer').onclick = function () {
      sauverForme(false); flashBouton('btn-enregistrer', '✔ Enregistré', 'Enregistrer');
      if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
    };

    document.getElementById('btn-pdf').onclick = ouvrirDialoguePlan;

    rendrePalette();
  }

  /**
   * Ouvre un petit dialogue pour choisir l'échelle d'impression, puis génère
   * le plan PDF (page de légende + tuiles A3 à scotcher si nécessaire).
   */
  function ouvrirDialoguePlan() {
    // On enregistre d'abord la forme pour exporter l'état le plus à jour.
    sauverForme(true);
    var data = App.Drawing.exporter();
    var placements = App.Drawing.exporterPlacements();
    var existants = App.Drawing.exporterExistants();

    if (data.points.length < 3 && placements.length === 0 && existants.length === 0) {
      alert('Dessinez d\'abord le massif et/ou placez des plantes avant d\'exporter.');
      return;
    }

    // Construit le dialogue (overlay modal).
    var overlay = document.createElement('div');
    overlay.className = 'modal-fond';
    overlay.innerHTML = '<div class="modal">'
      + '<h2 class="modal-titre">Plan imprimable PDF</h2>'
      + '<p class="aide">Choisissez l\'échelle. Si le plan dépasse une feuille A3, '
      + 'il sera découpé en plusieurs A3 à assembler (avec repères et zones à scotcher).</p>'
      + '<label class="champ">Échelle d\'impression'
      + '<select id="pdf-echelle">'
      + '<option value="fit">Ajusté à une seule feuille A3</option>'
      + '<option value="20">1:20 (très détaillé)</option>'
      + '<option value="50" selected>1:50 (recommandé jardiniers)</option>'
      + '<option value="100">1:100 (vue d\'ensemble)</option>'
      + '</select></label>'
      + '<div class="barre-actions">'
      + '<button class="btn-secondaire" id="pdf-annuler">Annuler</button>'
      + '<button class="btn-principal" id="pdf-generer">Générer le PDF</button>'
      + '</div></div>';
    document.body.appendChild(overlay);

    function fermer() { document.body.removeChild(overlay); }
    overlay.querySelector('#pdf-annuler').onclick = fermer;
    overlay.onclick = function (e) { if (e.target === overlay) fermer(); };

    overlay.querySelector('#pdf-generer').onclick = function () {
      var val = overlay.querySelector('#pdf-echelle').value;
      var scale = (val === 'fit') ? 'fit' : parseInt(val, 10);
      var lieu = App.Storage.find('lieux', lieuActif);
      App.Export.genererPlan({
        projet: App.Config.get().projet,
        session: App.Storage.find('sessions', lieu.session_id),
        lieu: lieu,
        points: data.points,
        placements: placements,
        existants: existants,
        ppm: App.Drawing.getEchelle(),
        plantes: App.Plantes.liste(),
        scale: scale
      });
      fermer();
    };
  }

  /** Enregistre la forme du massif (et la surface réelle du lieu). */
  function sauverForme(silencieux) {
    var data = App.Drawing.exporter();
    if (data.points.length < 3) return; // rien à enregistrer
    var existante = App.Storage.where('formes', 'lieu_id', lieuActif)[0];
    var f = App.Storage.upsert('formes', {
      id: existante ? existante.id : undefined, lieu_id: lieuActif,
      points_json: JSON.stringify(data.points), surface_m2: data.surface_m2,
      date_creation: new Date().toISOString()
    });
    etatDessin.formeId = f.id;
    var lieu = etatDessin.lieu;
    lieu.surface_reelle_m2 = data.surface_m2;
    App.Storage.upsert('lieux', lieu);
  }

  /**
   * Construit la palette de plantes + le filtre couleur (mode "plantes" seulement).
   * Rafraîchie après chaque pose pour mettre à jour les compteurs de stock.
   */
  /** Libellé lisible d'une catégorie de végétal existant. */
  function libelleCat(c) {
    return { arbre: 'un arbre', arbuste: 'un arbuste', vivace: 'une vivace', autre: 'un végétal' }[c] || 'un végétal';
  }

  function rendrePalette() {
    var zone = document.getElementById('zone-palette');
    if (!zone) return;
    var m = App.Drawing.getMode();
    if (m === 'existant') { rendrePaletteExistant(zone); return; }
    if (m !== 'plantes') { zone.innerHTML = ''; return; }

    var plantes = App.Plantes.liste();
    if (plantes.length === 0) {
      zone.innerHTML = '<div class="palette-plantes"><p class="aide" style="padding:12px">'
        + 'Aucune plante. Ajoutez vos plantes commandées via l\'écran '
        + '<strong>🌱 Plantes</strong> (depuis l\'accueil).</p></div>';
      return;
    }

    // Cases à cocher du filtre d'exclusion par couleur.
    var couleurs = App.Plantes.couleursDisponibles();
    var filtres = couleurs.map(function (c) {
      var masquee = etatDessin.couleursMasquees.indexOf(c) !== -1;
      return '<label class="filtre-couleur">'
        + '<input type="checkbox" data-couleur="' + esc(c) + '" ' + (masquee ? 'checked' : '') + '>'
        + '<span class="pastille-couleur" style="background:' + App.Plantes.couleurCss(c) + '"></span>'
        + 'Masquer ' + esc(c) + '</label>';
    }).join('');

    // Pastilles de plantes (en excluant les couleurs masquées).
    var chips = plantes
      .filter(function (p) { return etatDessin.couleursMasquees.indexOf((p.couleur || '').trim()) === -1; })
      .map(function (p) {
        var reste = App.Plantes.restant(p);
        var epuise = reste <= 0;
        var actif = App.Drawing.getSelection() === null; // info purement visuelle
        return '<button class="chip-plante' + (epuise ? ' chip-plante--epuise' : '') + '" data-id="' + esc(p.id) + '"'
          + (epuise ? ' disabled' : '') + '>'
          + '<span class="pastille-couleur" style="background:' + App.Plantes.couleurCss(p.couleur) + '"></span>'
          + '<span class="chip-nom">' + esc(p.nom) + '</span>'
          + '<span class="chip-reste">' + reste + '</span></button>';
      }).join('');

    var selInfo = App.Drawing.getSelection()
      ? '<p class="aide" style="padding:6px 12px">Plante sélectionnée — bouton <strong>Effacer</strong> pour la retirer.</p>'
      : '<p class="aide" style="padding:6px 12px">Touchez une plante puis le massif pour la poser. '
        + 'Touchez une plante posée pour la sélectionner.</p>';

    zone.innerHTML = '<div class="palette-plantes">'
      + '<div class="filtres-couleur">' + (filtres || '<span class="aide">Aucune couleur</span>') + '</div>'
      + '<div class="chips">' + chips + '</div>' + selInfo + '</div>';

    // Coche/décoche d'une couleur → on masque/affiche les plantes concernées.
    [].forEach.call(zone.querySelectorAll('input[type=checkbox]'), function (cb) {
      cb.onchange = function () {
        var c = cb.getAttribute('data-couleur');
        var i = etatDessin.couleursMasquees.indexOf(c);
        if (cb.checked && i === -1) etatDessin.couleursMasquees.push(c);
        else if (!cb.checked && i !== -1) etatDessin.couleursMasquees.splice(i, 1);
        rendrePalette();
      };
    });

    // Sélection d'une plante à poser.
    [].forEach.call(zone.querySelectorAll('.chip-plante'), function (btn) {
      btn.onclick = function () {
        var p = App.Storage.find('plantes', btn.getAttribute('data-id'));
        App.Drawing.setPlanteActive(p);
        [].forEach.call(zone.querySelectorAll('.chip-plante'), function (b) { b.classList.remove('chip-plante--actif'); });
        btn.classList.add('chip-plante--actif');
      };
    });
  }

  /**
   * Palette du mode "Existant" : choix de catégorie, diamètre, et actions sur
   * le végétal sélectionné (renseigner, autoriser la plantation dessous, supprimer).
   */
  function rendrePaletteExistant(zone) {
    var tpl = App.Drawing.getExistantTemplate();
    var sel = App.Drawing.getSelection();

    // Boutons de catégorie (avec diamètre par défaut associé).
    var cats = [
      { id: 'arbre', label: '🌳 Arbre', d: 200 },
      { id: 'arbuste', label: '🌿 Arbuste', d: 100 },
      { id: 'vivace', label: '🌼 Vivace', d: 40 },
      { id: 'autre', label: '❓ Autre', d: 50 }
    ];
    var chips = cats.map(function (c) {
      var actif = tpl.categorie === c.id ? ' chip-plante--actif' : '';
      return '<button class="chip-plante' + actif + '" data-cat="' + c.id + '" data-d="' + c.d + '">'
        + '<span class="chip-nom">' + c.label + '</span></button>';
    }).join('');

    // Bloc d'actions sur le végétal sélectionné.
    var bloc = '';
    if (sel.type === 'existant') {
      var ex = App.Storage.find('existants', sel.id);
      if (ex) {
        var autorise = ex.autorise_dessous === true || ex.autorise_dessous === 'true';
        bloc = '<div class="existant-actions">'
          + '<p class="existant-info"><strong>' + esc(ex.nom || libelleCat(ex.categorie)) + '</strong> · Ø '
          + esc(ex.diametre_cm) + ' cm' + (ex.notes ? ' · ' + esc(ex.notes) : '') + '</p>'
          + '<button class="btn-tactile" id="ex-renseigner">✎ Renseigner</button>'
          + '<button class="btn-tactile ' + (autorise ? 'btn-autorise' : 'btn-verrou') + '" id="ex-autoriser">'
          + (autorise ? '🔓 Plantation autorisée dessous' : '🔒 Plantation verrouillée dessous') + '</button>'
          + '<button class="btn-tactile" id="ex-supprimer">✕ Supprimer</button>'
          + '</div>';
      }
    } else {
      bloc = '<p class="aide" style="padding:6px 12px">Touchez le massif pour placer un '
        + esc(libelleCat(tpl.categorie)) + '. Touchez un végétal posé pour le modifier.</p>';
    }

    zone.innerHTML = '<div class="palette-plantes">'
      + '<div class="chips">' + chips
      + '<button class="chip-plante" id="ex-diametre"><span class="chip-nom">Ø ' + esc(tpl.diametre_cm) + ' cm ✎</span></button>'
      + '</div>' + bloc + '</div>';

    // Sélection de catégorie.
    [].forEach.call(zone.querySelectorAll('[data-cat]'), function (btn) {
      btn.onclick = function () {
        App.Drawing.setExistantTemplate({ categorie: btn.getAttribute('data-cat'), diametre_cm: parseFloat(btn.getAttribute('data-d')) });
        rendrePaletteExistant(zone);
      };
    });
    // Modifier le diamètre du modèle.
    zone.querySelector('#ex-diametre').onclick = function () {
      var v = prompt('Diamètre du végétal (cm) :', tpl.diametre_cm);
      var n = parseFloat(v);
      if (n > 0) { App.Drawing.setExistantTemplate({ diametre_cm: n }); rendrePaletteExistant(zone); }
    };
    // Actions sur la sélection.
    var bR = zone.querySelector('#ex-renseigner');
    if (bR) bR.onclick = function () {
      var ex = App.Storage.find('existants', sel.id);
      var nom = prompt('Nom de la plante (laisser vide si inconnu) :', ex.nom || '');
      if (nom === null) return;
      var diam = prompt('Diamètre (cm) :', ex.diametre_cm);
      var notes = prompt('Autres infos (état, hauteur, remarque…) :', ex.notes || '');
      App.Drawing.majExistantSelection({ nom: (nom || '').trim(), diametre_cm: diam, notes: (notes || '').trim() });
      rendrePaletteExistant(zone);
    };
    var bA = zone.querySelector('#ex-autoriser');
    if (bA) bA.onclick = function () { App.Drawing.basculerAutorisation(); rendrePaletteExistant(zone); };
    var bS = zone.querySelector('#ex-supprimer');
    if (bS) bS.onclick = function () { App.Drawing.supprimerSelection(); rendrePaletteExistant(zone); };
  }

  /* ----------------------------- Vue : Plantes --------------------------- */

  function vuePlantes() {
    var plantes = App.Plantes.liste();
    var liste = plantes.length === 0
      ? '<p class="aide">Aucune plante. Ajoutez vos plantes commandées (ou remplissez l\'onglet "Plantes" du Google Sheets, puis synchronisez).</p>'
      : plantes.map(function (p) {
          return '<div class="carte carte--plante" data-id="' + esc(p.id) + '">'
            + '<span class="pastille-couleur" style="background:' + App.Plantes.couleurCss(p.couleur) + '"></span>'
            + '<span class="plante-info"><span class="carte-titre">' + esc(p.nom) + '</span>'
            + '<span class="carte-sous">Ø ' + esc(p.diametre_adulte_cm) + ' cm · '
            + App.Plantes.restant(p) + ' / ' + (p.stock_commande || 0) + ' restants</span></span>'
            + '<button class="btn-mini-suppr" data-suppr="' + esc(p.id) + '">✕</button></div>';
        }).join('');

    racine.innerHTML = entete('Plantes commandées', 'sessions')
      + '<main class="contenu">'
      + '<button class="btn-principal" id="btn-add-plante">+ Ajouter une plante</button>'
      + '<div class="liste">' + liste + '</div></main>';

    document.getElementById('btn-retour').onclick = function () { aller('sessions'); };
    document.getElementById('btn-add-plante').onclick = ajouterPlante;
    [].forEach.call(racine.querySelectorAll('.btn-mini-suppr'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (confirm('Supprimer cette plante de la liste ?')) {
          App.Storage.remove('plantes', b.getAttribute('data-suppr'));
          if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
          rafraichir();
        }
      };
    });
  }

  function ajouterPlante() {
    var nom = prompt('Nom de la plante :'); if (!nom) return;
    var couleur = prompt('Couleur de la fleur (ex : rouge, jaune, #FF8800) :', 'rouge') || '';
    var diam = prompt('Diamètre adulte en cm :', '30');
    var stock = prompt('Quantité commandée :', '20');
    App.Plantes.creer({
      nom: nom, couleur: couleur.trim(),
      diametre_adulte_cm: parseFloat(diam) || 30,
      stock_commande: parseInt(stock, 10) || 0
    });
    if (App.Sync.estEnLigne()) App.Sync.synchroniser(true);
    rafraichir();
  }

  /* ---------------------------- Vue : Dashboard -------------------------- */

  function vueDashboard() {
    var sessions = App.Storage.all('sessions').filter(function (s) { return !s.archive; });

    var blocs = sessions.map(function (s) {
      var lieux = App.Storage.where('lieux', 'session_id', s.id);
      var surfTotale = lieux.reduce(function (acc, l) { return acc + (parseFloat(l.surface_reelle_m2) || 0); }, 0);
      var nbPlTotal = lieux.reduce(function (acc, l) {
        return acc + App.Storage.where('placements', 'lieu_id', l.id).length;
      }, 0);

      var lignes = lieux.length === 0
        ? '<tr><td colspan="3" class="vide">Aucun lieu</td></tr>'
        : (function () {
            // Regroupe par secteur, avec une ligne d'en-tête par secteur.
            var groupes = {};
            lieux.forEach(function (l) {
              var sec = (l.secteur || '').trim() || 'Sans secteur';
              (groupes[sec] = groupes[sec] || []).push(l);
            });
            var ordre = Object.keys(groupes).sort(function (a, b) {
              if (a === 'Sans secteur') return 1;
              if (b === 'Sans secteur') return -1;
              return a.localeCompare(b);
            });
            return ordre.map(function (sec) {
              var enTete = '<tr class="ligne-secteur"><td colspan="3">▸ ' + esc(sec) + '</td></tr>';
              var rows = groupes[sec].map(function (l) {
                var nbPl = App.Storage.where('placements', 'lieu_id', l.id).length;
                return '<tr data-lieu="' + esc(l.id) + '" data-session="' + esc(s.id) + '">'
                  + '<td class="cellule-lieu">' + esc(l.nom) + (l.latitude ? ' 📍' : '') + '</td>'
                  + '<td class="num">' + (l.surface_reelle_m2 || '—') + '</td>'
                  + '<td class="num">' + nbPl + '</td></tr>';
              }).join('');
              return enTete + rows;
            }).join('');
          })();

      return '<section class="bloc-session">'
        + '<h2 class="titre-session">' + esc(s.nom) + '</h2>'
        + '<p class="resume-session">' + lieux.length + ' lieu(x) · '
        + (Math.round(surfTotale * 100) / 100) + ' m² · ' + nbPlTotal + ' plante(s)</p>'
        + '<table class="tableau"><thead><tr><th>Lieu</th><th class="num">m²</th><th class="num">Plantes</th></tr></thead>'
        + '<tbody>' + lignes + '</tbody></table></section>';
    }).join('');

    racine.innerHTML = entete('Tableau de bord', 'sessions')
      + '<main class="contenu">'
      + (sessions.length === 0 ? '<p class="aide">Aucune donnée à afficher.</p>' : blocs)
      + '</main>';

    document.getElementById('btn-retour').onclick = function () { aller('sessions'); };
    // Cliquer une ligne ouvre directement le lieu correspondant.
    [].forEach.call(racine.querySelectorAll('tr[data-lieu]'), function (tr) {
      tr.onclick = function () {
        sessionActive = tr.getAttribute('data-session');
        lieuActif = tr.getAttribute('data-lieu');
        aller('dessin');
      };
    });
  }

  /* ----------------------------- Petits helpers -------------------------- */

  /** Affiche brièvement un texte sur un bouton puis restaure l'original. */
  function flashBouton(id, texte, retour) {
    var b = document.getElementById(id); if (!b) return;
    var orig = retour || b.textContent;
    b.textContent = texte;
    setTimeout(function () { b.textContent = orig; }, 1200);
  }

  return { demarrer: demarrer, rafraichir: rafraichir };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.UI.demarrer();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(function () {});
  }
});
