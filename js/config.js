/**
 * =============================================================================
 *  config.js — GESTION DE LA CONFIGURATION (SÉCURITÉ)
 * =============================================================================
 *
 *  PRINCIPE DE SÉCURITÉ
 *  --------------------
 *  Aucune URL privée ni aucun jeton n'est écrit en dur dans ce fichier.
 *  L'utilisateur saisit, UNE SEULE FOIS sur son téléphone :
 *    - l'URL de la Web App Google Apps Script ;
 *    - le jeton secret (TOKEN).
 *  Ces deux informations sont stockées dans le localStorage du navigateur,
 *  qui est PROPRE À L'APPAREIL et n'est jamais envoyé sur GitHub.
 *
 *  => Le dépôt GitHub ne contient donc aucun secret. Pour changer de projet,
 *     il suffit de saisir une nouvelle URL/token dans l'écran Configuration.
 * =============================================================================
 */

// Espace de noms global de l'application (évite de polluer "window").
window.App = window.App || {};

App.Config = (function () {
  // Clé sous laquelle la configuration est rangée dans le localStorage.
  var STORAGE_KEY = 'parterres.config.v1';

  /**
   * Récupère la configuration enregistrée (ou des valeurs vides par défaut).
   * @return {{url:string, token:string, projet:string}}
   */
  function get() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { url: '', token: '', projet: '' };
      return JSON.parse(raw);
    } catch (e) {
      // En cas de données corrompues, on repart sur une config vide.
      return { url: '', token: '', projet: '' };
    }
  }

  /**
   * Enregistre la configuration après validation basique.
   * @param {{url:string, token:string, projet:string}} cfg
   * @return {{ok:boolean, error?:string}}
   */
  function save(cfg) {
    // Validation : l'URL doit ressembler à une Web App Apps Script.
    if (!cfg.url || !/^https:\/\/script\.google\.com\/.+/.test(cfg.url.trim())) {
      return { ok: false, error: 'URL Apps Script invalide (doit commencer par https://script.google.com/).' };
    }
    if (!cfg.token || cfg.token.trim().length < 8) {
      return { ok: false, error: 'Le jeton doit faire au moins 8 caractères.' };
    }

    var clean = {
      url: cfg.url.trim(),
      token: cfg.token.trim(),
      projet: (cfg.projet || '').trim() || 'Projet sans nom'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return { ok: true };
  }

  /**
   * Indique si l'application est configurée (prête à être utilisée).
   * Vrai si le mode local est actif OU si une URL + un jeton sont renseignés.
   * @return {boolean}
   */
  function isConfigured() {
    var c = get();
    return c.mode === 'local' || Boolean(c.url && c.token);
  }

  /** Vrai si l'application tourne en mode local (aucune synchronisation). */
  function estLocal() {
    return get().mode === 'local';
  }

  /**
   * Active le mode local : l'application fonctionne entièrement sur l'appareil,
   * sans Google Sheets. Idéal pour tester sur PC ou travailler 100 % hors-ligne.
   * @param {string} projet - nom du projet (facultatif)
   */
  function activerModeLocal(projet) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'local', url: '', token: '',
      projet: (projet || '').trim() || 'Projet local'
    }));
  }

  /**
   * Réinitialise TOUT (configuration + données locales).
   * Utilisé pour repartir sur un projet vierge. Action irréversible localement.
   */
  function resetAll() {
    // On vide toutes les clés liées à l'application.
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf('parterres.') === 0; })
      .forEach(function (k) { localStorage.removeItem(k); });
  }

  // API publique du module.
  return {
    get: get,
    save: save,
    isConfigured: isConfigured,
    estLocal: estLocal,
    activerModeLocal: activerModeLocal,
    resetAll: resetAll
  };
})();
