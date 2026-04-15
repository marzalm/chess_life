// inbox-system.js
//
// Logic layer for persisted career mails. No DOM access.

const InboxSystem = (() => {

  let _initialized = false;

  function _state() {
    return CareerManager.inbox.get();
  }

  function _cloneDate(d) {
    return { year: d.year, month: d.month, day: d.day };
  }

  function _genMailId() {
    return 'mail_' + Math.random().toString(36).slice(2, 10);
  }

  function _getTemplate(templateId) {
    const tpl = InboxTemplates[templateId];
    if (!tpl) {
      throw new Error(`[Inbox] Unknown template: ${templateId}`);
    }
    return tpl;
  }

  function _renderString(str, vars) {
    return String(str).replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined && vars[key] !== null) {
        return String(vars[key]);
      }
      return '???';
    });
  }

  function _sortNewestFirst(a, b) {
    return CalendarSystem.compareDates(b.date, a.date);
  }

  function _formatSignedInt(n) {
    return n > 0 ? `+${n}` : String(n);
  }

  function _getCoach(coachId) {
    if (typeof CoachData === 'undefined' || !Array.isArray(CoachData)) return null;
    return CoachData.find((coach) => coach.id === coachId) || null;
  }

  function _scheduleTournamentPressMail(summary) {
    queueMicrotask(() => {
      const player = CareerManager.player.get();
      const templateId = summary.rank === 1
        ? 'press_tournament_win'
        : (summary.rank <= 3 ? 'press_tournament_top3' : 'press_tournament_disappointing');

      InboxSystem.push(templateId, {
        playerName: player.playerName,
        tournamentName: summary.tournamentName,
        city: summary.city,
        country: summary.country,
        rank: summary.rank,
        of: summary.of,
        score: summary.score,
        prize: summary.prize,
        rounds: summary.rounds,
      });
    });
  }

  function _scheduleFederationMail(summary) {
    queueMicrotask(() => {
      const player = CareerManager.player.get();
      const eloAfter = summary.eloAfter ?? player.elo;
      const eloBefore = summary.eloBefore ?? eloAfter;
      const delta = eloAfter - eloBefore;

      InboxSystem.push('federation_elo_confirmation', {
        playerName: player.playerName,
        elo: eloAfter,
        deltaSigned: _formatSignedInt(delta),
      });
    });
  }

  function _scheduleCoachHiredMail(payload) {
    queueMicrotask(() => {
      const coach = _getCoach(payload.coachId);
      InboxSystem.push('inbox_coach_hired', {
        coachName: coach ? `${coach.title} ${coach.name}` : 'Your new coach',
        weeklyCost: payload.weeklyCost ?? (coach ? coach.weeklyCost : '???'),
      });
    });
  }

  function _scheduleCoachFiredMail(payload) {
    queueMicrotask(() => {
      const coach = _getCoach(payload.coachId);
      const templateId = payload.reason === 'cant_afford'
        ? 'inbox_coach_fired_no_funds'
        : 'inbox_coach_fired_manual';
      InboxSystem.push(templateId, {
        coachName: coach ? `${coach.title} ${coach.name}` : 'Your coach',
        weeklyCost: coach ? coach.weeklyCost : '???',
      });
    });
  }

  // ── Phase F.3 — rival / round narration ─────────────────────

  function _resultPhrase(result) {
    if (result === 'win')  return 'scored a win';
    if (result === 'draw') return 'settled for a draw';
    if (result === 'loss') return 'was beaten';
    if (result === 'bye')  return 'received a bye';
    return 'played';
  }

  function _pressFlavor(result) {
    if (result === 'win')  return 'The scoreboard moves.';
    if (result === 'draw') return 'A cautious half-point shared.';
    if (result === 'loss') return 'A setback they will want to bury fast.';
    if (result === 'bye')  return 'A rest day that keeps the clock honest.';
    return '';
  }

  function _rivalVerbFromResult(result) {
    if (result === 'win')  return 'took the point';
    if (result === 'draw') return 'held a draw';
    if (result === 'loss') return 'dropped the point';
    return 'played';
  }

  function _scheduleRoundPressMail(payload) {
    queueMicrotask(() => {
      if (!payload || !payload.opponent) return;
      const player = CareerManager.player.get();
      InboxSystem.push('round_press_player_result', {
        playerName:     player.playerName || 'Player',
        round:          payload.round,
        tournamentName: payload.tournamentName || 'the tournament',
        opponentName:   payload.opponent.name || 'their opponent',
        opponentElo:    payload.opponent.elo || '?',
        resultPhrase:   _resultPhrase(payload.playerResult),
        flavor:         _pressFlavor(payload.playerResult),
      });
    });
  }

  function _scheduleRivalRoundWatchMails(payload) {
    if (typeof RivalSystem === 'undefined') return;
    const results = Array.isArray(payload.notableResults) ? payload.notableResults : [];
    if (results.length === 0) return;

    // Only push about rivals the player has already met.
    for (const r of results) {
      const rival = RivalSystem.getById(r.rivalId);
      if (!rival || !rival.met) continue;
      queueMicrotask(() => {
        InboxSystem.push('rival_round_watch', {
          round:          payload.round,
          rivalName:      r.name,
          rivalVerb:      _rivalVerbFromResult(r.result),
          opponentName:   r.opponentName,
          tournamentName: payload.tournamentName || 'the tournament',
        });
      });
    }
  }

  return {
    init() {
      if (_initialized) return;
      _initialized = true;

      GameEvents.on(
        GameEvents.EVENTS.TOURNAMENT_FINISHED,
        (summary) => _scheduleTournamentPressMail(summary),
      );

      GameEvents.on(
        GameEvents.EVENTS.TOURNAMENT_FINISHED,
        (summary) => _scheduleFederationMail(summary),
      );

      GameEvents.on(
        GameEvents.EVENTS.COACH_HIRED,
        (payload) => _scheduleCoachHiredMail(payload),
      );

      GameEvents.on(
        GameEvents.EVENTS.COACH_FIRED,
        (payload) => _scheduleCoachFiredMail(payload),
      );

      if (GameEvents.EVENTS.TOURNAMENT_ROUND_FINISHED) {
        GameEvents.on(
          GameEvents.EVENTS.TOURNAMENT_ROUND_FINISHED,
          (payload) => {
            _scheduleRoundPressMail(payload);
            _scheduleRivalRoundWatchMails(payload);
          },
        );
      }
    },

    push(templateId, vars = {}, options = {}) {
      const tpl = _getTemplate(templateId);
      const inbox = _state();
      const date = options.date ? _cloneDate(options.date) : _cloneDate(CalendarSystem.getDate());
      const tag = options.tag || tpl.tag || 'misc';
      const actions = options.actions || tpl.actions;

      const mail = {
        id:         _genMailId(),
        templateId,
        date,
        from:       _renderString(tpl.from, vars),
        subject:    _renderString(tpl.subject, vars),
        body:       _renderString(tpl.body, vars),
        read:       false,
        tag,
      };

      if (actions !== undefined) {
        mail.actions = actions;
      }

      inbox.mails.push(mail);
      CareerManager.save();

      GameEvents.emit(GameEvents.EVENTS.MAIL_RECEIVED, {
        mailId: mail.id,
        templateId,
        vars,
        date: _cloneDate(mail.date),
        tag: mail.tag,
      });

      return { ...mail };
    },

    getAll() {
      const mails = _state().mails.slice();
      mails.sort(_sortNewestFirst);
      return mails;
    },

    getById(id) {
      return _state().mails.find((m) => m.id === id) || null;
    },

    getUnreadCount() {
      return _state().mails.filter((m) => !m.read).length;
    },

    markRead(id) {
      const mail = this.getById(id);
      if (!mail) return false;
      mail.read = true;
      CareerManager.save();
      return true;
    },

    markUnread(id) {
      const mail = this.getById(id);
      if (!mail) return false;
      mail.read = false;
      CareerManager.save();
      return true;
    },

    delete(id) {
      const inbox = _state();
      const idx = inbox.mails.findIndex((m) => m.id === id);
      if (idx === -1) return false;
      inbox.mails.splice(idx, 1);
      CareerManager.save();
      return true;
    },

    clear() {
      _state().mails = [];
      CareerManager.save();
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.inbox = InboxSystem;
}
