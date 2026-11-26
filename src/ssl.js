/**
 * Teacher Match - Choix du chiffrement TLS de la connexion PostgreSQL.
 */

'use strict';

/**
 * Choix du chiffrement de la connexion :
 * - DATABASE_SSL=disable  : pas de TLS ;
 * - DATABASE_SSL=verify   : TLS avec vérification complète du certificat ;
 * - DATABASE_SSL=require  : TLS sans vérification de la chaîne (certificat auto-signé) ;
 * - sinon (automatique)   : pas de TLS sur le réseau privé Railway
 *   (*.railway.internal) et en local, TLS sans vérification ailleurs
 *   (proxy public Railway, certificat auto-signé).
 */
function optionsSsl(url) {
  const mode = String(process.env.DATABASE_SSL || '').toLowerCase();
  if (mode === 'disable' || mode === 'false') return false;
  if (mode === 'verify') return { rejectUnauthorized: true };
  if (mode === 'require' || mode === 'true') return { rejectUnauthorized: false };

  let hote = '';
  try {
    hote = new URL(url).hostname;
  } catch (e) {
    hote = '';
  }
  if (/sslmode=disable/i.test(url)) return false;
  if (hote === 'localhost' || hote === '127.0.0.1' || hote === '::1' || hote.endsWith('.railway.internal')) {
    return false;
  }
  return { rejectUnauthorized: false };
}

module.exports = { optionsSsl };
