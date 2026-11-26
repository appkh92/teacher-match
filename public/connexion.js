/**
 * Teacher Match - Page de connexion : affiche le message correspondant au
 * paramètre d'URL (erreur, déconnexion, session expirée). Aucun texte de
 * l'URL n'est injecté dans la page : seuls des messages fixes sont affichés.
 */

'use strict';

(function () {
  const conteneur = document.getElementById('messages');
  const params = new URLSearchParams(window.location.search);

  function afficher(type, texte) {
    const bloc = document.createElement('div');
    bloc.className = 'message message--' + type;
    const p = document.createElement('p');
    p.className = 'message__titre';
    p.textContent = texte;
    bloc.appendChild(p);
    conteneur.appendChild(bloc);
  }

  if (params.has('erreur')) afficher('erreur', 'Mot de passe incorrect.');
  if (params.has('deconnecte')) afficher('succes', 'Vous êtes déconnecté(e).');
  if (params.has('expire')) afficher('attention', 'Votre session a expiré. Reconnectez-vous.');
})();
