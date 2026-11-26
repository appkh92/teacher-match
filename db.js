/**
 * Teacher Match - Accès à la base PostgreSQL.
 *
 * La chaîne de connexion est lue dans la variable d'environnement DATABASE_URL
 * (fournie automatiquement par Railway lorsque le plugin PostgreSQL est ajouté).
 * Aucun identifiant n'est écrit dans le code.
 */

'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error(
    "[Teacher Match] La variable d'environnement DATABASE_URL est absente.\n" +
      'Ajoutez le plugin PostgreSQL sur Railway (ou renseignez DATABASE_URL en local).'
  );
  process.exit(1);
}

// Railway et la plupart des hébergeurs exigent une connexion TLS, mais
// présentent un certificat qui n'est pas dans le magasin local : on accepte
// donc le certificat sans vérifier la chaîne, ce qui reste chiffré.
const useSsl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
  ? false
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[Teacher Match] Erreur inattendue du pool PostgreSQL :', err.message);
});

/**
 * Exécute une requête SQL paramétrée.
 * @param {string} text  Requête SQL avec des marqueurs $1, $2, ...
 * @param {Array}  params Valeurs à injecter (jamais de concaténation de chaînes)
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Crée les tables nécessaires au démarrage si elles n'existent pas encore.
 * Aucune donnée existante n'est supprimée.
 */
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

  await query(`
    CREATE TABLE IF NOT EXISTS demandes (
      id                SERIAL PRIMARY KEY,
      libelle           TEXT NOT NULL,
      nombre_syllabi    INTEGER NOT NULL DEFAULT 0,
      date_demande      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Lien entre une demande (une soumission) et les syllabi qu'elle contient.
  await query(`
    CREATE TABLE IF NOT EXISTS demande_syllabi (
      demande_id      INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
      syllabus_id     INTEGER NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
      PRIMARY KEY (demande_id, syllabus_id)
    );
  `);

  // Table prévue pour le retour généré par l'IA (analyse, profil recherché,
  // classement). Elle est créée maintenant mais reste vide : l'analyse sera
  // développée dans une prochaine étape, à votre validation.
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
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  return rows.map((r) => r.table_name);
}

module.exports = { pool, query, initSchema };
