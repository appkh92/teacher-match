/**
 * Teacher Match - Validation côté serveur.
 *
 * Règle de base : tout ce qui vient du navigateur est considéré comme non fiable.
 * On vérifie le type de fichier par son extension ET par son type MIME, on
 * limite la taille, on limite le nombre de fichiers par envoi et on nettoie
 * les noms de fichiers (protection contre les traversées de répertoire).
 */

'use strict';

// Types autorisés : PDF et Word uniquement.
const EXTENSIONS_AUTORISEES = ['.pdf', '.doc', '.docx'];

const TYPES_MIME_AUTORISES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Certains navigateurs renvoient un type générique pour les .doc / .docx.
  'application/octet-stream',
];

const TAILLE_MAX_OCTETS =
  Math.max(1, parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024;

const NOMBRE_MAX_FICHIERS = 10;
const LONGUEUR_MAX_NOM = 180;

/**
 * Récupère l'extension en minuscules, y compris pour les doubles extensions
 * du type "syllabus.pdf.exe" (on ne garde que la dernière).
 */
function extensionDe(nomFichier) {
  const nom = String(nomFichier || '');
  const point = nom.lastIndexOf('.');
  if (point === -1) return '';
  return nom.slice(point).toLowerCase();
}

/**
 * Nettoie un nom de fichier : supprime les chemins, les caractères de contrôle
 * et les caractères interdits, limite la longueur.
 */
function nettoyerNom(nomFichier) {
  let nom = String(nomFichier || '')
    .replace(/\\/g, '/') // chemins Windows -> Unix
    .split('/')
    .pop() // on ne garde que le nom, jamais le chemin
    .replace(/[\u0000-\u001F\u007F]/g, '') // caractères de contrôle
    .replace(/[<>:"|?*]/g, '_') // caractères interdits sur les systèmes de fichiers
    .trim();

  if (nom === '' || nom === '.' || nom === '..') nom = 'syllabus';
  if (nom.length > LONGUEUR_MAX_NOM) {
    const ext = extensionDe(nom);
    nom = nom.slice(0, LONGUEUR_MAX_NOM - ext.length) + ext;
  }
  return nom;
}

/**
 * Vérifie la validité d'un fichier reçu depuis le navigateur.
 * @returns {{ok: true} | {ok: false, motif: string}}
 */
function validerFichier(fichier) {
  if (!fichier || typeof fichier !== 'object') {
    return { ok: false, motif: 'Fichier illisible.' };
  }

  const nom = nettoyerNom(fichier.originalname);
  const extension = extensionDe(nom);

  if (!EXTENSIONS_AUTORISEES.includes(extension)) {
    return {
      ok: false,
      motif: `Format non autorisé (« ${extension || 'sans extension'} »). Formats acceptés : PDF, DOC, DOCX.`,
    };
  }

  if (fichier.mimetype && !TYPES_MIME_AUTORISES.includes(fichier.mimetype)) {
    return {
      ok: false,
      motif: `Type de fichier non autorisé (« ${fichier.mimetype} »).`,
    };
  }

  if (!Buffer.isBuffer(fichier.buffer) || fichier.buffer.length === 0) {
    return { ok: false, motif: 'Le fichier est vide.' };
  }

  if (fichier.buffer.length > TAILLE_MAX_OCTETS) {
    const max = Math.round(TAILLE_MAX_OCTETS / (1024 * 1024));
    return { ok: false, motif: `Fichier trop volumineux (maximum ${max} Mo).` };
  }

  return { ok: true };
}

/**
 * Vérifie que le contenu réel correspond bien à l'extension annoncée.
 * C'est une seconde barrière : un fichier renommé en .pdf est refusé.
 */
function verifierSignature(fichier) {
  const buf = fichier.buffer;
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;

  const extension = extensionDe(nettoyerNom(fichier.originalname));

  if (extension === '.pdf') {
    // PDF : %PDF
    return buf.slice(0, 4).toString('latin1') === '%PDF';
  }

  if (extension === '.docx') {
    // DOCX = archive ZIP : PK\x03\x04
    return buf[0] === 0x50 && buf[1] === 0x4b;
  }

  if (extension === '.doc') {
    // Ancien format Word = conteneur OLE : D0 CF 11 E0
    return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  }

  return false;
}

/**
 * Valide le libellé facultatif de la demande.
 */
function validerLibelle(valeur) {
  if (valeur === undefined || valeur === null) return '';
  const texte = String(valeur).trim();
  if (texte.length > 200) {
    return { erreur: 'Le libellé ne doit pas dépasser 200 caractères.' };
  }
  return texte;
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
  validerLibelle,
};
