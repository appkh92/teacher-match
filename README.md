# Teacher Match

Application web d'aide à la décision pour la mise en relation entre les
**enseignants** et les **cours** d'un établissement scolaire ou d'un centre de
formation. Le responsable pédagogique importe le syllabus d'un cours ; Teacher
Match doit ensuite en extraire les compétences visées, définir le profil
enseignant recherché, comparer les profils disponibles et proposer un classement
argumenté. **La décision finale reste humaine.**

Interface entièrement en français.

---

## 1. État actuel du projet

Le projet est construit **étape par étape**, à votre validation.

| Étape | Fonctionnalité | État |
| --- | --- | --- |
| 1 | Page d'accueil, import de plusieurs syllabi (PDF/Word), enregistrement en base | **Livrée** |
| 2 | Analyse du syllabus par l'IA et extraction des compétences visées | À venir |
| 3 | Définition du profil enseignant recherché et des critères de matching | À venir |
| 4 | Recherche externe d'enseignants (sources autorisées) et analyse des CV | À venir |
| 5 | Classement automatique avec scores et justifications | À venir |

### Ce que fait l'étape 1

- Affiche une page d'accueil Teacher Match.
- Propose un formulaire d'import d'un ou plusieurs syllabi au format PDF ou Word.
- Permet de sélectionner **plusieurs documents en une seule fois** (clic ou
  glisser-déposer), jusqu'à 10 par envoi.
- Valide chaque document côté serveur (extension, type MIME, signature du
  fichier, taille).
- Enregistre chaque syllabus **individuellement** dans PostgreSQL, contenu
  binaire compris, pour permettre son analyse ultérieure.
- Regroupe les documents importés ensemble dans une même « demande » datée.
- Affiche un message confirmant l'importation, avec la liste des documents
  enregistrés et la référence de chacun.
- Affiche la liste des syllabi déjà importés et l'historique des demandes.

### Ce que l'étape 1 ne fait pas encore

- Aucune analyse du syllabus par l'IA n'est déclenchée : le bouton
  « Générer le classement » enregistre les documents et prépare la suite.
- Aucune recherche externe d'enseignants, aucun classement de profils.
- La page « Résultats » affiche l'emplacement des futures sections.

---

## 2. Pile technique

- **Node.js 20+** et **Express** (serveur HTTP).
- Pages **HTML / CSS / JavaScript** sans framework lourd.
- **PostgreSQL** via la variable d'environnement `DATABASE_URL`.
- **API Anthropic (Claude)** — appelée **côté serveur uniquement**, clé lue dans
  `ANTHROPIC_API_KEY`. La dépendance est déjà installée : l'appel sera ajouté à
  l'étape 2. Le navigateur ne parle jamais directement au modèle.
- Déploiement sur **Railway** depuis un dépôt **GitHub**.

---

## 3. Arborescence du dépôt

Tous les chemins sont **relatifs à la racine du dépôt GitHub**.

```
.
├── .env.example              Modèle des variables (aucune valeur réelle)
├── .gitignore                Exclut .env, node_modules, données locales
├── package.json              Dépendances + script "start"
├── railway.json              Configuration de déploiement Railway
├── README.md                 Ce document
├── public/                   Interface (servie telle quelle par Express)
│   ├── index.html            Page d'accueil : formulaire d'import
│   ├── resultats.html        Page résultats (étape 5)
│   ├── historique.html       Page historique des demandes
│   ├── styles.css            Feuille de style unique
│   ├── accueil.js            Sélection des fichiers + envoi vers l'API
│   └── historique.js         Chargement de l'historique
└── src/                      Serveur (jamais exposé au navigateur)
    ├── server.js             Point d'entrée : Express, sécurité, routes
    ├── db.js                 Pool PostgreSQL + création des tables
    ├── validation.js         Validation des fichiers et des entrées
    └── routes/
        └── syllabi.js        Import, liste, téléchargement, historique
```

---

## 4. Variables à renseigner sur Railway

Dans Railway : ouvrez votre projet → cliquez sur le service → onglet
**Variables** → **New Variable**.

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | Oui | Chaîne de connexion PostgreSQL. **Ajoutée automatiquement** quand vous ajoutez le plugin PostgreSQL au projet (Référence de variable `${{Postgres.DATABASE_URL}}`). |
| `ANTHROPIC_API_KEY` | Pour l'étape 2 | Clé API Anthropic (`sk-ant-...`), créée sur console.anthropic.com. |
| `ANTHROPIC_MODEL` | Non | Modèle Claude utilisé. Par défaut `claude-3-5-sonnet-latest`. |
| `MAX_FILE_SIZE_MB` | Non | Taille maximale d'un document importé. Par défaut `10`. |
| `PORT` | Non | Railway la fournit automatiquement. Ne pas la définir à la main. |

