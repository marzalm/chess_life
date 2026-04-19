// inbox-templates.js
//
// Pure data dictionary for inbox mails. Strings may contain {{var}}
// placeholders resolved by inbox-system.js.

const InboxTemplates = {
  press_tournament_win: {
    from:    'Chess Life Daily',
    subject: '{{playerName}} takes {{tournamentName}}',
    body:
      '{{playerName}} scored {{score}}/{{rounds}} to top a field of {{of}} at the {{tournamentName}} in {{city}}. Prize: ${{prize}}. One to remember.',
    tag:     'press',
  },

  press_tournament_top3: {
    from:    'Weekend Chess Report',
    subject: '{{playerName}} reaches the podium at {{tournamentName}}',
    body:
      '{{playerName}} finished {{rank}} of {{of}} at the {{tournamentName}} in {{city}} with {{score}}/{{rounds}}. A strong week and a useful result.',
    tag:     'press',
  },

  press_tournament_disappointing: {
    from:    'Local Chess Chronicle',
    subject: 'Tough finish for {{playerName}} at {{tournamentName}}',
    body:
      '{{playerName}} ended the {{tournamentName}} in {{city}} in {{rank}} place out of {{of}}, scoring {{score}}/{{rounds}}. Not the headline result they wanted.',
    tag:     'press',
  },

  federation_elo_confirmation: {
    from:    'National Chess Federation',
    subject: 'Rating update confirmed',
    body:
      'Dear {{playerName}}, your latest rated result has been processed. Your published rating is now {{elo}} ({{deltaSigned}}).',
    tag:     'federation',
  },

  title_earned: {
    from:    'FIDE Office',
    subject: 'Title awarded: {{title}}',
    body:
      'Congratulations — you have been awarded the title of {{titleFull}}! This is a permanent recognition of your strength.',
    tag:     'federation',
  },

  inbox_coach_hired: {
    from: 'Career Office',
    subject: '{{coachName}} joins your team',
    body:
      '{{coachName}} has been hired as your new coach. Weekly cost: ${{weeklyCost}}. Their first week starts now.',
    tag: 'coach',
  },

  inbox_coach_fired_manual: {
    from: 'Career Office',
    subject: '{{coachName}} has been dismissed',
    body:
      'You have ended your coaching arrangement with {{coachName}}. No severance was paid, and the coach slot is now open.',
    tag: 'coach',
  },

  inbox_coach_fired_no_funds: {
    from: 'Career Office',
    subject: '{{coachName}} leaves over unpaid fees',
    body:
      'Your coaching arrangement with {{coachName}} has ended because you could not cover the weekly cost of ${{weeklyCost}}.',
    tag: 'coach',
  },

  // Phase F.3 — round press reaction. One template, branching on result
  // inside the caller so we can vary the tone without three subjects.
  round_press_player_result: {
    from:    'Chess Life Wire',
    subject: 'Round {{round}} — {{tournamentName}}',
    body:
      '{{playerName}} {{resultPhrase}} in round {{round}} of the {{tournamentName}}, facing {{opponentName}} ({{opponentElo}}). {{flavor}}',
    tag:     'press',
  },

  // Round-by-round update on a met rival playing in the same tournament.
  rival_round_watch: {
    from:    'Tournament Wire',
    subject: 'Round {{round}} — {{rivalName}} {{rivalVerb}}',
    body:
      'Your rival {{rivalName}} {{rivalVerb}} against {{opponentName}} in round {{round}} of the {{tournamentName}}. A result worth tracking.',
    tag:     'press',
  },

  // J-3 heads-up when a met rival registers to the same tournament.
  rival_provocation_before_tournament: {
    from:    '{{rivalName}}',
    subject: 'See you at {{tournamentName}}',
    body:
      '{{provocationText}}',
    tag:     'rival',
  },

  champion_in_field: {
    from:    'Tournament Desk',
    subject: 'Elite names in the {{tournamentName}} field',
    body:
      '{{championNames}} {{verb}} in the field for {{tournamentName}}. A proper measuring stick awaits.',
    tag:     'press',
  },
};

if (typeof window !== 'undefined' && window.cl) {
  window.cl.inboxTemplates = InboxTemplates;
}
