/**
 * Teacher Match - Accès à la base PostgreSQL.
 *
 * La chaîne de connexion est lue dans DATABASE_URL (fournie par Railway via
 * une référence de variable). Le module ne fait JAMAIS s'arrêter le serveur :
 * si la base est absente ou pas encore prête, les routes concernées répondent
 * « base indisponible » et la création des tables est retentée en tâche de fond.
 */

'use strict';

const { Pool } = require('pg');
const { optionsSsl } = require('./ssl');

let pool = null;
let schemaPret = false;

function obtenirPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  pool = new Pool({
    connectionString: url,
    ssl: optionsSsl(url),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 35000,
  });
  pool.on('error', (err) => {
    console.error('[Teacher Match] Erreur inattendue du pool PostgreSQL :', err.message);
  });
  return pool;
}

class BaseIndisponible extends Error {
  constructor() {
    super('Base de données non configurée.');
    this.code = 'BASE_INDISPONIBLE';
  }
}

/** Requête paramétrée ($1, $2...) : jamais de concaténation de valeurs. */
async function query(text, params) {
  const p = obtenirPool();
  if (!p) throw new BaseIndisponible();
  return p.query(text, params);
}

/** Connexion dédiée (transactions). Toujours appeler client.release(). */
async function connecter() {
  const p = obtenirPool();
  if (!p) throw new BaseIndisponible();
  return p.connect();
}

/** Crée les tables si elles n'existent pas. Aucune donnée n'est supprimée. */
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS syllabi (
      id              SERIAL PRIMARY KEY,
      nom_original    TEXT NOT NULL,
      nom_stocke      TEXT NOT NULL,
      type_mime       TEXT NOT NULL,
      taille_octets   INTEGER NOT NULL,
      contenu         BYTEA NOT NULL,
      statut          TEXT NOT NULL DEFAULT 'importe',
      date_import     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS syllabi_date_import_idx ON syllabi (date_import DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS demandes (
      id                SERIAL PRIMARY KEY,
      libelle           TEXT NOT NULL,
      nombre_syllabi    INTEGER NOT NULL DEFAULT 0,
      date_demande      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS demande_syllabi (
      demande_id      INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
      syllabus_id     INTEGER NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
      PRIMARY KEY (demande_id, syllabus_id)
    );
  `);

  // Prévue pour les étapes suivantes (analyse IA, profil, classement).
  await query(`
    CREATE TABLE IF NOT EXISTS resultats (
      id                    SERIAL PRIMARY KEY,
      syllabus_id           INTEGER NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
      analyse_syllabus      TEXT,
      competences_visees    JSONB,
      profil_enseignant     JSONB,
      criteres_matching     JSONB,
      classement            JSONB,
      sources               JSONB,
      date_generation       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name;
  `);
  schemaPret = true;
  return rows.map((r) => r.table_name);
}

/** Tente la création des tables, puis réessaie toutes les 15 s en cas d'échec. */
function initSchemaAvecReprise() {
  if (!process.env.DATABASE_URL) {
    console.warn('[Teacher Match] DATABASE_URL absente : la base ne sera pas initialisée.');
    return;
  }
  initSchema()
    .then((tables) => console.log('[Teacher Match] Tables vérifiées :', tables.join(', ')))
    .catch((e) => {
      console.error('[Teacher Match] Base pas encore accessible (' + e.message + '). Nouvel essai dans 15 s.');
      setTimeout(initSchemaAvecReprise, 15000).unref();
    });
}

async function etat() {
  if (!process.env.DATABASE_URL) return 'non_configuree';
  try {
    await query('SELECT 1');
    return schemaPret ? 'connectee' : 'connectee_initialisation';
  } catch (e) {
    return 'indisponible';
  }
}

async function fermer() {
  if (pool) await pool.end().catch(() => {});
}

module.exports = { query, connecter, initSchema, initSchemaAvecReprise, etat, fermer, optionsSsl };
