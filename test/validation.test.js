'use strict';
// Tests sans dépendance externe : npm test
const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/validation');

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml')]);
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('autre-contenu-zip-quelconque')]);
const doc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(50)]);
const fichier = (originalname, buffer, mimetype = 'application/octet-stream') => ({ originalname, buffer, mimetype });

test('nettoyage des noms', () => {
  assert.strictEqual(v.nettoyerNom('../../etc/passwd'), 'passwd');
  assert.strictEqual(v.nettoyerNom('C:\\Users\\x\\cours.pdf'), 'cours.pdf');
  assert.strictEqual(v.nettoyerNom('cours\u202Efdp.exe'), 'coursfdp.exe');
  assert.strictEqual(v.nettoyerNom('a"b<c>.pdf'), 'a_b_c_.pdf');
  assert.strictEqual(v.nettoyerNom('...'), 'syllabus');
  assert.strictEqual(v.nettoyerNom('x'.repeat(300) + '.pdf').length, 180);
});

test('signatures réelles', () => {
  assert.ok(v.verifierSignature(fichier('a.pdf', pdf)));
  assert.ok(v.verifierSignature(fichier('a.docx', docx)));
  assert.ok(v.verifierSignature(fichier('a.doc', doc)));
  assert.ok(!v.verifierSignature(fichier('a.pdf', Buffer.from('juste du texte renommé'))));
  assert.ok(!v.verifierSignature(fichier('a.docx', zip)), 'un ZIP quelconque est refusé');
  assert.ok(!v.verifierSignature(fichier('a.doc', pdf)));
});

test('validation des fichiers', () => {
  assert.ok(v.validerFichier(fichier('a.pdf', pdf, 'application/pdf')).ok);
  assert.ok(!v.validerFichier(fichier('a.txt', pdf)).ok);
  assert.ok(!v.validerFichier(fichier('a.pdf.exe', pdf)).ok);
  assert.ok(!v.validerFichier(fichier('a.pdf', pdf, 'text/html')).ok);
  assert.ok(!v.validerFichier(fichier('a.pdf', Buffer.alloc(0))).ok);
  assert.ok(!v.validerFichier(fichier('a.pdf', Buffer.alloc(v.TAILLE_MAX_OCTETS + 1))).ok);
});

test('type MIME déduit de l\'extension', () => {
  assert.strictEqual(v.typeMimeDe('x.PDF'), 'application/pdf');
  assert.strictEqual(v.typeMimeDe('x.html'), 'application/octet-stream');
});

test('libellé et identifiants', () => {
  assert.deepStrictEqual(v.validerLibelle(undefined), { valeur: '' });
  assert.deepStrictEqual(v.validerLibelle('  Master\nFinance '), { valeur: 'Master Finance' });
  assert.ok(v.validerLibelle('x'.repeat(201)).erreur);
  assert.ok(v.validerLibelle(['a', 'b']).erreur);
  assert.strictEqual(v.validerId('42'), 42);
  for (const mauvais of ['0', '-1', '1e3', '12abc', '99999999999', '', ' 1']) {
    assert.strictEqual(v.validerId(mauvais), null, mauvais);
  }
});
