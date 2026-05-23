/**
 * =============================================================================
 *  storage.js — BASE DE DONNÉES LOCALE (OFFLINE-FIRST)
 * =============================================================================
 *
 *  RÔLE
 *  ----
 *  Toute l'application écrit d'abord en LOCAL (localStorage), instantanément,
 *  même sans réseau. Chaque modification est aussi empilée dans une "file de
 *  synchronisation" (sync queue) qui sera envoyée à Google Sheets dès qu'une
 *  connexion est disponible (voir sync.js).
 *
 *  MODÈLE DE DONNÉES (miroir local du Google Sheets)
 *  -------------------------------------------------
 *    sessions   : situations de relevés
 *    lieux      : parterres rattachés à une session
 *    formes     : massifs dessinés (géométrie + surface)
 *    plantes    : stock des plantes commandées
 *    placements : végétaux posés sur un massif
 * =============================================================================
 */

window.App = window.App || {};

App.Storage = (function () {
  var DB_KEY = 'parterres.db.v1';      // les données métier
  var QUEUE_KEY = 'parterres.queue.v1'; // les opérations en attente de synchro

  // Les tables gérées (mêmes noms que côté backend).
  var TABLES = ['sessions', 'lieux', 'formes', 'existants', 'plantes', 'placements'];

  /* ------------------------- Lecture / écriture brute --------------------- */

  /** Charge la base locale complète (toutes les tables). */
  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* données corrompues : on réinitialise proprement */ }

    // Base vierge : un tableau vide par table.
    var empty = {};
    TABLES.forEach(function (t) { empty[t] = []; });
    return empty;
  }

  /** Sauvegarde la base locale complète. */
  function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  /* ------------------------- File de synchronisation ---------------------- */

  /** Récupère la liste des opérations en attente. */
  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) { return []; }
  }

  /** Sauvegarde la file d'opérations. */
  function setQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  /** Ajoute une opération (upsert/delete) à la file de synchro. */
  function enqueue(op) {
    var q = getQueue();
    q.push(op);
    setQueue(q);
  }

  /** Vide complètement la file (après une synchro réussie). */
  function clearQueue() {
    setQueue([]);
  }

  /* ------------------------- Identifiants uniques ------------------------- */

  /**
   * Génère un identifiant unique côté client.
   * Indispensable en mode hors-ligne : l'app crée elle-même les "id" pour que
   * le serveur sache reconnaître chaque enregistrement (upsert sans doublon).
   */
  function uid(prefix) {
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + rand;
  }

  /* ------------------------- Opérations métier (CRUD) --------------------- */

  /**
   * Insère ou met à jour un enregistrement dans une table locale,
   * puis empile l'opération pour la synchro distante.
   * @param {string} table
   * @param {Object} record - doit contenir (ou recevra) un champ "id".
   * @return {Object} l'enregistrement enregistré.
   */
  function upsert(table, record) {
    var db = loadDB();
    if (!db[table]) db[table] = [];

    // Si pas d'id, on en crée un (cas d'une création).
    if (!record.id) record.id = uid(table);

    // Cherche un enregistrement existant.
    var idx = db[table].findIndex(function (r) { return r.id === record.id; });
    if (idx >= 0) {
      db[table][idx] = record; // mise à jour
    } else {
      db[table].push(record);  // création
    }

    saveDB(db);
    enqueue({ type: 'upsert', table: table, record: record });
    return record;
  }

  /**
   * Supprime un enregistrement local et empile l'opération distante.
   * @param {string} table
   * @param {string} id
   */
  function remove(table, id) {
    var db = loadDB();
    if (db[table]) {
      db[table] = db[table].filter(function (r) { return r.id !== id; });
      saveDB(db);
    }
    enqueue({ type: 'delete', table: table, record: { id: id } });
  }

  /** Renvoie tous les enregistrements d'une table. */
  function all(table) {
    return loadDB()[table] || [];
  }

  /** Renvoie les enregistrements filtrés par un champ = valeur. */
  function where(table, field, value) {
    return all(table).filter(function (r) { return r[field] === value; });
  }

  /** Renvoie un enregistrement par son id (ou null). */
  function find(table, id) {
    return all(table).find(function (r) { return r.id === id; }) || null;
  }

  /**
   * Remplace entièrement la base locale par les données venues du serveur.
   * Appelé après une lecture distante réussie (fusion simple : le serveur fait foi
   * pour les tables, mais on conserve la file locale non encore synchronisée).
   */
  function replaceFromServer(serverData) {
    var db = loadDB();
    TABLES.forEach(function (t) {
      if (serverData[t]) db[t] = serverData[t];
    });
    saveDB(db);
  }

  // API publique.
  return {
    TABLES: TABLES,
    uid: uid,
    upsert: upsert,
    remove: remove,
    all: all,
    where: where,
    find: find,
    getQueue: getQueue,
    clearQueue: clearQueue,
    replaceFromServer: replaceFromServer
  };
})();
