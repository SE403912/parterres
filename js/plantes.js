/**
 * =============================================================================
 *  plantes.js — LOGIQUE DES PLANTES, STOCK & FILTRE COULEUR
 * =============================================================================
 *
 *  RÔLE
 *  ----
 *  Centralise tout ce qui concerne la liste des plantes commandées :
 *    - lecture de la liste (chargée depuis Google Sheets via la synchro) ;
 *    - calcul du stock restant (commandé − posé) ;
 *    - extraction des couleurs disponibles pour le filtre d'exclusion ;
 *    - recalcul du nombre de plantes posées à partir des placements réels.
 *
 *  Le "stock posé" n'est PAS modifié à la main : il est recalculé à partir du
 *  nombre réel de placements enregistrés. C'est plus fiable (pas de dérive) et
 *  cela évite les conflits lors de la synchronisation hors-ligne.
 * =============================================================================
 */

window.App = window.App || {};

App.Plantes = (function () {

  /** Renvoie toute la liste des plantes commandées (depuis la base locale). */
  function liste() {
    return App.Storage.all('plantes');
  }

  /**
   * Nombre de plantes d'un type donné réellement posées (tous lieux confondus,
   * car le stock commandé est global). On compte les placements existants.
   * @param {string} planteId
   * @return {number}
   */
  function nbPose(planteId) {
    return App.Storage.all('placements')
      .filter(function (p) { return p.plante_id === planteId; }).length;
  }

  /**
   * Stock restant d'une plante = quantité commandée − quantité posée.
   * @param {Object} plante
   * @return {number}
   */
  function restant(plante) {
    var commande = parseInt(plante.stock_commande, 10) || 0;
    return commande - nbPose(plante.id);
  }

  /**
   * Liste des couleurs distinctes présentes dans les plantes commandées.
   * Sert à construire les cases à cocher du filtre d'exclusion.
   * @return {Array<string>}
   */
  function couleursDisponibles() {
    var vues = {};
    liste().forEach(function (p) {
      var c = (p.couleur || '').trim();
      if (c) vues[c.toLowerCase()] = c; // dédoublonne sans tenir compte de la casse
    });
    return Object.keys(vues).map(function (k) { return vues[k]; }).sort();
  }

  /**
   * Recalcule et persiste la colonne "stock_pose" d'une plante pour que le
   * Google Sheets reflète l'état réel. Appelé après chaque pose/suppression.
   * @param {string} planteId
   */
  function rafraichirStockPose(planteId) {
    var plante = App.Storage.find('plantes', planteId);
    if (!plante) return;
    var pose = nbPose(planteId);
    if (String(plante.stock_pose) !== String(pose)) {
      plante.stock_pose = pose;
      App.Storage.upsert('plantes', plante); // met à jour localement + file de synchro
    }
  }

  /**
   * Convertit un nom de couleur français courant en code couleur CSS pour
   * l'affichage du cercle. Toute autre valeur est renvoyée telle quelle
   * (on accepte donc aussi un code hexadécimal "#A1B2C3" saisi directement).
   * @param {string} nom
   * @return {string}
   */
  function couleurCss(nom) {
    var n = (nom || '').trim().toLowerCase();
    var table = {
      'rouge': '#D32F2F', 'jaune': '#F9C513', 'orange': '#F57C00',
      'bleu': '#1E88E5', 'violet': '#7B1FA2', 'mauve': '#9C6ADE',
      'rose': '#EC407A', 'blanc': '#FAFAFA', 'blanche': '#FAFAFA',
      'vert': '#388E3C', 'verte': '#388E3C', 'pourpre': '#880E4F',
      'bordeaux': '#6D1B2E', 'saumon': '#FF8A65', 'lavande': '#B39DDB',
      'fuchsia': '#D81B60', 'crème': '#F5EAD0', 'creme': '#F5EAD0'
    };
    if (table[n]) return table[n];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(nom)) return nom; // code hexa direct
    return '#999999'; // couleur inconnue : gris neutre
  }

  /**
   * Crée une nouvelle plante dans la base (et la file de synchro).
   * @param {{nom, couleur, diametre_adulte_cm, stock_commande}} infos
   * @return {Object}
   */
  function creer(infos) {
    return App.Storage.upsert('plantes', {
      nom: infos.nom,
      couleur: infos.couleur,
      diametre_adulte_cm: infos.diametre_adulte_cm,
      stock_commande: infos.stock_commande,
      stock_pose: 0
    });
  }

  return {
    liste: liste,
    nbPose: nbPose,
    restant: restant,
    couleursDisponibles: couleursDisponibles,
    rafraichirStockPose: rafraichirStockPose,
    couleurCss: couleurCss,
    creer: creer
  };
})();
