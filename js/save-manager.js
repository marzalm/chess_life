// save-manager.js
// Sérialisation JSON dans localStorage. Boîte noire pure — aucun accès au DOM.

const SaveManager = (() => {
  const KEY = 'chess_life_career_v1';

  function _isAvailable() {
    try {
      localStorage.setItem('__cl_test__', '1');
      localStorage.removeItem('__cl_test__');
      return true;
    } catch (e) {
      console.warn('[SaveManager] localStorage indisponible — navigation privée ou quota dépassé.', e);
      return false;
    }
  }

  return {

    /**
     * Sauvegarde l'état complet en JSON.
     * @param {object} state
     * @returns {boolean} true si succès
     */
    save(state) {
      if (!_isAvailable()) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error('[SaveManager] Erreur save :', e);
        return false;
      }
    },

    /**
     * Charge et désérialise l'état sauvegardé.
     * @returns {object|null} null si aucune save ou données corrompues
     */
    load() {
      if (!_isAvailable()) return null;
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('[SaveManager] Données corrompues — save ignoré :', e);
        return null;
      }
    },

    /**
     * Indique si une sauvegarde valide existe.
     * @returns {boolean}
     */
    hasSave() {
      if (!_isAvailable()) return false;
      return localStorage.getItem(KEY) !== null;
    },

    /**
     * Supprime la sauvegarde (reset de carrière).
     */
    deleteSave() {
      if (!_isAvailable()) return;
      try {
        localStorage.removeItem(KEY);
      } catch (e) {
        console.error('[SaveManager] Erreur deleteSave :', e);
      }
    },

  };
})();
