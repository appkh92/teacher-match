/**
 * Teacher Match - Page historique.
 *
 * Liste les demandes d'import : libellé, date et syllabi contenus. Contenu
 * dynamique inséré via textContent uniquement (aucune injection HTML).
 */

'use strict';

(function () {
  const conteneur = document.getElementById('historique');
  const boutonRafraichir = document.getElementById('bouton-rafraichir');

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

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte !== undefined && texte !== null) el.textContent = String(texte);
    return el;
  }

  function message(texte) {
    conteneur.replaceChildren(element('p', 'vide', texte));
  }

  function afficher(corps) {
    if (!corps || !corps.ok) {
      message((corps && corps.erreur) || "Impossible de charger l'historique pour le moment.");
      return;
    }
    const demandes = corps.demandes || [];
    if (!demandes.length) {
      message("Aucune demande enregistrée pour le moment. Importez un syllabus depuis la page d'accueil.");
      return;
    }

    const fragment = document.createDocumentFragment();

    demandes.forEach(function (d) {
      const syllabi = d.syllabi || [];
      const article = element('article', 'demande');

      const entete = element('div', 'demande__entete');
      entete.appendChild(
        element('span', 'demande__titre', d.libelle && d.libelle.trim() ? d.libelle : 'Demande sans libellé')
      );
      entete.appendChild(element('span', 'demande__date', 'Demande du ' + formaterDate(d.date_demande)));
      article.appendChild(entete);

      article.appendChild(
        element('p', 'carte__aide', syllabi.length + (syllabi.length > 1 ? ' syllabi importés' : ' syllabus importé'))
      );

      if (syllabi.length) {
        const enveloppe = element('div', 'tableau-conteneur');
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const ligneTitre = document.createElement('tr');
        [
          ['Syllabus', null],
          ['Taille', 'colonne-nombre'],
          ['Statut', null],
          ["Date d'import", null],
          ['Classement', null],
        ].forEach(function (c) {
          ligneTitre.appendChild(element('th', c[1], c[0]));
        });
        thead.appendChild(ligneTitre);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        syllabi.forEach(function (s) {
          const tr = document.createElement('tr');
          tr.appendChild(element('td', null, s.nom_original));
          tr.appendChild(element('td', 'colonne-nombre', formaterTaille(s.taille_octets)));
          const tdStatut = document.createElement('td');
          tdStatut.appendChild(element('span', 'etiquette', s.statut));
          tr.appendChild(tdStatut);
          tr.appendChild(element('td', null, formaterDate(s.date_import)));
          tr.appendChild(element('td', 'vide', 'À générer'));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        enveloppe.appendChild(table);
        article.appendChild(enveloppe);
      }

      fragment.appendChild(article);
    });

    conteneur.replaceChildren(fragment);
  }

  function charger() {
    message('Chargement…');
    fetch('/api/demandes', { credentials: 'same-origin' })
      .then(function (reponse) {
        if (reponse.status === 401) {
          window.location.href = '/connexion?expire=1';
          return new Promise(function () {});
        }
        return reponse.json().catch(function () {
          return { ok: false, erreur: 'Réponse inattendue du serveur (code ' + reponse.status + ').' };
        });
      })
      .then(afficher)
      .catch(function () {
        message("Impossible de charger l'historique pour le moment.");
      });
  }

  boutonRafraichir.addEventListener('click', charger);
  charger();
})();
