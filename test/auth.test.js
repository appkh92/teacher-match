'use strict';
const test = require('node:test');
const assert = require('node:assert');

process.env.APP_PASSWORD = 'mot-de-passe-de-test-123';
process.env.SESSION_SECRET = 'x'.repeat(40);
const auth = require('../src/auth');
const { optionsSsl } = require('../src/ssl');

test('jeton de session signé', () => {
  const jeton = auth.creerJeton();
  assert.ok(auth.jetonValide(jeton));
  const [charge, sig] = jeton.split('.');
  assert.ok(!auth.jetonValide(charge + '.' + sig.slice(0, -2) + 'AA'), 'signature altérée');
  const fausse = Buffer.from(JSON.stringify({ exp: Date.now() + 1e9 })).toString('base64url');
  assert.ok(!auth.jetonValide(fausse + '.' + sig), 'charge forgée');
  assert.ok(!auth.jetonValide('n.importe.quoi'));
  assert.ok(!auth.jetonValide(undefined));
});

test('exigerConnexion bloque sans cookie', () => {
  let statut, corps, redirection;
  const res = {
    status(s) { statut = s; return this; },
    json(c) { corps = c; return this; },
    redirect(s, url) { statut = s; redirection = url; return this; },
  };
  auth.exigerConnexion({ headers: {}, originalUrl: '/api/syllabi' }, res, () => assert.fail('ne doit pas passer'));
  assert.strictEqual(statut, 401);
  assert.strictEqual(corps.ok, false);
  auth.exigerConnexion({ headers: {}, originalUrl: '/' }, res, () => assert.fail('ne doit pas passer'));
  assert.strictEqual(redirection, '/connexion');

  let passe = false;
  auth.exigerConnexion({ headers: { cookie: 'a=b; tm_session=' + auth.creerJeton() }, originalUrl: '/' }, res, () => { passe = true; });
  assert.ok(passe);
});

test('choix TLS PostgreSQL', () => {
  assert.strictEqual(optionsSsl('postgresql://u:p@postgres.railway.internal:5432/railway'), false);
  assert.strictEqual(optionsSsl('postgresql://u:p@localhost:5432/db'), false);
  assert.deepStrictEqual(optionsSsl('postgresql://u:p@monorail.proxy.rlwy.net:1234/railway'), { rejectUnauthorized: false });
});
