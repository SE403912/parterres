/**
 * =============================================================================
 *  drawing.js — DESSIN, ÉCHELLE, SURFACE, VÉGÉTATION EXISTANTE & ANNUELLES
 * =============================================================================
 *
 *  TROIS MODES sur un même canvas :
 *
 *  1) 'dessin'   : tracé du contour du massif à la main levée, lissé en
 *     polygone net, surface en m² et échelle (px/m).
 *
 *  2) 'existant' : on localise la VÉGÉTATION DÉJÀ EN PLACE (arbres, arbustes,
 *     vivaces…). Chaque végétal a une catégorie, un diamètre, un nom facultatif
 *     et des notes. On peut AUTORISER ou non la plantation "dessous".
 *
 *  3) 'plantes'  : on pose les ANNUELLES commandées. La végétation existante
 *     apparaît GRISÉE. Poser une annuelle SOUS un végétal existant est BLOQUÉ,
 *     sauf si ce végétal a été marqué "plantation autorisée dessous".
 * =============================================================================
 */

window.App = window.App || {};

App.Drawing = (function () {
  var canvas, ctx;
  var pointsBruts = [];
  var polygone = [];
  var enTrainDeTracer = false;
  var pixelsParMetre = 50;
  var pileUndo = [];
  var onChange = function () {};

  var mode = 'dessin'; // 'dessin' | 'existant' | 'plantes'

  // --- Annuelles (issues du stock commandé) ---
  var placements = [];     // [{ id, plante_id, x, y, diametre_cm, couleur }]
  var planteActive = null;

  // --- Végétation existante ---
  var existants = [];      // [{ id, x, y, diametre_cm, categorie, nom, autorise_dessous, notes }]
  var existantTemplate = { categorie: 'arbre', diametre_cm: 200, nom: '', notes: '' };

  // --- Sélection unifiée ---
  var selection = { type: null, id: null }; // type: 'annuelle' | 'existant'

  // --- Rappels vers l'application ---
  var onPlace = function () {};
  var onRetrait = function () {};
  var onPlaceExistant = function () {};
  var onRetraitExistant = function () {};
  var onSelection = function () {};

  /* ----------------------------- Initialisation -------------------------- */

  function init(canvasEl, options) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    options = options || {};
    if (options.pixelsParMetre) pixelsParMetre = options.pixelsParMetre;
    onChange = options.onChange || function () {};
    onPlace = options.onPlace || function () {};
    onRetrait = options.onRetrait || function () {};
    onPlaceExistant = options.onPlaceExistant || function () {};
    onRetraitExistant = options.onRetraitExistant || function () {};
    onSelection = options.onSelection || function () {};

    polygone = []; placements = []; existants = []; pileUndo = [];
    planteActive = null; selection = { type: null, id: null }; mode = 'dessin';
    existantTemplate = { categorie: 'arbre', diametre_cm: 200, nom: '', notes: '' };

    ajusterTaille();
    brancherEvenements();
    redessiner();
  }

  function ajusterTaille() {
    var ratio = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /* --------------------------- Gestion des gestes ------------------------ */

  function position(evt) {
    var rect = canvas.getBoundingClientRect();
    var src = evt.touches ? evt.touches[0] : evt;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function debutGeste(evt) {
    evt.preventDefault();
    if (mode === 'dessin') {
      enTrainDeTracer = true;
      pointsBruts = [position(evt)];
    } else if (mode === 'existant') {
      gererTapExistant(position(evt));
    } else {
      gererTapAnnuelle(position(evt));
    }
  }

  function continueGeste(evt) {
    if (mode !== 'dessin' || !enTrainDeTracer) return;
    evt.preventDefault();
    pointsBruts.push(position(evt));
    redessiner();
    dessinerTraceBrut();
  }

  function finGeste(evt) {
    if (mode !== 'dessin' || !enTrainDeTracer) return;
    evt.preventDefault();
    enTrainDeTracer = false;
    if (pointsBruts.length < 3) { pointsBruts = []; return; }
    sauverPourUndo();
    polygone = simplifierRDP(pointsBruts, 4);
    pointsBruts = [];
    redessiner();
    notifier();
  }

  function brancherEvenements() {
    canvas.addEventListener('touchstart', debutGeste, { passive: false });
    canvas.addEventListener('touchmove', continueGeste, { passive: false });
    canvas.addEventListener('touchend', finGeste, { passive: false });
    canvas.addEventListener('mousedown', debutGeste);
    canvas.addEventListener('mousemove', continueGeste);
    canvas.addEventListener('mouseup', finGeste);
    window.addEventListener('resize', function () { ajusterTaille(); redessiner(); });
  }

  /* ----------------------- Placement de la végétation existante ---------- */

  function gererTapExistant(pt) {
    // Si on touche un végétal existant déjà posé → on le sélectionne (édition).
    var dessus = existantSousPoint(pt);
    if (dessus) {
      selection = { type: 'existant', id: dessus.id };
      redessiner();
      onSelection({ type: 'existant', item: dessus });
      return;
    }
    // Sinon, on pose un nouveau végétal existant selon le modèle courant.
    var ex = {
      id: App.Storage.uid('exist'),
      x: pt.x, y: pt.y,
      diametre_cm: existantTemplate.diametre_cm,
      categorie: existantTemplate.categorie,
      nom: existantTemplate.nom || '',
      autorise_dessous: false,
      notes: existantTemplate.notes || ''
    };
    existants.push(ex);
    selection = { type: 'existant', id: ex.id };
    redessiner();
    notifier();
    onPlaceExistant(ex);
  }

  /* ----------------------- Placement des annuelles ----------------------- */

  function gererTapAnnuelle(pt) {
    if (planteActive) {
      // Blocage : interdit de planter sous un végétal existant non autorisé.
      var veg = vegSousPoint(pt);
      if (veg && !estVrai(veg.autorise_dessous)) {
        onPlace({ refuse: true, raison: 'sous_vegetal', categorie: veg.categorie });
        return;
      }
      var diamCm = parseFloat(planteActive.diametre_adulte_cm) || 30;
      var placement = {
        id: App.Storage.uid('place'),
        plante_id: planteActive.id,
        x: pt.x, y: pt.y, diametre_cm: diamCm, couleur: planteActive.couleur
      };
      placements.push(placement);
      selection = { type: null, id: null };
      redessiner();
      notifier();
      onPlace({ refuse: false, placement: placement });
    } else {
      // Pas de plante active : on sélectionne l'élément le plus proche.
      var pl = placementSousPoint(pt);
      if (pl) { selection = { type: 'annuelle', id: pl.id }; redessiner(); onSelection({ type: 'annuelle', item: pl }); return; }
      var ex = existantSousPoint(pt);
      selection = ex ? { type: 'existant', id: ex.id } : { type: null, id: null };
      redessiner();
      onSelection(ex ? { type: 'existant', item: ex } : null);
    }
  }

  /* ----------------------- Recherche d'éléments sous un point ------------ */

  function placementSousPoint(pt) {
    for (var i = placements.length - 1; i >= 0; i--) {
      var pl = placements[i];
      var rayon = Math.max(14, (pl.diametre_cm / 100 * pixelsParMetre) / 2);
      if (Math.hypot(pt.x - pl.x, pt.y - pl.y) <= rayon) return pl;
    }
    return null;
  }

  function existantSousPoint(pt) {
    for (var i = existants.length - 1; i >= 0; i--) {
      var ex = existants[i];
      var rayon = Math.max(14, (ex.diametre_cm / 100 * pixelsParMetre) / 2);
      if (Math.hypot(pt.x - ex.x, pt.y - ex.y) <= rayon) return ex;
    }
    return null;
  }

  /** Renvoie le végétal existant dont le DISQUE contient le point (pour le blocage). */
  function vegSousPoint(pt) {
    for (var i = existants.length - 1; i >= 0; i--) {
      var ex = existants[i];
      var rayon = (ex.diametre_cm / 100 * pixelsParMetre) / 2;
      if (Math.hypot(pt.x - ex.x, pt.y - ex.y) <= rayon) return ex;
    }
    return null;
  }

  function estVrai(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  /* --------------------------- Suppression / édition --------------------- */

  function supprimerSelection() {
    if (!selection.id) return;
    if (selection.type === 'annuelle') {
      var retire = placements.find(function (p) { return p.id === selection.id; });
      placements = placements.filter(function (p) { return p.id !== selection.id; });
      selection = { type: null, id: null };
      redessiner(); notifier();
      if (retire) onRetrait(retire);
    } else if (selection.type === 'existant') {
      var ret = existants.find(function (e) { return e.id === selection.id; });
      existants = existants.filter(function (e) { return e.id !== selection.id; });
      selection = { type: null, id: null };
      redessiner(); notifier();
      if (ret) onRetraitExistant(ret);
    }
  }

  /** Bascule l'autorisation de plantation sous le végétal sélectionné. */
  function basculerAutorisation() {
    if (selection.type !== 'existant') return null;
    var ex = existants.find(function (e) { return e.id === selection.id; });
    if (!ex) return null;
    ex.autorise_dessous = !estVrai(ex.autorise_dessous);
    redessiner();
    onPlaceExistant(ex); // persistance par l'app
    return ex;
  }

  /** Met à jour les champs (nom, diamètre, notes) du végétal sélectionné. */
  function majExistantSelection(champs) {
    if (selection.type !== 'existant') return null;
    var ex = existants.find(function (e) { return e.id === selection.id; });
    if (!ex) return null;
    if (champs.nom !== undefined) ex.nom = champs.nom;
    if (champs.diametre_cm !== undefined) ex.diametre_cm = parseFloat(champs.diametre_cm) || ex.diametre_cm;
    if (champs.notes !== undefined) ex.notes = champs.notes;
    redessiner();
    onPlaceExistant(ex);
    return ex;
  }

  /* ------------------------- Lissage (Douglas-Peucker) ------------------- */

  function simplifierRDP(pts, epsilon) {
    if (pts.length < 3) return pts.slice();
    function distance(p, a, b) {
      var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
    function rdp(points) {
      var dmax = 0, index = 0;
      for (var i = 1; i < points.length - 1; i++) {
        var d = distance(points[i], points[0], points[points.length - 1]);
        if (d > dmax) { index = i; dmax = d; }
      }
      if (dmax > epsilon) {
        return rdp(points.slice(0, index + 1)).slice(0, -1).concat(rdp(points.slice(index)));
      }
      return [points[0], points[points.length - 1]];
    }
    return rdp(pts);
  }

  /* --------------------------- Calculs de surface ------------------------ */

  function surfaceM2() {
    if (polygone.length < 3) return 0;
    var aire2 = 0;
    for (var i = 0; i < polygone.length; i++) {
      var p1 = polygone[i], p2 = polygone[(i + 1) % polygone.length];
      aire2 += (p1.x * p2.y) - (p2.x * p1.y);
    }
    var aireM2 = (Math.abs(aire2) / 2) / (pixelsParMetre * pixelsParMetre);
    return Math.round(aireM2 * 100) / 100;
  }

  function surfaceOccupeeM2() {
    var total = 0;
    placements.forEach(function (pl) {
      var r = (pl.diametre_cm / 100) / 2; total += Math.PI * r * r;
    });
    return Math.round(total * 100) / 100;
  }

  function surfaceRestanteM2() {
    return Math.round(Math.max(0, surfaceM2() - surfaceOccupeeM2()) * 100) / 100;
  }

  /* ------------------------------- Rendu --------------------------------- */

  function libelleCategorie(c) {
    return { arbre: 'A', arbuste: 'Ab', vivace: 'V', autre: '?' }[c] || '?';
  }

  function redessiner() {
    if (!ctx) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    dessinerGrille(w, h);

    // Massif.
    if (polygone.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(polygone[0].x, polygone[0].y);
      polygone.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(26, 77, 230, 0.10)'; ctx.fill();
      ctx.strokeStyle = '#1A4DE6'; ctx.lineWidth = 2.5; ctx.stroke();
      if (mode === 'dessin') {
        polygone.forEach(function (p) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#1A4DE6'; ctx.stroke();
        });
      }
    }

    // Végétation existante (grisée, surtout en mode 'plantes').
    dessinerExistants();

    // Annuelles (couleur réelle).
    placements.forEach(function (pl) {
      var rayonPx = Math.max(5, (pl.diametre_cm / 100 * pixelsParMetre) / 2);
      ctx.beginPath(); ctx.arc(pl.x, pl.y, rayonPx, 0, Math.PI * 2);
      ctx.fillStyle = App.Plantes.couleurCss(pl.couleur);
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      if (selection.type === 'annuelle' && pl.id === selection.id) {
        ctx.lineWidth = 3; ctx.strokeStyle = '#1A4DE6';
      } else { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(10,10,10,0.55)'; }
      ctx.stroke();
    });
  }

  function dessinerExistants() {
    // Plus grisé quand on travaille sur les annuelles (pour se concentrer).
    var alpha = (mode === 'plantes') ? 0.45 : 0.8;
    existants.forEach(function (ex) {
      var rayonPx = Math.max(8, (ex.diametre_cm / 100 * pixelsParMetre) / 2);

      // Disque gris.
      ctx.beginPath(); ctx.arc(ex.x, ex.y, rayonPx, 0, Math.PI * 2);
      ctx.fillStyle = '#C9C9C9'; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1;

      // Contour : pointillés gris foncé ; vert si plantation autorisée dessous.
      ctx.setLineDash([5, 4]);
      if (estVrai(ex.autorise_dessous)) { ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2.5; }
      else { ctx.strokeStyle = '#6B6B6B'; ctx.lineWidth = 1.8; }
      ctx.stroke();
      ctx.setLineDash([]);

      // Surbrillance bleue si sélectionné.
      if (selection.type === 'existant' && ex.id === selection.id) {
        ctx.beginPath(); ctx.arc(ex.x, ex.y, rayonPx + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#1A4DE6'; ctx.lineWidth = 2.5; ctx.stroke();
      }

      // Étiquette de catégorie au centre.
      ctx.fillStyle = '#3A3A3A';
      ctx.font = 'bold ' + Math.max(9, Math.min(rayonPx, 14)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(libelleCategorie(ex.categorie), ex.x, ex.y);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    });
  }

  function dessinerGrille(w, h) {
    ctx.strokeStyle = '#ECECEC'; ctx.lineWidth = 1;
    for (var x = 0; x <= w; x += pixelsParMetre) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y <= h; y += pixelsParMetre) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  function dessinerTraceBrut() {
    if (pointsBruts.length < 2) return;
    ctx.beginPath(); ctx.moveTo(pointsBruts[0].x, pointsBruts[0].y);
    pointsBruts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = '#999'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ------------------------------ Annulation ----------------------------- */

  function sauverPourUndo() {
    pileUndo.push(JSON.stringify(polygone));
    if (pileUndo.length > 30) pileUndo.shift();
  }

  function annuler() {
    if (mode === 'plantes' && placements.length > 0) {
      var r = placements.pop(); selection = { type: null, id: null };
      redessiner(); notifier(); onRetrait(r); return;
    }
    if (mode === 'existant' && existants.length > 0) {
      var e = existants.pop(); selection = { type: null, id: null };
      redessiner(); notifier(); onRetraitExistant(e); return;
    }
    if (pileUndo.length === 0) { polygone = []; }
    else { polygone = JSON.parse(pileUndo.pop()); }
    redessiner(); notifier();
  }

  function effacer() {
    sauverPourUndo(); polygone = []; redessiner(); notifier();
  }

  /* ----------------------------- Échelle & I/O --------------------------- */

  function definirEchelle(px) { if (px > 0) { pixelsParMetre = px; redessiner(); notifier(); } }
  function getEchelle() { return pixelsParMetre; }

  function setMode(m) {
    mode = (m === 'plantes' || m === 'existant') ? m : 'dessin';
    selection = { type: null, id: null };
    if (m !== 'plantes') planteActive = null;
    redessiner();
  }
  function getMode() { return mode; }

  function setPlanteActive(plante) { planteActive = plante; selection = { type: null, id: null }; redessiner(); }
  function setExistantTemplate(tpl) {
    if (tpl.categorie) existantTemplate.categorie = tpl.categorie;
    if (tpl.diametre_cm !== undefined) existantTemplate.diametre_cm = parseFloat(tpl.diametre_cm) || existantTemplate.diametre_cm;
    if (tpl.nom !== undefined) existantTemplate.nom = tpl.nom;
    if (tpl.notes !== undefined) existantTemplate.notes = tpl.notes;
  }
  function getExistantTemplate() { return existantTemplate; }
  function getSelection() { return selection; }

  function exporter() { return { points: polygone.slice(), surface_m2: surfaceM2(), echelle: pixelsParMetre }; }
  function exporterPlacements() { return placements.slice(); }
  function exporterExistants() { return existants.slice(); }

  function charger(data) {
    polygone = (data && data.points) ? data.points : [];
    if (data && data.echelle) pixelsParMetre = data.echelle;
    redessiner(); notifier();
  }
  function chargerPlacements(liste) {
    placements = (liste || []).map(function (p) {
      return { id: p.id, plante_id: p.plante_id, x: parseFloat(p.x), y: parseFloat(p.y),
        diametre_cm: parseFloat(p.diametre_cm) || 30, couleur: p.couleur };
    });
    redessiner(); notifier();
  }
  function chargerExistants(liste) {
    existants = (liste || []).map(function (e) {
      return { id: e.id, x: parseFloat(e.x), y: parseFloat(e.y),
        diametre_cm: parseFloat(e.diametre_cm) || 100, categorie: e.categorie || 'autre',
        nom: e.nom || '', autorise_dessous: estVrai(e.autorise_dessous), notes: e.notes || '' };
    });
    redessiner(); notifier();
  }

  function notifier() {
    onChange({
      surface_m2: surfaceM2(), surface_restante_m2: surfaceRestanteM2(),
      echelle: pixelsParMetre, nb_plantes: placements.length, nb_existants: existants.length
    });
  }

  return {
    init: init, annuler: annuler, effacer: effacer,
    surfaceM2: surfaceM2, surfaceRestanteM2: surfaceRestanteM2,
    definirEchelle: definirEchelle, getEchelle: getEchelle,
    setMode: setMode, getMode: getMode,
    setPlanteActive: setPlanteActive,
    setExistantTemplate: setExistantTemplate, getExistantTemplate: getExistantTemplate,
    basculerAutorisation: basculerAutorisation, majExistantSelection: majExistantSelection,
    supprimerSelection: supprimerSelection, getSelection: getSelection,
    exporter: exporter, exporterPlacements: exporterPlacements, exporterExistants: exporterExistants,
    charger: charger, chargerPlacements: chargerPlacements, chargerExistants: chargerExistants
  };
})();
