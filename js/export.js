/**
 * =============================================================================
 *  export.js — PLAN IMPRIMABLE PDF (A3, À L'ÉCHELLE, MULTI-TUILES)
 * =============================================================================
 *
 *  OBJECTIF
 *  --------
 *  Produire un plan clair pour les jardiniers, à partir du massif dessiné et
 *  des plantes posées :
 *    - une PAGE DE LÉGENDE (titre, échelle, GPS, liste des espèces avec leur
 *      couleur, diamètre et quantité, instructions d'assemblage) ;
 *    - une ou plusieurs PAGES DE PLAN au format A3, à l'échelle réelle choisie
 *      (1:20, 1:50, 1:100 ou ajusté). Si le plan dépasse une feuille, il est
 *      automatiquement DÉCOUPÉ EN TUILES A3 avec zones de chevauchement à
 *      scotcher et repères d'assemblage (Ligne × Colonne).
 *
 *  Le rendu utilise jsPDF (bibliothèque embarquée en local : aucun accès
 *  réseau requis). Toutes les coordonnées sont calculées en MILLIMÈTRES pour
 *  garantir une échelle fidèle à l'impression.
 * =============================================================================
 */

window.App = window.App || {};

App.Export = (function () {

  // --- Constantes de mise en page (millimètres) ---
  var A3 = { L: 420, H: 297 };   // A3 paysage (largeur × hauteur)
  var MARGE = 10;                // marge blanche autour de chaque tuile
  var CHEVAUCHEMENT = 20;        // zone commune entre deux tuiles (pour scotcher)

  /* ----------------------- Utilitaires couleur -------------------------- */

  /** Vrai si la valeur représente "true" (booléen, chaîne ou 1). */
  function estVrai(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  /** Convertit un code couleur (#RGB ou #RRGGBB) en {r,g,b}. */
  function hexVersRgb(hex) {
    var h = (hex || '#999999').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.substring(0, 2), 16) || 153,
      g: parseInt(h.substring(2, 4), 16) || 153,
      b: parseInt(h.substring(4, 6), 16) || 153
    };
  }

  /* ----------------------- Calcul de la zone du plan -------------------- */

  /**
   * Calcule la "boîte englobante" du plan en mètres réels, en incluant les
   * plantes qui débordent du massif (on tient compte du rayon des cercles).
   */
  function boiteEnglobante(points, placements, existants, ppm) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    function etend(cx, cy, r) {
      minX = Math.min(minX, cx - r); minY = Math.min(minY, cy - r);
      maxX = Math.max(maxX, cx + r); maxY = Math.max(maxY, cy + r);
    }

    // Sommets du massif (pixels → mètres).
    points.forEach(function (p) {
      var mx = p.x / ppm, my = p.y / ppm;
      minX = Math.min(minX, mx); minY = Math.min(minY, my);
      maxX = Math.max(maxX, mx); maxY = Math.max(maxY, my);
    });

    // Annuelles et végétation existante (centre ± rayon réel).
    placements.forEach(function (pl) { etend(pl.x / ppm, pl.y / ppm, (pl.diametre_cm / 100) / 2); });
    (existants || []).forEach(function (ex) { etend(ex.x / ppm, ex.y / ppm, (ex.diametre_cm / 100) / 2); });

    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
    var pad = 0.2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  /* --------------------------- Génération PDF --------------------------- */

  /**
   * Génère et télécharge le plan.
   * @param {Object} ctx - { lieu, session, projet, points, placements, ppm,
   *                          plantes, scale } où scale = 20|50|100|'fit'
   */
  function genererPlan(ctx) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('La bibliothèque PDF n\'a pas pu être chargée.');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

    ctx.existants = ctx.existants || [];
    var boite = boiteEnglobante(ctx.points, ctx.placements, ctx.existants, ctx.ppm);
    var planLargeurM = boite.maxX - boite.minX;
    var planHauteurM = boite.maxY - boite.minY;

    // Zone utile d'une tuile (hors marges).
    var utileL = A3.L - 2 * MARGE;
    var utileH = A3.H - 2 * MARGE;

    // Échelle : combien de millimètres papier pour 1 mètre réel.
    var mmParM;
    if (ctx.scale === 'fit') {
      // Ajuste pour que tout tienne sur UNE seule tuile.
      mmParM = Math.min(utileL / planLargeurM, utileH / planHauteurM);
    } else {
      mmParM = 1000 / ctx.scale; // ex : 1:50 → 20 mm/m
    }
    var ratio = Math.round(1000 / mmParM); // pour l'affichage "1:ratio"

    // Dimensions du plan sur le papier (mm).
    var planLargeurMm = planLargeurM * mmParM;
    var planHauteurMm = planHauteurM * mmParM;

    // Découpage en tuiles : pas = zone utile − chevauchement.
    var pasL = Math.max(10, utileL - CHEVAUCHEMENT);
    var pasH = Math.max(10, utileH - CHEVAUCHEMENT);
    var cols = Math.max(1, Math.ceil((planLargeurMm - CHEVAUCHEMENT) / pasL));
    var lignes = Math.max(1, Math.ceil((planHauteurMm - CHEVAUCHEMENT) / pasH));
    if (planLargeurMm <= utileL) cols = 1;
    if (planHauteurMm <= utileH) lignes = 1;

    // --- PAGE 1 : légende & instructions ---
    dessinerLegende(doc, ctx, ratio, lignes, cols);

    // --- PAGES SUIVANTES : tuiles du plan ---
    for (var r = 0; r < lignes; r++) {
      for (var c = 0; c < cols; c++) {
        doc.addPage('a3', 'landscape');
        dessinerTuile(doc, ctx, {
          mmParM: mmParM, boite: boite,
          origineMmX: c * pasL, origineMmY: r * pasH,
          utileL: utileL, utileH: utileH,
          ligne: r, col: c, totalLignes: lignes, totalCols: cols, ratio: ratio
        });
      }
    }

    // Nom de fichier propre.
    var nom = 'plan_' + (ctx.lieu.nom || 'massif').replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.pdf';
    doc.save(nom);
  }

  /* --------------------------- Page de légende -------------------------- */

  function dessinerLegende(doc, ctx, ratio, lignes, cols) {
    var x = MARGE, y = MARGE + 6;

    // Titre.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.setTextColor(26, 77, 230); // bleu roi
    doc.text('Plan de plantation', x, y);
    doc.setTextColor(10, 10, 10);

    // Bloc d'informations.
    y += 12; doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    var infos = [
      'Projet : ' + (ctx.projet || '—'),
      'Session : ' + (ctx.session ? ctx.session.nom : '—'),
      'Lieu : ' + (ctx.lieu.nom || '—'),
      'Date : ' + new Date().toLocaleDateString('fr-FR'),
      'Echelle : 1:' + ratio + '   (1 metre reel = ' + Math.round(1000 / ratio) + ' mm sur le papier)',
      'Surface du massif : ' + (ctx.lieu.surface_reelle_m2 || '?') + ' m2'
    ];
    if (ctx.lieu.latitude) infos.push('GPS : ' + ctx.lieu.latitude + ', ' + ctx.lieu.longitude);
    infos.forEach(function (t) { doc.text(t, x, y); y += 6; });

    // Découpage.
    y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Assemblage : ' + (lignes * cols) + ' feuille(s) A3  (' + lignes + ' ligne(s) x ' + cols + ' colonne(s))', x, y);
    y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (lignes * cols > 1) {
      doc.text('Les zones grisees en bord de feuille se chevauchent : superposez-les et scotchez.', x, y); y += 5;
      doc.text('Reperez chaque feuille par son etiquette "Ligne x / Colonne y" en haut a gauche.', x, y); y += 5;
    } else {
      doc.text('Le plan tient sur une seule feuille A3.', x, y); y += 5;
    }

    // Tableau de légende (espèces).
    y += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Legende des plantes', x, y); y += 7;
    doc.setFontSize(10);

    // En-têtes de colonnes.
    doc.setFont('helvetica', 'bold');
    doc.text('Couleur', x + 2, y);
    doc.text('Espece', x + 24, y);
    doc.text('Diametre', x + 120, y);
    doc.text('Posees', x + 160, y);
    y += 2; doc.setDrawColor(180); doc.line(x, y, x + 200, y); y += 5;
    doc.setFont('helvetica', 'normal');

    // Regroupe les placements par espèce.
    var parPlante = {};
    ctx.placements.forEach(function (pl) {
      parPlante[pl.plante_id] = (parPlante[pl.plante_id] || 0) + 1;
    });

    ctx.plantes.forEach(function (p) {
      var nb = parPlante[p.id] || 0;
      if (nb === 0) return; // n'affiche que les espèces réellement posées
      var rgb = hexVersRgb(App.Plantes.couleurCss(p.couleur));
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.setDrawColor(60);
      doc.circle(x + 6, y - 1.5, 3, 'FD'); // pastille de couleur
      doc.setTextColor(10, 10, 10);
      doc.text(String(p.nom), x + 24, y);
      doc.text((p.diametre_adulte_cm || '?') + ' cm', x + 120, y);
      doc.text(String(nb), x + 162, y);
      y += 7;
      if (y > A3.H - MARGE) { y = MARGE + 10; } // garde-fou simple
    });

    // Note sur la végétation existante (à conserver).
    var nbEx = (ctx.existants || []).length;
    if (nbEx > 0) {
      y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(10, 10, 10);
      doc.text('Vegetation existante a conserver : ' + nbEx + ' repere(s)', x, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
      doc.text('Cercles GRIS (A = arbre, Ab = arbuste, V = vivace, ? = autre).', x, y); y += 5;
      doc.text('Contour VERT = plantation autorisee dessous. Sinon, ne pas planter dessous.', x, y);
    }
  }

  /* ------------------------------- Une tuile ---------------------------- */

  function dessinerTuile(doc, ctx, t) {
    // Fonction de projection : mètre réel → millimètre sur CETTE tuile.
    function px(mx) { return MARGE + (mx - t.boite.minX) * t.mmParM - t.origineMmX; }
    function py(my) { return MARGE + (my - t.boite.minY) * t.mmParM - t.origineMmY; }

    var x0 = MARGE, y0 = MARGE, x1 = MARGE + t.utileL, y1 = MARGE + t.utileH;

    // 1) Grille de 1 m (repère léger gris clair).
    doc.setDrawColor(225); doc.setLineWidth(0.1);
    var b = t.boite;
    for (var gx = Math.ceil(b.minX); gx <= b.maxX; gx++) {
      var X = px(gx); if (X >= x0 && X <= x1) doc.line(X, y0, X, y1);
    }
    for (var gy = Math.ceil(b.minY); gy <= b.maxY; gy++) {
      var Y = py(gy); if (Y >= y0 && Y <= y1) doc.line(x0, Y, x1, Y);
    }

    // 2) Contour du massif (trait bleu roi épais).
    if (ctx.points.length >= 3) {
      doc.setDrawColor(26, 77, 230); doc.setLineWidth(0.6);
      for (var i = 0; i < ctx.points.length; i++) {
        var a = ctx.points[i], bb = ctx.points[(i + 1) % ctx.points.length];
        doc.line(px(a.x / ctx.ppm), py(a.y / ctx.ppm), px(bb.x / ctx.ppm), py(bb.y / ctx.ppm));
      }
    }

    // 2bis) Végétation existante (gris, étiquette de catégorie, vert si plantation autorisée).
    (ctx.existants || []).forEach(function (ex) {
      var cx = px(ex.x / ctx.ppm), cy = py(ex.y / ctx.ppm);
      var rmm = (ex.diametre_cm / 100) / 2 * t.mmParM;
      if (cx > x0 - rmm - 5 && cx < x1 + rmm + 5 && cy > y0 - rmm - 5 && cy < y1 + rmm + 5) {
        doc.setFillColor(214, 214, 214);
        doc.setDrawColor(120); doc.setLineWidth(0.25);
        doc.circle(cx, cy, Math.max(1, rmm), 'FD');
        if (estVrai(ex.autorise_dessous)) {
          doc.setDrawColor(46, 125, 50); doc.setLineWidth(0.6);
          doc.circle(cx, cy, Math.max(1, rmm), 'S');
        }
        doc.setTextColor(70, 70, 70); doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(6, Math.min(rmm, 11)));
        var lab = { arbre: 'A', arbuste: 'Ab', vivace: 'V', autre: '?' }[ex.categorie] || '?';
        doc.text(lab, cx, cy + 1, { align: 'center' });
      }
    });

    // 3) Plantes (cercles à la couleur réelle, diamètre adulte à l'échelle).
    ctx.placements.forEach(function (pl) {
      var cx = px(pl.x / ctx.ppm), cy = py(pl.y / ctx.ppm);
      var rmm = (pl.diametre_cm / 100) / 2 * t.mmParM;
      var rgb = hexVersRgb(App.Plantes.couleurCss(pl.couleur));
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.setDrawColor(40); doc.setLineWidth(0.2);
      // On ne dessine que si le centre est globalement dans la tuile (perf).
      if (cx > x0 - rmm - 5 && cx < x1 + rmm + 5 && cy > y0 - rmm - 5 && cy < y1 + rmm + 5) {
        doc.circle(cx, cy, Math.max(0.6, rmm), 'FD');
      }
    });

    // 4) Masques blancs sur les marges (nettoie les débordements de tuile).
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, A3.L, MARGE, 'F');                 // haut
    doc.rect(0, A3.H - MARGE, A3.L, MARGE, 'F');       // bas
    doc.rect(0, 0, MARGE, A3.H, 'F');                  // gauche
    doc.rect(A3.L - MARGE, 0, MARGE, A3.H, 'F');       // droite

    // 5) Zones de chevauchement grisées (uniquement côtés où il y a une tuile voisine).
    doc.setFillColor(232, 232, 232);
    if (t.col < t.totalCols - 1) doc.rect(x1 - CHEVAUCHEMENT, y0, CHEVAUCHEMENT, t.utileH, 'F'); // bande droite
    if (t.ligne < t.totalLignes - 1) doc.rect(x0, y1 - CHEVAUCHEMENT, t.utileL, CHEVAUCHEMENT, 'F'); // bande bas

    // 6) Cadre de la zone utile + barre d'échelle + étiquette + mini-repère.
    doc.setDrawColor(120); doc.setLineWidth(0.2);
    doc.rect(x0, y0, t.utileL, t.utileH, 'S');

    // Barre d'échelle : 1 m.
    var barre = t.mmParM; // longueur de 1 m en mm
    doc.setDrawColor(10, 10, 10); doc.setLineWidth(0.5);
    doc.line(x0 + 4, y1 - 4, x0 + 4 + barre, y1 - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(10, 10, 10);
    doc.text('1 m', x0 + 4 + barre + 2, y1 - 3);

    // Étiquette de tuile.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 77, 230);
    doc.text('Ligne ' + (t.ligne + 1) + ' / Colonne ' + (t.col + 1)
      + '   (1:' + t.ratio + ')', x0 + 1, y0 - 2 + MARGE - MARGE + 4);

    // Mini-repère d'assemblage (petite grille en haut à droite).
    var taille = 3, gx0 = x1 - t.totalCols * taille - 1, gy0 = y0 + 1;
    doc.setLineWidth(0.15);
    for (var rr = 0; rr < t.totalLignes; rr++) {
      for (var cc = 0; cc < t.totalCols; cc++) {
        if (rr === t.ligne && cc === t.col) { doc.setFillColor(26, 77, 230); doc.rect(gx0 + cc * taille, gy0 + rr * taille, taille, taille, 'F'); }
        else { doc.setDrawColor(150); doc.rect(gx0 + cc * taille, gy0 + rr * taille, taille, taille, 'S'); }
      }
    }
  }

  return { genererPlan: genererPlan };
})();
