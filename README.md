# Teacher Match

Application web d'aide à la décision pour la mise en relation entre les
**enseignants** et les **cours** d'un établissement. Le responsable pédagogique
importe le syllabus d'un cours ; Teacher Match en extraira ensuite les
compétences visées, définira le profil enseignant recherché, comparera les
profils disponibles et proposera un classement argumenté. **La décision finale
reste humaine.**

Interface entièrement en français.

---

## 1. État du projet

| Étape | Fonctionnalité | État |
| --- | --- | --- |
| 1 | Accueil, connexion sécurisée, import de plusieurs syllabi (PDF/Word), enregistrement en base, téléchargement, suppression, historique | **Livrée (v1.1)** |
| 2 | Analyse du syllabus par l'IA et extraction des compétences visées | À venir |
| 3 | Profil enseignant recherché et critères de matching | À venir |
| 4 | Recherche externe d'enseignants (sources autorisées) et analyse des CV | À venir |
| 5 | Classement automatique avec scores et justifications | À venir |

### Corrections de la version 1.1

Pourquoi la version 1.0 ne démarrait pas (ou tombait) sur Railway :

1. **Arrêt brutal au chargement** : `src/db.js` appelait `process.exit(1)` dès
   que `DATABASE_URL` manquait, avant même l'ouverture du port. Railway
   relançait le service en boucle puis marquait le déploiement en échec.
2. **Contrôle de santé bloquant** : `/health` renvoyait une erreur 503 tant que
   la base n'était pas joignable. Si PostgreSQL démarrait après l'application,
   Railway considérait le déploiement comme raté.
3. **Plantage du processus** : dans la route d'import, la connexion à la base
   était ouverte hors du bloc `try`. Au moindre incident PostgreSQL, la promesse
   rejetée non gérée arrêtait Node.js (comportement par défaut depuis Node 15).
4. **TLS imposé partout** : le chiffrement était forcé même sur le réseau privé
   Railway (`*.railway.internal`), ce qui peut faire échouer la connexion.
5. **Une seule tentative de création des tables** : si la base n'était pas
   prête au démarrage, les tables n'étaient jamais créées.

