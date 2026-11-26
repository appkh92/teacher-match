/**
 * Teacher Match - Serveur principal.
 *
 * Ordre des protections :
 *   1. en-têtes de sécurité sur toutes les réponses ;
 *   2. /health public (liveness Railway, aucune donnée sensible) ;
 *   3. page « configuration incomplète » si une variable obligatoire manque ;
 *   4. page de connexion et ses deux ressources publiques ;
 *   5. tout le reste (pages, scripts, API) exige une session valide.
 */

'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const { enTetesSecurite, limiteur, verifierOrigine, pasDeCache } = require('./security');
const routesSyllabi = require('./routes/syllabi');

const app = express();
const dossierPublic = path.join(__dirname, '..', 'public');
const page = (nom) => path.join(dossierPublic, nom);

app.disable('x-powered-by');
app.set('trust proxy', 1); // un seul proxy devant l'application (Railway)

app.use(enTetesSecurite);

// --- 2. État de santé (public) -----------------------------------------------
app.get('/health', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const base = await db.etat();
  // Toujours 200 : le processus est vivant. L'état de la base est indicatif.
  res.json({ ok: true, base_donnees: base, configuration: config.problemesConfiguration().length ? 'incomplete' : 'complete' });
});

// --- 3. Configuration incomplète : rien n'est servi -----------------------
app.use((req, res, next) => {
  const problemes = config.problemesConfiguration();
  if (problemes.length === 0) return next();
  if (req.path === '/styles.css') return next();
  res.status(503);
  if (req.originalUrl.startsWith('/api')) {
    return res.json({ ok: false, erreur: 'Configuration du serveur incomplète.' });
  }
  return res.sendFile(page('configuration.html'));
});

// --- 4. Ressources publiques et connexion ------------------------------------
const statiquePublic = { dotfiles: 'deny', index: false, maxAge: '1h' };
app.get('/styles.css', (req, res) => res.sendFile(page('styles.css'), statiquePublic));
app.get('/connexion.js', (req, res) => res.sendFile(page('connexion.js'), statiquePublic));

app.get('/connexion', (req, res) => {
  if (auth.estConnecte(req)) return res.redirect(303, '/');
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(page('connexion.html'));
});

const limiteConnexion = limiteur({
  nom: 'connexion',
  fenetreMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
});

app.post(
  '/connexion',
  limiteConnexion,
  verifierOrigine,
  express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 5 }),
  auth.connexion
);
app.post('/deconnexion', verifierOrigine, auth.deconnexion);

// --- 5. Tout ce qui suit exige une session ---------------------------------
app.use(auth.exigerConnexion);

app.get('/', (req, res) => res.sendFile(page('index.html')));
app.get('/resultats', (req, res) => res.sendFile(page('resultats.html')));
app.get('/historique', (req, res) => res.sendFile(page('historique.html')));

app.use(express.static(dossierPublic, { dotfiles: 'deny', index: false, maxAge: 0 }));

const limiteApi = limiteur({
  nom: 'api',
  fenetreMs: 15 * 60 * 1000,
  max: 600,
  message: 'Trop de requêtes. Patientez quelques minutes.',
});
const limiteImport = limiteur({
  nom: 'import',
  fenetreMs: 60 * 60 * 1000,
  max: 60,
  message: "Trop d'imports sur la dernière heure. Réessayez plus tard.",
});

app.use('/api', pasDeCache, limiteApi, verifierOrigine);
app.post('/api/syllabi', limiteImport);
app.use('/api', express.json({ limit: '50kb' }), routesSyllabi);

// --- Introuvable --------------------------------------------------------
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ ok: false, erreur: 'Ressource introuvable.' });
  }
  return res.status(404).type('text/plain; charset=utf-8').send('Page introuvable.');
});

// --- Erreurs non gérées (jamais de détail technique côté navigateur) -----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Teacher Match] Erreur non gérée :', err && err.message);
  if (res.headersSent) return undefined;
  const statut = err && (err.type === 'entity.too.large' || err.status === 413) ? 413 : err && err.status === 400 ? 400 : 500;
  const message = statut === 413 ? 'Requête trop volumineuse.' : statut === 400 ? 'Requête invalide.' : 'Une erreur interne est survenue.';
  if (req.originalUrl.startsWith('/api')) return res.status(statut).json({ ok: false, erreur: message });
  return res.status(statut).type('text/plain; charset=utf-8').send(message);
});

// --- Robustesse du processus --------------------------------------------
process.on('unhandledRejection', (raison) => {
  console.error('[Teacher Match] Promesse rejetée non gérée :', raison && raison.message ? raison.message : raison);
});

function demarrer() {
  const problemes = config.problemesConfiguration();
  if (problemes.length) {
    console.warn('[Teacher Match] Configuration incomplète :\n - ' + problemes.join('\n - '));
  }
  if (config.secretEphemere) {
    console.warn('[Teacher Match] SESSION_SECRET absente ou trop courte : secret temporaire généré (sessions perdues au redémarrage).');
  }

  db.initSchemaAvecReprise();

  const serveur = app.listen(config.PORT, () => {
    console.log(`[Teacher Match] Serveur démarré sur le port ${config.PORT}`);
  });
  serveur.headersTimeout = 65000;
  serveur.requestTimeout = 120000;

  const arreter = (signal) => {
    console.log(`[Teacher Match] ${signal} reçu : arrêt propre.`);
    serveur.close(() => db.fermer().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => arreter('SIGTERM'));
  process.on('SIGINT', () => arreter('SIGINT'));
}

if (require.main === module) demarrer();

module.exports = app;
