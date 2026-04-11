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
