// dev-tools.js
//
// Phase G manual-test tool. Lets us launch a quick free game with
// arbitrary player Elo / opponent Elo / tier / color to exercise G.2
// routing in a real game. Intentionally
// live and mutable — this file is meant to be removed or gated once the
// real ladder covers Stockfish-tier opponents.
//
// Toggle DEV_TOOLS_ENABLED to false to hide the Dev button and short-
// circuit the module.

const DevTools = (() => {

  const DEV_TOOLS_ENABLED = true;

  // Lazily captured the first time open() runs, never overwritten within a
  // session. Used by "Restore real career" so we can undo _onPlay mutations
  // no matter how many dev games were launched.
  let _realCareerSnapshot = null;

  function _inTournament() {
    if (typeof CareerFlow !== 'undefined' && CareerFlow.getMode && CareerFlow.getMode() === 'tournament') {
      return true;
    }
    if (typeof CalendarSystem !== 'undefined' && CalendarSystem.isInTournament && CalendarSystem.isInTournament()) {
      return true;
    }
    return false;
  }

  const PRESETS = {
    maia_low: {
      label:      'Maia low',
      playerElo:  800,
      oppElo:     1000,
      tier:       1,
      color:      'w',
    },
    maia_ceiling: {
      label:      'Maia ceiling',
      playerElo:  1500,
      oppElo:     1950,
      tier:       3,
      color:      'w',
    },
    stockfish_elite: {
      label:      'Stockfish elite',
      playerElo:  2200,
      oppElo:     2600,
      tier:       5,
      color:      'w',
    },
  };

  function _getFormValues() {
    return {
      playerElo:  parseInt(document.getElementById('dev-player-elo').value, 10),
      oppElo:     parseInt(document.getElementById('dev-opp-elo').value, 10),
      tier:       parseInt(document.getElementById('dev-tier').value, 10),
      color:      document.getElementById('dev-color').value,
    };
  }

  function _setFormValues(v) {
    document.getElementById('dev-player-elo').value  = v.playerElo;
    document.getElementById('dev-opp-elo').value     = v.oppElo;
    document.getElementById('dev-tier').value        = v.tier;
    document.getElementById('dev-color').value       = v.color;
  }

  function _renderPreview() {
    const v = _getFormValues();
    const preview = document.getElementById('dev-preview');
    if (!preview) return;
    if (!Number.isFinite(v.playerElo) || !Number.isFinite(v.oppElo)) {
      preview.textContent = 'Enter valid Elo values.';
      return;
    }
    const engine = v.oppElo > 2000 ? 'Stockfish' : 'Maia';
    preview.textContent =
      `Opponent Elo: ${v.oppElo}  →  ${engine}`;
  }

  function _onPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    _setFormValues(p);
    _renderPreview();
  }

  function _onPlay() {
    if (_inTournament()) {
      alert('Dev panel is disabled during a tournament — recorded game results would corrupt the current event. Finalize or leave the tournament first.');
      return;
    }

    const v = _getFormValues();
    if (!Number.isFinite(v.playerElo) || !Number.isFinite(v.oppElo)) return;

    // Mutate player state for this dev session. The one-time snapshot
    // captured in open() lets "Restore real career" undo this later.
    const st = CareerManager._rawState();
    if (st && st.player) {
      st.player.elo = v.playerElo;
      if (!st.player.settings) st.player.settings = {};
      st.player.settings.difficulty = 'realistic';
      CareerManager.save();
    }

    // Force an opponent matching the requested Elo/tier.
    UIManager.setOpponent({
      name:        'Dev Opponent',
      elo:         v.oppElo,
      title:       CareerManager.titleForElo(v.oppElo),
      tier:        v.tier,
      nationality: null,
    });

    document.getElementById('modal-dev-panel').close();

    // Show the game screen and start immediately with the chosen color.
    const screenGame = document.getElementById('screen-game');
    const screenHome = document.getElementById('screen-home');
    if (screenHome) screenHome.classList.add('hidden');
    if (screenGame) screenGame.classList.remove('hidden');

    const color = v.color === 'rand' ? (Math.random() < 0.5 ? 'w' : 'b') : v.color;
    UIManager.newGame(color);

    // Grant bonuses if checkboxes are ticked.
    if (document.getElementById('dev-grant-flow')?.checked) {
      if (typeof PuzzleSystem !== 'undefined' && PuzzleSystem.earnFlowBonus) {
        PuzzleSystem.earnFlowBonus();
        console.log('[DevTools] granted Flow bonus');
      }
    }
    if (document.getElementById('dev-grant-training')?.checked) {
      _grantTrainingBonus();
    }

    // Re-render inventory so the buttons appear immediately.
    if (typeof BonusSystem !== 'undefined' && BonusSystem.renderInventory) {
      BonusSystem.renderInventory();
    }

    console.log('[DevTools] launched game', v);
  }

  function _grantTrainingBonus() {
    if (typeof PuzzleSystem === 'undefined') return;
    const themes = PuzzleSystem.getThemes ? PuzzleSystem.getThemes() : [];
    // Pick the first theme that isn't already prepared.
    const training = CareerManager._rawState()?.training;
    if (!training || !training.trainingBonuses) return;
    let granted = false;
    for (const theme of themes) {
      const b = training.trainingBonuses[theme];
      if (b && !b.prepared) {
        b.prepared = true;
        b.usedThisGame = false;
        b.lockedUntilTournamentEnd = false;
        CareerManager.save();
        console.log('[DevTools] granted Training bonus on theme:', theme);
        granted = true;
        break;
      }
    }
    if (!granted) {
      // All themes prepared — force 'fork' as fallback.
      const b = training.trainingBonuses['fork'];
      if (b) {
        b.prepared = true;
        b.usedThisGame = false;
        CareerManager.save();
        console.log('[DevTools] granted Training bonus on fallback theme: fork');
      }
    }
  }

  function _onRestoreReal() {
    if (!_realCareerSnapshot) {
      alert('No snapshot captured yet — nothing to restore.');
      return;
    }
    const st = CareerManager._rawState();
    if (!st || !st.player) return;
    st.player.elo = _realCareerSnapshot.elo;
    if (!st.player.settings) st.player.settings = {};
    st.player.settings.difficulty = 'realistic';
    CareerManager.save();
    _setFormValues({
      playerElo:  _realCareerSnapshot.elo,
      oppElo:     1200,
      tier:       1,
      color:      'w',
    });
    _renderPreview();
    console.log('[DevTools] restored real career state', _realCareerSnapshot);
  }

  function open() {
    if (!DEV_TOOLS_ENABLED) return;
    if (_inTournament()) {
      alert('Dev panel is disabled during a tournament. Finalize or leave the tournament first.');
      return;
    }
    const st = CareerManager._rawState();

    // Capture the real career snapshot the first time we open the panel
    // in this session. Never overwrite: subsequent opens after a dev
    // launch must still be able to restore the original values.
    if (!_realCareerSnapshot && st && st.player) {
      _realCareerSnapshot = {
        elo: st.player.elo,
      };
    }

    const defaults = {
      playerElo:  (st && st.player && st.player.elo) || 800,
      oppElo:     1200,
      tier:       1,
      color:      'w',
    };
    _setFormValues(defaults);
    _renderPreview();
    document.getElementById('modal-dev-panel').showModal();
  }

  function init() {
    if (!DEV_TOOLS_ENABLED) {
      const btn = document.getElementById('btn-dev-panel');
      if (btn) btn.style.display = 'none';
      return;
    }

    const btnOpen = document.getElementById('btn-dev-panel');
    if (btnOpen) btnOpen.addEventListener('click', () => open());

    const btnClose = document.getElementById('btn-dev-close');
    if (btnClose) btnClose.addEventListener('click', () => {
      document.getElementById('modal-dev-panel').close();
    });

    const btnPlay = document.getElementById('btn-dev-play');
    if (btnPlay) btnPlay.addEventListener('click', () => _onPlay());

    const btnReset = document.getElementById('btn-dev-restore-real');
    if (btnReset) btnReset.addEventListener('click', () => _onRestoreReal());

    for (const key of Object.keys(PRESETS)) {
      const b = document.getElementById(`btn-dev-preset-${key}`);
      if (b) b.addEventListener('click', () => _onPreset(key));
    }

    for (const id of ['dev-player-elo', 'dev-opp-elo', 'dev-tier', 'dev-color']) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', _renderPreview);
      if (el) el.addEventListener('change', _renderPreview);
    }
  }

  return { init, open, DEV_TOOLS_ENABLED, PRESETS };

})();

if (typeof window !== 'undefined') {
  if (window.cl) window.cl.dev = DevTools;
  window.addEventListener('DOMContentLoaded', () => DevTools.init());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DevTools;
}
