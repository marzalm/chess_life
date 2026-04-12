// staff-system.js
//
// Single-coach staffing domain for Phase E.3 / E.5.
// Owns hire/fire/replace, weekly coach costs, and coach bonus lookup.

const StaffSystem = (() => {

  let _initialized = false;
  let _tickUnsubscribe = null;

  function _cloneDate(d) {
    return d ? { year: d.year, month: d.month, day: d.day } : null;
  }

  function _state() {
    return CareerManager.staff.get();
  }

  function _today() {
    if (typeof CalendarSystem !== 'undefined' && CalendarSystem.getDate) {
      return _cloneDate(CalendarSystem.getDate());
    }
    if (CareerManager.calendar && CareerManager.calendar.get) {
      return _cloneDate(CareerManager.calendar.get().date);
    }
    throw new Error('[StaffSystem] Calendar date is unavailable');
  }

  function _normalizeState() {
    const staff = _state();
    if (!staff.currentCoach) return;
    if (!staff.currentCoach.hireDate) staff.currentCoach.hireDate = _today();
    if (!staff.currentCoach.lastPaidDate) {
      staff.currentCoach.lastPaidDate = _cloneDate(staff.currentCoach.hireDate);
    }
  }

  function _getCoachById(coachId) {
    return CoachData.find((coach) => coach.id === coachId) || null;
  }

  function _emit(eventName, payload) {
    if (typeof GameEvents === 'undefined') return;
    GameEvents.emit(eventName, payload);
  }

  function _datesReachedOrPassed(a, b) {
    return CalendarSystem.compareDates(a, b) <= 0;
  }

  function _cloneCoach(coach) {
    return coach ? JSON.parse(JSON.stringify(coach)) : null;
  }

  return {
    init() {
      _normalizeState();
      CareerManager.save();
      if (_initialized) return;
      _initialized = true;

      if (typeof CalendarSystem !== 'undefined' && CalendarSystem.onDayAdvanced) {
        _tickUnsubscribe = CalendarSystem.onDayAdvanced((date) => {
          this.processWeeklyCost(date);
        });
      }
    },

    getCurrentCoach() {
      _normalizeState();
      const current = _state().currentCoach;
      return current ? _cloneCoach(_getCoachById(current.id)) : null;
    },

    getHireDate() {
      _normalizeState();
      const current = _state().currentCoach;
      return current ? _cloneDate(current.hireDate) : null;
    },

    getLastPaidDate() {
      _normalizeState();
      const current = _state().currentCoach;
      return current ? _cloneDate(current.lastPaidDate) : null;
    },

    getCoachById(coachId) {
      return _cloneCoach(_getCoachById(coachId));
    },

    getAllCoaches() {
      return CoachData.map((coach) => _cloneCoach(coach));
    },

    getAvailableCoaches() {
      const elo = CareerManager.player.get().elo;
      return CoachData
        .filter((coach) => elo >= coach.eloUnlock)
        .map((coach) => _cloneCoach(coach));
    },

    getCurrentCoachBonusMoves(theme) {
      const coach = this.getCurrentCoach();
      if (!coach || !theme) return 0;
      return Array.isArray(coach.primaryThemes) && coach.primaryThemes.includes(theme)
        ? (coach.bonusMoves || 0)
        : 0;
    },

    canHire(coachId) {
      _normalizeState();
      const coach = _getCoachById(coachId);
      const reasons = [];

      if (!coach) reasons.push('unknown_coach');
      if (coach && CareerManager.player.get().elo < coach.eloUnlock) reasons.push('elo_too_low');
      if (coach && !CareerManager.finances.canAfford(coach.weeklyCost)) reasons.push('cant_afford');
      if (_state().currentCoach && _state().currentCoach.id === coachId) reasons.push('already_hired');

      return {
        ok: reasons.length === 0,
        reasons,
      };
    },

    hire(coachId) {
      _normalizeState();
      const verdict = this.canHire(coachId);
      if (!verdict.ok) {
        return { ok: false, error: verdict.reasons[0], reasons: verdict.reasons };
      }

      const coach = _getCoachById(coachId);
      const current = _state().currentCoach;
      const today = _today();

      if (!CareerManager.finances.addExpense(coach.weeklyCost, `coach:${coach.id}:week1`)) {
        return { ok: false, error: 'cant_afford', reasons: ['cant_afford'] };
      }

      if (current && current.id !== coachId) {
        const oldId = current.id;
        _state().currentCoach = null;
        CareerManager.save();
        _emit(GameEvents.EVENTS.COACH_FIRED, {
          coachId: oldId,
          reason: 'manual',
        });
      }

      _state().currentCoach = {
        id: coach.id,
        hireDate: _cloneDate(today),
        lastPaidDate: _cloneDate(today),
      };
      CareerManager.save();

      _emit(GameEvents.EVENTS.COACH_HIRED, {
        coachId: coach.id,
        weeklyCost: coach.weeklyCost,
        eloUnlock: coach.eloUnlock,
      });

      return { ok: true };
    },

    fire(reason = 'manual') {
      _normalizeState();
      const current = _state().currentCoach;
      if (!current) return { ok: false };

      const coachId = current.id;
      _state().currentCoach = null;
      CareerManager.save();

      _emit(GameEvents.EVENTS.COACH_FIRED, {
        coachId,
        reason,
      });

      return { ok: true };
    },

    processWeeklyCost(currentDate) {
      _normalizeState();
      const current = _state().currentCoach;
      if (!current) return { paid: false, fired: false, paymentsProcessed: 0 };

      const coach = _getCoachById(current.id);
      if (!coach) return { paid: false, fired: false, paymentsProcessed: 0 };

      let paymentsProcessed = 0;
      let nextDue = CalendarSystem.addDays(current.lastPaidDate, 7);

      while (_datesReachedOrPassed(nextDue, currentDate)) {
        if (!CareerManager.finances.addExpense(coach.weeklyCost, `coach:${coach.id}:weekly`)) {
          this.fire('cant_afford');
          return { paid: paymentsProcessed > 0, fired: true, paymentsProcessed };
        }
        current.lastPaidDate = _cloneDate(nextDue);
        CareerManager.save();
        paymentsProcessed += 1;
        nextDue = CalendarSystem.addDays(current.lastPaidDate, 7);
      }

      return {
        paid: paymentsProcessed > 0,
        fired: false,
        paymentsProcessed,
      };
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.staff = StaffSystem;
}