Désormais, le serveur démarre toujours, `/health` répond 200 dès que le
processus vit, la création des tables est retentée toutes les 15 secondes, et
une page « Configuration incomplète » s'affiche tant qu'une variable
obligatoire manque (rien n'est accessible dans cet état).

Sécurisation ajoutée :

- **Authentification obligatoire** : la v1.0 n'en avait aucune ; toute personne
  connaissant l'adresse pouvait lister, importer et télécharger les syllabi.
  Toutes les pages et toute l'API exigent maintenant une connexion
  (mot de passe `APP_PASSWORD`, session signée HMAC, cookie `HttpOnly`,
  `SameSite=Strict`, `Secure`).
- **Protection CSRF** : vérification de l'origine sur toute requête qui
  modifie des données, en plus du cookie `SameSite=Strict`.
- **Limitation de débit** : 10 tentatives de connexion par quart d'heure et
  par adresse IP, 60 imports par heure, 3 imports simultanés au plus
  (protection de la mémoire).
- **Dépendances corrigées** : `multer` 1.4.5 (vulnérabilités de déni de
  service connues) remplacé par `multer` 2.x ; `express` 4.21.x ; dépendance
  Anthropic inutilisée retirée (elle sera ajoutée à l'étape 2).
- **Validation renforcée** : un DOCX doit être une vraie archive Word (pas
  n'importe quel ZIP), signature OLE complète pour les DOC, suppression des
  caractères Unicode d'inversion de sens dans les noms (usurpation
  d'extension), type MIME enregistré déduit de l'extension et non repris du
  navigateur.
- **Téléchargement durci** : nom de fichier encodé selon la RFC 5987,
  `Content-Security-Policy: sandbox`, aucune mise en cache.
- **Aucune fuite technique** : `/health` n'expose plus les messages d'erreur
  ni la présence de la clé Anthropic ; les erreurs renvoyées au navigateur
  sont génériques.
- **Interface sans injection HTML** : tout le contenu dynamique est inséré via
  `textContent`.
- **Droit à l'effacement (RGPD)** : bouton « Supprimer » sur chaque syllabus ;
  les demandes devenues vides sont supprimées.
- En-têtes HSTS, `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy`,
  `noindex`, arrêt propre sur `SIGTERM`.

---

## 2. Pile technique

- **Node.js 20+** et **Express 4**, sans framework front-end.
- **PostgreSQL** via `DATABASE_URL`.
- **API Anthropic (Claude)** : prévue pour l'étape 2, côté serveur uniquement.
- Déploiement sur **Railway** depuis **GitHub** (builder Railpack).

---

## 3. Arborescence du dépôt

Chemins relatifs à la racine du dépôt GitHub.

```
.
├── .env.example              Modèle des variables (aucune valeur réelle)
├── .gitignore                Exclut .env, node_modules, données locales
├── package.json              Dépendances, scripts "start" et "test"
├── railway.json              Configuration de déploiement Railway
├── README.md                 Ce document
├── public/                   Interface
│   ├── connexion.html        Page de connexion (publique)
│   ├── connexion.js          Messages de la page de connexion (public)
│   ├── configuration.html    Affichée si une variable obligatoire manque
│   ├── index.html            Accueil : import, liste, suppression
│   ├── resultats.html        Résultats (étape 5)
│   ├── historique.html       Historique des demandes
│   ├── styles.css            Feuille de style unique (publique)
│   ├── accueil.js            Sélection, envoi, liste des syllabi
│   └── historique.js         Chargement de l'historique
├── src/                      Serveur (jamais exposé au navigateur)
│   ├── server.js             Point d'entrée : ordre des protections, routes
│   ├── config.js             Lecture et contrôle des variables
│   ├── auth.js               Connexion, sessions signées, déconnexion
│   ├── security.js           En-têtes, limitation de débit, contrôle d'origine
│   ├── db.js                 Pool PostgreSQL, tables, reprise automatique
│   ├── ssl.js                Choix du chiffrement de la connexion PostgreSQL
│   ├── validation.js         Validation des fichiers et des entrées
│   └── routes/
│       └── syllabi.js        Import, liste, téléchargement, suppression, historique
└── test/                     Tests automatiques (node --test, sans dépendance)
    ├── auth.test.js
    └── validation.test.js
```

---

## 4. Variables à renseigner sur Railway

Railway : projet → service applicatif → onglet **Variables** → **New Variable**.

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | **Oui** | Référence vers la base : **Add Reference** → `${{Postgres.DATABASE_URL}}`. |
| `APP_PASSWORD` | **Oui** | Mot de passe d'accès à l'application, **12 caractères minimum**. Le modifier déconnecte toutes les sessions. |
| `SESSION_SECRET` | Recommandée | Clé de signature des sessions, 32 caractères aléatoires minimum (par exemple un mot de passe généré par votre gestionnaire). Sans elle, les sessions sont perdues à chaque redéploiement. |
| `SESSION_HOURS` | Non | Durée d'une session en heures. Par défaut `12`. |
| `DATABASE_SSL` | Non | Laisser vide (automatique). `disable`, `require` ou `verify` pour forcer. |
| `MAX_FILE_SIZE_MB` | Non | Taille maximale d'un document. Par défaut `10`, maximum `25`. |
| `ANTHROPIC_API_KEY` | Étape 2 | Clé API Anthropic, côté serveur uniquement. |
| `ANTHROPIC_MODEL` | Étape 2 | Modèle Claude. Valeur proposée : `claude-sonnet-5-5`. |
| `PORT` | Non | Fournie par Railway. Ne pas la définir. |

Aucune clé n'est écrite dans le code. `.gitignore` empêche tout fichier `.env`
d'être versionné.

---

## 5. PostgreSQL

1. Dans le projet Railway : **+ New** → **Database** → **Add PostgreSQL**.
2. Service applicatif → **Variables** → **New Variable** → **Add Reference** →
   `DATABASE_URL` du service PostgreSQL.
3. Les tables sont créées automatiquement (`CREATE TABLE IF NOT EXISTS`), et la
   création est retentée toutes les 15 secondes si la base n'est pas encore
   prête. Aucune donnée existante n'est supprimée : une base créée avec la
   v1.0 est reprise telle quelle.

| Table | Contenu |
| --- | --- |
| `syllabi` | Un enregistrement par syllabus : nom d'origine, nom de stockage aléatoire, type MIME, taille, contenu, statut, date d'import. |
| `demandes` | Un envoi groupé : libellé, nombre de syllabi, date. |
| `demande_syllabi` | Lien entre demandes et syllabi. |
| `resultats` | Prévue pour les étapes suivantes. Créée vide. |

Vérification : `https://votre-domaine.up.railway.app/health` doit renvoyer
`"base_donnees":"connectee"` et `"configuration":"complete"`.

---

## 6. Déploiement depuis GitHub (sans ligne de commande)

### 6.1 Mettre à jour le dépôt existant

1. Sur github.com, ouvrez le dépôt `teacher-match`.
2. **Add file** → **Upload files**, puis glissez-déposez **le contenu** du
   dossier décompressé (fichiers de la racine et dossiers `public`, `src`,
   `test`). GitHub conserve l'arborescence des dossiers déposés et remplace
   les fichiers existants.
3. Ne déposez jamais de dossier `node_modules` ni de fichier `.env`.
4. **Commit changes**.

Pour un nouveau dépôt : **New repository** (de préférence *Private*, sans
README), puis **uploading an existing file** et même procédure.

### 6.2 Railway

1. Si ce n'est pas déjà fait : **New Project** → **Deploy from GitHub repo** →
   `teacher-match`.
2. Ajoutez PostgreSQL et la référence `DATABASE_URL` (§5).
3. Ajoutez `APP_PASSWORD` et `SESSION_SECRET` (§4).
4. **Settings** → **Networking** → **Generate Domain**.
5. Railway installe les dépendances (`npm install`), lance `npm start` et
   redéploie à chaque commit sur `main`.

En cas d'échec, ouvrez **Deployments** → **View logs** : les messages
`[Teacher Match]` indiquent la variable manquante ou l'état de la base.

---

## 7. Tester l'application

### 7.1 Après déploiement

1. Ouvrez le domaine : la page **Connexion** s'affiche.
2. Saisissez `APP_PASSWORD` : la page d'accueil s'affiche.
3. Ouvrez `/health` : `"base_donnees":"connectee"`.
4. Le bouton **Déconnexion** du menu ramène à la page de connexion.

### 7.2 Import

1. Préparez deux ou trois syllabi PDF ou Word.
2. Saisissez éventuellement un libellé, ajoutez les documents (clic ou
   glisser-déposer), cliquez **Générer le classement**.
3. Un message vert liste les documents enregistrés et leur référence.
4. Le tableau « Syllabi déjà importés » se met à jour : **Télécharger**
   restitue le document à l'identique, **Supprimer** l'efface définitivement
   après confirmation.
5. La page **Historique** affiche la demande et ses documents.

### 7.3 Tests de sécurité attendus

| Test | Résultat attendu |
| --- | --- |
| Ouvrir `/`, `/historique` ou `/api/syllabi` sans être connecté | Redirection vers la connexion (pages) ou erreur 401 (API). |
| Onze mots de passe erronés en moins de 15 minutes | Erreur 429 « Trop de tentatives ». |
| Envoyer un `.txt` ou une image renommée en `.pdf` | Refusé : le contenu ne correspond pas à l'extension. |
| Envoyer un ZIP renommé en `.docx` | Refusé. |
| Envoyer un fichier de plus de 10 Mo | Refusé (taille maximale). |
| Envoyer plus de 10 documents d'un coup | Refusé (maximum 10). |
| Supprimer la variable `APP_PASSWORD` | Page « Configuration incomplète », aucune donnée accessible. |
| Chercher un secret dans le dépôt | Aucun. |

### 7.4 Tests automatiques et exécution locale (facultatif)

1. Node.js 20 ou supérieur.
2. `npm install`, puis `npm test` (8 tests : validation des fichiers,
   sessions, choix TLS).
3. Copiez `.env.example` en `.env`, renseignez `DATABASE_URL`,
   `APP_PASSWORD` et `SESSION_SECRET`.
4. `npm start`, puis `http://localhost:3000`.

---

## 8. Sécurité et données personnelles

- Accès réservé aux personnes connaissant le mot de passe ; un mot de passe
  partagé convient à une petite équipe. Pour plusieurs utilisateurs nominatifs,
  prévoir des comptes individuels à une étape ultérieure.
- Aucun secret dans le code ; validation serveur systématique ; contenus
  stockés en base, hors de la racine web, diffusés par une route authentifiée.
- Les syllabi et, plus tard, les CV contiennent des données personnelles :
  définissez une durée de conservation, limitez l'accès, supprimez sur demande
  (bouton « Supprimer »).
- Étape 4 : seules des sources autorisées seront utilisées, sans contourner les
  protections des plateformes, avec conservation des sources.
- Aucun critère discriminatoire ; classements indicatifs, décision humaine.

---

## 9. Licence

Parcours pédagogique conçu et déployé par Caroline Gans Combe (Omnes Education,
2026). Licence CC BY-NC 4.0 :
https://creativecommons.org/licenses/by-nc/4.0/deed.fr
