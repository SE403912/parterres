/**
 * =============================================================================
 *  kml.js — IMPORT DE RELEVÉS GOOGLE EARTH (FICHIERS .KML)
 * =============================================================================
 *
 *  OBJECTIF
 *  --------
 *  Lire un fichier KML exporté de Google Earth (contours de jardinières/massifs
 *  tracés à la main sur l'imagerie satellite) et convertir chaque polygone en
 *  une "forme" exploitable par l'application :
 *    - géométrie en pixels (à une échelle calculée automatiquement) ;
 *    - surface réelle en m² (calcul géodésique local) ;
 *    - coordonnées GPS du centre du polygone.
 *
 *  Les coordonnées KML sont au format "longitude,latitude,altitude" (WGS84).
 *  Pour de petites surfaces (jardinières, parterres), une projection
 *  équirectangulaire locale autour du centroïde donne une précision largement
 *  suffisante (erreur négligeable sur quelques dizaines de mètres).
 * =============================================================================
 */

window.App = window.App || {};

App.KML = (function () {

  /* ----------------------------- Petits outils --------------------------- */

  function moyenne(arr, champ) {
    return arr.reduce(function (s, p) { return s + p[champ]; }, 0) / arr.length;
  }

  /** Surface (m²) d'un polygone donné en coordonnées planes (formule du lacet). */
  function aire(xy) {
    var a2 = 0;
    for (var i = 0; i < xy.length; i++) {
      var p1 = xy[i], p2 = xy[(i + 1) % xy.length];
      a2 += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(a2) / 2;
  }

  /* ------------------------------- Parsing ------------------------------- */

  /**
   * Analyse le texte d'un fichier KML et renvoie la liste des polygones trouvés.
   * @param {string} texte - contenu du fichier .kml
   * @return {Array<{nom:string, coords:Array<{lon,lat}>}>}
   */
  function parser(texte) {
    // DOMParser est disponible dans tous les navigateurs : parsing XML fiable.
    var doc = new DOMParser().parseFromString(texte, 'application/xml');

    // Détecte une erreur de parsing XML.
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Fichier KML illisible (XML invalide).');
    }

    var placemarks = doc.getElementsByTagName('Placemark');
    var resultats = [];

    for (var i = 0; i < placemarks.length; i++) {
      var pm = placemarks[i];

      // Nom du repère (ex : "Jardinière 3").
      var nomEl = pm.getElementsByTagName('name')[0];
      var nom = (nomEl && nomEl.textContent ? nomEl.textContent : 'Forme ' + (i + 1)).trim();

      // On ne traite que les Placemarks contenant un polygone.
      if (!pm.getElementsByTagName('Polygon').length) continue;

      var coordsEl = pm.getElementsByTagName('coordinates')[0];
      if (!coordsEl) continue;

      var pts = parseCoords(coordsEl.textContent);
      if (pts.length < 3) continue; // pas assez de points pour une surface

      resultats.push({ nom: nom, coords: pts });
    }
    return resultats;
  }

  /** Transforme le bloc texte de coordonnées KML en liste de {lon, lat}. */
  function parseCoords(txt) {
    return txt.trim().split(/\s+/)
      .map(function (c) {
        var a = c.split(',');
        return { lon: parseFloat(a[0]), lat: parseFloat(a[1]) };
      })
      .filter(function (p) { return isFinite(p.lon) && isFinite(p.lat); });
  }

  /* --------------------- Conversion géo → forme canvas ------------------- */

  /**
   * Convertit un polygone géographique en forme exploitable par l'app.
   * @param {Array<{lon,lat}>} coords
   * @param {Object} options - { ciblePx } taille visée en pixels (défaut 300)
   * @return {{points, surface_m2, echelle_px_par_m, latitude, longitude}}
   */
  function versForme(coords, options) {
    options = options || {};
    var ciblePx = options.ciblePx || 300;

    // Centre géographique = origine de la projection locale.
    var lat0 = moyenne(coords, 'lat');
    var lon0 = moyenne(coords, 'lon');

    // Conversion degrés → mètres (équirectangulaire autour du centroïde).
    var mParDegLat = 111320;
    var mParDegLon = 111320 * Math.cos(lat0 * Math.PI / 180);

    // Coordonnées en mètres locaux (y vers le bas = vers le sud, comme le canvas).
    var xy = coords.map(function (p) {
      return { x: (p.lon - lon0) * mParDegLon, y: (lat0 - p.lat) * mParDegLat };
    });

    // Surface réelle en m² (avant toute mise à l'échelle écran).
    var surface = aire(xy);

    // Boîte englobante en mètres.
    var minX = Math.min.apply(null, xy.map(function (p) { return p.x; }));
    var maxX = Math.max.apply(null, xy.map(function (p) { return p.x; }));
    var minY = Math.min.apply(null, xy.map(function (p) { return p.y; }));
    var maxY = Math.max.apply(null, xy.map(function (p) { return p.y; }));
    var largeurM = Math.max(maxX - minX, 0.5);
    var hauteurM = Math.max(maxY - minY, 0.5);

    // Échelle automatique : la plus grande dimension occupe ~ciblePx pixels.
    var ppm = Math.max(5, Math.round(ciblePx / Math.max(largeurM, hauteurM)));

    // Projection en pixels avec une marge de 20 px.
    var marge = 20;
    var points = xy.map(function (p) {
      return {
        x: Math.round(((p.x - minX) * ppm + marge) * 10) / 10,
        y: Math.round(((p.y - minY) * ppm + marge) * 10) / 10
      };
    });

    // KML referme le polygone (dernier point = premier) : on retire le doublon.
    if (points.length > 1) {
      var a = points[0], b = points[points.length - 1];
      if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) points.pop();
    }

    return {
      points: points,
      surface_m2: Math.round(surface * 100) / 100,
      echelle_px_par_m: ppm,
      latitude: lat0.toFixed(6),
      longitude: lon0.toFixed(6)
    };
  }

  return { parser: parser, versForme: versForme };
})();
