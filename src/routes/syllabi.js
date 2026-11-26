/**
 * Teacher Match - Routes de gestion des syllabi (API interne, authentifiée).
 *
 * Étape 1 : import groupé, liste, téléchargement, suppression (RGPD) et
 * historique des demandes. L'analyse par l'IA viendra à l'étape 2.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const config = require('../config');
const db = require('../db');
const {
  NOMBRE_MAX_FICHIERS,
  TAILLE_MAX_OCTETS,
  extensionDe,
  nettoyerNom,
  validerFichier,
  verifierSignature,
  typeMimeDe,
  validerLibelle,
  validerId,
} = require('../validation');

const router = express.Router();

/**
 * Stockage en mémoire : le fichier est validé puis écrit en base, il ne
 * touche jamais le disque du serveur. Les limites protègent la mémoire.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAILLE_MAX_OCTETS,
    files: NOMBRE_MAX_FICHIERS,
    fields: 5,
    fieldNameSize: 50,
    fieldSize: 2 * 1024,
    parts: NOMBRE_MAX_FICHIERS + 5,
    headerPairs: 200,
  },
});

/** Nombre d'imports en cours : borne la mémoire consommée simultanément. */
let importsEnCours = 0;

function messageErreurMulter(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return `Un des fichiers dépasse la taille maximale autorisée (${config.MAX_FILE_SIZE_MB} Mo).`;
  }
  if (err && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_PART_COUNT')) {
    return `Trop de fichiers envoyés en une seule fois (maximum ${NOMBRE_MAX_FICHIERS}).`;
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Champ de fichier inattendu.';
  }
  return "L'envoi des fichiers a échoué. Vérifiez les documents puis réessayez.";
}

function reponseErreurBase(res, e, message) {
  if (e && e.code === 'BASE_INDISPONIBLE') {
    return res.status(503).json({ ok: false, erreur: "La base de données n'est pas configurée." });
  }
  console.error('[Teacher Match]', message, '-', e && e.message);
  return res.status(500).json({ ok: false, erreur: message });
}

/** Nom de fichier ASCII de repli pour l'en-tête Content-Disposition. */
function nomAscii(nom) {
  const ext = extensionDe(nom);
  const base = nom
    .slice(0, nom.length - ext.length)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .slice(0, 120);
  return (base || 'syllabus') + ext;
}

/** GET /api/config : limites affichées par l'interface. */
router.get('/config', (req, res) => {
  res.json({
    ok: true,
    taille_max_mo: config.MAX_FILE_SIZE_MB,
    nombre_max_fichiers: NOMBRE_MAX_FICHIERS,
  });
});

/** POST /api/syllabi : import d'un ou plusieurs syllabi (champ "syllabi"). */
router.post('/syllabi', (req, res) => {
  if (importsEnCours >= config.IMPORTS_SIMULTANES_MAX) {
    res.setHeader('Retry-After', '10');
    return res.status(503).json({ ok: false, erreur: 'Serveur occupé : réessayez dans quelques secondes.' });
  }
  importsEnCours += 1;
  let libere = false;
  const liberer = () => {
    if (!libere) {
      libere = true;
      importsEnCours -= 1;
    }
  };
  res.on('close', liberer);

  upload.array('syllabi', NOMBRE_MAX_FICHIERS)(req, res, (err) => {
    traiterImport(err, req, res)
      .catch((e) => reponseErreurBase(res, e, "L'enregistrement a échoué. Aucun document n'a été conservé."))
      .finally(liberer);
  });
});

