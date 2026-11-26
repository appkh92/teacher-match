/**
 * Teacher Match - Serveur principal.
 *
 * Application web simple : Express sert les pages HTML/CSS/JavaScript, et
 * expose une petite API interne utilisée par ces pages.
 *
 * Aucun secret n'est écrit dans le code : les valeurs sensibles sont lues
 * dans les variables d'environnement (DATABASE_URL, ANTHROPIC_API_KEY...).
 */

'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const db = require('./db');
const routesSyllabi = require('./routes/syllabi');

const app = express();
const PORT = process.env.PORT || 3000;

// Derrière le proxy de Railway : nécessaire pour lire correctement l'IP client.
app.set('trust proxy', 1);

// --- En-têtes de sécurité (appliqués à toutes les réponses) ----------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

// --- Limitation du corps des requêtes JSON (hors fichiers) -----------------
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// --- Fichiers statiques (pages, styles, scripts) ---------------------------
app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'deny' }));

// --- API --------------------------------------------------------------------
app.use('/api', routesSyllabi);

// --- Pages ------------------------------------------------------------------
const dossierPublic = path.join(__dirname, '..', 'public');
app.get('/', (req, res) => res.sendFile(path.join(dossierPublic, 'index.html')));
app.get('/resultats', (req, res) => res.sendFile(path.join(dossierPublic, 'resultats.html')));
app.get('/historique', (req, res) => res.sendFile(path.join(dossierPublic, 'historique.html')));

/**
 * État de santé : utilisé par Railway et pour vérifier la base de données.
 * Ne révèle aucune donnée sensible, uniquement des états.
 */
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, base_donnees: 'connectee', cle_anthropic: process.env.ANTHROPIC_API_KEY ? 'presente' : 'absente' });
  } catch (e) {
    res.status(503).json({ ok: false, base_donnees: 'indisponible', erreur: e.message });
  }
});

// --- Erreurs de multer / erreurs non gérées --------------------------------
app.use((err, req, res, next) => {
  console.error('[Teacher Match] Erreur non gérée :', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({
    ok: false,
    erreur: "Une erreur interne est survenue. Aucune donnée n'a été enregistrée.",
  });
});

// --- Démarrage : on crée les tables si elles n'existent pas ----------------
async function demarrer() {
  try {
    const tables = await db.initSchema();
    console.log('[Teacher Match] Tables vérifiées :', tables.join(', '));
  } catch (e) {
    console.error('[Teacher Match] Création des tables impossible :', e.message);
    console.error('Vérifiez que DATABASE_URL est correcte et que la base PostgreSQL est accessible.');
  }

  app.listen(PORT, () => {
    console.log(`[Teacher Match] Serveur démarré sur le port ${PORT}`);
  });
}

demarrer();

module.exports = app;