Aucune clé n'est écrite dans le code : tout passe par ces variables
d'environnement. Le fichier `.env.example` du dépôt liste les mêmes noms, sans
aucune valeur, et `.gitignore` empêche tout fichier `.env` d'être versionné.

---

## 5. Configuration de PostgreSQL

**Sur Railway :**

1. Dans votre projet Railway, cliquez sur **+ New** → **Database** → **Add
   PostgreSQL**.
2. Attendez que le service PostgreSQL soit au statut *Active*.
3. Cliquez sur votre service applicatif → **Variables** → **New Variable** →
   **Add Reference** → choisissez `DATABASE_URL` du service PostgreSQL.
4. C'est tout : la table est créée automatiquement.

**Les tables sont créées automatiquement au démarrage** du serveur si elles
n'existent pas (`CREATE TABLE IF NOT EXISTS`). Aucune migration manuelle n'est
nécessaire. Les données déjà présentes ne sont jamais supprimées.

Tables créées :

| Table | Contenu |
| --- | --- |
| `syllabi` | Un enregistrement par syllabus importé : nom d'origine, nom de stockage, type MIME, taille, **contenu du fichier**, statut, date d'import. |
| `demandes` | Une demande = un envoi groupé : libellé, nombre de syllabi, date de la demande. |
| `demande_syllabi` | Lien entre une demande et les syllabi qu'elle contient. |
| `resultats` | Prévue pour la suite (analyse, compétences visées, profil recherché, critères, classement, sources). Créée vide. |

Pour vérifier la connexion une fois le site en ligne, ouvrez l'adresse
`https://votre-domaine.up.railway.app/health` : la réponse doit contenir
`"base_donnees":"connectee"`.

---

## 6. Configuration de l'API Anthropic

Cette configuration est **préparée mais pas encore utilisée** : l'appel au
modèle sera écrit à l'étape 2.

1. Créez un compte sur **console.anthropic.com**.
2. Section **API Keys** → **Create Key** → copiez la clé (elle ne s'affiche
   qu'une fois).
3. Sur Railway, ajoutez la variable `ANTHROPIC_API_KEY` avec cette valeur.
4. La clé ne doit **jamais** apparaître dans le dépôt GitHub, ni dans un fichier
   envoyé au navigateur. Le code lit uniquement
   `process.env.ANTHROPIC_API_KEY`, et l'appel au modèle se fera exclusivement
   dans `src/`.

Bonne pratique : créez une clé dédiée au projet et fixez un plafond de dépense
mensuel dans la console Anthropic.

---

## 7. Procédure de déploiement depuis GitHub (sans ligne de commande)

### 7.1 Créer le dépôt et déposer les fichiers

1. Connectez-vous à **github.com** → **New repository**.
2. Nom : `teacher-match`. Visibilité : *Private* de préférence (le projet
   contient du code métier). Ne cochez **pas** « Add a README file » : le dépôt
   doit rester vide.
3. **Create repository**.
4. Sur la page du dépôt vide, cliquez sur **uploading an existing file**.
5. Déposez-y les fichiers du projet **en respectant l'arborescence** :
   - les fichiers de la racine (`.env.example`, `.gitignore`, `package.json`,
     `railway.json`, `README.md`) ;
   - le contenu du dossier `public/` dans un dossier `public` ;
   - le contenu du dossier `src/` dans un dossier `src` (avec le sous-dossier
     `routes`).

   Pour créer les dossiers : dans l'interface **Add file** → **Create new
   file**, tapez `public/index.html` dans le champ du nom — GitHub crée le
   dossier automatiquement — puis collez le contenu. Répétez pour chaque
   fichier.

   *Astuce* : si vous téléchargez le projet au format ZIP, supprimez d'abord le
   dossier `node_modules` s'il existe — il ne doit jamais être déposé sur GitHub.
6. En bas de page : **Commit changes**.

### 7.2 Déployer sur Railway

1. Allez sur **railway.app** → **Start a New Project** → **Deploy from GitHub
   repo**.
2. Autorisez Railway à accéder à votre compte GitHub, puis choisissez le dépôt
   `teacher-match`.
3. Railway détecte automatiquement Node.js et lance `npm install` puis
   `npm start` (le script `start` défini dans `package.json`).
4. Ajoutez le plugin PostgreSQL (§5) et la variable `DATABASE_URL` par
   référence.
5. **Settings** → **Networking** → **Generate Domain** pour obtenir une adresse
   publique.
6. Railway redéploie automatiquement à chaque nouveau commit sur la branche
   `main`.

---

## 8. Comment tester l'application

### 8.1 Test rapide après déploiement

1. Ouvrez le domaine généré par Railway : la page d'accueil Teacher Match doit
   s'afficher.
2. Ouvrez `/health` : la réponse doit indiquer
   `"base_donnees":"connectee"`.
3. Cliquez sur **Historique** dans le menu : la page doit s'afficher et indiquer
   « Aucune demande enregistrée pour le moment ».

### 8.2 Test de l'import

1. Préparez **deux ou trois syllabi** en PDF ou Word (des fichiers de test
   suffisent).
2. Sur la page d'accueil, saisissez éventuellement un **libellé** (ex. :
   « Rentrée septembre 2027 - Master Finance »).
