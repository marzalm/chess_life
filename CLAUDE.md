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

## Refactors différés (à reprendre quand le moment sera venu)

Ces décisions ont été prises avec la note "à revoir plus tard". Quand
tu travailles sur le module concerné, vérifie si l'un de ces points
est mûr pour être traité.

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
