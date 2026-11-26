/**
 * Teacher Match - Authentification par mot de passe partagé.
 *
 * Les syllabi (et plus tard les CV) contiennent des données personnelles :
 * aucune page ni aucune route de l'API n'est accessible sans connexion.
 *
 * - Le mot de passe est lu dans APP_PASSWORD, comparé en temps constant.
 * - La session est un cookie signé HMAC-SHA256 (HttpOnly, SameSite=Strict,
 *   Secure en production), avec une date d'expiration.
 * - La clé de signature dérive de SESSION_SECRET ET du mot de passe : changer
 *   APP_PASSWORD sur Railway déconnecte immédiatement toutes les sessions.
 */

'use strict';

const crypto = require('crypto');
const config = require('./config');

const NOM_COOKIE = 'tm_session';

const cleSignature = crypto
  .createHmac('sha256', config.SESSION_SECRET)
  .update('teacher-match-session:' + config.APP_PASSWORD)
  .digest();

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function signer(donnees) {
  return base64url(crypto.createHmac('sha256', cleSignature).update(donnees).digest());
}

function egaliteTempsConstant(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function creerJeton() {
  const charge = base64url(
    JSON.stringify({
      exp: Date.now() + config.DUREE_SESSION_HEURES * 3600 * 1000,
      n: crypto.randomBytes(12).toString('hex'),
    })
  );
  return `${charge}.${signer(charge)}`;
}

function jetonValide(jeton) {
  if (typeof jeton !== 'string' || jeton.length > 512) return false;
  const [charge, signature] = jeton.split('.');
  if (!charge || !signature) return false;
  if (!egaliteTempsConstant(signer(charge), signature)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'));
    return Number.isFinite(exp) && exp > Date.now();
  } catch (e) {
    return false;
  }
}

/** Lecture minimale des cookies (évite une dépendance). */
function lireCookie(req, nom) {
  const entete = req.headers.cookie;
  if (!entete) return null;
  for (const morceau of entete.split(';')) {
    const i = morceau.indexOf('=');
    if (i === -1) continue;
    if (morceau.slice(0, i).trim() === nom) {
      try {
        return decodeURIComponent(morceau.slice(i + 1).trim());
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function optionsCookie(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production || req.secure,
    path: '/',
  };
}

function estConnecte(req) {
  return jetonValide(lireCookie(req, NOM_COOKIE));
}

/** Middleware : bloque tout accès non authentifié. */
function exigerConnexion(req, res, next) {
  if (estConnecte(req)) return next();
  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ ok: false, erreur: 'Session expirée ou absente. Reconnectez-vous.', connexion: true });
  }
  return res.redirect(303, '/connexion');
}

/** POST /connexion */
function connexion(req, res) {
  const motDePasse = req.body && typeof req.body.mot_de_passe === 'string' ? req.body.mot_de_passe : '';
  if (motDePasse.length === 0 || motDePasse.length > 256 || !egaliteTempsConstant(motDePasse, config.APP_PASSWORD)) {
    return res.redirect(303, '/connexion?erreur=1');
  }
  res.cookie(NOM_COOKIE, creerJeton(), {
    ...optionsCookie(req),
    maxAge: config.DUREE_SESSION_HEURES * 3600 * 1000,
  });
  return res.redirect(303, '/');
}

/** POST /deconnexion */
function deconnexion(req, res) {
  res.clearCookie(NOM_COOKIE, optionsCookie(req));
  return res.redirect(303, '/connexion?deconnecte=1');
}

module.exports = { exigerConnexion, connexion, deconnexion, estConnecte, jetonValide, creerJeton };
