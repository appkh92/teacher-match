/**
 * Teacher Match - Configuration centralisée.
 *
 * Toutes les valeurs sensibles viennent des variables d'environnement.
 * Le serveur ne s'arrête jamais à cause d'une variable manquante : il démarre,
 * répond à /health (pour que Railway valide le déploiement) et affiche une
 * page « configuration incomplète » tant que les variables obligatoires ne
 * sont pas renseignées. Rien n'est accessible sans configuration complète
 * (comportement « fermé par défaut »).
 */

'use strict';

const crypto = require('crypto');

function entier(valeur, defaut, min, max) {
  const n = Number.parseInt(valeur, 10);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, n));
}

const production =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT_ID);

const APP_PASSWORD = process.env.APP_PASSWORD || '';
let SESSION_SECRET = process.env.SESSION_SECRET || '';
let secretEphemere = false;

if (SESSION_SECRET.length < 32) {
  // Repli sûr : un secret aléatoire est généré au démarrage. Les sessions
  // seront simplement invalidées à chaque redémarrage du service.
  SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  secretEphemere = true;
}

/** Liste des problèmes bloquants (noms de variables uniquement, jamais de valeurs). */
function problemesConfiguration() {
  const problemes = [];
  if (!process.env.DATABASE_URL) {
    problemes.push('DATABASE_URL est absente : ajoutez la base PostgreSQL et la référence de variable.');
  }
  if (!APP_PASSWORD) {
    problemes.push("APP_PASSWORD est absente : définissez le mot de passe d'accès à l'application.");
  } else if (APP_PASSWORD.length < 12) {
    problemes.push('APP_PASSWORD est trop courte : 12 caractères minimum.');
  }
  return problemes;
}

module.exports = {
  production,
  PORT: entier(process.env.PORT, 3000, 1, 65535),
  APP_PASSWORD,
  SESSION_SECRET,
  secretEphemere,
  DUREE_SESSION_HEURES: entier(process.env.SESSION_HOURS, 12, 1, 168),
  MAX_FILE_SIZE_MB: entier(process.env.MAX_FILE_SIZE_MB, 10, 1, 25),
  NOMBRE_MAX_FICHIERS: 10,
  IMPORTS_SIMULTANES_MAX: 3,
  problemesConfiguration,
};
