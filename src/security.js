/**
 * Teacher Match - Protections HTTP transversales.
 *
 * - En-têtes de sécurité (CSP stricte, HSTS, anti-cadre, etc.)
 * - Limitation de débit en mémoire (pas de dépendance externe)
 * - Vérification de l'origine des requêtes qui modifient des données (CSRF)
 */

'use strict';

const config = require('./config');

/** En-têtes appliqués à toutes les réponses. */
function enTetesSecurite(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  if (config.production) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * Limiteur de débit à fenêtre fixe, par adresse IP et par usage.
 * Suffisant pour une instance unique (cas de Railway par défaut).
 */
function limiteur({ nom, fenetreMs, max, message }) {
  const compteurs = new Map();

  const nettoyage = setInterval(() => {
    const maintenant = Date.now();
    for (const [cle, entree] of compteurs) {
      if (entree.fin <= maintenant) compteurs.delete(cle);
    }
  }, Math.min(fenetreMs, 60 * 1000));
  nettoyage.unref();

  return function limiter(req, res, next) {
    const cle = `${nom}:${req.ip || 'inconnue'}`;
    const maintenant = Date.now();
    let entree = compteurs.get(cle);
    if (!entree || entree.fin <= maintenant) {
      entree = { nombre: 0, fin: maintenant + fenetreMs };
      compteurs.set(cle, entree);
    }
    entree.nombre += 1;

    if (entree.nombre > max) {
      const attente = Math.ceil((entree.fin - maintenant) / 1000);
      res.setHeader('Retry-After', String(attente));
      if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
        return res.status(429).json({ ok: false, erreur: message });
      }
      return res.status(429).type('text/plain; charset=utf-8').send(message);
    }
    return next();
  };
}

/**
 * Refuse les requêtes POST/PUT/PATCH/DELETE venant d'un autre site.
 * Complète le cookie SameSite=Strict.
 */
function verifierOrigine(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const hotes = [req.get('host'), req.get('x-forwarded-host')]
    .filter(Boolean)
    .map((h) => String(h).split(',')[0].trim().toLowerCase());
  const source = req.get('origin') || req.get('referer');
  let valide = false;

  if (source && hotes.length) {
    try {
      valide = hotes.includes(new URL(source).host.toLowerCase());
    } catch (e) {
      valide = false;
    }
  }

  if (!valide) {
    if (req.originalUrl.startsWith('/api')) {
      return res.status(403).json({ ok: false, erreur: 'Requête refusée (origine non reconnue).' });
    }
    return res.status(403).type('text/plain; charset=utf-8').send('Requête refusée (origine non reconnue).');
  }
  return next();
}

/** Les réponses de l'API ne doivent jamais être mises en cache. */
function pasDeCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

module.exports = { enTetesSecurite, limiteur, verifierOrigine, pasDeCache };
