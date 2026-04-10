// save-manager.js
// JSON serialization to localStorage. Pure black box — no DOM access.

const SaveManager = (() => {
  const KEY = 'chess_life_career_v2';

  function _isAvailable() {
    try {
      localStorage.setItem('__cl_test__', '1');
      localStorage.removeItem('__cl_test__');
      return true;
    } catch (e) {
      console.warn('[SaveManager] localStorage unavailable — private browsing or quota exceeded.', e);
      return false;
    }
  }

  return {

    save(state) {
      if (!_isAvailable()) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error('[SaveManager] Save error:', e);
        return false;
      }
    },

    load() {
      if (!_isAvailable()) return null;
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('[SaveManager] Corrupted data — save ignored:', e);
        return null;
      }
    },

    hasSave() {
      if (!_isAvailable()) return false;
      return localStorage.getItem(KEY) !== null;
    },

    deleteSave() {
      if (!_isAvailable()) return;
      try {
        localStorage.removeItem(KEY);
      } catch (e) {
        console.error('[SaveManager] Delete error:', e);
      }
    },

  };
})();
