# Chess Life — Document de référence projet

Tu es mon assistant de développement pour Chess Life. Lis ce document avant toute intervention.

## Ce qu'est Chess Life

Chess Life est un jeu web de **simulation de carrière d'échecs**, inspiré de Football Manager appliqué à un joueur d'échecs solo. Le joueur incarne un jeune talent qui démarre dans des tournois de quartier et progresse, saison après saison, jusqu'au Championnat du Monde FIDE.

**Double intention — importante :**
1. **Un jeu fun** de simulation de carrière, avec calendrier, tournois, inbox, coachs, finances.
2. **Un entraîneur d'échecs caché** derrière ce jeu. L'objectif assumé est que le joueur progresse réellement aux échecs en jouant. Les parties, les ouvertures, les exercices entre tournois, la revue post-partie — tout doit servir un apprentissage implicite. L'UX est ludique, la pédagogie est invisible mais constante.

Chaque décision de design doit être jugée à l'aune de ces deux intentions : est-ce fun ? est-ce que ça fait progresser le joueur réel ?

## Concept de jeu

- Le joueur crée son personnage (avatar pixel art en couches : visage, cheveux, yeux, peau, tenue) et choisit une nationalité et un genre.
- Le jeu tourne autour d'un **calendrier annuel** et d'un bouton « Continuer » : on avance jour par jour, le jeu s'arrête à chaque événement (tournoi, séance d'entraînement, mail important, deadline d'inscription).
- L'**inbox** est la colonne vertébrale narrative : articles de presse après les tournois, messages des coachs, provocations des rivaux, offres de sponsors, invitations à des tournois.
- Entre les tournois, le joueur peut **s'inscrire à des événements**, **engager ou licencier des coachs**, **gérer ses finances**, et (plus tard) **s'entraîner** via des puzzles ou des drills d'ouverture.
- Les parties d'échecs se jouent sur l'échiquier existant, avec le système **Focus / Flow / Stockfish / Maia** déjà en place (la partie la plus aboutie du projet).
- L'objectif long terme : grimper les tiers de tournois jusqu'à devenir Champion du Monde.

## Progression des tournois (vrais tournois)

Utiliser des noms réels de tournois à tous les niveaux.

**Tier 1 — Amateur local** (Elo ~800-1400)
Opens de quartier, championnats départementaux, tournois rapides municipaux.

**Tier 2 — National amateur** (Elo ~1400-1800)
Championnat de France amateur, Cappelle-la-Grande, British Championship (sections ouvertes), US Open amateur.

**Tier 3 — Opens internationaux** (Elo ~1800-2300, normes IM/GM)
Gibraltar Masters, Reykjavik Open, Hastings, Biel MTO, Aeroflot Open, Isle of Man, Charlotte Open.

**Tier 4 — Tournois fermés pros** (Elo ~2300-2600)
Tata Steel Challengers, Prague Masters Challengers, Norway Chess Challenger.

**Tier 5 — Élite mondiale** (Elo 2600+)
Tata Steel Masters, Norway Chess, Sinquefield Cup, Superbet Bucharest, Grand Chess Tour.

**Tier 6 — Cycle mondial**
FIDE Grand Swiss → FIDE World Cup → Tournoi des Candidats → **Championnat du Monde FIDE**.

Calendrier annuel réaliste en référence : Tata Steel (janvier), Candidats (avril, années paires), Norway Chess (mai), Sinquefield (septembre), Championnat du Monde Rapide & Blitz (fin décembre).

## Adversaires et IA

- **Maia-2 (ONNX)** — déjà intégré, 11 tranches Elo de <1100 à ≥2000. C'est le cerveau des adversaires jusqu'à ~2000 Elo, là où Maia-2 donne des coups humains réalistes.
- **Stockfish (WASM)** — déjà intégré comme Worker unique pour les évaluations (système Focus). Au-delà de ~2000 Elo, les adversaires passeront à du Stockfish avec skill level limité + bruit, pour simuler le jeu des pros. Cette transition sera implémentée plus tard (Phase G).
- Un adversaire = un nom, une nationalité, un Elo, un portrait pixel art, un style, et quelques lignes de dialogue pré/post-partie.
- Des **rivaux PNJ nommés** progresseront en parallèle au joueur, avec leur propre courbe Elo, et interagiront via l'inbox.

