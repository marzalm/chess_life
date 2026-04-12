// tests/inbox-system.test.js
//
// Standalone Node.js test harness for js/inbox-system.js.
// Loads inbox-templates.js as the real dependency and mocks
// CareerManager, CalendarSystem, and GameEvents.

const fs = require('fs');
const path = require('path');

let InboxSystem;
let InboxTemplates;
let CoachData;
let CareerManager;
let CalendarSystem;
let GameEvents;
let _player;
let _calendarDate;
let _inboxState;
let _saveCount;
let _receivedEvents;

function buildGameEventsMock() {
  const listeners = new Map();
  return {
    EVENTS: {
      TOURNAMENT_FINISHED: 'tournament_finished',
      MAIL_RECEIVED: 'mail_received',
      COACH_HIRED: 'coach_hired',
      COACH_FIRED: 'coach_fired',
    },
    on(eventName, handler) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(handler);
      listeners.set(eventName, bucket);
      return () => this.off(eventName, handler);
    },
    off(eventName, handler) {
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      bucket.delete(handler);
      if (bucket.size === 0) listeners.delete(eventName);
    },
    emit(eventName, payload) {
      const bucket = listeners.get(eventName);
      if (!bucket) return;
      for (const handler of bucket) handler(payload);
    },
    clear(eventName) {
      if (eventName === undefined) listeners.clear();
      else listeners.delete(eventName);
    },
  };
}

function compareDates(a, b) {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

function flushMicrotasks() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function reset() {
  _player = {
    playerName: 'Tester',
    nationality: 'NO',
    elo: 1500,
  };
  _calendarDate = { year: 2026, month: 4, day: 10 };
  _inboxState = { mails: [] };
  _saveCount = 0;
  _receivedEvents = [];

  CareerManager = {
    player: { get: () => _player },
    inbox: { get: () => _inboxState },
    save: () => { _saveCount += 1; },
  };

  CalendarSystem = {
    getDate: () => ({ ..._calendarDate }),
    compareDates,
  };

  GameEvents = buildGameEventsMock();
  GameEvents.on(GameEvents.EVENTS.MAIL_RECEIVED, (payload) => {
    _receivedEvents.push(payload);
  });

  const templatesCode = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'inbox-templates.js'),
    'utf8',
  );
  InboxTemplates = (new Function(`${templatesCode}\nreturn InboxTemplates;`))();

  const coachDataCode = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'coach-data.js'),
    'utf8',
  );
  CoachData = (new Function(`${coachDataCode}\nreturn CoachData;`))();

  const systemCode = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'inbox-system.js'),
    'utf8',
  );
  InboxSystem = (new Function(
    'CareerManager', 'CalendarSystem', 'GameEvents', 'InboxTemplates', 'CoachData',
    `${systemCode}\nreturn InboxSystem;`,
  ))(CareerManager, CalendarSystem, GameEvents, InboxTemplates, CoachData);
}

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  reset();
  try {
    await fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('     →', e.message);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg || 'mismatch'}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

