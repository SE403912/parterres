/**
 * =============================================================================
 *  sync.js — SYNCHRONISATION AVEC GOOGLE SHEETS
 * =============================================================================
 *
 *  STRATÉGIE OFFLINE-FIRST
 *  -----------------------
 *  - L'app fonctionne 100 % hors-ligne grâce à storage.js.
 *  - Ce module envoie la file d'opérations au backend Apps Script :
 *      * automatiquement quand le réseau revient (événement "online") ;
 *      * automatiquement à intervalle régulier ;
 *      * manuellement via le bouton "Synchroniser".
 *  - La communication passe par l'URL + le TOKEN saisis dans la configuration.
 * =============================================================================
 */

window.App = window.App || {};

App.Sync = (function () {
  var enCours = false; // évite deux synchros simultanées.

  /** Indique si l'appareil est actuellement en ligne. */
  function estEnLigne() {
    return navigator.onLine;
  }

  /**
   * Teste la connexion au backend (utilisé par l'écran Configuration).
   * @return {Promise<{ok:boolean, error?:string}>}
   */
  function tester() {
    var cfg = App.Config.get();
    if (!cfg.url || !cfg.token) {
      return Promise.resolve({ ok: false, error: 'Configuration incomplète.' });
    }
    var url = cfg.url + '?action=ping&token=' + encodeURIComponent(cfg.token);
    return fetch(url, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return data && data.ok
          ? { ok: true }
          : { ok: false, error: (data && data.error) || 'Réponse inattendue.' };
      })
      .catch(function (e) { return { ok: false, error: 'Réseau : ' + e.message }; });
  }

  /**
   * Récupère toutes les données du Sheet et remplace la base locale.
   * (Sert notamment à charger la liste des plantes commandées.)
   * @return {Promise<{ok:boolean, error?:string}>}
   */
  function tirerDepuisServeur() {
    var cfg = App.Config.get();
    if (!cfg.url || !cfg.token) {
      return Promise.resolve({ ok: false, error: 'Non configuré.' });
    }
    var url = cfg.url + '?action=read&token=' + encodeURIComponent(cfg.token);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          App.Storage.replaceFromServer(data.data || {});
          return { ok: true };
        }
        return { ok: false, error: (data && data.error) || 'Lecture échouée.' };
      })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }

  /**
   * Envoie la file d'opérations locale au serveur.
   * En cas de succès, vide la file locale.
   * @return {Promise<{ok:boolean, applied?:number, error?:string}>}
   */
  function pousserVersServeur() {
    var cfg = App.Config.get();
    var queue = App.Storage.getQueue();

    // Rien à envoyer : succès immédiat.
    if (queue.length === 0) return Promise.resolve({ ok: true, applied: 0 });
    if (!cfg.url || !cfg.token) {
      return Promise.resolve({ ok: false, error: 'Non configuré.' });
    }

    return fetch(cfg.url, {
      method: 'POST',
      // text/plain évite une requête CORS "preflight" qui ferait échouer Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token, action: 'sync', payload: queue })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          App.Storage.clearQueue(); // synchro réussie => on vide la file.
          return { ok: true, applied: (data.result && data.result.applied) || queue.length };
        }
        return { ok: false, error: (data && data.error) || 'Synchro échouée.' };
      })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }

  /**
   * Synchronisation complète : on pousse les modifications locales,
   * puis on retire la dernière version du serveur.
   * @param {boolean} silencieux - si true, ne déclenche pas d'alerte UI.
   * @return {Promise<Object>}
   */
  function synchroniser(silencieux) {
    if (App.Config.estLocal()) return Promise.resolve({ ok: true }); // mode local : rien à synchroniser
    if (enCours) return Promise.resolve({ ok: false, error: 'Déjà en cours.' });
    if (!estEnLigne()) return Promise.resolve({ ok: false, error: 'Hors-ligne.' });

    enCours = true;
    majIndicateur('sync'); // met l'icône en mode "synchronisation".

    return pousserVersServeur()
      .then(function (res) {
        if (!res.ok) throw new Error(res.error);
        return tirerDepuisServeur();
      })
      .then(function (res) {
        majIndicateur(estEnLigne() ? 'online' : 'offline');
        if (!silencieux && typeof App.UI !== 'undefined') App.UI.rafraichir();
        return { ok: true };
      })
      .catch(function (e) {
        majIndicateur('error');
        return { ok: false, error: e.message };
      })
      .finally(function () { enCours = false; });
  }

  /** Met à jour l'indicateur visuel d'état (pastille en haut de l'écran). */
  function majIndicateur(etat) {
    var el = document.getElementById('statut-reseau');
    if (!el) return;
    var libelles = {
      online: '● En ligne', offline: '● Hors-ligne',
      sync: '● Synchronisation…', error: '● Erreur synchro'
    };
    el.textContent = libelles[etat] || '';
    el.className = 'statut statut--' + etat;
  }

  /**
   * Démarre la surveillance réseau et la synchro périodique.
   * Appelé une fois au lancement de l'application.
   */
  function demarrer() {
    // Mode local : aucune synchronisation, indicateur dédié.
    if (App.Config.estLocal()) {
      var el = document.getElementById('statut-reseau');
      if (el) { el.textContent = '● Local'; el.className = 'statut statut--offline'; }
      return;
    }

    // Quand le réseau revient, on synchronise automatiquement.
    window.addEventListener('online', function () {
      majIndicateur('online');
      synchroniser(true);
    });
    window.addEventListener('offline', function () { majIndicateur('offline'); });

    // Synchro automatique toutes les 60 secondes si en ligne.
    setInterval(function () {
      if (estEnLigne() && App.Storage.getQueue().length > 0) synchroniser(true);
    }, 60000);

    // État initial.
    majIndicateur(estEnLigne() ? 'online' : 'offline');
  }

  return {
    estEnLigne: estEnLigne,
    tester: tester,
    synchroniser: synchroniser,
    tirerDepuisServeur: tirerDepuisServeur,
    demarrer: demarrer
  };
})();