## Stack technique — non négociable

- HTML5 + JavaScript vanilla ES6+, **aucun framework JS**
- Tailwind CSS 4.0 + DaisyUI 5.0 via CDN, pas de build step
- chess.js 0.10.3 (méthodes avec underscores : `game_over()`, `in_check()`, `in_checkmate()`)
- Stockfish.js (WebAssembly) dans un Web Worker
- Maia-2 via onnxruntime-web (ONNX)
- localStorage pour les sauvegardes
- IndexedDB pour le cache du modèle Maia (~90 MB)
- coi-serviceworker.js à la racine pour SharedArrayBuffer sur GitHub Pages
- Pas de backend, pas de serveur — tout dans le navigateur
- GitHub Pages pour l'hébergement

## Style visuel

- Pixel art cohérent, police **Press Start 2P**.
- Palette existante (voir [css/ui.css](css/ui.css)) : `#1a1a2e` fond, `#e0d8c8` texte clair, `#e8c98a` accent doré, `#a0522d` marron foncé.
- Style panneaux RPG avec bordures biseautées et ombres 3D, inspiration Stardew Valley.
- Échiquier 72px par case, couleurs terre `#e8c98a` / `#a0522d`.
- Toute nouvelle UI (écran calendrier, inbox, création perso, staff, finances) doit reprendre cette palette et ce style.

## Structure des fichiers du projet (cible)

```
chess_life/
├── index.html
├── CLAUDE.md
├── coi-serviceworker.js
├── manifest.json
├── css/
│   ├── board.css          (échiquier, pièces)
│   ├── ui.css             (UI générale pixel art)
│   └── career.css         (écrans carrière : calendrier, inbox, staff)
├── js/
│   ├── chess-engine.js         → moteur de partie (chess.js + Stockfish)
│   ├── maia-engine.js          → IA Maia-2 ONNX
│   ├── focus-system.js         → Focus, Flow State, modificateurs
│   ├── career-manager.js       → état joueur, Elo, persistence
│   ├── save-manager.js         → sérialisation localStorage
│   ├── dialog-system.js        → file de dialogues typewriter (réutilisé)
│   ├── character-creator.js    → NOUVEAU : création avatar pixel art
│   ├── calendar-system.js      → NOUVEAU : moteur de temps, file d'événements
│   ├── tournament-system.js    → NOUVEAU : tournois, appariements, prix, Elo
│   ├── tournament-data.js      → NOUVEAU : catalogue vrais tournois par tier
│   ├── inbox-system.js         → NOUVEAU : génération procédurale de mails
│   ├── finance-system.js       → NOUVEAU : solde, revenus, dépenses
│   ├── staff-system.js         → NOUVEAU : coachs recrutables
│   ├── rival-system.js         → NOUVEAU : PNJ rivaux nommés
│   ├── puzzle-system.js        → NOUVEAU : puzzles thématiques (coachs)
│   ├── puzzle-data.js          → NOUVEAU : catalogue de puzzles par thème
│   ├── ui-manager.js           → rendu échiquier (à nettoyer)
│   ├── ui-career.js            → NOUVEAU : écrans calendrier, inbox, staff, finances
│   ├── review-manager.js       → revue post-partie (pédagogie)
│   └── sound-manager.js        → sons 8-bit Web Audio
└── lib/
    ├── chess.js
    ├── stockfish.js
    └── maia/                   → modèle ONNX (en IndexedDB après 1er chargement)
```

Les modules suivants seront **supprimés** lors de la Phase A (nettoyage du pivot Pokémon → Career) :
`progression-manager.js`, `club-data.js`, `world-engine.js`, `world-data.js`, `game-controller.js`, `css/world.css`.