3. Ajoutez les documents : cliquez dans la zone de dépôt **ou** glissez-déposez
   plusieurs fichiers d'un coup.
   - Les fichiers apparaissent dans la liste avec leur taille.
   - Le bouton **Retirer** permet d'en enlever un avant l'envoi.
4. Cliquez sur **Générer le classement**.
5. **Résultat attendu** : un message vert confirme l'importation et liste chaque
   document avec sa taille, sa date d'import et sa référence.
6. Le tableau « Syllabi déjà importés » se met à jour automatiquement ; chaque
   ligne propose **Télécharger** pour récupérer le document enregistré.

### 8.3 Vérifier l'enregistrement en base

- Ouvrez la page **Historique** : une demande apparaît, datée d'aujourd'hui,
  avec le nombre de syllabi et le tableau des documents.
- Côté Railway, onglet **Data** du service PostgreSQL : les tables `syllabi`,
  `demandes` et `demande_syllabi` contiennent les lignes correspondantes.
- Téléchargez un document depuis le site et ouvrez-le : le contenu enregistré
  est identique au fichier d'origine.

### 8.4 Tests de sécurité attendus

| Test | Résultat attendu |
| --- | --- |
| Envoyer un `.txt` ou une image renommée en `.pdf` | Refusé, avec un message expliquant le motif. |
| Envoyer un fichier de plus de 10 Mo | Refusé (message sur la taille maximale). |
| Cliquer sur « Générer le classement » sans fichier | Message demandant de sélectionner au moins un document. |
| Envoyer plus de 10 documents d'un coup | Refusé (maximum 10 par import). |
| Ouvrir `/api/syllabi` dans le navigateur | Renvoie la liste des métadonnées, **jamais** le contenu des fichiers. |
| Chercher une clé ou un secret dans le code du dépôt | Aucun : tout est lu dans les variables d'environnement. |

### 8.5 Exécution en local (facultatif)

1. Installez Node.js 20 ou supérieur.
2. Dans le dossier du projet : `npm install`.
3. Copiez `.env.example` en `.env` et renseignez `DATABASE_URL` (une base
   PostgreSQL locale ou une base hébergée) et `ANTHROPIC_API_KEY`.
4. Lancez `npm start`, puis ouvrez `http://localhost:3000`.

---

## 9. Sécurité et données personnelles

- **Aucun secret dans le code** : clés et chaînes de connexion lues dans
  l'environnement ; `.env` exclu du dépôt par `.gitignore`.
- **Validation serveur systématique** : extension, type MIME, signature réelle
  du fichier (un `.txt` renommé `.pdf` est refusé), taille maximale, nombre de
  fichiers, longueur du libellé.
- **Taille limitée** sur le corps des requêtes et sur chaque fichier.
- **Jamais d'appel au modèle depuis le navigateur** : la clé Anthropic reste sur
  le serveur.
- **Noms de fichiers nettoyés** (suppression des chemins) et identifiant de
  stockage **aléatoire** : impossible de deviner ou d'écraser un document.
- **Contenus stockés en base**, hors de la racine web, et diffusés uniquement
  par la route de téléchargement contrôlée.
- **En-têtes de sécurité** : `Content-Security-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`.
- **Collecte minimale** : seuls le document, son nom, sa taille, sa date et le
  libellé facultatif sont conservés.
- **Données personnelles** : les syllabus et, plus tard, les CV contiennent des
  données personnelles. Prévoyez une durée de conservation, limitez l'accès aux
  personnes habilitées, et supprimez les documents sur demande (RGPD).
- **Sources externes** : à l'étape 4, seules des sources accessibles et
  autorisées seront utilisées, sans contourner les protections des plateformes,
  et les sources de chaque information seront conservées.
- **Pas de critère discriminatoire** dans les analyses à venir.
- **Vérification humaine** : les classements resteront indicatifs ; la décision
  finale appartient au responsable pédagogique.

---

## 10. Licence

Parcours pédagogique conçu et déployé par Caroline Gans Combe (Omnes Education,
2026). Licence CC BY-NC 4.0 :
https://creativecommons.org/licenses/by-nc/4.0/deed.fr
