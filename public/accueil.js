/**
 * Teacher Match - Page d'accueil.
 *
 * Sélection de plusieurs fichiers (clic ou glisser-déposer), affichage avant
 * envoi, envoi vers /api/syllabi, liste des syllabi importés avec
 * téléchargement et suppression. Tout le contenu dynamique est inséré via
 * textContent (aucune injection HTML possible).
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
  let tailleMaxMo = 10;
  let nombreMax = 10;

  /** Sélection courante : un tableau de File. */
  let selection = [];

  // --- Utilitaires ---------------------------------------------------------

  function formaterTaille(octets) {
    if (octets == null) return '—';
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
    const texte = String(nom || '');
    const point = texte.lastIndexOf('.');
    return point === -1 ? '' : texte.slice(point + 1).toLowerCase();
  }

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte !== undefined && texte !== null) el.textContent = String(texte);
    return el;
  }

  /**
   * Appel à l'API : gère la session expirée (redirection vers la connexion)
   * et les réponses qui ne sont pas du JSON (erreur du proxy, par exemple).
   */
  function appelApi(url, options) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (reponse) {
      if (reponse.status === 401) {
        window.location.href = '/connexion?expire=1';
        return new Promise(function () {});
      }
      return reponse
        .json()
        .catch(function () {
          return { ok: false, erreur: 'Réponse inattendue du serveur (code ' + reponse.status + ').' };
        })
        .then(function (corps) {
          return { statut: reponse.status, corps: corps || {} };
        });
    });
  }

  function effacerMessages() {
    conteneurMessages.replaceChildren();
  }

  function afficherMessage(type, titre, details) {
    const bloc = element('div', 'message message--' + type);
    const paragraphe = element('p', 'message__titre');
    paragraphe.appendChild(element('strong', null, titre));
    bloc.appendChild(paragraphe);

    if (details && details.length) {
      const ul = document.createElement('ul');
      details.forEach(function (ligne) {
        ul.appendChild(element('li', null, ligne));
      });
      bloc.appendChild(ul);
    }
    conteneurMessages.appendChild(bloc);
  }

  // --- Limites définies par le serveur -------------------------------------

  appelApi('/api/config').then(function (r) {
    if (r.corps && r.corps.ok) {
      tailleMaxMo = Number(r.corps.taille_max_mo) || tailleMaxMo;
      nombreMax = Number(r.corps.nombre_max_fichiers) || nombreMax;
      const spanNombre = document.getElementById('limite-nombre');
      const spanTaille = document.getElementById('limite-taille');
      if (spanNombre) spanNombre.textContent = String(nombreMax);
      if (spanTaille) spanTaille.textContent = String(tailleMaxMo);
    }
  }).catch(function () {});

  // --- Affichage de la sélection ------------------------------------------

  function afficherSelection() {
    listeFichiers.replaceChildren();

    selection.forEach(function (fichier, index) {
      const li = document.createElement('li');
      const nom = element('span', 'liste-fichiers__nom', fichier.name);
      const droite = element('span', 'liste-fichiers__taille', formaterTaille(fichier.size) + '  ');

      const retirer = element('button', 'bouton bouton--discret', 'Retirer');
      retirer.type = 'button';
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

  // --- Ajout de fichiers (contrôle immédiat, revérifié par le serveur) ----

  function ajouterFichiers(fichiersRecus) {
    const refusees = [];

    Array.from(fichiersRecus).forEach(function (fichier) {
      const ext = extensionDe(fichier.name);

      if (EXTENSIONS_OK.indexOf(ext) === -1) {
        refusees.push('« ' + fichier.name + ' » : format non accepté (PDF, DOC ou DOCX attendu).');
        return;
      }
      if (fichier.size === 0) {
        refusees.push('« ' + fichier.name + ' » : fichier vide.');
        return;
      }
      if (fichier.size > tailleMaxMo * 1024 * 1024) {
        refusees.push('« ' + fichier.name + ' » : dépasse ' + tailleMaxMo + ' Mo.');
        return;
      }
      const dejaPresent = selection.some(function (f) {
        return f.name === fichier.name && f.size === fichier.size;
      });
      if (dejaPresent) return;

      if (selection.length >= nombreMax) {
        refusees.push('« ' + fichier.name + ' » : maximum ' + nombreMax + ' documents par import.');
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

  // --- Zone de dépôt --------------------------------------------------------

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
      afficherMessage('erreur', 'Aucun document sélectionné.', [
        'Sélectionnez au moins un syllabus au format PDF, DOC ou DOCX.',
      ]);
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

    appelApi('/api/syllabi', { method: 'POST', body: donnees })
      .then(function (resultat) {
        const corps = resultat.corps;

        if (resultat.statut >= 200 && resultat.statut < 300 && corps.ok) {
          const details = (corps.importes || []).map(function (s) {
            return (
              s.nom_original + ' — ' + formaterTaille(s.taille_octets) +
              ' — importé le ' + formaterDate(s.date_import) + ' (référence n° ' + s.id + ')'
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
          afficherMessage('erreur', corps.erreur || "L'import a échoué.", details);
        }
      })
      .catch(function () {
        afficherMessage('erreur', 'Impossible de joindre le serveur.', ['Vérifiez votre connexion puis réessayez.']);
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

  function messageTableau(texte) {
    tableauSyllabi.replaceChildren(element('p', 'vide', texte));
  }

  function supprimer(syllabus) {
    const confirme = window.confirm(
      'Supprimer définitivement « ' + syllabus.nom_original + ' » ?\nCette action est irréversible.'
    );
    if (!confirme) return;

    appelApi('/api/syllabi/' + encodeURIComponent(syllabus.id), { method: 'DELETE' })
      .then(function (r) {
        effacerMessages();
        if (r.corps.ok) {
          afficherMessage('succes', r.corps.message || 'Syllabus supprimé.');
        } else {
          afficherMessage('erreur', r.corps.erreur || 'La suppression a échoué.');
        }
        chargerSyllabi();
      })
      .catch(function () {
        afficherMessage('erreur', 'Impossible de joindre le serveur.');
      });
  }

  function chargerSyllabi() {
    messageTableau('Chargement…');

    appelApi('/api/syllabi')
      .then(function (r) {
        const corps = r.corps;
        if (!corps.ok) {
          messageTableau(corps.erreur || 'Impossible de charger la liste des syllabi.');
          return;
        }
        if (!corps.syllabi || corps.syllabi.length === 0) {
          messageTableau('Aucun syllabus importé pour le moment.');
          return;
        }

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const ligneTitre = document.createElement('tr');
        [
          ['Document', null],
          ['Format', null],
          ['Taille', 'colonne-nombre'],
          ['Statut', null],
          ["Date d'import", null],
          ['Actions', null],
        ].forEach(function (c) {
          ligneTitre.appendChild(element('th', c[1], c[0]));
        });
        thead.appendChild(ligneTitre);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        corps.syllabi.forEach(function (s) {
          const tr = document.createElement('tr');
          tr.appendChild(element('td', null, s.nom_original));
          tr.appendChild(element('td', null, extensionDe(s.nom_original).toUpperCase() || '—'));
          tr.appendChild(element('td', 'colonne-nombre', formaterTaille(s.taille_octets)));

          const tdStatut = document.createElement('td');
          tdStatut.appendChild(element('span', 'etiquette', s.statut));
          tr.appendChild(tdStatut);

          tr.appendChild(element('td', null, formaterDate(s.date_import)));

          const tdActions = element('td', 'colonne-actions');
          const lien = element('a', null, 'Télécharger');
          lien.href = '/api/syllabi/' + encodeURIComponent(s.id) + '/fichier';
          tdActions.appendChild(lien);

          const boutonSupprimer = element('button', 'bouton bouton--discret bouton--danger', 'Supprimer');
          boutonSupprimer.type = 'button';
          boutonSupprimer.setAttribute('aria-label', 'Supprimer ' + s.nom_original);
          boutonSupprimer.addEventListener('click', function () {
            supprimer(s);
          });
          tdActions.appendChild(boutonSupprimer);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableauSyllabi.replaceChildren(table);
      })
      .catch(function () {
        messageTableau('Impossible de charger la liste des syllabi.');
      });
  }

  boutonRafraichir.addEventListener('click', chargerSyllabi);
  chargerSyllabi();
})();