## Règles absolues d'architecture

- **Chaque module est une boîte noire.** Communication via fonctions publiques uniquement. Jamais d'accès direct aux variables internes d'un autre module.
- **Tous les calculs de Focus passent exclusivement par `focus-system.js`.** Jamais inline ailleurs.
- **Toute manipulation du temps passe par `calendar-system.js`.** Jamais de calcul de semaine/date ailleurs.
- **Toute génération de mail passe par `inbox-system.js`.** Les autres modules appellent `inbox.push(templateId, vars)`.
- **Les tournois sont déclarés statiquement dans `tournament-data.js`.** Jamais de tournoi hardcodé ailleurs.
- **Un seul Worker Stockfish pour tout le projet.** Déjà instancié dans `chess-engine.js`, ne jamais en créer un second.

## Phases du plan

**Phases 1 à 4** — **DÉJÀ TERMINÉES** (historique) :
Échiquier fonctionnel, persistence localStorage, Stockfish en Worker avec jauge Focus, Flow State et actions Focus avancées, intégration Maia-2, livre d'ouverture, feedback coups (éval, sons, texte flottant), pièces capturées, choix de couleur, revue post-partie.

À partir d'ici, le projet pivote de la direction « jeu type Pokémon avec clubs » vers la direction « simulation de carrière type Football Manager ». Les phases 5 à 8 précédentes sont **annulées** et remplacées par A→H ci-dessous.

**Phase A ✅ — Nettoyage pivot** (terminée le 2026-04-10, commit `1bf903b`)
Suppression des fichiers de l'ancienne direction Pokémon, nettoyage d'[index.html](index.html), [ui-manager.js](js/ui-manager.js), [career-manager.js](js/career-manager.js), [focus-system.js](js/focus-system.js), [dialog-system.js](js/dialog-system.js) et [save-manager.js](js/save-manager.js). Passage du code et de l'UI à l'anglais. Stub bootstrap qui crée un joueur par défaut et affiche l'écran de jeu pour permettre le test.

**Phase B — Personnage et calendrier**
`character-creator.js` (layers pixel art : visage, cheveux, yeux, peau, tenue, plus nom, nationalité, genre), `calendar-system.js` (temps en semaines/jours/années, file d'événements, bouton « Continuer » qui avance jusqu'au prochain événement), écran home avec le calendrier annuel visible et les événements affichés. `ui-career.js` est créé ici.

- **B.1 ✅** — `save-manager.js` clé `chess_life_career_v2` (Phase A)
- **B.2 ✅ (2026-04-10)** — `career-manager.js` réécrit en schéma nesté domain-driven inspiré de ZenGM. Sub-namespaces `player`, `calendar`, `focus`, `finances`, `history`. Migration défensive depuis l'ancien schéma plat. JSDoc typedefs pour `CareerState`. Debug global `window.cl`. Tous les callers migrés. Voir [CHANGELOG.md](CHANGELOG.md).
- **B.3 ✅ (2026-04-10)** — `calendar-system.js` : moteur de temps grégorien (zéro `Date` natif), file d'événements triée par date, machine à états (`idle` / `event_prompt` / `in_tournament` / `in_training`) avec une fonction de transition par phase à la ZenGM, boucle `continue()` jour par jour avec cap de sécurité 365 jours. Pure logique, zéro DOM. Debug shortcut `window.cl.calendar`. Suite de tests Node.js dans [tests/calendar-system.test.js](tests/calendar-system.test.js) (50 tests, tous verts). Voir [CHANGELOG.md](CHANGELOG.md).
- **B.4 ✅ (2026-04-10)** — `ui-career.js` + écran home avec player header (avatar placeholder, nom, nationalité, Elo, money), grille calendrier mensuelle ISO 8601 (jour aujourd'hui en doré, points rouges sur jours d'événements), bouton Continue qui appelle `CalendarSystem.continue()`, liste des prochains événements, modal `#modal-event-prompt` pour le flux event_prompt, bouton "Back to home" sur l'écran de jeu, retour automatique au home après une partie. Helpers `getDayOfWeek` (Zeller's congruence), `getDayOfWeekName`, `getDaysInMonth` ajoutés à `calendar-system.js`. 53 tests verts. Voir [CHANGELOG.md](CHANGELOG.md).
- **B.5 ✅ (2026-04-10)** — `character-creator.js` + `avatar-data.js`. Écran de création de personnage avec preview d'avatar placeholder (CSS shapes : cheveux + visage + yeux + tenue), 6 cyclers de layers (skin/face/eyes/hair/hairColor/outfit), bouton randomize, champs name/country (40 nations FIDE)/gender (M/F/X), validation du nom obligatoire. Le bootstrap appelle `CharacterCreator.show()` au premier lancement (plus de stub silencieux). Le home header rend désormais le vrai avatar via le même `AvatarData` que le creator. Voir [CHANGELOG.md](CHANGELOG.md).
- **B.6 ✅ (2026-04-10)** — Polish final de Phase B : Focus stat dans le header du home, drapeau du pays au lieu du code ISO, day-of-week dans la ligne "Today" du calendrier, lock 200 ms du bouton Continue + status "No events scheduled — skipped X days", hooks SoundManager sur Continue / Event prompt / Back to home / Reset / Start career / Randomize / validation error. Phase B complète. Voir [CHANGELOG.md](CHANGELOG.md).

