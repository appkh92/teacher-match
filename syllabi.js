/**
 * Teacher Match - Routes de gestion des syllabi.
 *
 * Fonctionnalité actuelle (étape 1) : import et enregistrement de plusieurs
 * syllabi en une seule fois, puis consultation de la liste et des fichiers
 * déjà importés.
 *
 * L'analyse par l'IA, la recherche d'enseignants et le classement viendront
 * dans une étape ultérieure.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const db = require('../db');
const {
  NOMBRE_MAX_FICHIERS,
  TAILLE_MAX_OCTETS,
  nettoyerNom,
  validerFichier,
  verifierSignature,
  validerLibelle,
} = require('../validation');

const router = express.Router();

/**
 * Multer est configuré en stockage mémoire : le fichier est lu, validé, puis
 * écrit en base. Il n'est donc jamais déposé sur le disque du serveur, ce qui
 * évite les fichiers orphelins et garde les documents hors de portée du web.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAILLE_MAX_OCTETS,
    files: NOMBRE_MAX_FICHIERS,
    fields: 10,
    fieldNameSize: 100,
  },
});

/** Génère un identifiant de stockage opaque (jamais le nom d'origine seul). */
function nomStocke(nomOriginal, cleStockage) {
  const ext = path.extname(nomOriginal).toLowerCase();
  return `${cleStockage}${ext}`;
}

/** Transforme une erreur multer en message lisible en français. */
function messageErreurMulter(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    const max = Math.round(TAILLE_MAX_OCTETS / (1024 * 1024));
    return `Un des fichiers dépasse la taille maximale autorisée (${max} Mo).`;
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return `Trop de fichiers envoyés en une seule fois (maximum ${NOMBRE_MAX_FICHIERS}).`;
  }
  return "L'envoi des fichiers a échoué. Vérifiez les documents puis réessayez.";
}

/**
 * POST /api/syllabi
 * Import d'un ou plusieurs syllabi (champ "syllabi").
 */
router.post(
  '/syllabi',
  (req, res) => {
    upload.array('syllabi', NOMBRE_MAX_FICHIERS)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ ok: false, erreur: messageErreurMulter(err) });
      }

      const fichiers = Array.isArray(req.files) ? req.files : [];
      if (fichiers.length === 0) {
        return res.status(400).json({
          ok: false,
          erreur: 'Aucun document reçu. Sélectionnez au moins un syllabus au format PDF ou Word.',
        });
      }
      if (fichiers.length > NOMBRE_MAX_FICHIERS) {
        return res.status(400).json({
          ok: false,
          erreur: `Maximum ${NOMBRE_MAX_FICHIERS} documents par import.`,
        });
      }

      // Validation du libellé (facultatif).
      const libelleValide = validerLibelle(req.body && req.body.libelle);
      if (libelleValide && typeof libelleValide === 'object') {
        return res.status(400).json({ ok: false, erreur: libelleValide.erreur });
      }
      const libelle = libelleValide || '';

      // Validation individuelle de chaque document.
      const acceptes = [];
      const refuses = [];

      for (const fichier of fichiers) {
        const nomOriginal = nettoyerNom(fichier.originalname);
        const verdict = validerFichier(fichier);

        if (!verdict.ok) {
          refuses.push({ nom: nomOriginal, motif: verdict.motif });
          continue;
        }
        if (!verifierSignature(fichier)) {
          refuses.push({
            nom: nomOriginal,
            motif: 'Le contenu du fichier ne correspond pas à son extension.',
          });
          continue;
        }
        acceptes.push({ fichier, nomOriginal });
      }

      if (acceptes.length === 0) {
        return res.status(400).json({
          ok: false,
          erreur: "Aucun des documents envoyés n'a pu être enregistré.",
          refuses,
        });
      }

      // Écriture transactionnelle : tout ou rien, pour ne jamais laisser une
      // demande sans ses syllabi.
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        const demande = await client.query(
          `INSERT INTO demandes (libelle, nombre_syllabi, date_demande)
           VALUES ($1, $2, NOW())
           RETURNING id, date_demande`,
          [libelle, acceptes.length]
        );
        const demandeId = demande.rows[0].id;

        const enregistres = [];
        for (const { fichier, nomOriginal } of acceptes) {
          const cleStockage = crypto.randomUUID();
          const stocke = nomStocke(nomOriginal, cleStockage);

          const insere = await client.query(
            `INSERT INTO syllabi
               (nom_original, nom_stocke, type_mime, taille_octets, contenu, statut, date_import)
             VALUES ($1, $2, $3, $4, $5, 'importe', NOW())
             RETURNING id, nom_original, type_mime, taille_octets, statut, date_import`,
            [
              nomOriginal,
              stocke,
              fichier.mimetype || 'application/octet-stream',
              fichier.size,
              fichier.buffer,
            ]
          );

          await client.query(
            `INSERT INTO demande_syllabi (demande_id, syllabus_id) VALUES ($1, $2)`,
            [demandeId, insere.rows[0].id]
          );

          enregistres.push(insere.rows[0]);
        }

        await client.query('COMMIT');

        return res.status(201).json({
          ok: true,
          demande: { id: demandeId, libelle, date_demande: demande.rows[0].date_demande },
          importes: enregistres,
          refuses,
          message:
            enregistres.length > 1
              ? `${enregistres.length} syllabi ont été importés et enregistrés.`
              : 'Le syllabus a été importé et enregistré.',
        });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[Teacher Match] Erreur pendant l\'enregistrement :', e.message);
        return res.status(500).json({
          ok: false,
          erreur: "L'enregistrement en base a échoué. Aucun document n'a été conservé.",
        });
      } finally {
        client.release();
      }
    });
  }
);