(async () => {
  console.log('\n── Push and retrieval ──');

  await test('push creates a persisted mail with defaults', async () => {
    const mail = InboxSystem.push('press_tournament_win', {
      playerName: 'Tester', score: 5, rounds: 5, of: 40, tournamentName: 'Local Weekend Open', city: 'Oslo', prize: 200,
    });
    assert(mail.id.startsWith('mail_'));
    assertEq(_inboxState.mails.length, 1);
    assertEq(_saveCount, 1);
    assertEq(_inboxState.mails[0].read, false);
    assertEq(_inboxState.mails[0].date, { year: 2026, month: 4, day: 10 });
  });

  await test('push uses the in-game calendar date by default', async () => {
    _calendarDate = { year: 2027, month: 1, day: 3 };
    InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1512, deltaSigned: '+12',
    });
    assertEq(_inboxState.mails[0].date, { year: 2027, month: 1, day: 3 });
  });

  await test('push accepts an explicit CalendarDate override', async () => {
    InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1512, deltaSigned: '+12',
    }, {
      date: { year: 2030, month: 6, day: 1 },
    });
    assertEq(_inboxState.mails[0].date, { year: 2030, month: 6, day: 1 });
  });

  await test('getAll returns newest first using CalendarSystem.compareDates', async () => {
    InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1500, deltaSigned: '0',
    }, { date: { year: 2026, month: 4, day: 8 } });
    InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    }, { date: { year: 2026, month: 4, day: 12 } });
    InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1510, deltaSigned: '+10',
    }, { date: { year: 2026, month: 4, day: 10 } });

    const mails = InboxSystem.getAll();
    assertEq(mails.map((m) => m.date), [
      { year: 2026, month: 4, day: 12 },
      { year: 2026, month: 4, day: 10 },
      { year: 2026, month: 4, day: 8 },
    ]);
  });

  await test('getById finds a known mail', async () => {
    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });
    assertEq(InboxSystem.getById(mail.id).id, mail.id);
  });

  console.log('\n── Read and delete ──');

  await test('getUnreadCount reflects unread mails', async () => {
    const a = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });
    const b = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1510, deltaSigned: '+10',
    });
    InboxSystem.markRead(a.id);
    assertEq(InboxSystem.getUnreadCount(), 1);
    InboxSystem.markRead(b.id);
    assertEq(InboxSystem.getUnreadCount(), 0);
  });

  await test('markRead marks a mail as read and persists', async () => {
    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });
    const savesBefore = _saveCount;
    assertEq(InboxSystem.markRead(mail.id), true);
    assertEq(_inboxState.mails[0].read, true);
    assertEq(_saveCount, savesBefore + 1);
  });

  await test('markUnread flips a mail back to unread', async () => {
    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });
    InboxSystem.markRead(mail.id);
    InboxSystem.markUnread(mail.id);
    assertEq(_inboxState.mails[0].read, false);
  });

  await test('delete removes a mail and persists', async () => {
    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });
    const savesBefore = _saveCount;
    assertEq(InboxSystem.delete(mail.id), true);
    assertEq(_inboxState.mails.length, 0);
    assertEq(_saveCount, savesBefore + 1);
  });

  await test('delete missing id is a no-op false', async () => {
    assertEq(InboxSystem.delete('missing'), false);
    assertEq(_saveCount, 0);
  });

  console.log('\n── Template rendering ──');

  await test('template substitution fills placeholders', async () => {
    const mail = InboxSystem.push('press_tournament_win', {
      playerName: 'Tester',
      score: 5,
      rounds: 5,
      of: 40,
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      prize: 200,
    });
    assert(mail.subject.includes('Tester takes Local Weekend Open'));
    assert(mail.body.includes('5/5'));
    assert(mail.body.includes('$200'));
  });

  await test('missing vars render as ??? instead of throwing', async () => {
    const mail = InboxSystem.push('press_tournament_top3', {
      playerName: 'Tester',
    });
    assert(mail.subject.includes('???') || mail.body.includes('???'));
  });

  await test('unknown template throws cleanly', async () => {
    let threw = false;
    try {
      InboxSystem.push('nope', {});
    } catch (e) {
      threw = true;
    }
    assertEq(threw, true);
  });

  await test('push preserves actions when provided', async () => {
    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    }, {
      actions: [{ label: 'Open', handlerId: 'open_mail' }],
    });
    assertEq(mail.actions, [{ label: 'Open', handlerId: 'open_mail' }]);
  });

  console.log('\n── Events and subscriptions ──');

  await test('push emits MAIL_RECEIVED after persisting', async () => {
    let lengthSeenByHandler = -1;
    GameEvents.on(GameEvents.EVENTS.MAIL_RECEIVED, () => {
      lengthSeenByHandler = _inboxState.mails.length;
    });

    const mail = InboxSystem.push('federation_elo_confirmation', {
      playerName: 'Tester', elo: 1505, deltaSigned: '+5',
    });

    assertEq(_receivedEvents.length, 1);
    assertEq(_receivedEvents[0].mailId, mail.id);
    assertEq(lengthSeenByHandler, 1);
  });

  await test('init guard prevents duplicate subscriptions', async () => {
    InboxSystem.init();
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      country: 'NO',
      rank: 1,
      of: 40,
      score: 5,
      prize: 200,
      rounds: 5,
      eloBefore: 1500,
      eloAfter: 1516,
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails.length, 2, 'expected one press + one federation mail');
  });

  await test('TOURNAMENT_FINISHED rank 1 auto-pushes win press mail and federation mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      country: 'NO',
      rank: 1,
      of: 40,
      score: 5,
      prize: 200,
      rounds: 5,
      eloBefore: 1500,
      eloAfter: 1516,
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails.map((m) => m.templateId), [
      'press_tournament_win',
      'federation_elo_confirmation',
    ]);
  });

  await test('TOURNAMENT_FINISHED top-3 auto-pushes podium press mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      country: 'NO',
      rank: 3,
      of: 40,
      score: 4,
      prize: 50,
      rounds: 5,
      eloBefore: 1500,
      eloAfter: 1508,
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails[0].templateId, 'press_tournament_top3');
  });

  await test('TOURNAMENT_FINISHED poor finish auto-pushes disappointing press mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      country: 'NO',
      rank: 17,
      of: 40,
      score: 2,
      prize: 0,
      rounds: 5,
      eloBefore: 1500,
      eloAfter: 1488,
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails[0].templateId, 'press_tournament_disappointing');
  });

  await test('federation auto-mail uses eloAfter and signed delta', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.TOURNAMENT_FINISHED, {
      tournamentName: 'Local Weekend Open',
      city: 'Oslo',
      country: 'NO',
      rank: 2,
      of: 40,
      score: 4.5,
      prize: 100,
      rounds: 5,
      eloBefore: 1500,
      eloAfter: 1512,
    });
    await flushMicrotasks();
    const federation = _inboxState.mails.find((m) => m.templateId === 'federation_elo_confirmation');
    assert(federation.body.includes('1512'));
    assert(federation.body.includes('+12'));
  });

  await test('COACH_HIRED auto-pushes a hire mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.COACH_HIRED, {
      coachId: 'coach_petrova_elena',
      weeklyCost: 150,
      eloUnlock: 1300,
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails.length, 1);
    assertEq(_inboxState.mails[0].templateId, 'inbox_coach_hired');
    assert(_inboxState.mails[0].subject.includes('Elena Petrova'));
  });

  await test('COACH_FIRED manual auto-pushes the dismissal mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.COACH_FIRED, {
      coachId: 'coach_meyer_luc',
      reason: 'manual',
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails[0].templateId, 'inbox_coach_fired_manual');
  });

  await test('COACH_FIRED cant_afford auto-pushes the no-funds mail', async () => {
    InboxSystem.init();
    GameEvents.emit(GameEvents.EVENTS.COACH_FIRED, {
      coachId: 'coach_rinaldi_marco',
      reason: 'cant_afford',
    });
    await flushMicrotasks();
    assertEq(_inboxState.mails[0].templateId, 'inbox_coach_fired_no_funds');
    assert(_inboxState.mails[0].body.includes('$520'));
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
})();