**Phase C — Tournois Tier 1 et 2**
`tournament-system.js` et `tournament-data.js`. Un tournoi = une série de rounds contre des adversaires Maia générés (nom, Elo, nationalité, portrait). Appariements de type suisse simplifié. Gains/pertes Elo FIDE. Prize money versé au solde. Seulement les Tiers 1 et 2 (amateur local + national amateur). Les parties se jouent sur l'échiquier existant avec le système Focus.

- **C.1 ✅ (2026-04-10)** — `tournament-data.js` : catalogue de **24 tournois** = 6 templates Tier 1 universels (`home: true`, country/city remplis par C.2 selon la nationalité du joueur) + 18 vrais tournois Tier 2 dans 11 pays (Tata Steel, Moscow Open, Cappelle, Prague, Atlantic City, Grenke, World Open, Czech Open, Biel, Andorra, Vienna, Politiken, British Major, Continental, Avignon, Championnat Amateur FR, North American, Hastings). Schéma complet, API lookup/eligibilité/getHomeTemplates/getFixedLocationTournaments/getInstancesForYear. 26 tests verts. Voir [CHANGELOG.md](CHANGELOG.md).
- **C.2a ✅ (2026-04-10)** — `tournament-system.js` : `HOME_CITIES` (40 nations → ville par défaut), pools de noms par nationalité (20 pays + fallback générique), `resolve()` qui résout les `home: true` selon `player.nationality`, `generateOpponent()` (Tier 1 = 90% locaux, Tier 2 = 60% locaux), barrières d'entrée `canRegister()` avec raisons explicites (hard : `elo_too_low`, `cant_afford` / soft : `below_your_level`), `register()` qui déduit l'entrée et schedule un seul événement `tournament_start` par tournoi, `getEligibleInstancesForYear()` pour la lobby. 27 tests verts. Voir [CHANGELOG.md](CHANGELOG.md).
- **C.2b ✅ (2026-04-10)** — Run loop de tournoi : `startTournament` (génération du field `max(8, rounds × 8)` joueurs), pairings suisse Monrad simplifiés, simulation Elo des matchs NPC vs NPC (modèle E + 30% draw rate), `recordPlayerResult` qui avance round par round, `getStandings` triées score puis elo, `finalize` qui paie le prize selon le rang, push dans `history.tournaments` et avance le calendrier de `daysDuration` jours. État vivant dans `CareerManager.calendar.currentTournament`. 22 nouveaux tests, **49 verts au total**. Voir [CHANGELOG.md](CHANGELOG.md).
- **C.3a ✅ (2026-04-10)** — Lobby UI : `#screen-lobby` plein écran avec cards de tournoi (tier badge, date, ville+drapeau, description, stats, fee/prize, status d'éligibilité vert/gold/rouge avec raisons), bouton `🏆 Browse tournaments` sur le home, sous-namespace `UICareer.lobby`, sound hooks. **Auto-play temporaire** sur les `tournament_start` events (start → recordPlayerResult ×N avec résultats aléatoires → finalize) pour permettre de tester le full register → calendar → tournoi → prize sans attendre l'écran in-tournament. C.3b remplacera l'auto-play par du jeu interactif sur l'échiquier. Voir [CHANGELOG.md](CHANGELOG.md).
- **C.3b ✅ (2026-04-10)** — Bug fix inscription multiple (nouvelle barrière `already_registered` + `CalendarSystem.getAllEvents()`) + vrai écran in-tournament. Header (nom/ville/round/score/rank), card "Next round" (pairing avec couleur W/B/BYE + Play button), panel "Finished" (résumé + prize + Finalize), standings top 10 + joueur si hors top, round history avec notation d'échecs colorée. `UICareer.tournament` sub-namespace, `_mode = 'free' | 'tournament'`, dispatch `UIManager.onGameEnd` via `_handleGameEnd`. Body class `.in-tournament` cache New game et Back to home pour empêcher l'abandon mid-round. Resume sur reload via `CalendarSystem.isInTournament()`. Auto-play supprimé. 53 tests verts. Voir [CHANGELOG.md](CHANGELOG.md).
- **C.4** — premier tournoi jouable bout-en-bout (polish final, test utilisateur)

**Phase D — Inbox**
`inbox-system.js` avec templates de mails : articles de presse après chaque tournoi (podium ou pas, performance, Elo gagné), messages automatiques de fédération (invitations, résultats officiels). Écran inbox intégré. Les mails arrivent au fil du calendrier.

**Phase E — Finances, coachs et puzzles thématiques**
`finance-system.js` minimal : solde, prix de tournois encaissés, inscription payante à certains tournois, frais de voyage. Pas de sponsors ni de revenus secondaires à ce stade.

`staff-system.js` minimal : 2-3 coachs recrutables avec un coût hebdomadaire. Chaque coach a une **spécialité thématique** (ex. Ruy Lopez, tactique-fourchettes, finales roi-pion). Engager un coach déverrouille des séances de puzzles sur ce thème.

`puzzle-system.js` : chargement et résolution de puzzles thématiques (format FEN + meilleure séquence). Le joueur accepte une séance via le calendrier ; s'il résout X puzzles sur N, il débloque un **bonus thématique** qui s'applique lors de son prochain tournoi : **réduction du coût Stockfish** (déjà implémenté dans `focus-system.js` via les modificateurs) quand la position jouée matche le thème du coach.

**Matching thème ↔ position** : démarrer extrêmement simple — seuls les thèmes d'ouverture sont détectés (comparaison ECO ou préfixe de coups). Les thèmes tactique/finale viennent plus tard quand on saura les détecter proprement. Le bonus est temporaire (un tournoi) pour garder la pression de la répétition et l'engagement avec les coachs.

Cette phase est la **première manifestation concrète de l'entraîneur caché** : le joueur résout de vrais puzzles d'échecs pour obtenir un avantage in-game, donc il apprend réellement tout en jouant.

**Phase F — Rivaux et narration**
`rival-system.js` : 5 à 10 PNJ nommés avec une courbe Elo qui progresse en parallèle. Ils apparaissent dans les tournois, commentent les résultats via l'inbox, créent des rivalités émergentes. Extension des templates de mail pour les messages de rivaux.

**Phase G — Tiers 3 à 6 et cycle mondial**
Ajout des tournois Tier 3 (opens internationaux), Tier 4 (fermés), Tier 5 (élite), Tier 6 (cycle Candidats → Championnat du Monde). Transition Maia → Stockfish pour les adversaires au-delà de 2000 Elo. Le joueur peut atteindre et gagner le Championnat du Monde.

**Phase H — Polish, pédagogie et PWA**
Sons, animations, écran titre, responsive, PWA offline, déploiement GitHub Pages. **Pédagogie assumée** : renforcement de la revue post-partie, éventuels puzzles tactiques entre tournois, drills d'ouverture. C'est ici que l'aspect « trainer caché » se manifeste explicitement.

**Mis de côté pour le moment (à réintroduire plus tard si besoin)** :
- Système d'attributs joueur (ouvertures / tactique / finales / mental etc.) — on démarre avec Elo comme seule métrique de progression
- Simulation de parties (skip) — toutes les parties se jouent en direct pour l'instant
- Sponsors, cours donnés, revenus secondaires
- Système d'entraînement avancé (puzzles, drills)

## Langue du code et de l'UI

**Tout le code, les commentaires, les identifiants et les textes UI sont en anglais.** Un système multilingue sera ajouté plus tard (Phase H) avec le français comme première langue alternative. Jusque-là, seuls CLAUDE.md et LEARNINGS.md restent en français (documents de conception).

Exemples : variables `playerName` pas `nomJoueur`, fichier `tournament-data.js` pas `donnees-tournois.js`, bouton UI "Continue" pas "Continuer".

## Intentions futures (à garder en tête pendant les phases suivantes)

- **Niveaux de difficulté global avec scaling dynamique (easy / normal / realistic)** *(décidé en C.4, 2026-04-10)*

  Le jeu est conçu pour être accessible aux joueurs d'un Elo modeste. La
  force réelle des adversaires doit être plus basse que l'Elo affiché pour
  rester ludique. **Point clé :** le décalage doit être **dynamique en
  fonction du gap d'Elo**, pas un simple offset fixe. Raison : battre un
  2000 affiché devient impossible pour un 600 réel, même si le 2000 joue
  "comme un 1700". À l'inverse, quand le joueur est proche en Elo, on
  veut préserver le challenge.

  **Idée retenue : dampening sigmoïde du gap Elo affiché.**

  On introduit une fonction `effectiveOpponentElo(playerElo, displayedElo, difficulty)`
  qui réduit le gap au lieu de l'offsetter. Pseudo-code :

  ```js
  function effectiveOpponentElo(playerElo, oppElo, difficulty) {
    const gap = oppElo - playerElo;       // peut être négatif si l'opp est plus faible
    if (gap <= 0) return oppElo;          // on n'aide jamais contre plus faible
    const factor = { easy: 0.40, normal: 0.65, realistic: 1.00 }[difficulty];
    return Math.round(playerElo + gap * factor);
  }
  ```

  Exemples concrets (`playerElo = 600`) :

  | Adversaire affiché | Gap | easy (0.40) | normal (0.65) | realistic (1.00) |
  |---|---|---|---|---|
  | 800  | +200 | 680  | 730  | 800  |
  | 1200 | +600 | 840  | 990  | 1200 |
  | 2000 | +1400 | 1160 | 1510 | 2000 |

  Plus le gap est grand, plus l'écart absolu entre "joué" et "affiché" est
  grand. Plus le joueur se rapproche, moins l'aide fait effet (jusqu'à
  disparaître quand `gap ≤ 0`).

  **Propriétés** :
  - Jamais d'aide contre un adversaire de même niveau ou plus faible
    (pas de "victoire trop facile" qui casse l'immersion).
  - Jamais en dessous du `playerElo` lui-même → l'adversaire aidé reste
    plus fort que le joueur, la progression reste méritée.
  - Scaling progressif et continu → pas de "marches" surprenantes.
  - Les gains d'Elo restent basés sur l'Elo **affiché** (celui du
    catalogue), donc le joueur progresse comme si l'adversaire était à
    sa force officielle. C'est l'idée clé d'accessibilité : "je gagne
    comme si j'avais battu un 1200, mais le 1200 jouait à 990".

  **Implémentation** :
  - Nouveau champ `player.settings.difficulty ∈ { 'easy', 'normal', 'realistic' }`
    (défaut `'normal'`), choisi au character creator (Phase B.5 extended)
    et ajustable plus tard via un futur écran Settings.
  - Fonction utilitaire `_effectiveOpponentElo` dans `ui-manager.js` (ou
    module dédié `difficulty-system.js` si elle grossit).
  - Point d'intégration : `UIManager._triggerAIMove` qui construit
    l'appel à `MaiaEngine.getMove(fen, oppElo, playerElo)` — on passe
    `effectiveOpponentElo(player.elo, this._opponentElo, player.settings.difficulty)`
    à la place de `this._opponentElo`.
  - **Aucun** autre point de lecture. Les standings, barrières d'entrée,
    tournament payouts, gains Elo FIDE, appariements suisses → tout reste
    sur l'Elo affiché.
  - Phase G (Tier 4+) : envisager des facteurs `easy/normal` légèrement
    plus stricts (0.50 / 0.75) pour éviter que l'aide devienne trop
    généreuse dans les tournois élite — ajustable par tier.

- **Form rating / bonus temporaire après coaching** *(noté en C.4, 2026-04-10)*
  L'idée du joueur : "quand je gagne de l'Elo via coaching, les adversaires
  deviennent un peu plus faibles pour me laisser franchir le plafond
  officiel". Séduisant mais mélange deux concepts.
  - **Option retenue à développer** en Phase E : un "form rating" caché
    symétrique. Le joueur a son Elo officiel (qui bouge par tournois FIDE)
    et une "forme" (monte via puzzles/coaching, baisse via inactivité).
    La forme modifie le **joueur** pas les adversaires, via des
    modificateurs Focus temporaires (réduction du coût SF, bonus de gain
    Flow, etc.) — c'est mathématiquement équivalent à rendre les adversaires
    plus faibles mais ça reste dans ton propre référentiel, plus facile à
    expliquer et à débugger.
  - **Option complémentaire** : un bonus explicite et visible, appliqué
    sur le prochain tournoi seulement, matérialisé par une icône dans
    l'UI ("In form: +2 focus gain this tournament"). Déjà prévu en
    Phase E via les puzzles thématiques des coachs.
  - Surtout NE PAS faire : la compression dynamique des Elo adverses
    selon l'état coaching du joueur, trop opaque pour le joueur.

- **Inscription aux tournois via mail et conseil de coach** *(noté en C.3a, 2026-04-10)*
  Pour l'instant, la seule entrée dans le calendrier d'un tournoi est
  le lobby manuel (Browse tournaments). En Phase D, le système inbox
  générera des **invitations par mail** (éditeur d'un tournoi qui
  propose une entrée gratuite ou subventionnée). En Phase E, les
  **coachs** pourront suggérer des tournois adaptés au profil de leur
  élève via un mail ou un écran dédié. Quand on câblera ces sources :
  - `TournamentSystem.register()` reste l'API canonique de l'inscription
    (dédup + charge + scheduling), peu importe l'origine de la demande.
  - Ajouter un paramètre optionnel `register(id, year, { source: 'lobby'|'mail'|'coach', feeOverride })`
    pour tracer l'origine et permettre aux invitations de couvrir tout
    ou partie de l'entry fee.
  - Le lobby manuel reste la source de vérité "je cherche un tournoi"
    mais on devrait le réorganiser par pays / prestige (filtre
    régional, filtre tier, tri par date) quand la liste dépasse ~20.
    Le catalogue actuel compte déjà 24 entrées, ça commence à demander
    du tri.

## Refactors différés (à reprendre quand le moment sera venu)

Ces décisions ont été prises avec la note "à revoir plus tard". Quand
tu travailles sur le module concerné, vérifie si l'un de ces points
est mûr pour être traité.

- **Swiss pairing — color balancing across rounds** *(décidé en C.2b, 2026-04-10)*
  Le `_pairRound` actuel alterne les couleurs simplement par index de pairing,
  sans regarder l'historique de couleurs des joueurs. Le système de tournoi
  réel équilibre B/W sur la longueur du tournoi. **Refactor déclencheur** :
  quand on aura besoin de réalisme compétitif (Tier 4+ avec normes IM/GM)
  ou quand un joueur se plaindra de jouer Black 5 fois sur 9. À ce moment,
  enrichir `_pairRound` avec un état `colorsHad` par joueur et préférer
  les pairings qui équilibrent.

- **Swiss tiebreaks (Buchholz / Sonneborn-Berger)** *(décidé en C.2b)*
  Les standings actuelles trient par score puis par Elo. Les vrais Swiss
  utilisent Buchholz (somme des scores des adversaires), Sonneborn-Berger,
  ou progressive score. **Refactor déclencheur** : quand on rendra publiques
  les standings dans le lobby et que le rang sera disputé serré.

- **Calendar dispatcher style ZenGM strict** *(décidé en B.3, 2026-04-10)*
  Notre `calendar-system.js` expose des fonctions de transition nommées
  directes (`enterTournament()`, `exitTournament()`, `enterTraining()`,
  …). ZenGM passe par un dispatcher central `newPhase(phaseId, …)` avec
  une lookup table et 13 fichiers `newPhase*.ts` séparés. On garde
  notre style direct tant qu'on a 4 phases synchrones et zéro hook
  cross-cutting. **Refactor déclencheurs** : (a) on dépasse 6-7 phases,
  ou (b) on a besoin d'un `finalize()` qui s'exécute après chaque
  transition (par exemple : émettre un mail dans l'inbox à chaque
  changement de phase, ou logguer dans l'historique). Quand l'un des
  deux arrive, basculer sur le pattern ZenGM avec
  `CalendarSystem.PHASE = { IDLE: 0, … }` et un `setPhase(phaseId)`
  central.

## Comment tu dois travailler avec moi

- Générer du code **fichier par fichier**, jamais plusieurs modules en une seule fois.
- Respecter les contrats d'interface de chaque module. Si une fonction publique n'est pas définie, me poser la question avant d'inventer.
- Toujours préciser dans quel fichier coller le code.
- Signaler les versions de librairie (chess.js 0.10.3, onnxruntime-web) si tu as un doute.
- Ne jamais sauter de phase ni anticiper du code d'une phase future.
- Ne jamais proposer React, Vue, Vite, Webpack ou tout autre framework/bundler.
- Ne jamais modifier le Focus en dehors de `focus-system.js`.
- Toujours garder les deux intentions en tête : **jeu fun** et **entraîneur caché**. Si une décision sacrifie l'un pour l'autre, me le signaler.
- Lire [LEARNINGS.md](LEARNINGS.md) avant de démarrer un module — il contient les patterns extraits de ZenGM et Lucas Chess qui doivent guider l'architecture.

## Format de réponse attendu quand tu génères du code

- Nom du fichier exact.
- Remplacer tout le fichier ou coller à un endroit précis.
- Un bref commentaire sur ce que fait le code.
- Si le changement touche plusieurs modules, procéder module par module en attendant ma validation à chaque étape.

## En cas de bug

Je fournirai le message d'erreur exact de la console. Travaille uniquement depuis le message et le fichier concerné — ne me demande pas de coller tout le code du projet.

## Références open source inspirantes

- [ZenGM](https://github.com/zengm-games/zengm) — sports management 100% client-side JS/IndexedDB. Leur règle d'or : *« Don't do everything at once. Make a minimal playable game, and iterate. »*
- [Master of Chess](https://branegames.itch.io/master-of-chess) — seul concurrent direct (Godot, payant). Valide le concept. À ne pas copier mais à connaître.
- [OpenFootManager](https://github.com/openfootmanager/openfootmanager) — clone FM libre (Rust/Tauri). Structure canonique d'un jeu de carrière.
- [Lucas Chess](https://lucaschess.pythonanywhere.com/) — entraîneur d'échecs libre. Référence pour la dimension pédagogique cachée.