async function traiterImport(err, req, res) {
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

  const libelle = validerLibelle(req.body && req.body.libelle);
  if (libelle.erreur) {
    return res.status(400).json({ ok: false, erreur: libelle.erreur });
  }

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
      refuses.push({ nom: nomOriginal, motif: 'Le contenu du fichier ne correspond pas à son extension.' });
      continue;
    }
    acceptes.push({ fichier, nomOriginal });
  }

  if (acceptes.length === 0) {
    return res.status(400).json({ ok: false, erreur: "Aucun des documents envoyés n'a pu être enregistré.", refuses });
  }

  // Écriture transactionnelle : tout ou rien.
  const client = await db.connecter();
  try {
    await client.query('BEGIN');
    const demande = await client.query(
      `INSERT INTO demandes (libelle, nombre_syllabi) VALUES ($1, $2) RETURNING id, date_demande`,
      [libelle.valeur, acceptes.length]
    );
    const demandeId = demande.rows[0].id;

    const enregistres = [];
    for (const { fichier, nomOriginal } of acceptes) {
      const stocke = crypto.randomUUID() + extensionDe(nomOriginal);
      const insere = await client.query(
        `INSERT INTO syllabi (nom_original, nom_stocke, type_mime, taille_octets, contenu, statut)
         VALUES ($1, $2, $3, $4, $5, 'importe')
         RETURNING id, nom_original, type_mime, taille_octets, statut, date_import`,
        [nomOriginal, stocke, typeMimeDe(nomOriginal), fichier.buffer.length, fichier.buffer]
      );
      await client.query(`INSERT INTO demande_syllabi (demande_id, syllabus_id) VALUES ($1, $2)`, [
        demandeId,
        insere.rows[0].id,
      ]);
      enregistres.push(insere.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(201).json({
      ok: true,
      demande: { id: demandeId, libelle: libelle.valeur, date_demande: demande.rows[0].date_demande },
      importes: enregistres,
      refuses,
      message:
        enregistres.length > 1
          ? `${enregistres.length} syllabi ont été importés et enregistrés.`
          : 'Le syllabus a été importé et enregistré.',
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** GET /api/syllabi : liste (jamais le contenu binaire). */
router.get('/syllabi', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nom_original, type_mime, taille_octets, statut, date_import
       FROM syllabi ORDER BY date_import DESC, id DESC LIMIT 200`
    );
    return res.json({ ok: true, syllabi: rows });
  } catch (e) {
    return reponseErreurBase(res, e, 'Impossible de lire la liste des syllabi.');
  }
});

/** GET /api/syllabi/:id/fichier : téléchargement contrôlé. */
router.get('/syllabi/:id/fichier', async (req, res) => {
  const id = validerId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, erreur: 'Identifiant invalide.' });

  try {
    const { rows } = await db.query(`SELECT nom_original, contenu FROM syllabi WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ ok: false, erreur: 'Syllabus introuvable.' });

    const nom = rows[0].nom_original;
    res.setHeader('Content-Type', typeMimeDe(nom));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomAscii(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`
    );
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'no-store');
    return res.send(rows[0].contenu);
  } catch (e) {
    return reponseErreurBase(res, e, 'Impossible de récupérer ce document.');
  }
});

/**
 * DELETE /api/syllabi/:id : suppression définitive (droit à l'effacement).
 * Met à jour le compteur des demandes et supprime les demandes devenues vides.
 */
router.delete('/syllabi/:id', async (req, res) => {
  const id = validerId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, erreur: 'Identifiant invalide.' });

  let client;
  try {
    client = await db.connecter();
    await client.query('BEGIN');
    const liens = await client.query(`SELECT demande_id FROM demande_syllabi WHERE syllabus_id = $1`, [id]);
    const supprime = await client.query(`DELETE FROM syllabi WHERE id = $1 RETURNING id`, [id]);
    if (supprime.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erreur: 'Syllabus introuvable.' });
    }
    const demandes = liens.rows.map((r) => r.demande_id);
    if (demandes.length) {
      await client.query(
        `UPDATE demandes d
           SET nombre_syllabi = (SELECT COUNT(*) FROM demande_syllabi ds WHERE ds.demande_id = d.id)
         WHERE d.id = ANY($1::int[])`,
        [demandes]
      );
      await client.query(`DELETE FROM demandes WHERE id = ANY($1::int[]) AND nombre_syllabi = 0`, [demandes]);
    }
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Le syllabus a été définitivement supprimé.' });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return reponseErreurBase(res, e, 'La suppression a échoué.');
  } finally {
    if (client) client.release();
  }
});

/** GET /api/demandes : historique des imports. */
router.get('/demandes', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.libelle, d.nombre_syllabi, d.date_demande,
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
    return res.json({ ok: true, demandes: rows });
  } catch (e) {
    return reponseErreurBase(res, e, "Impossible de lire l'historique.");
  }
});

module.exports = router;
