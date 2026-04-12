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

  const SIMULATE_TOAST_MS = 900;
  const TRAINING_PUZZLE_OPPONENT_DELAY_MS = 500;

  // ── Screen router ─────────────────────────────────────────

  const SCREENS = ['character', 'home', 'lobby', 'inbox', 'coaches', 'training', 'tournament', 'game'];

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
      this.renderCoachButton();
      this.renderTrainingButton();
      this.renderInboxBadge();
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

    renderInboxBadge() {
      const badgeEl = document.getElementById('career-inbox-badge');
      if (!badgeEl) return;
      const unread = InboxSystem.getUnreadCount();
      if (unread > 0) {
        badgeEl.textContent = String(unread);
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.textContent = '0';
        badgeEl.classList.add('hidden');
      }
    },

    renderCoachButton() {
      const labelEl = document.getElementById('career-coach-button-label');
      const noteEl = document.getElementById('career-current-coach-name');
      if (!labelEl || !noteEl) return;

      const coach = (typeof StaffSystem !== 'undefined' && StaffSystem.getCurrentCoach)
        ? StaffSystem.getCurrentCoach()
        : null;

      if (!coach) {
        labelEl.textContent = '👨‍🏫 Hire a coach';
        noteEl.textContent = '';
        noteEl.classList.add('hidden');
        return;
      }

      labelEl.textContent = '👨‍🏫 Your coach';
      noteEl.textContent = `${coach.title} ${coach.name} · $${coach.weeklyCost}/week`;
      noteEl.classList.remove('hidden');
    },

    renderTrainingButton() {
      const labelEl = document.getElementById('career-training-button-label');
      const noteEl = document.getElementById('career-training-button-note');
      if (!labelEl || !noteEl || typeof PuzzleSystem === 'undefined') return;

      const prepared = PuzzleSystem.getPreparedThemes();
      labelEl.textContent = '🏋️ Train';

      if (prepared.length === 0) {
        noteEl.textContent = 'No prepared themes';
        noteEl.classList.add('hidden');
        return;
      }

      const labels = prepared
        .slice(0, 3)
        .map((theme) => PuzzleSystem.getThemeLabel(theme))
        .join(', ');
      const suffix = prepared.length > 3 ? ` +${prepared.length - 3}` : '';
      noteEl.textContent = `Prepared: ${labels}${suffix}`;
      noteEl.classList.remove('hidden');
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

      if (bodyEl) {
        if (ev.type === 'tournament_start' && ev.payload) {
          const p = ev.payload;
          bodyEl.textContent =
            `${p.rounds}-round Swiss in ${p.city || '—'}, ${p.country || ''}. ` +
            `Spans ${p.duration || '?'} days. ` +
            `Click OK to play it through (auto-played for now — C.3b will let you play each round on the board).`;
        } else {
          bodyEl.textContent = `Event type: ${ev.type}`;
        }
      }

      if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
      if (modal) modal.showModal();
    },

    onEventDismiss() {
      const modal = document.getElementById('modal-event-prompt');
      if (modal) modal.close();
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();

      if (CalendarSystem.isEventPrompt()) {
        const ev = CalendarSystem.getCurrentEvent();
        const isTournament = ev && ev.type === 'tournament_start';
        CalendarSystem.consumeCurrentEvent();

        if (isTournament) {
          this._enterTournament(ev);
          return;
        }
      }
      this.render();
    },

    /**
     * Handle a tournament_start event: start the tournament in the
     * system, switch the UI into tournament mode, and show the
     * in-tournament screen.
     */
    _enterTournament(ev) {
      try {
        TournamentSystem.startTournament(ev.payload);
        CareerFlow.enterTournamentMode();
        _showScreen('tournament');
        tournament.render();
        if (typeof SoundManager !== 'undefined') {
          SoundManager.playFlowEnter(1);
        }
      } catch (e) {
        console.error('[Tournament] Failed to enter:', e);
      }
    },

  };

  // ── Inbox screen ───────────────────────────────────────────

  let _selectedMailId = null;

  const inbox = {
    render() {
      let mails = InboxSystem.getAll();
      const summaryEl = document.getElementById('inbox-summary');
      if (summaryEl) {
        const unread = InboxSystem.getUnreadCount();
        summaryEl.textContent = unread === 1 ? '1 unread' : `${unread} unread`;
      }

      if (mails.length === 0) {
        _selectedMailId = null;
        this._renderList(mails, null);
        this._renderEmptyPane('No mail. Play a tournament to see the press react.');
        return;
      }

      let selected = mails.find((m) => m.id === _selectedMailId) || mails[0];
      _selectedMailId = selected.id;

      if (!selected.read) {
        InboxSystem.markRead(selected.id);
        home.renderInboxBadge();
        mails = InboxSystem.getAll();
        selected = mails.find((m) => m.id === _selectedMailId) || mails[0];
      }

      this._renderList(mails, selected.id);
      this._renderPane(selected);
    },

    _renderList(mails, selectedId) {
      const listEl = document.getElementById('inbox-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      if (mails.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'inbox-empty-state';
        empty.textContent = 'No mail. Play a tournament to see the press react.';
        listEl.appendChild(empty);
        return;
      }

      mails.forEach((mail) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'inbox-list-row ' + (mail.read ? 'read' : 'unread');
        if (mail.id === selectedId) row.classList.add('selected');
        row.addEventListener('click', () => this.onOpenMail(mail.id));

        const subject = document.createElement('div');
        subject.className = 'inbox-list-subject';
        subject.textContent = mail.subject;

        const from = document.createElement('div');
        from.className = 'inbox-list-from';
        from.textContent = mail.from;

        const date = document.createElement('div');
        date.className = 'inbox-list-date';
        date.textContent = CalendarSystem.formatDate(mail.date);

        row.appendChild(subject);
        row.appendChild(from);
        row.appendChild(date);
        listEl.appendChild(row);
      });
    },

    _renderPane(mail) {
      const emptyEl = document.getElementById('inbox-pane-empty');
      const contentEl = document.getElementById('inbox-pane-content');
      const fromEl = document.getElementById('inbox-mail-from');
      const tagEl = document.getElementById('inbox-mail-tag');
      const dateEl = document.getElementById('inbox-mail-date');
      const subjectEl = document.getElementById('inbox-mail-subject');
      const bodyEl = document.getElementById('inbox-mail-body');
      if (!contentEl || !emptyEl) return;

      emptyEl.classList.add('hidden');
      contentEl.classList.remove('hidden');

      if (fromEl) fromEl.textContent = `From: ${mail.from}`;
      if (tagEl) tagEl.textContent = mail.tag || 'mail';
      if (dateEl) dateEl.textContent = CalendarSystem.formatDate(mail.date);
      if (subjectEl) subjectEl.textContent = mail.subject;
      if (bodyEl) bodyEl.textContent = mail.body;
    },

    _renderEmptyPane(message) {
      const emptyEl = document.getElementById('inbox-pane-empty');
      const contentEl = document.getElementById('inbox-pane-content');
      if (!emptyEl || !contentEl) return;
      emptyEl.textContent = message || 'Select a mail to read.';
      emptyEl.classList.remove('hidden');
      contentEl.classList.add('hidden');
    },

    onOpenMail(id) {
      _selectedMailId = id;
      InboxSystem.markRead(id);
      home.renderInboxBadge();
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      this.render();
    },

    onBack() {
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      _showScreen('home');
      home.render();
    },
  };

  // ── Coaches screen ────────────────────────────────────────

  let _selectedCoachId = null;
  let _pendingReplaceCoachId = null;
  let _activeTrainingSession = null;
  let _trainingRuntime = null;
  let _trainingSummaryReady = false;
  let _soloPracticeResult = '';

  function _coachFlag(code) {
    return COUNTRY_FLAGS[code] || '🏳️';
  }

  function _coachDisplayName(coach) {
    return `${coach.title} ${coach.name}`;
  }

  function _themeLabelList(themes) {
    return (themes || []).map((theme) => PuzzleSystem.getThemeLabel(theme)).join(', ');
  }

  const coaches = {
    render() {
      const summaryEl = document.getElementById('coaches-summary');
      const player = CareerManager.player.get();
      const money = CareerManager.finances.get().money;
      if (summaryEl) {
        summaryEl.textContent = `You: Elo ${player.elo} · $${money} · One coach slot`;
      }

      const all = StaffSystem.getAllCoaches();
      if (!_selectedCoachId || !all.find((coach) => coach.id === _selectedCoachId)) {
        const current = StaffSystem.getCurrentCoach();
        _selectedCoachId = current ? current.id : (all[0] ? all[0].id : null);
      }

      this.renderCurrentCoach();
      this.renderBrowser();
      home.renderCoachButton();
    },

    renderCurrentCoach() {
      const panel = document.getElementById('coaches-current-panel');
      if (!panel) return;
      const coach = StaffSystem.getCurrentCoach();
      const hireDate = StaffSystem.getHireDate();

      if (!coach) {
        panel.innerHTML = `
          <div class="coaches-current-empty">
            <div>
              <div class="coaches-current-title">Current coach</div>
              <div class="coaches-current-name">No coach hired</div>
              <div class="coaches-current-note">Browse the catalog below. Hiring starts the first weekly payment immediately.</div>
            </div>
          </div>
        `;
        return;
      }

      panel.innerHTML = `
        <div class="coaches-current-hired">
          <div>
            <div class="coaches-current-title">Current coach</div>
            <div class="coaches-current-name">${_coachFlag(coach.nationality)} ${_coachDisplayName(coach)}</div>
            <div class="coaches-current-meta">$${coach.weeklyCost}/week · Since ${CalendarSystem.formatDate(hireDate)}</div>
            <div class="coaches-current-meta">Themes: ${_themeLabelList(coach.primaryThemes)}</div>
            <div class="coaches-current-meta">Bonus: +${coach.bonusMoves} Stockfish moves</div>
            <div class="coaches-current-note">${coach.background}</div>
          </div>
          <button id="btn-fire-current-coach" class="coaches-current-fire" type="button">Fire</button>
        </div>
      `;

      const btnFire = document.getElementById('btn-fire-current-coach');
      if (btnFire) btnFire.addEventListener('click', () => this.onFireCoach());
    },

    renderBrowser() {
      const grid = document.getElementById('coaches-grid');
      if (!grid) return;
      grid.innerHTML = '';
      const current = StaffSystem.getCurrentCoach();

      StaffSystem.getAllCoaches().forEach((coach) => {
        const verdict = StaffSystem.canHire(coach.id);
        const isCurrent = current && current.id === coach.id;
        const locked = verdict.reasons.includes('elo_too_low');
        const cantAfford = verdict.reasons.includes('cant_afford');

        const card = document.createElement('div');
        card.className = 'coach-card';
        if (_selectedCoachId === coach.id) card.classList.add('selected');
        if (locked) card.classList.add('locked');
        card.addEventListener('click', () => this.onSelectCoach(coach.id));

        let actionLabel = 'Hire';
        let actionDisabled = false;
        if (isCurrent) {
          actionLabel = 'Current coach';
          actionDisabled = true;
        } else if (locked) {
          actionLabel = `Requires ${coach.eloUnlock} Elo`;
          actionDisabled = true;
        } else if (cantAfford) {
          actionLabel = `Can't afford ($${coach.weeklyCost}/week)`;
          actionDisabled = true;
        } else if (current) {
          actionLabel = 'Replace';
        }

        card.innerHTML = `
          <div class="coach-card-header">
            <div class="coach-card-name">${_coachFlag(coach.nationality)} ${_coachDisplayName(coach)}</div>
            <div class="coach-card-meta">$${coach.weeklyCost}/wk</div>
          </div>
          <div class="coach-card-meta">${coach.style} · Unlock ${coach.eloUnlock}</div>
          <div class="coach-card-strengths">Themes: ${_themeLabelList(coach.primaryThemes)}</div>
          <div class="coach-card-weaknesses">Bonus: +${coach.bonusMoves} Stockfish moves</div>
          <div class="coach-card-background">${coach.background}</div>
          <div class="coach-card-status ${locked ? 'locked' : (cantAfford ? 'warn' : '')}">
            ${locked ? `Requires ${coach.eloUnlock} Elo` : (cantAfford ? `Can't afford $${coach.weeklyCost}/week` : 'Available')}
          </div>
          <button class="coach-card-action" type="button" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>
        `;

        const actionBtn = card.querySelector('.coach-card-action');
        if (actionBtn && !actionDisabled) {
          actionBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.onHireCoach(coach.id);
          });
        }

        grid.appendChild(card);
      });
    },

    onSelectCoach(coachId) {
      _selectedCoachId = coachId;
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      this.render();
    },

    onHireCoach(coachId) {
      const current = StaffSystem.getCurrentCoach();
      if (current && current.id !== coachId) {
        _pendingReplaceCoachId = coachId;
        const next = StaffSystem.getCoachById(coachId);
        const body = document.getElementById('coach-replace-body');
        const modal = document.getElementById('modal-coach-replace');
        if (body && next) {
          body.textContent =
            `Fire ${_coachDisplayName(current)} and hire ${_coachDisplayName(next)}? Weekly cost changes from $${current.weeklyCost} to $${next.weeklyCost}.`;
        }
        if (modal) modal.showModal();
        return;
      }

      const result = StaffSystem.hire(coachId);
      if (result.ok) {
        if (typeof SoundManager !== 'undefined') SoundManager.playGoodMove(2);
      } else if (typeof SoundManager !== 'undefined') {
        SoundManager.playBlunder();
      }
      this.render();
    },

    onConfirmReplace() {
      if (!_pendingReplaceCoachId) return;
      const modal = document.getElementById('modal-coach-replace');
      const result = StaffSystem.hire(_pendingReplaceCoachId);
      _pendingReplaceCoachId = null;
      if (modal) modal.close();
      if (result.ok) {
        if (typeof SoundManager !== 'undefined') SoundManager.playGoodMove(2);
      } else if (typeof SoundManager !== 'undefined') {
        SoundManager.playBlunder();
      }
      this.render();
    },

    onFireCoach() {
      const result = StaffSystem.fire();
      if (result.ok && typeof SoundManager !== 'undefined') SoundManager.playMove();
      this.render();
    },

    onBack() {
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      _showScreen('home');
      home.render();
    },
  };

  // ── Training hub ──────────────────────────────────────────

  const training = {
    _opponentReplyTimer: null,

    render() {
      const coach = typeof StaffSystem !== 'undefined' ? StaffSystem.getCurrentCoach() : null;
      const summaryEl = document.getElementById('training-summary');
      const preparedEl = document.getElementById('training-prepared');
      const coachPanel = document.getElementById('training-coach-panel');
      const selfPanel = document.getElementById('training-self-panel');
      const sessionWrap = document.getElementById('training-session');
      const summaryWrap = document.getElementById('training-session-summary');

      if (summaryEl) {
        summaryEl.textContent = coach
          ? `${_coachFlag(coach.nationality)} ${_coachDisplayName(coach)} · +${coach.bonusMoves} on ${_themeLabelList(coach.primaryThemes)}`
          : 'No coach hired. Self-training remains available on all 22 themes.';
      }

      if (preparedEl) {
        const prepared = PuzzleSystem.getPreparedThemes();
        preparedEl.textContent = prepared.length > 0
          ? `Prepared for next tournament: ${prepared.map((theme) => PuzzleSystem.getThemeLabel(theme)).join(', ')}`
          : 'No themes prepared for your next tournament yet.';
      }

      if (summaryWrap) summaryWrap.classList.toggle('hidden', !_trainingSummaryReady);
      if (sessionWrap) sessionWrap.classList.toggle('hidden', !_activeTrainingSession || _trainingSummaryReady);

      if (_trainingSummaryReady) {
        if (coachPanel) coachPanel.classList.add('hidden');
        if (selfPanel) selfPanel.classList.add('hidden');
        return;
      }

      if (_activeTrainingSession) {
        if (coachPanel) coachPanel.classList.add('hidden');
        if (selfPanel) selfPanel.classList.add('hidden');
        this._renderSession();
        return;
      }

      const coachThemes = coach && Array.isArray(coach.primaryThemes)
        ? coach.primaryThemes
        : [];
      const soloThemes = PuzzleSystem.getThemes().filter((theme) => !coachThemes.includes(theme));

      if (coachPanel) {
        if (coach) {
          coachPanel.classList.remove('hidden');
          coachPanel.innerHTML = this._buildThemePanel(
              'With your coach',
              `Coach bonus: +${coach.bonusMoves} Stockfish moves on these themes.`,
              coachThemes,
              true,
              'Start session',
            );
        } else {
          coachPanel.classList.remove('hidden');
          coachPanel.innerHTML = `
            <div class="training-panel-title">With your coach</div>
            <div class="training-panel-empty">Hire a coach to unlock guided theme sessions.</div>
          `;
        }
      }

      if (selfPanel) {
        selfPanel.classList.remove('hidden');
        selfPanel.innerHTML = this._buildSoloPracticePanel();
      }

      this.bindThemeButtons();
    },

    _buildThemePanel(title, subtitle, themes, coached, buttonLabel) {
      if (!themes.length) {
        return `
          <div class="training-panel-title">${title}</div>
          <div class="training-panel-subtitle">${subtitle}</div>
          <div class="training-panel-empty">No themes available here right now.</div>
        `;
      }

      const items = themes.map((theme) => {
        const verdict = PuzzleSystem.canStartTrainingSession(theme);
        const status = PuzzleSystem.getTrainingBonusStatus(theme);
        const disabled = !verdict.ok;
        const label = status.lockedUntilTournamentEnd
          ? 'Prepared for next tournament'
          : buttonLabel;
        return `
          <div class="training-theme-row">
            <div class="training-theme-text">
              <div class="training-theme-name">${PuzzleSystem.getThemeLabel(theme)}</div>
              <div class="training-theme-meta">
                Rating ${PuzzleSystem.getPuzzleRating(theme)} · Aptitude ${PuzzleSystem.getAptitude(theme)}${coached ? ' · Coach bonus active' : ''}
              </div>
            </div>
            <button class="training-theme-action" type="button" data-theme="${theme}" ${disabled ? 'disabled' : ''}>${label}</button>
          </div>
        `;
      }).join('');

      return `
        <div class="training-panel-title">${title}</div>
        <div class="training-panel-subtitle">${subtitle}</div>
        <div class="training-theme-list">${items}</div>
      `;
    },

    _buildSoloPracticePanel() {
      const result = _soloPracticeResult
        ? `<div class="training-practice-result">${_soloPracticeResult}</div>`
        : '';
      return `
        <div class="training-panel-title">Solo practice</div>
        <div class="training-panel-subtitle">No bonus. No rating change. Just practice.</div>
        <div class="training-theme-list">
          <div class="training-theme-row">
            <div class="training-theme-text">
              <div class="training-theme-name">Random puzzle</div>
              <div class="training-theme-meta">Drawn from the full 176-puzzle pool. No career impact.</div>
            </div>
            <button id="btn-training-practice" class="training-theme-action" type="button">🎲 Random puzzle</button>
          </div>
        </div>
        ${result}
      `;
    },

    bindThemeButtons() {
      document.querySelectorAll('.training-theme-action').forEach((btn) => {
        if (btn.id === 'btn-training-practice') return;
        btn.addEventListener('click', () => this.startSession(btn.dataset.theme));
      });
      const practiceBtn = document.getElementById('btn-training-practice');
      if (practiceBtn) practiceBtn.addEventListener('click', () => this.startSoloPractice());
    },

    startSession(theme) {
      try {
        _activeTrainingSession = PuzzleSystem.startSelfTrainingSession(theme);
      } catch (err) {
        console.error('[UICareer.training] Failed to start session:', err);
        return;
      }

      _trainingSummaryReady = false;
      this._primeRuntimeFromSession(_activeTrainingSession);
      if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
      this.render();
    },

    startSoloPractice() {
      const puzzle = PuzzleSystem.pickRandomPractice();
      if (!puzzle) return;
      _soloPracticeResult = '';
      _trainingSummaryReady = false;
      _activeTrainingSession = {
        id: 'solo_practice',
        mode: 'practice',
        theme: puzzle.theme,
        currentPuzzle: puzzle,
      };
      this._primeRuntimeFromSession(_activeTrainingSession);
      if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
      this.render();
    },

    _primeRuntimeFromSession(session) {
      _trainingRuntime = {
        selectedSquare: null,
        phase: 'awaiting-player',
        solutionIndex: 0,
        chess: new Chess(session.currentPuzzle.fen),
        playerColor: String(session.currentPuzzle.fen).split(' ')[1] === 'b' ? 'b' : 'w',
        lastMove: null,
      };
    },

    _renderSession() {
      const titleEl = document.getElementById('training-session-title');
      const metaEl = document.getElementById('training-session-meta');
      const streakEl = document.getElementById('training-progress-streak');
      const solvedEl = document.getElementById('training-progress-solved');
      const attemptsEl = document.getElementById('training-progress-attempts');
      const statusEl = document.getElementById('training-session-status');
      const progressRow = document.querySelector('#training-session .training-progress-row');

      if (!_activeTrainingSession || !_trainingRuntime) return;

      const turnLabel = _trainingRuntime.playerColor === 'b' ? 'Black to move' : 'White to move';
      if (titleEl) titleEl.textContent = `PUZZLE — ${PuzzleSystem.getThemeLabel(_activeTrainingSession.theme)}`;
      if (_activeTrainingSession.mode === 'practice') {
        if (metaEl) metaEl.innerHTML = `<span class="training-session-turn">${turnLabel}</span> · Solo practice`;
        if (progressRow) progressRow.classList.add('hidden');
      } else {
        if (metaEl) {
          metaEl.innerHTML = `<span class="training-session-turn">${turnLabel}</span> · Puzzle ${_activeTrainingSession.attemptsUsed + 1} · Theme rating ${PuzzleSystem.getPuzzleRating(_activeTrainingSession.theme)}`;
        }
        if (progressRow) progressRow.classList.remove('hidden');
        if (streakEl) streakEl.textContent = `${_activeTrainingSession.streak}/${PuzzleSystem.SESSION_STREAK_TARGET}`;
        if (solvedEl) solvedEl.textContent = `${_activeTrainingSession.solvedTotal}/${PuzzleSystem.SESSION_SOLVE_TARGET}`;
        if (attemptsEl) attemptsEl.textContent = `${_activeTrainingSession.attemptsRemaining}/${PuzzleSystem.SESSION_MAX_ATTEMPTS}`;
      }
      if (statusEl) {
        statusEl.textContent = _trainingRuntime.phase === 'awaiting-opponent'
          ? 'Reply...'
          : 'Solve the puzzle. Unlimited time, one attempt.';
      }

      this._renderTrainingBoard();
    },

    _renderTrainingBoard() {
      const board = document.getElementById('training-board');
      if (!board || !_activeTrainingSession || !_trainingRuntime) return;
      board.innerHTML = '';

      const getPiece = (sq) => _trainingRuntime.chess.get(sq);
      const isFlipped = _trainingRuntime.playerColor === 'b';
      const files = isFlipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
      const ranks = isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
      const moves = _trainingRuntime.selectedSquare
        ? _trainingRuntime.chess.moves({ square: _trainingRuntime.selectedSquare, verbose: true })
        : [];
      const legalTargets = moves.map((move) => move.to);
      const captureTargets = moves
        .filter((move) => move.flags.includes('c') || move.flags.includes('e'))
        .map((move) => move.to);

      ranks.forEach((rank, ri) => {
        files.forEach((file, fi) => {
          const square = file + rank;
          const piece = getPiece(square);
          const isLight = (ri + fi) % 2 === 0;
          const el = document.createElement('div');
          el.className = 'square ' + (isLight ? 'light' : 'dark');
          el.dataset.square = square;
          if (square === _trainingRuntime.selectedSquare) el.classList.add('selected');
          if (_trainingRuntime.lastMove &&
              (_trainingRuntime.lastMove.from === square || _trainingRuntime.lastMove.to === square)) {
            el.classList.add('last-move');
          }
          if (legalTargets.includes(square) && !captureTargets.includes(square)) el.classList.add('legal-move');
          if (captureTargets.includes(square)) el.classList.add('legal-capture');

          if (fi === 0) {
            const r = document.createElement('span');
            r.className = 'coord-rank';
            r.textContent = rank;
            el.appendChild(r);
          }
          if (ri === ranks.length - 1) {
            const f = document.createElement('span');
            f.className = 'coord-file';
            f.textContent = file;
            el.appendChild(f);
          }

          if (piece) {
            const p = document.createElement('img');
            p.className = 'piece';
            p.src = UIManager.PIECES[piece.color + piece.type.toUpperCase()];
            p.alt = piece.color + piece.type.toUpperCase();
            p.draggable = false;
            el.appendChild(p);
          }

          el.addEventListener('click', () => this.onSquareClick(square));
          board.appendChild(el);
        });
      });
    },

    onSquareClick(square) {
      if (!_activeTrainingSession || !_trainingRuntime) return;
      if (_trainingRuntime.phase !== 'awaiting-player') return;

      const piece = _trainingRuntime.chess.get(square);
      const turn = _trainingRuntime.chess.turn();
      if (piece && piece.color === turn) {
        _trainingRuntime.selectedSquare = square;
        this._renderSession();
        return;
      }

      if (!_trainingRuntime.selectedSquare) return;

      const from = _trainingRuntime.selectedSquare;
      const promotion = piece && piece.type === 'p' && (square[1] === '1' || square[1] === '8') ? 'q' : '';
      const uci = `${from}${square}${promotion}`;
      const expected = _activeTrainingSession.currentPuzzle.solution[_trainingRuntime.solutionIndex];
      _trainingRuntime.selectedSquare = null;

      if (uci !== expected) {
        this._resolveAttempt(false);
        return;
      }

      const move = _trainingRuntime.chess.move({ from, to: square, promotion: promotion || 'q' });
      if (!move) {
        this._resolveAttempt(false);
        return;
      }

      _trainingRuntime.lastMove = { from, to: square };
      _trainingRuntime.solutionIndex += 1;
      this._advanceTrainingLine();
    },

    _advanceTrainingLine() {
      if (!_activeTrainingSession || !_trainingRuntime) return;
      const solution = _activeTrainingSession.currentPuzzle.solution;

      if (_trainingRuntime.solutionIndex >= solution.length) {
        this._resolveAttempt(true);
        return;
      }

      if (_trainingRuntime.solutionIndex % 2 === 1) {
        _trainingRuntime.phase = 'awaiting-opponent';
        this._renderSession();
        clearTimeout(this._opponentReplyTimer);
        this._opponentReplyTimer = setTimeout(() => {
          if (!_trainingRuntime || !_activeTrainingSession) return;
          const reply = solution[_trainingRuntime.solutionIndex];
          const from = reply.slice(0, 2);
          const to = reply.slice(2, 4);
          const promotion = reply.length > 4 ? reply[4] : 'q';
          const ok = _trainingRuntime.chess.move({ from, to, promotion });
          if (!ok) {
            this._resolveAttempt(false);
            return;
          }
          _trainingRuntime.lastMove = { from, to };
          _trainingRuntime.solutionIndex += 1;
          if (_trainingRuntime.solutionIndex >= solution.length) {
            this._resolveAttempt(true);
            return;
          }
          _trainingRuntime.phase = 'awaiting-player';
          this._renderSession();
        }, TRAINING_PUZZLE_OPPONENT_DELAY_MS);
        return;
      }

      _trainingRuntime.phase = 'awaiting-player';
      this._renderSession();
    },

    _resolveAttempt(solved) {
      if (!_activeTrainingSession) return;
      clearTimeout(this._opponentReplyTimer);
      this._opponentReplyTimer = null;
      if (_activeTrainingSession.mode === 'practice') {
        const puzzle = _activeTrainingSession.currentPuzzle;
        _soloPracticeResult = solved
          ? 'Correct!'
          : `Incorrect. Solution: ${this._formatSolutionLine(puzzle)}`;
        _activeTrainingSession = null;
        _trainingRuntime = null;
        this.render();
        return;
      }
      const result = PuzzleSystem.submitSessionAnswer(_activeTrainingSession.id, solved);
      _activeTrainingSession = result.session;

      if (_activeTrainingSession.status === 'completed') {
        const summary = PuzzleSystem.completeSession(_activeTrainingSession.id);
        _trainingSummaryReady = true;
        _trainingRuntime = null;
        CalendarSystem.advanceOneDay();
        this._renderSessionSummary(summary);
        this.render();
        return;
      }

      this._primeRuntimeFromSession(_activeTrainingSession);
      this._renderSession();
    },

    _renderSessionSummary(summary) {
      const titleEl = document.getElementById('training-session-summary-title');
      const bodyEl = document.getElementById('training-session-summary-body');
      const buttonEl = document.getElementById('btn-training-summary-home');
      if (titleEl) {
        titleEl.textContent = summary.bonusGranted
          ? `Bonus prepared: ${PuzzleSystem.getThemeLabel(summary.theme)}`
          : `Session failed: ${PuzzleSystem.getThemeLabel(summary.theme)}`;
      }
      if (bodyEl) {
        bodyEl.textContent = summary.bonusGranted
          ? `Path: ${summary.path}. Rating now ${summary.rating}. Aptitude ${summary.aptitude}. One calendar day has passed.`
          : `No bonus earned. Rating now ${summary.rating}. Queue size ${summary.reinforcementQueueSize}. One calendar day has passed.`;
      }
      if (buttonEl) {
        buttonEl.onclick = () => this.onReturnHome();
      }
    },

    _formatSolutionLine(puzzle) {
      try {
        const chess = new Chess(puzzle.fen);
        return puzzle.solution.map((uci) => {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci[4] : 'q';
          const move = chess.move({ from, to, promotion });
          return move ? move.san : uci;
        }).join(', ');
      } catch (_) {
        return puzzle.solution.join(', ');
      }
    },

    onReturnHome() {
      clearTimeout(this._opponentReplyTimer);
      this._opponentReplyTimer = null;
      _activeTrainingSession = null;
      _trainingRuntime = null;
      _trainingSummaryReady = false;
      _soloPracticeResult = '';
      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      _showScreen('home');
      home.render();
    },

    onBack() {
      this.onReturnHome();
    },
  };

  // ── Tournament lobby screen ──────────────────────────────

  const COUNTRY_FLAGS = {
    AR: '🇦🇷', AM: '🇦🇲', AU: '🇦🇺', AZ: '🇦🇿', BR: '🇧🇷', CA: '🇨🇦',
    CN: '🇨🇳', CU: '🇨🇺', CZ: '🇨🇿', DK: '🇩🇰', EG: '🇪🇬', EN: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    FR: '🇫🇷', DE: '🇩🇪', GE: '🇬🇪', HU: '🇭🇺', IN: '🇮🇳', IR: '🇮🇷',
    IL: '🇮🇱', IT: '🇮🇹', JP: '🇯🇵', KZ: '🇰🇿', MA: '🇲🇦', NL: '🇳🇱',
    NO: '🇳🇴', PE: '🇵🇪', PH: '🇵🇭', PL: '🇵🇱', PT: '🇵🇹', RO: '🇷🇴', RU: '🇷🇺',
    RS: '🇷🇸', ES: '🇪🇸', SE: '🇸🇪', CH: '🇨🇭', TR: '🇹🇷', UA: '🇺🇦',
    GB: '🇬🇧', US: '🇺🇸', UZ: '🇺🇿', VN: '🇻🇳', AT: '🇦🇹', AD: '🇦🇩', DZ: '🇩🇿',
  };

  const REASON_LABELS = {
    elo_too_low:        'Elo too low',
    cant_afford:        'Cannot afford the entry fee',
    already_registered: 'Already registered',
    unknown_tournament: 'Unknown tournament',
    below_your_level:   'Below your level',
  };

  const lobby = {

    render() {
      const today = CalendarSystem.getDate();
      const list  = TournamentSystem.getEligibleInstancesForYear(today.year);

      const summaryEl = document.getElementById('lobby-summary');
      if (summaryEl) {
        const player = CareerManager.player.get();
        const fin    = CareerManager.finances.get();
        summaryEl.textContent =
          `Year ${today.year} — ${list.length} events · You: Elo ${player.elo} · $${fin.money}`;
      }

      const cardsEl = document.getElementById('lobby-cards');
      if (!cardsEl) return;
      cardsEl.innerHTML = '';

      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'lobby-empty';
        empty.textContent = 'No tournaments available this year. Try again next year.';
        cardsEl.appendChild(empty);
        return;
      }

      for (const item of list) {
        cardsEl.appendChild(this._buildCard(item));
      }
    },

    _buildCard(item) {
      const t = item.tournament;
      const e = item.eligible;

      const card = document.createElement('div');
      card.className = 'tour-card';
      if (e.ok && e.warnings.length === 0) card.classList.add('eligible');
      else if (e.ok && e.warnings.includes('below_your_level')) card.classList.add('warn');
      else card.classList.add('locked');

      // ── Top row: tier badge + date ──
      const top = document.createElement('div');
      top.className = 'tour-card-top';
      const tier = document.createElement('span');
      tier.className   = `tour-card-tier tier-${t.tier}`;
      tier.textContent = `Tier ${t.tier}`;
      const date = document.createElement('span');
      date.className   = 'tour-card-date';
      date.textContent = CalendarSystem.formatDate(item.date);
      top.appendChild(tier);
      top.appendChild(date);
      card.appendChild(top);

      // ── Name ──
      const name = document.createElement('div');
      name.className   = 'tour-card-name';
      name.textContent = t.name;
      card.appendChild(name);

      // ── City + flag ──
      const city = document.createElement('div');
      city.className = 'tour-card-city';
      const flag = COUNTRY_FLAGS[t.country] || '🏳️';
      city.textContent = `${flag} ${t.city}, ${t.country}`;
      card.appendChild(city);

      // ── Description (italic) ──
      if (t.description) {
        const desc = document.createElement('div');
        desc.className   = 'tour-card-description';
        desc.textContent = t.description;
        card.appendChild(desc);
      }

      // ── Stats row ──
      const stats = document.createElement('div');
      stats.className = 'tour-card-stats';
      stats.innerHTML = `
        <span>${t.rounds} rounds</span>
        <span>${t.daysDuration}d</span>
        <span>Elo ${t.eloMin}–${t.eloMax}</span>
      `;
      card.appendChild(stats);

      // ── Finance row ──
      const finance = document.createElement('div');
      finance.className = 'tour-card-finance';
      const totalPrize  = t.prizes.reduce((a, b) => a + b, 0);
      finance.innerHTML = `
        <span class="tour-card-fee">Fee: $${t.entryFee}</span>
        <span class="tour-card-prize">Prizes: $${totalPrize}</span>
      `;
      card.appendChild(finance);

      // ── Status / register button ──
      if (!e.ok) {
        const status = document.createElement('div');
        status.className = 'tour-card-status locked';
        const reasonText = e.reasons
          .map((r) => REASON_LABELS[r] || r)
          .join(' · ');
        status.textContent = `🔒 ${reasonText}`;
        card.appendChild(status);

        const btn = document.createElement('button');
        btn.className   = 'tour-card-register';
        btn.disabled    = true;
        btn.textContent = 'Locked';
        card.appendChild(btn);
      } else {
        if (e.warnings.includes('below_your_level')) {
          const status = document.createElement('div');
          status.className   = 'tour-card-status warn';
          status.textContent = '⚠ Below your level';
          card.appendChild(status);
        }

        const btn = document.createElement('button');
        btn.className   = 'tour-card-register';
        btn.textContent = 'Register';
        btn.addEventListener('click', () =>
          this.onRegisterClick(item.tournamentId, item.date),
        );
        card.appendChild(btn);
      }

      return card;
    },

    onRegisterClick(tournamentId, date) {
      const result = TournamentSystem.register(tournamentId, date.year);
      if (result.ok) {
        if (typeof SoundManager !== 'undefined') SoundManager.playGoodMove(2);
        this._showStatus(`Registered for the ${date.year} edition.`);
      } else {
        if (typeof SoundManager !== 'undefined') SoundManager.playBlunder();
        const label = REASON_LABELS[result.error] || result.error;
        this._showStatus(`Cannot register: ${label}`, true);
      }
      this.render();
    },

    _showStatus(msg, isError) {
      const el = document.getElementById('lobby-status');
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('hidden', 'error');
      if (isError) el.classList.add('error');
      // Auto-hide after a few seconds
      clearTimeout(this._statusTimer);
      this._statusTimer = setTimeout(() => {
        el.classList.add('hidden');
      }, 4000);
    },

  };

  // ── In-tournament screen ─────────────────────────────────

  const tournament = {
    _simulateToastTimer: null,

    /** Refresh the in-tournament screen from the live instance. */
    render() {
      const inst = TournamentSystem.getCurrentInstance();
      if (!inst) {
        // Nothing to show — bail and go home
        _showScreen('home');
        home.render();
        return;
      }

      this._renderHeader(inst);
      this._renderPairings(inst);
      this._renderStandings(inst);
      this._renderHistory(inst);

      if (TournamentSystem.isFinished()) {
        this._showFinishedPanel(inst);
      } else {
        this._showNextRound(inst);
      }
    },

    _renderPairings(inst) {
      const wrapEl  = document.getElementById('t-pairings');
      const roundEl = document.getElementById('t-pairings-round');
      const listEl  = document.getElementById('t-pairings-list');
      if (!wrapEl || !listEl) return;

      if (!inst.currentPairings || inst.currentPairings.length === 0) {
        wrapEl.classList.add('hidden');
        return;
      }
      wrapEl.classList.remove('hidden');
      if (roundEl) roundEl.textContent = String(inst.currentRound);

      listEl.innerHTML = '';
      inst.currentPairings.forEach((p, i) => {
        const div = document.createElement('div');
        const isPlayerRow =
          (p.white && p.white.id === 'player') ||
          (p.black && p.black.id === 'player');
        div.className = 't-pairing-row' + (isPlayerRow ? ' player-row' : '');

        const whiteFlag = p.white ? (COUNTRY_FLAGS[p.white.nationality] || '') : '';
        const blackFlag = p.black ? (COUNTRY_FLAGS[p.black.nationality] || '') : '';

        const whiteLabel = p.white
          ? `${whiteFlag} ${p.white.name} (${p.white.elo})`
          : '—';
        const blackLabel = p.black === null
          ? 'BYE'
          : `${blackFlag} ${p.black.name} (${p.black.elo})`;

        div.innerHTML = `
          <span class="t-pr-num">${i + 1}.</span>
          <span class="t-pr-white">${whiteLabel}</span>
          <span class="t-pr-vs">vs</span>
          <span class="t-pr-black">${blackLabel}</span>
        `;
        listEl.appendChild(div);
      });
    },

    _renderHeader(inst) {
      const nameEl = document.getElementById('t-name');
      const locEl  = document.getElementById('t-location');
      const rEl    = document.getElementById('t-round');
      const sEl    = document.getElementById('t-score');
      const rkEl   = document.getElementById('t-rank');

      if (nameEl) nameEl.textContent = inst.tournamentName;
      if (locEl) {
        const flag = COUNTRY_FLAGS[inst.country] || '🏳️';
        locEl.textContent = `${flag} ${inst.city || '—'}, ${inst.country || ''}`;
      }

      const round = Math.min(inst.currentRound, inst.rounds);
      if (rEl) rEl.textContent = `${round}/${inst.rounds}`;

      const me = inst.field.find((p) => p.id === 'player');
      if (sEl) sEl.textContent = me ? String(me.score) : '0';

      const standings = TournamentSystem.getStandings();
      const myRank = standings.find((s) => s.id === 'player');
      if (rkEl) rkEl.textContent = myRank ? `${myRank.rank}/${standings.length}` : '—';
    },

    _showNextRound(inst) {
      const nextEl    = document.getElementById('t-next-round');
      const finishedEl = document.getElementById('t-finished');
      if (nextEl)     nextEl.classList.remove('hidden');
      if (finishedEl) finishedEl.classList.add('hidden');

      const pairing = TournamentSystem.getCurrentPlayerPairing();
      if (!pairing) return;

      const me = inst.field.find((p) => p.id === 'player');
      const youNameEl = document.getElementById('t-you-name');
      const youEloEl  = document.getElementById('t-you-elo');
      if (youNameEl) youNameEl.textContent = me.name;
      if (youEloEl)  youEloEl.textContent  = String(me.elo);

      const oppNameEl = document.getElementById('t-opp-name');
      const oppEloEl  = document.getElementById('t-opp-elo');
      const colorEl   = document.getElementById('t-color');
      const playBtn   = document.getElementById('btn-play-round');
      const simBtn    = document.getElementById('btn-simulate-round');

      if (pairing.color === 'bye') {
        if (oppNameEl) oppNameEl.textContent = '— BYE —';
        if (oppEloEl)  oppEloEl.textContent  = '';
        if (colorEl) {
          colorEl.textContent = 'BYE';
          colorEl.className   = 't-color-indicator bye';
        }
        if (playBtn) playBtn.textContent = '▶ Take the bye (+1)';
        if (simBtn)  simBtn.textContent  = '⏩ Take the bye';
      } else {
        const flag = COUNTRY_FLAGS[pairing.opponent.nationality] || '';
        if (oppNameEl) oppNameEl.textContent = `${flag} ${pairing.opponent.name}`;
        if (oppEloEl)  oppEloEl.textContent  = String(pairing.opponent.elo);
        if (colorEl) {
          const c = pairing.color;
          colorEl.textContent = c === 'w' ? 'W' : 'B';
          colorEl.className   = 't-color-indicator ' + c;
        }
        if (playBtn) playBtn.textContent = '▶ Play round';
        if (simBtn)  simBtn.textContent  = '⏩ Simulate round';
      }
    },

    _showFinishedPanel(inst) {
      const nextEl     = document.getElementById('t-next-round');
      const finishedEl = document.getElementById('t-finished');
      const msgEl      = document.getElementById('t-final-message');
      if (nextEl)     nextEl.classList.add('hidden');
      if (finishedEl) finishedEl.classList.remove('hidden');

      const standings = TournamentSystem.getStandings();
      const me = standings.find((s) => s.id === 'player');
      const rank = me ? me.rank : standings.length;
      const of   = standings.length;
      const score = me ? me.score : 0;
      const prize = inst.prizes[rank - 1] || 0;

      if (msgEl) {
        msgEl.innerHTML =
          `You finished <strong>${rank}${_ordinalSuffix(rank)}</strong> of ${of} ` +
          `with a score of <strong>${score}</strong>.` +
          `<span class="t-prize">Prize: $${prize}</span>`;
      }
    },

    _renderStandings(inst) {
      const listEl = document.getElementById('t-standings-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      const standings = TournamentSystem.getStandings();
      for (const row of standings) this._appendStandingRow(listEl, row);
    },

    _appendStandingRow(listEl, row) {
      const div = document.createElement('div');
      div.className = 't-standings-row' + (row.id === 'player' ? ' player' : '');
      const flag = COUNTRY_FLAGS[row.nationality] || '';
      div.innerHTML = `
        <span class="t-st-rank">${row.rank}.</span>
        <span class="t-st-name">${flag} ${row.name}</span>
        <span class="t-st-elo">${row.elo}</span>
        <span class="t-st-score">${row.score}</span>
      `;
      listEl.appendChild(div);
    },

    _renderHistory(inst) {
      const listEl = document.getElementById('t-history-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      if (!inst.history.length) {
        const empty = document.createElement('div');
        empty.className   = 't-history-empty';
        empty.textContent = 'No rounds played yet.';
        listEl.appendChild(empty);
        return;
      }

      for (const round of inst.history) {
        const myResult = round.results.find(
          (r) => r.white === 'player' || r.black === 'player',
        );
        if (!myResult) continue;

        let oppId, score, isBye;
        if (myResult.black === null && myResult.white === 'player') {
          isBye = true;
          oppId = null;
          score = 1;
        } else if (myResult.white === 'player') {
          oppId = myResult.black;
          score = myResult.scoreW;
        } else {
          oppId = myResult.white;
          score = myResult.scoreB;
        }

        const opp = oppId ? inst.field.find((p) => p.id === oppId) : null;
        const oppFlag = opp ? (COUNTRY_FLAGS[opp.nationality] || '') : '';
        const oppLabel = isBye
          ? '— BYE —'
          : (opp ? `${oppFlag} ${opp.name} (${opp.elo})` : '?');

        let cls, label;
        if (isBye)           { cls = 'bye';  label = '+1'; }
        else if (score === 1)  { cls = 'win';  label = '1 - 0'; }
        else if (score === 0)  { cls = 'loss'; label = '0 - 1'; }
        else                   { cls = 'draw'; label = '½ - ½'; }

        const div = document.createElement('div');
        div.className = 't-history-row';
        div.innerHTML = `
          <span class="t-history-round">R${round.round}</span>
          <span class="t-history-opp">${oppLabel}</span>
          <span class="t-history-result ${cls}">${label}</span>
        `;
        listEl.appendChild(div);
      }
    },

    /** Play button handler. */
    onPlayRound() {
      const pairing = TournamentSystem.getCurrentPlayerPairing();
      if (!pairing) return;

      if (pairing.color === 'bye') {
        // Free point — no game to play
        TournamentSystem.recordPlayerResult(1, 'bye');
        if (typeof SoundManager !== 'undefined') SoundManager.playGoodMove(2);
        this.render();
        return;
      }

      // Hand off to the chess board
      UIManager.setOpponent({
        name:        pairing.opponent.name,
        elo:         pairing.opponent.elo,
        id:          pairing.opponent.id,
        nationality: pairing.opponent.nationality,
      });
      _showScreen('game');
      UIManager.newGame(pairing.color);
    },

    onSimulateRound() {
      const result = TournamentSystem.simulatePlayerRound();
      if (!result.ok) return;

      if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      this._showSimulationToast(result);
      this.render();
    },

    /** Finalize button handler. */
    onFinalize() {
      try {
        const result = TournamentSystem.finalize();
        if (typeof SoundManager !== 'undefined') {
          if (result.prize > 0) SoundManager.playVictory();
          else                  SoundManager.playFlowExit();
        }

        const status = document.getElementById('career-continue-status');
        if (status) {
          status.textContent =
            `Tournament: ${result.rank}/${result.of} · score ${result.score} · prize $${result.prize}`;
          status.classList.add('warn');
        }
      } catch (e) {
        console.error('[Tournament] Finalize failed:', e);
      }
    },

    _showSimulationToast(summary) {
      const toastEl = document.getElementById('t-sim-toast');
      if (!toastEl) return;

      toastEl.textContent = this._formatSimulationToast(summary);
      toastEl.classList.remove('hidden');

      if (this._simulateToastTimer) {
        clearTimeout(this._simulateToastTimer);
      }

      this._simulateToastTimer = setTimeout(() => {
        toastEl.classList.add('hidden');
        this._simulateToastTimer = null;
      }, SIMULATE_TOAST_MS);
    },

    _formatSimulationToast(summary) {
      const round = summary.round || '?';
      if (summary.source === 'bye') return `R${round}: bye (+1)`;

      const opp = summary.opponent
        ? `${summary.opponent.name}, ${summary.opponent.elo}`
        : 'unknown opponent';
      const resultLabel = summary.result === 'win'
        ? '+1'
        : summary.result === 'draw'
          ? '+0.5'
          : '0';
      return `R${round}: ${resultLabel} vs ${opp}`;
    },

  };

  function _ordinalSuffix(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'st';
    if (mod10 === 2 && mod100 !== 12) return 'nd';
    if (mod10 === 3 && mod100 !== 13) return 'rd';
    return 'th';
  }

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

    // Browse tournaments → lobby
    const btnBrowse = document.getElementById('btn-browse-tournaments');
    if (btnBrowse) {
      btnBrowse.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
        _showScreen('lobby');
        lobby.render();
      });
    }

    const btnInbox = document.getElementById('btn-open-inbox');
    if (btnInbox) {
      btnInbox.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
        _showScreen('inbox');
        inbox.render();
      });
    }

    const btnTraining = document.getElementById('btn-open-training');
    if (btnTraining) {
      btnTraining.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
        _showScreen('training');
        training.render();
      });
    }

    const btnCoaches = document.getElementById('btn-open-coaches');
    if (btnCoaches) {
      btnCoaches.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playSFActivate();
        _showScreen('coaches');
        coaches.render();
      });
    }

    // Lobby → back to home
    const btnLobbyBack = document.getElementById('btn-lobby-back');
    if (btnLobbyBack) {
      btnLobbyBack.addEventListener('click', () => {
        if (typeof SoundManager !== 'undefined') SoundManager.playMove();
        _showScreen('home');
        home.render();
      });
    }

    const btnInboxBack = document.getElementById('btn-inbox-back');
    if (btnInboxBack) {
      btnInboxBack.addEventListener('click', () => inbox.onBack());
    }

    const btnCoachesBack = document.getElementById('btn-coaches-back');
    if (btnCoachesBack) {
      btnCoachesBack.addEventListener('click', () => coaches.onBack());
    }

    const btnTrainingBack = document.getElementById('btn-training-back');
    if (btnTrainingBack) {
      btnTrainingBack.addEventListener('click', () => training.onBack());
    }

    const btnCoachReplaceCancel = document.getElementById('btn-coach-replace-cancel');
    if (btnCoachReplaceCancel) {
      btnCoachReplaceCancel.addEventListener('click', () => {
        const modal = document.getElementById('modal-coach-replace');
        _pendingReplaceCoachId = null;
        if (modal) modal.close();
      });
    }

    const btnCoachReplaceConfirm = document.getElementById('btn-coach-replace-confirm');
    if (btnCoachReplaceConfirm) {
      btnCoachReplaceConfirm.addEventListener('click', () => coaches.onConfirmReplace());
    }

    // Tournament — Play round
    const btnPlayRound = document.getElementById('btn-play-round');
    if (btnPlayRound) {
      btnPlayRound.addEventListener('click', () => tournament.onPlayRound());
    }

    const btnSimulateRound = document.getElementById('btn-simulate-round');
    if (btnSimulateRound) {
      btnSimulateRound.addEventListener('click', () => tournament.onSimulateRound());
    }

    // Tournament — Finalize & return home
    const btnFinalize = document.getElementById('btn-finalize');
    if (btnFinalize) {
      btnFinalize.addEventListener('click', () => tournament.onFinalize());
    }
  }

  // ── Public API ────────────────────────────────────────────

  return {
    init() {
      _bindButtons();
      home.render();

      GameEvents.on(GameEvents.EVENTS.GAME_ENDED, (payload) => {
        setTimeout(() => {
          if (payload.mode === 'tournament') {
            _showScreen('tournament');
            tournament.render();
            return;
          }
          _showScreen('home');
          home.render();
        }, 1500);
      });

      GameEvents.on(GameEvents.EVENTS.TOURNAMENT_FINISHED, () => {
        _showScreen('home');
        home.render();
      });

      GameEvents.on(GameEvents.EVENTS.MAIL_RECEIVED, () => {
        home.renderInboxBadge();
        const inboxScreen = document.getElementById('screen-inbox');
        if (inboxScreen && !inboxScreen.classList.contains('hidden')) {
          inbox.render();
        }
      });

      GameEvents.on(GameEvents.EVENTS.COACH_HIRED, () => {
        home.renderCoachButton();
        home.renderTrainingButton();
        const coachScreen = document.getElementById('screen-coaches');
        if (coachScreen && !coachScreen.classList.contains('hidden')) {
          coaches.render();
        }
        const trainingScreen = document.getElementById('screen-training');
        if (trainingScreen && !trainingScreen.classList.contains('hidden')) {
          training.render();
        }
      });

      GameEvents.on(GameEvents.EVENTS.COACH_FIRED, () => {
        home.renderCoachButton();
        home.renderTrainingButton();
        const coachScreen = document.getElementById('screen-coaches');
        if (coachScreen && !coachScreen.classList.contains('hidden')) {
          coaches.render();
        }
        const trainingScreen = document.getElementById('screen-training');
        if (trainingScreen && !trainingScreen.classList.contains('hidden')) {
          training.render();
        }
      });
    },

    showScreen: _showScreen,

    home,
    lobby,
    inbox,
    coaches,
    training,
    tournament,
  };

})();

// Debug global
if (typeof window !== 'undefined' && window.cl) {
  window.cl.ui = UICareer;
}
