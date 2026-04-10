// ui-career.js
//
// All career-related screens (home, inbox, staff, finance, tournament
// lobby, …). Phase B.4 ships only the home screen — every other
// sub-namespace is added in its own phase.
//
// Architecture:
//   - UICareer.init()              binds buttons and renders home once
//   - UICareer.showScreen(name)    central router for career screens
//   - UICareer.home.render()       refreshes the home screen DOM
//   - UICareer.home.onContinue()   click handler for the Continue button
//   - UICareer.home.onEventDismiss() handler for the event prompt modal
//
// All DOM access lives here. All time/event logic lives in
// CalendarSystem. UICareer never touches state directly — it reads
// CareerManager via domain accessors and writes nothing (state
// mutations happen through system modules).

const UICareer = (() => {

  // ── Screen router ─────────────────────────────────────────

  const SCREENS = ['character', 'home', 'game'];

  function _showScreen(name) {
    if (!SCREENS.includes(name)) {
      throw new Error(`[UICareer] Unknown screen: ${name}`);
    }
    SCREENS.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    });
  }

  // ── Home screen ───────────────────────────────────────────

  const home = {

    /** Refresh every part of the home screen from current state. */
    render() {
      this._renderHeader();
      this._renderCalendar();
      this._renderUpcoming();
    },

    _renderHeader() {
      const player   = CareerManager.player.get();
      const finances = CareerManager.finances.get();
      const focus    = CareerManager.focus.get();

      const nameEl   = document.getElementById('career-player-name');
      const metaEl   = document.getElementById('career-player-meta');
      const avatarEl = document.getElementById('career-avatar');
      const eloEl    = document.getElementById('career-elo');
      const focusEl  = document.getElementById('career-focus');
      const moneyEl  = document.getElementById('career-money');

      if (nameEl) nameEl.textContent = player.playerName || 'Player';
      if (metaEl) {
        const country = (typeof CharacterCreator !== 'undefined')
          ? CharacterCreator.COUNTRIES.find((c) => c.code === player.nationality)
          : null;
        metaEl.textContent = country
          ? `${country.flag} ${country.name}`
          : (player.nationality || '—');
      }
      if (avatarEl) this._renderAvatarInto(avatarEl, player.avatar);
      if (eloEl)   eloEl.textContent   = player.elo;
      if (focusEl) focusEl.textContent = `${Math.round(focus.current)}%`;
      if (moneyEl) moneyEl.textContent = `$ ${finances.money}`;
    },

    /**
     * Render the player's avatar layers into a small box. Uses the
     * same placeholder shape technique as the character creator so
     * the home and creator stay visually consistent.
     */
    _renderAvatarInto(rootEl, avatarRaw) {
      if (typeof AvatarData === 'undefined') {
        rootEl.textContent = '?';
        return;
      }
      const a = AvatarData.normalize(avatarRaw);
      const skin   = AvatarData.SKIN_TONES[a.skinTone];
      const hairC  = AvatarData.HAIR_COLORS[a.hairColor];
      const hairS  = AvatarData.HAIR_STYLES[a.hairStyle];
      const eyes   = AvatarData.EYE_COLORS[a.eyeColor];
      const face   = AvatarData.FACE_SHAPES[a.faceShape];
      const outfit = AvatarData.OUTFITS[a.outfit];

      // Scale the hair height to fit the mini renderer (max ~10px)
      const miniHairHeight = Math.max(4, Math.round(hairS.height * 0.45));

      rootEl.innerHTML = `
        <div class="career-avatar-mini">
          <div class="career-avatar-mini-hair"
               style="height:${miniHairHeight}px;background:${hairC};"></div>
          <div class="career-avatar-mini-face"
               style="background:${skin};border-radius:${face.borderRadius};">
            <div class="career-avatar-mini-eye" style="background:${eyes};"></div>
            <div class="career-avatar-mini-eye" style="background:${eyes};"></div>
          </div>
          <div class="career-avatar-mini-outfit" style="background:${outfit};"></div>
        </div>
      `;
    },

    _renderCalendar() {
      const today = CalendarSystem.getDate();
      const titleEl   = document.getElementById('career-calendar-title');
      const todayEl   = document.getElementById('career-calendar-today');
      const gridEl    = document.getElementById('career-calendar-grid');
      if (!gridEl) return;

      // Title and "today" label (with day-of-week prefix)
      const monthName = CalendarSystem.formatDate(today).split(' ')[0]; // "April"
      if (titleEl) titleEl.textContent = `${monthName} ${today.year}`;
      if (todayEl) {
        const dow = CalendarSystem.getDayOfWeekName(today);
        todayEl.textContent = `Today: ${dow}, ${CalendarSystem.formatDate(today)}`;
      }

      // Build a set of days that have events this month for quick lookup
      const eventDays = new Set();
      const upcoming = CalendarSystem.getUpcomingEvents(50);
      for (const ev of upcoming) {
        if (ev.date.year === today.year && ev.date.month === today.month) {
          eventDays.add(ev.date.day);
        }
      }

      gridEl.innerHTML = '';

      // Day-of-week headers (Mon → Sun, ISO 8601)
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (const dow of dows) {
        const cell = document.createElement('div');
        cell.className   = 'career-cal-dow';
        cell.textContent = dow;
        gridEl.appendChild(cell);
      }

      // Leading empty cells for days before the 1st
      const firstOfMonth = { year: today.year, month: today.month, day: 1 };
      const firstDow     = CalendarSystem.getDayOfWeek(firstOfMonth); // 0 = Mon
      for (let i = 0; i < firstDow; i++) {
        const cell = document.createElement('div');
        cell.className = 'career-cal-day empty';
        gridEl.appendChild(cell);
      }

      // Day cells
      const totalDays = CalendarSystem.getDaysInMonth(today.year, today.month);
      for (let d = 1; d <= totalDays; d++) {
        const cell = document.createElement('div');
        cell.className = 'career-cal-day';
        if (d === today.day) cell.classList.add('today');
        if (eventDays.has(d)) cell.classList.add('has-event');
        cell.textContent = String(d);
        gridEl.appendChild(cell);
      }
    },

    _renderUpcoming() {
      const listEl = document.getElementById('career-upcoming-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      const upcoming = CalendarSystem.getUpcomingEvents(5);
      if (upcoming.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'career-upcoming-empty';
        empty.textContent = 'No events scheduled.';
        listEl.appendChild(empty);
        return;
      }

      for (const ev of upcoming) {
        const row = document.createElement('div');
        row.className = 'career-upcoming-item';

        const label = document.createElement('span');
        label.className   = 'career-upcoming-label';
        label.textContent = ev.label || ev.type;

        const date = document.createElement('span');
        date.className   = 'career-upcoming-date';
        date.textContent = CalendarSystem.formatDate(ev.date);

        row.appendChild(label);
        row.appendChild(date);
        listEl.appendChild(row);
      }
    },

    /** Continue button handler. */
    onContinue() {
      if (!CalendarSystem.isIdle()) return;

      const btn      = document.getElementById('btn-continue');
      const statusEl = document.getElementById('career-continue-status');

      // Brief visual lock so a double-click doesn't queue two advances
      if (btn) btn.disabled = true;

      if (typeof SoundManager !== 'undefined') SoundManager.playMove();

      const result = CalendarSystem.continue();
      this.render();

      if (result.stoppedBy === 'event') {
        this._openEventPrompt(result.event);
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.classList.remove('warn');
        }
      } else if (result.stoppedBy === 'limit') {
        if (statusEl) {
          statusEl.textContent = `No events scheduled — skipped ${result.daysAdvanced} days.`;
          statusEl.classList.add('warn');
        }
      }

      if (btn) {
        setTimeout(() => { btn.disabled = false; }, 200);
      }
    },

    _openEventPrompt(ev) {
      const titleEl = document.getElementById('event-prompt-title');
      const dateEl  = document.getElementById('event-prompt-date');
      const bodyEl  = document.getElementById('event-prompt-body');
      const modal   = document.getElementById('modal-event-prompt');

      if (titleEl) titleEl.textContent = ev.label || ev.type;
      if (dateEl)  dateEl.textContent  = CalendarSystem.formatDate(ev.date);
      if (bodyEl)  bodyEl.textContent  = `Event type: ${ev.type}`;

      if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
      if (modal) modal.showModal();
    },

    onEventDismiss() {
      const modal = document.getElementById('modal-event-prompt');
      if (modal) modal.close();
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      if (CalendarSystem.isEventPrompt()) {
        CalendarSystem.consumeCurrentEvent();
      }
      this.render();
    },

  };

  // ── Bindings ──────────────────────────────────────────────

  function _bindButtons() {
    const btnContinue = document.getElementById('btn-continue');
    if (btnContinue) btnContinue.addEventListener('click', () => home.onContinue());

    const btnDismiss = document.getElementById('btn-event-dismiss');
    if (btnDismiss) btnDismiss.addEventListener('click', () => home.onEventDismiss());

    // Dev / test row — removed in Phase C when real tournaments exist
    const btnPlay = document.getElementById('btn-play-test-game');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (!MaiaEngine.isReady()) return;
        _showScreen('game');
        // Open the color choice modal so the user picks a side
        const modal = document.getElementById('modal-color-choice');
        if (modal) modal.showModal();
      });
    }

    const btnReset = document.getElementById('btn-reset-career');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        const ok = window.confirm('Reset career? All progress will be lost.');
        if (!ok) return;
        if (typeof SoundManager !== 'undefined') SoundManager.playBlunder();
        CareerManager.reset();
        location.reload();
      });
    }

    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) {
      btnBackHome.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playMove();
        CareerManager.focus.sync();
        _showScreen('home');
        home.render();
      });
    }
  }

  // ── Public API ────────────────────────────────────────────

  return {
    init() {
      _bindButtons();
      home.render();
    },

    showScreen: _showScreen,

    home,
  };

})();

// Debug global
if (typeof window !== 'undefined' && window.cl) {
  window.cl.ui = UICareer;
}
