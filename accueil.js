/**
 * Teacher Match - Page d'accueil.
 *
 * Gère la sélection de plusieurs fichiers (clic ou glisser-déposer), leur
 * affichage avant envoi, puis l'envoi vers /api/syllabi.
 *
 * Aucun appel à un modèle d'IA n'est fait ici : tout passe par le serveur.
 */

'use strict';

(function () {
  const formulaire = document.getElementById('formulaire-import');
  const zoneDepot = document.getElementById('zone-depot');
  const champFichiers = document.getElementById('syllabi');
  const listeFichiers = document.getElementById('liste-fichiers');
  const conteneurMessages = document.getElementById('messages');
  const boutonGenerer = document.getElementById('bouton-generer');
  const boutonReinitialiser = document.getElementById('bouton-reinitialiser');
  const boutonRafraichir = document.getElementById('bouton-rafraichir');
  const tableauSyllabi = document.getElementById('tableau-syllabi');

  const EXTENSIONS_OK = ['pdf', 'doc', 'docx'];
  const TAILLE_MAX_MO = 10;
  const NOMBRE_MAX = 10;

  /** Sélection courante : un tableau de File. */
  let selection = [];

  // --- Utilitaires ---------------------------------------------------------

  function formaterTaille(octets) {
    if (octets < 1024) return octets + ' o';
    if (octets < 1024 * 1024) return (octets / 1024).toFixed(1).replace('.', ',') + ' Ko';
    return (octets / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  }

  function formaterDate(valeur) {
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function extensionDe(nom) {
    const point = nom.lastIndexOf('.');
    return point === -1 ? '' : nom.slice(point + 1).toLowerCase();
  }

  /** Retire les caractères qui pourraient être interprétés comme du HTML. */
  function securiser(texte) {
    const div = document.createElement('div');
    div.textContent = String(texte == null ? '' : texte);
    return div.innerHTML;
  }

  function effacerMessages() {
    conteneurMessages.innerHTML = '';
  }

  function afficherMessage(type, titre, details) {
    const bloc = document.createElement('div');
    bloc.className = 'message message--' + type;

    const paragraphe = document.createElement('p');
    paragraphe.style.margin = '0';
    paragraphe.innerHTML = '<strong>' + securiser(titre) + '</strong>';
    bloc.appendChild(paragraphe);

    if (details && details.length) {
      const ul = document.createElement('ul');
      details.forEach(function (ligne) {
        const li = document.createElement('li');
        li.textContent = ligne;
        ul.appendChild(li);
      });
      bloc.appendChild(ul);
    }

    conteneurMessages.appendChild(bloc);
  }

  // --- Affichage de la sélection ------------------------------------------

  function afficherSelection() {
    listeFichiers.innerHTML = '';

    selection.forEach(function (fichier, index) {
      const li = document.createElement('li');

      const nom = document.createElement('span');
      nom.className = 'liste-fichiers__nom';
      nom.textContent = fichier.name;

      const droite = document.createElement('span');
      droite.className = 'liste-fichiers__taille';
      droite.textContent = formaterTaille(fichier.size) + '  ';

      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'bouton bouton--discret';
      retirer.textContent = 'Retirer';
      retirer.setAttribute('aria-label', 'Retirer ' + fichier.name);
      retirer.addEventListener('click', function () {
        selection.splice(index, 1);
        afficherSelection();
      });

      droite.appendChild(retirer);
      li.appendChild(nom);
      li.appendChild(droite);
      listeFichiers.appendChild(li);
    });
  }

  // --- Ajout de fichiers (avec contrôle immédiat côté navigateur) ---------

  function ajouterFichiers(fichiersRecus) {
    const refusees = [];

    Array.from(fichiersRecus).forEach(function (fichier) {
      const ext = extensionDe(fichier.name);

      if (EXTENSIONS_OK.indexOf(ext) === -1) {
        refusees.push('« ' + fichier.name + ' » : format non accepté (PDF, DOC ou DOCX attendu).');
        return;
      }
      if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
        refusees.push('« ' + fichier.name + ' » : dépasse ' + TAILLE_MAX_MO + ' Mo.');
        return;
      }
      const dejaPresent = selection.some(function (f) {
        return f.name === fichier.name && f.size === fichier.size;
      });
      if (dejaPresent) return;

      if (selection.length >= NOMBRE_MAX) {
        refusees.push('« ' + fichier.name + ' » : maximum ' + NOMBRE_MAX + ' documents par import.');
        return;
      }

      selection.push(fichier);
    });

    afficherSelection();

    if (refusees.length) {
      effacerMessages();
      afficherMessage(
        'attention',
        refusees.length === 1 ? 'Un fichier a été écarté.' : 'Certains fichiers ont été écartés.',
        refusees
      );
    }
  }

  // --- Événements sur la zone de dépôt ------------------------------------

  champFichiers.addEventListener('change', function () {
    ajouterFichiers(champFichiers.files);
    champFichiers.value = ''; // permet de re-sélectionner le même fichier
  });

  zoneDepot.addEventListener('keydown', function (evenement) {
    if (evenement.key === 'Enter' || evenement.key === ' ') {
      evenement.preventDefault();
      champFichiers.click();
    }
  });

  ['dragenter', 'dragover'].forEach(function (nomEvenement) {
    zoneDepot.addEventListener(nomEvenement, function (evenement) {
      evenement.preventDefault();
      zoneDepot.classList.add('zone-depot--survol');
    });
  });

  ['dragleave', 'drop'].forEach(function (nomEvenement) {
    zoneDepot.addEventListener(nomEvenement, function (evenement) {
      evenement.preventDefault();
      zoneDepot.classList.remove('zone-depot--survol');
    });
  });

  zoneDepot.addEventListener('drop', function (evenement) {
    if (evenement.dataTransfer && evenement.dataTransfer.files) {
      ajouterFichiers(evenement.dataTransfer.files);
    }
  });

  // --- Envoi du formulaire ------------------------------------------------

  formulaire.addEventListener('submit', function (evenement) {
    evenement.preventDefault();
    effacerMessages();

    if (selection.length === 0) {
      afficherMessage(
        'erreur',
        'Aucun document sélectionné.',
        ['Sélectionnez au moins un syllabus au format PDF, DOC ou DOCX.']
      );
      return;
    }

    const donnees = new FormData();
    const libelle = document.getElementById('libelle').value.trim();
    if (libelle) donnees.append('libelle', libelle);
    selection.forEach(function (fichier) {
      donnees.append('syllabi', fichier, fichier.name);
    });

    boutonGenerer.disabled = true;
    boutonGenerer.textContent = 'Import en cours…';

    fetch('/api/syllabi', { method: 'POST', body: donnees })
      .then(function (reponse) {
        return reponse.json().then(function (corps) {
          return { statut: reponse.status, corps: corps };
        });
      })
      .then(function (resultat) {
        const corps = resultat.corps || {};

        if (resultat.statut >= 200 && resultat.statut < 300 && corps.ok) {
          const details = (corps.importes || []).map(function (s) {
            return (
              s.nom_original +
              ' — ' +
              formaterTaille(s.taille_octets) +
              ' — importé le ' +
              formaterDate(s.date_import) +
              ' (référence n° ' +
              s.id +
              ')'
            );
          });

          afficherMessage('succes', corps.message || 'Import réussi.', details);

          if (corps.refuses && corps.refuses.length) {
            afficherMessage(
              'attention',
              'Documents non enregistrés :',
              corps.refuses.map(function (r) {
                return r.nom + ' — ' + r.motif;
              })
            );
          }

          selection = [];
          afficherSelection();
          formulaire.reset();
          chargerSyllabi();
        } else {
          const details = (corps.refuses || []).map(function (r) {
            return r.nom + ' — ' + r.motif;
          });
          afficherMessage(
            'erreur',
            corps.erreur || "L'import a échoué.",
            details
          );
        }
      })
      .catch(function () {
        afficherMessage('erreur', "Impossible de joindre le serveur.", [
          'Vérifiez votre connexion puis réessayez.',
        ]);
      })
      .finally(function () {
        boutonGenerer.disabled = false;
        boutonGenerer.textContent = 'Générer le classement';
      });
  });

  boutonReinitialiser.addEventListener('click', function () {
    selection = [];
    formulaire.reset();
    afficherSelection();
    effacerMessages();
  });

  // --- Liste des syllabi déjà importés ------------------------------------

  function chargerSyllabi() {
    tableauSyllabi.innerHTML = '<p class="vide">Chargement…</p>';

    fetch('/api/syllabi')
      .then(function (reponse) {
        return reponse.json();
      })
      .then(function (corps) {
        if (!corps.ok || !corps.syllabi || corps.syllabi.length === 0) {
          tableauSyllabi.innerHTML =
            '<p class="vide">Aucun syllabus importé pour le moment.</p>';
          return;
        }

        let html = '<table><thead><tr>';
        html += '<th>Document</th><th>Format</th><th class="colonne-nombre">Taille</th>';
        html += '<th>Statut</th><th>Date d\'import</th><th></th>';
        html += '</tr></thead><tbody>';

        corps.syllabi.forEach(function (s) {
          const extension = extensionDe(s.nom_original).toUpperCase() || '—';
          html += '<tr>';
          html += '<td>' + securiser(s.nom_original) + '</td>';
          html += '<td>' + securiser(extension) + '</td>';
          html += '<td class="colonne-nombre">' + formaterTaille(s.taille_octets) + '</td>';
          html += '<td><span class="etiquette">' + securiser(s.statut) + '</span></td>';
          html += '<td>' + formaterDate(s.date_import) + '</td>';
          html +=
            '<td><a href="/api/syllabi/' +
            encodeURIComponent(s.id) +
            '/fichier">Télécharger</a></td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        tableauSyllabi.innerHTML = html;
      })
      .catch(function () {
        tableauSyllabi.innerHTML =
          '<p class="vide">Impossible de charger la liste des syllabi.</p>';
      });
  }

  boutonRafraichir.addEventListener('click', chargerSyllabi);

  chargerSyllabi();
})();