/**
 * GET /api/syllabi
 * Liste des syllabi importés (sans le contenu binaire).
 */
router.get('/syllabi', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nom_original, type_mime, taille_octets, statut, date_import
       FROM syllabi
       ORDER BY date_import DESC, id DESC
       LIMIT 200`
    );
    res.json({ ok: true, syllabi: rows });
  } catch (e) {
    console.error('[Teacher Match] Erreur de lecture des syllabi :', e.message);
    res.status(500).json({ ok: false, erreur: 'Impossible de lire la liste des syllabi.' });
  }
});

/**
 * GET /api/syllabi/:id/fichier
 * Téléchargement d'un syllabus conservé en base.
 * L'identifiant est un entier ; le contenu ne sort jamais du serveur autrement.
 */
router.get('/syllabi/:id/fichier', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, erreur: 'Identifiant invalide.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT nom_original, type_mime, contenu FROM syllabi WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: 'Syllabus introuvable.' });
    }

    const { nom_original: nom, type_mime: type, contenu } = rows[0];
    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(contenu);
  } catch (e) {
    console.error('[Teacher Match] Erreur de téléchargement :', e.message);
    return res.status(500).json({ ok: false, erreur: 'Impossible de récupérer ce document.' });
  }
});

/**
 * GET /api/demandes
 * Historique des demandes d'import (utilisé par la page historique).
 */
router.get('/demandes', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id,
              d.libelle,
              d.nombre_syllabi,
              d.date_demande,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', s.id,
                    'nom_original', s.nom_original,
                    'taille_octets', s.taille_octets,
                    'statut', s.statut,
                    'date_import', s.date_import
                  ) ORDER BY s.date_import DESC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS syllabi
       FROM demandes d
       LEFT JOIN demande_syllabi ds ON ds.demande_id = d.id
       LEFT JOIN syllabi s ON s.id = ds.syllabus_id
       GROUP BY d.id
       ORDER BY d.date_demande DESC, d.id DESC
       LIMIT 100`
    );
    res.json({ ok: true, demandes: rows });
  } catch (e) {
    console.error('[Teacher Match] Erreur de lecture de l\'historique :', e.message);
    res.status(500).json({ ok: false, erreur: "Impossible de lire l'historique." });
  }
});

module.exports = router;
