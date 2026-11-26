/**
 * Teacher Match - Validation côté serveur.
 *
 * Tout ce qui vient du navigateur est non fiable. Chaque document est contrôlé
 * par son extension, son type MIME déclaré, sa taille ET sa signature réelle
 * (octets de début de fichier, structure interne pour les DOCX). Le type MIME
 * enregistré est déduit de l'extension, jamais repris tel quel du navigateur.
 */

'use strict';

const config = require('./config');

const TYPES_PAR_EXTENSION = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const EXTENSIONS_AUTORISEES = Object.keys(TYPES_PAR_EXTENSION);

const TYPES_MIME_AUTORISES = [
  'application/pdf',
  'application/x-pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Certains navigateurs / systèmes envoient un type générique.
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
];

const TAILLE_MAX_OCTETS = config.MAX_FILE_SIZE_MB * 1024 * 1024;
const NOMBRE_MAX_FICHIERS = config.NOMBRE_MAX_FICHIERS;
const LONGUEUR_MAX_NOM = 180;
const LONGUEUR_MAX_LIBELLE = 200;

/** Extension en minuscules (seule la dernière compte : "a.pdf.exe" -> ".exe"). */
function extensionDe(nomFichier) {
  const nom = String(nomFichier || '');
  const point = nom.lastIndexOf('.');
  if (point <= 0) return '';
  return nom.slice(point).toLowerCase();
}

/**
 * Nettoie un nom de fichier : supprime chemins, caractères de contrôle,
 * caractères de direction Unicode (usurpation d'extension) et caractères
 * interdits ; limite la longueur.
 */
function nettoyerNom(nomFichier) {
  let nom = String(nomFichier || '')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[<>:"|?*;]/g, '_')
    .replace(/^\.+/, '')
    .trim();

  if (nom === '') nom = 'syllabus';
  if (nom.length > LONGUEUR_MAX_NOM) {
    const ext = extensionDe(nom);
    nom = nom.slice(0, LONGUEUR_MAX_NOM - ext.length) + ext;
  }
  return nom;
}

function validerFichier(fichier) {
  if (!fichier || typeof fichier !== 'object') {
    return { ok: false, motif: 'Fichier illisible.' };
  }
  const extension = extensionDe(nettoyerNom(fichier.originalname));

  if (!EXTENSIONS_AUTORISEES.includes(extension)) {
    return {
      ok: false,
      motif: `Format non autorisé (« ${extension || 'sans extension'} »). Formats acceptés : PDF, DOC, DOCX.`,
    };
  }
  if (fichier.mimetype && !TYPES_MIME_AUTORISES.includes(String(fichier.mimetype).toLowerCase())) {
    return { ok: false, motif: 'Type de fichier non autorisé.' };
  }
  if (!Buffer.isBuffer(fichier.buffer) || fichier.buffer.length === 0) {
    return { ok: false, motif: 'Le fichier est vide.' };
  }
  if (fichier.buffer.length > TAILLE_MAX_OCTETS) {
    return { ok: false, motif: `Fichier trop volumineux (maximum ${config.MAX_FILE_SIZE_MB} Mo).` };
  }
  return { ok: true };
}

/** Vérifie que le contenu réel correspond à l'extension annoncée. */
function verifierSignature(fichier) {
  const buf = fichier && fichier.buffer;
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  const extension = extensionDe(nettoyerNom(fichier.originalname));

  if (extension === '.pdf') {
    // "%PDF-" dans les 1024 premiers octets (tolérance prévue par la norme).
    return buf.subarray(0, 1024).includes(Buffer.from('%PDF-', 'latin1'));
  }

  if (extension === '.docx') {
    // Archive ZIP (PK\x03\x04) contenant la structure d'un document Word.
    // Les noms des entrées d'une archive ZIP sont stockés en clair.
    const zip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    return (
      zip &&
      buf.includes(Buffer.from('[Content_Types].xml', 'latin1')) &&
      buf.includes(Buffer.from('word/', 'latin1'))
    );
  }

  if (extension === '.doc') {
    // Conteneur OLE2 : D0 CF 11 E0 A1 B1 1A E1
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return ole.every((octet, i) => buf[i] === octet);
  }

  return false;
}

/** Type MIME fiable, déduit de l'extension validée. */
function typeMimeDe(nomFichier) {
  return TYPES_PAR_EXTENSION[extensionDe(nomFichier)] || 'application/octet-stream';
}

/** Libellé facultatif : renvoie { valeur } ou { erreur }. */
function validerLibelle(valeur) {
  if (valeur === undefined || valeur === null) return { valeur: '' };
  if (typeof valeur !== 'string') return { erreur: 'Libellé invalide.' };
  const texte = valeur.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (texte.length > LONGUEUR_MAX_LIBELLE) {
    return { erreur: `Le libellé ne doit pas dépasser ${LONGUEUR_MAX_LIBELLE} caractères.` };
  }
  return { valeur: texte };
}

/** Identifiant entier strictement positif (paramètre d'URL). */
function validerId(valeur) {
  if (typeof valeur !== 'string' || !/^[1-9][0-9]{0,9}$/.test(valeur)) return null;
  const id = Number(valeur);
  return id <= 2147483647 ? id : null;
}

module.exports = {
  EXTENSIONS_AUTORISEES,
  TYPES_MIME_AUTORISES,
  TAILLE_MAX_OCTETS,
  NOMBRE_MAX_FICHIERS,
  extensionDe,
  nettoyerNom,
  validerFichier,
  verifierSignature,
  typeMimeDe,
  validerLibelle,
  validerId,
};
