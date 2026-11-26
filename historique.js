/**
 * Teacher Match - Page historique.
 *
 * Liste les demandes d'import : libellé, date, et les syllabi qu'elles
 * contiennent. Les classements générés apparaîtront ici une fois l'analyse
 * par l'IA développée.
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

  function securiser(texte) {
    const div = document.createElement('div');
    div.textContent = String(texte == null ? '' : texte);
    return div.innerHTML;
  }

  function afficher(corps) {
    const demandes = (corps && corps.demandes) || [];

    if (!demandes.length) {
      conteneur.innerHTML =
        '<p class="vide">Aucune demande enregistrée pour le moment. Importez un syllabus depuis la page d\'accueil.</p>';
      return;
    }

    let html = '';
    demandes.forEach(function (d) {
      const syllabi = d.syllabi || [];

      html += '<article class="demande">';
      html += '<div class="demande__entete">';
      html +=
        '<span class="demande__titre">' +
        securiser(d.libelle && d.libelle.trim() ? d.libelle : 'Demande sans libellé') +
        '</span>';
      html += '<span class="demande__date">Demande du ' + formaterDate(d.date_demande) + '</span>';
      html += '</div>';

      html +=
        '<p class="carte__aide">' +
        syllabi.length +
        (syllabi.length > 1 ? ' syllabi importés' : ' syllabus importé') +
        '</p>';

      if (syllabi.length) {
        html += '<div class="tableau-conteneur"><table><thead><tr>';
        html += '<th>Syllabus</th><th class="colonne-nombre">Taille</th><th>Statut</th>';
        html += '<th>Date d\'import</th><th>Classement</th></tr></thead><tbody>';

        syllabi.forEach(function (s) {
          html += '<tr>';
          html += '<td>' + securiser(s.nom_original) + '</td>';
          html += '<td class="colonne-nombre">' + formaterTaille(s.taille_octets) + '</td>';
          html += '<td><span class="etiquette">' + securiser(s.statut) + '</span></td>';
          html += '<td>' + formaterDate(s.date_import) + '</td>';
          html += '<td class="vide">À générer</td>';
          html += '</tr>';
        });

        html += '</tbody></table></div>';
      }

      html += '</article>';
    });

    conteneur.innerHTML = html;
  }

  function charger() {
    conteneur.innerHTML = '<p class="vide">Chargement…</p>';

    fetch('/api/demandes')
      .then(function (reponse) {
        return reponse.json();
      })
      .then(afficher)
      .catch(function () {
        conteneur.innerHTML =
          '<p class="vide">Impossible de charger l\'historique pour le moment.</p>';
      });
  }

  boutonRafraichir.addEventListener('click', charger);
  charger();
})();
