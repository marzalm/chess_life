// maia-engine.js
// Moteur Maia 2 : adversaire IA via ONNX Runtime Web.
// Port fidèle de tensor.ts + maia.ts + storage.ts du repo CSSLab/maia-platform-frontend.
// Boîte noire — API publique : init(), downloadModel(), getMove(), isReady(), getStatus().

const MaiaEngine = (() => {

  // ── ÉTAT ──────────────────────────────────────────────────────
  let _session        = null;    // ort.InferenceSession
  let _status         = 'idle';  // 'idle' | 'loading' | 'downloading' | 'ready' | 'error'
  let _progress       = 0;
  let _error          = null;
  let _statusCallback = null;    // (status, progress) => void

  let _allMoves         = null;  // { UCI: index } — 1880 entrées
  let _allMovesReversed = null;  // { index: UCI }
  let _eloDict          = null;

  const MODEL_URL     = 'https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/e23a50e/public/maia2/maia_rapid.onnx';
  const MODEL_VERSION = '1.0';

  // ── INDEXEDDB — CACHE DU MODÈLE (~90 Mo) ────────────────────

  const _storage = {
    dbName:    'MaiaModels',
    storeName: 'models',
    version:   1,
    db:        null,

    async openDB() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.version);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { this.db = req.result; resolve(req.result); };
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
      });
    },

    async storeModel(buffer) {
      const db = await this.openDB();
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      await new Promise((resolve, reject) => {
        const req = store.put({
          id:        'maia-rapid-model',
          url:       MODEL_URL,
          version:   MODEL_VERSION,
          data:      new Blob([buffer]),
          timestamp: Date.now(),
          size:      buffer.byteLength,
        });
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
      console.log('[Maia] Modèle stocké dans IndexedDB');
    },

    async getModel() {
      try {
        const db    = await this.openDB();
        const tx    = db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const data  = await new Promise((resolve, reject) => {
          const req = store.get('maia-rapid-model');
          req.onsuccess = () => resolve(req.result || null);
          req.onerror   = () => reject(req.error);
        });
        if (!data) return null;
        if (data.version && data.version !== MODEL_VERSION) {
          await this.deleteModel();
          return null;
        }
        return await data.data.arrayBuffer();
      } catch (e) {
        console.error('[Maia] IndexedDB read failed:', e);
        return null;
      }
    },

    async deleteModel() {
      try {
        const db    = await this.openDB();
        const tx    = db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        await new Promise((resolve, reject) => {
          const req = store.delete('maia-rapid-model');
          req.onsuccess = () => resolve();
          req.onerror   = () => reject(req.error);
        });
      } catch (e) {
        console.error('[Maia] IndexedDB delete failed:', e);
      }
    },

    async requestPersistentStorage() {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    },
  };

  // ── ELO DICT ────────────────────────────────────────────────
  // 11 catégories : <1100 = 0, 1100-1199 = 1, … , >=2000 = 10

  function _createEloDict() {
    const interval = 100, start = 1100, end = 2000;
    const dict = { [`<${start}`]: 0 };
    let idx = 1;
    for (let lb = start; lb < end; lb += interval) {
      dict[`${lb}-${lb + interval - 1}`] = idx++;
    }
    dict[`>=${end}`] = idx;
    return dict;
  }

  function _mapToCategory(elo) {
    const start = 1100, end = 2000, interval = 100;
    if (elo < start) return _eloDict[`<${start}`];
    if (elo >= end)  return _eloDict[`>=${end}`];
    for (let lb = start; lb < end; lb += interval) {
      if (elo >= lb && elo < lb + interval) {
        return _eloDict[`${lb}-${lb + interval - 1}`];
      }
    }
    return 0;
  }

  // ── TENSOR ENCODING (port fidèle de tensor.ts) ──────────────
  // 18 canaux × 8 × 8 = 1152 floats
  //   0-11  : pièces (P N B R Q K p n b r q k)
  //   12    : couleur active (1.0 = blancs, 0.0 = noirs)
  //   13-16 : droits de roque (K Q k q)
  //   17    : case en passant

  function _boardToTensor(fen) {
    const tokens   = fen.split(' ');
    const position = tokens[0];
    const active   = tokens[1];
    const castling = tokens[2];
    const ep       = tokens[3];

    const pieceTypes = ['P','N','B','R','Q','K','p','n','b','r','q','k'];
    const tensor     = new Float32Array(18 * 64);
    const rows       = position.split('/');

    for (let rank = 0; rank < 8; rank++) {
      const row  = 7 - rank;
      let   file = 0;
      for (const ch of rows[rank]) {
        if (isNaN(parseInt(ch))) {
          const idx = pieceTypes.indexOf(ch);
          if (idx >= 0) tensor[idx * 64 + row * 8 + file] = 1.0;
          file++;
        } else {
          file += parseInt(ch);
        }
      }
    }

    // Canal 12 : couleur active
    const turnStart = 12 * 64;
    tensor.fill(active === 'w' ? 1.0 : 0.0, turnStart, turnStart + 64);

    // Canaux 13-16 : droits de roque
    const rights = [
      castling.includes('K'),
      castling.includes('Q'),
      castling.includes('k'),
      castling.includes('q'),
    ];
    for (let i = 0; i < 4; i++) {
      if (rights[i]) {
        const s = (13 + i) * 64;
        tensor.fill(1.0, s, s + 64);
      }
    }

    // Canal 17 : en passant
    if (ep !== '-') {
      const epFile = ep.charCodeAt(0) - 97; // 'a' = 97
      const epRank = parseInt(ep[1], 10) - 1;
      tensor[17 * 64 + epRank * 8 + epFile] = 1.0;
    }

    return tensor;
  }

  // ── MIRRORING FEN (noirs → perspective blancs) ──────────────

  function _mirrorSquare(sq) {
    return sq[0] + (9 - parseInt(sq[1]));
  }

  function _mirrorMove(uci) {
    const from  = uci.substring(0, 2);
    const to    = uci.substring(2, 4);
    const promo = uci.length > 4 ? uci.substring(4) : '';
    return _mirrorSquare(from) + _mirrorSquare(to) + promo;
  }

  function _swapColorsInRank(rank) {
    let out = '';
    for (const ch of rank) {
      if (/[A-Z]/.test(ch))      out += ch.toLowerCase();
      else if (/[a-z]/.test(ch)) out += ch.toUpperCase();
      else                        out += ch;
    }
    return out;
  }

  function _swapCastlingRights(castling) {
    if (castling === '-') return '-';
    const rights  = new Set(castling.split(''));
    const swapped = new Set();
    if (rights.has('K')) swapped.add('k');
    if (rights.has('Q')) swapped.add('q');
    if (rights.has('k')) swapped.add('K');
    if (rights.has('q')) swapped.add('Q');
    let out = '';
    if (swapped.has('K')) out += 'K';
    if (swapped.has('Q')) out += 'Q';
    if (swapped.has('k')) out += 'k';
    if (swapped.has('q')) out += 'q';
    return out || '-';
  }

  function _mirrorFEN(fen) {
    const [position, active, castling, ep, halfmove, fullmove] = fen.split(' ');
    const mirroredPos     = position.split('/').slice().reverse().map(_swapColorsInRank).join('/');
    const mirroredActive  = active === 'w' ? 'b' : 'w';
    const mirroredCastle  = _swapCastlingRights(castling);
    const mirroredEP      = ep !== '-' ? _mirrorSquare(ep) : '-';
    return `${mirroredPos} ${mirroredActive} ${mirroredCastle} ${mirroredEP} ${halfmove} ${fullmove}`;
  }

  // ── PREPROCESSING ───────────────────────────────────────────

  function _preprocess(fen, eloSelf, eloOppo) {
    // Normaliser le FEN via chess.js
    const game    = new Chess(fen);
    let   workFen = game.fen();

    // Si noirs au trait → miroir pour que le modèle voie toujours les blancs
    if (workFen.split(' ')[1] === 'b') {
      workFen = _mirrorFEN(workFen);
    }

    const boardInput  = _boardToTensor(workFen);
    const eloSelfCat  = _mapToCategory(eloSelf);
    const eloOppoCat  = _mapToCategory(eloOppo);

    // Masque des coups légaux (position miroir si noirs)
    const workGame   = new Chess(workFen);
    const moves      = workGame.moves({ verbose: true });
    const legalMoves = new Float32Array(Object.keys(_allMoves).length);

    for (const m of moves) {
      const promo = m.promotion || '';
      const uci   = m.from + m.to + promo;
      const idx   = _allMoves[uci];
      if (idx !== undefined) legalMoves[idx] = 1.0;
    }

    return { boardInput, eloSelfCat, eloOppoCat, legalMoves };
  }

  // ── TRAITEMENT DES SORTIES DU MODÈLE ────────────────────────

  function _processOutputs(fen, logitsMaia, logitsValue, legalMoves) {
    const logits = logitsMaia.data;
    const value  = logitsValue.data;

    // Win probability : valeur brute ∈ [-1,1] → [0,1]
    let winProb   = Math.min(Math.max(value[0] / 2 + 0.5, 0), 1);
    let blackFlag = false;

    if (fen.split(' ')[1] === 'b') {
      blackFlag = true;
      winProb   = 1 - winProb;
    }
    winProb = Math.round(winProb * 10000) / 10000;

    // Indices des coups légaux
    const legalIndices = [];
    for (let i = 0; i < legalMoves.length; i++) {
      if (legalMoves[i] > 0) legalIndices.push(i);
    }

    // Convertir en UCI (dé-miroir si noirs)
    const moveUCIs = legalIndices.map(idx => {
      let uci = _allMovesReversed[String(idx)];
      if (blackFlag) uci = _mirrorMove(uci);
      return uci;
    });

    // Softmax sur les logits des coups légaux uniquement
    const legalLogits = legalIndices.map(idx => logits[idx]);
    const maxLogit    = Math.max(...legalLogits);
    const expLogits   = legalLogits.map(l => Math.exp(l - maxLogit));
    const sumExp      = expLogits.reduce((a, b) => a + b, 0);
    const probs       = expLogits.map(e => e / sumExp);

    // Policy : { UCI: probabilité } trié par proba décroissante
    const entries = moveUCIs.map((uci, i) => [uci, probs[i]]);
    entries.sort((a, b) => b[1] - a[1]);
    const policy = {};
    for (const [uci, p] of entries) policy[uci] = p;

    return { policy, value: winProb };
  }

  // ── ÉCHANTILLONNAGE DE COUP ─────────────────────────────────

  function _sampleMove(policy) {
    const moves = Object.keys(policy);
    const probs = Object.values(policy);
    const r     = Math.random();
    let   cumul = 0;
    for (let i = 0; i < moves.length; i++) {
      cumul += probs[i];
      if (r < cumul) return moves[i];
    }
    return moves[moves.length - 1];
  }

  // ── NOTIFICATION DE STATUT ─────────────────────────────────

  function _notifyStatus() {
    if (_statusCallback) _statusCallback(_status, _progress);
  }

  // ── OPENING BOOK LOCAL ─────────────────────────────────────
  // Clés SAN (lisibles) → converties en clés FEN au runtime via chess.js.
  // Chaque entrée : [UCI, poids] — le poids reflète la fréquence en parties réelles.

  const _BOOK_RAW = {
    // ══════════════════════════════════════════════════════════════
    // BLANC — Ply 0 : 1er coup blanc (position initiale)
    // ══════════════════════════════════════════════════════════════
    '': [['e2e4',3000],['d2d4',2800],['g1f3',1500],['c2c4',1200],['g2g3',400],['b2b3',200],['f2f4',150],['b1c3',100]],

    // ══════════════════════════════════════════════════════════════
    // BLANC — Ply 2 : 2e coup blanc (après réponse noire)
    // ══════════════════════════════════════════════════════════════

    // Après 1.e4 …
    'e4,e5':   [['g1f3',4000],['f1c4',1000],['d2d4',800],['f2f4',600],['b1c3',500]],
    'e4,c5':   [['g1f3',3000],['b1c3',1200],['c2c3',1000],['d2d4',800],['f1c4',400]],
    'e4,e6':   [['d2d4',3500],['g1f3',800],['d2d3',300]],
    'e4,c6':   [['d2d4',3500],['g1f3',600],['b1c3',400]],
    'e4,d5':   [['e4d5',3000],['e4e5',1500]],
    'e4,Nf6':  [['e4e5',3000],['b1c3',1500]],
    'e4,d6':   [['d2d4',3500],['g1f3',1000]],
    'e4,g6':   [['d2d4',3500],['g1f3',1000]],

    // Après 1.d4 …
    'd4,d5':   [['c2c4',3000],['g1f3',1500],['c1f4',800],['b1c3',500],['e2e3',400]],
    'd4,Nf6':  [['c2c4',2800],['g1f3',2000],['c1f4',800],['c1g5',600],['b1c3',400]],
    'd4,e6':   [['c2c4',2500],['g1f3',1500],['e2e4',800]],
    'd4,f5':   [['c2c4',2000],['g1f3',1800],['g2g3',1000]],
    'd4,g6':   [['c2c4',2500],['e2e4',1500],['g1f3',1000]],
    'd4,c5':   [['d4d5',2000],['e2e3',1200]],
    'd4,d6':   [['e2e4',2500],['g1f3',1500]],

    // Après 1.Nf3 …
    'Nf3,d5':  [['d2d4',2500],['c2c4',1500],['g2g3',1000]],
    'Nf3,Nf6': [['d2d4',2000],['c2c4',1800],['g2g3',1200]],
    'Nf3,c5':  [['c2c4',2000],['e2e4',1500]],
    'Nf3,e6':  [['d2d4',2500],['c2c4',800]],
    'Nf3,g6':  [['d2d4',2500],['c2c4',800]],

    // Après 1.c4 …
    'c4,e5':   [['b1c3',2500],['g2g3',1500],['g1f3',1200]],
    'c4,Nf6':  [['b1c3',2500],['d2d4',1500],['g1f3',1000]],
    'c4,c5':   [['b1c3',2000],['g1f3',1800]],
    'c4,e6':   [['b1c3',2000],['d2d4',1500]],
    'c4,g6':   [['d2d4',2500],['b1c3',1500]],

    // ══════════════════════════════════════════════════════════════
    // BLANC — Ply 4 : 3e coup blanc (lignes principales)
    // ══════════════════════════════════════════════════════════════

    // 1.e4 e5 2.Nf3 Nc6
    'e4,e5,Nf3,Nc6':  [['f1b5',2500],['f1c4',2000],['d2d4',1200],['b1c3',800]],
    // 1.e4 e5 2.Nf3 Nf6
    'e4,e5,Nf3,Nf6':  [['f3e5',2500],['b1c3',1500],['d2d4',800]],
    // 1.e4 e5 2.Nf3 d6
    'e4,e5,Nf3,d6':   [['d2d4',3000],['f1c4',1000]],
    // 1.e4 c5 2.Nf3 d6
    'e4,c5,Nf3,d6':   [['d2d4',4000]],
    // 1.e4 c5 2.Nf3 Nc6
    'e4,c5,Nf3,Nc6':  [['d2d4',3000],['f1b5',800],['b1c3',500]],
    // 1.e4 c5 2.Nf3 e6
    'e4,c5,Nf3,e6':   [['d2d4',3500],['b1c3',500]],
    // 1.e4 e6 2.d4 d5
    'e4,e6,d4,d5':    [['b1c3',2000],['b1d2',1800],['e4e5',1500],['e4d5',800]],
    // 1.e4 c6 2.d4 d5
    'e4,c6,d4,d5':    [['b1c3',2000],['b1d2',1500],['e4e5',1500],['e4d5',800]],

    // 1.d4 d5 2.c4 e6
    'd4,d5,c4,e6':    [['b1c3',2500],['g1f3',2000],['c4d5',500]],
    // 1.d4 d5 2.c4 c6
    'd4,d5,c4,c6':    [['g1f3',2500],['b1c3',2000],['e2e3',800]],
    // 1.d4 d5 2.c4 dxc4
    'd4,d5,c4,dxc4':  [['g1f3',2000],['e2e3',1800],['e2e4',1000]],
    // 1.d4 Nf6 2.c4 e6
    'd4,Nf6,c4,e6':   [['b1c3',2500],['g1f3',2500],['g2g3',800]],
    // 1.d4 Nf6 2.c4 g6
    'd4,Nf6,c4,g6':   [['b1c3',3000],['g1f3',1500],['g2g3',500]],
    // 1.d4 Nf6 2.Nf3 d5
    'd4,Nf6,Nf3,d5':  [['c2c4',2500],['c1f4',1000],['e2e3',800]],
    // 1.d4 Nf6 2.Nf3 e6
    'd4,Nf6,Nf3,e6':  [['c2c4',2500],['c1g5',1000],['e2e3',800]],
    // 1.d4 Nf6 2.Nf3 g6
    'd4,Nf6,Nf3,g6':  [['c2c4',2000],['g2g3',1500],['c1f4',500]],

    // ══════════════════════════════════════════════════════════════
    // NOIR — Ply 1 : réponses noires au 1er coup blanc
    // ══════════════════════════════════════════════════════════════
    'e4':  [['e7e5',2500],['c7c5',2300],['e7e6',1200],['c7c6',900],['d7d5',700],['g8f6',500],['d7d6',400],['g7g6',400]],
    'd4':  [['d7d5',2500],['g8f6',2200],['e7e6',800],['f7f5',400],['g7g6',350],['c7c5',300],['d7d6',250]],
    'Nf3': [['d7d5',2500],['g8f6',2000],['c7c5',800],['e7e6',500],['g7g6',400],['d7d6',300]],
    'c4':  [['e7e5',1800],['g8f6',1600],['c7c5',1200],['e7e6',800],['c7c6',500],['g7g6',400]],
    'g3':  [['d7d5',2000],['g8f6',1500],['e7e5',800],['g7g6',600],['c7c5',500]],
    'b3':  [['e7e5',1500],['d7d5',1500],['g8f6',1000],['c7c5',500]],
    'f4':  [['d7d5',2000],['e7e5',1500],['g8f6',800],['c7c5',500]],
    'Nc3': [['d7d5',2000],['g8f6',1500],['e7e5',1000],['c7c5',500]],
    'e3':  [['d7d5',2000],['g8f6',1500],['e7e5',800],['c7c5',500]],
    'd3':  [['d7d5',2000],['g8f6',1500],['e7e5',1000],['g7g6',500]],

    // ── Ply 3 : après 1.e4 … ──
    'e4,e5,Nf3':  [['b8c6',3000],['g8f6',1500],['d7d6',800],['f8c5',400]],
    'e4,e5,Bc4':  [['g8f6',2000],['b8c6',1500],['f8c5',1200]],
    'e4,e5,d4':   [['e5d4',3000],['b8c6',800],['g8f6',500]],
    'e4,e5,f4':   [['e5f4',2500],['d7d5',1500],['f8c5',1000]],
    'e4,e5,Nc3':  [['g8f6',2000],['b8c6',1800],['f8c5',800]],

    'e4,c5,Nf3':  [['d7d6',2500],['b8c6',2000],['e7e6',1500],['g7g6',500]],
    'e4,c5,Nc3':  [['b8c6',2000],['e7e6',1500],['d7d6',1200],['a7a6',500]],
    'e4,c5,c3':   [['d7d5',2500],['g8f6',1500],['e7e6',800]],
    'e4,c5,d4':   [['c5d4',3500]],
    'e4,c5,Bc4':  [['e7e6',2000],['b8c6',1200],['d7d6',800]],

    'e4,e6,d4':   [['d7d5',4000]],
    'e4,e6,Nf3':  [['d7d5',2500],['g8f6',800],['c7c5',500]],
    'e4,e6,d3':   [['d7d5',2500],['c7c5',800],['g8f6',600]],

    'e4,c6,d4':   [['d7d5',4000]],
    'e4,c6,Nf3':  [['d7d5',2500],['g8f6',800]],
    'e4,c6,Nc3':  [['d7d5',3000]],

    'e4,d5,exd5':  [['d8d5',3000],['g8f6',2000],['c7c6',500]],
    'e4,d5,e5':    [['c8f5',1500],['c7c5',1200],['e7e6',800],['b8c6',500]],

    'e4,Nf6,e5':   [['f6d5',4000]],
    'e4,Nf6,Nc3':  [['d7d5',2000],['e7e5',1500],['e7e6',500]],

    'e4,d6,d4':    [['g8f6',3000],['g7g6',1500],['e7e5',500]],
    'e4,d6,Nf3':   [['g8f6',2500],['g7g6',1000]],

    'e4,g6,d4':    [['f8g7',4000]],
    'e4,g6,Nf3':   [['f8g7',3000],['d7d6',800]],

    // ── Ply 3 : après 1.d4 … ──
    'd4,d5,c4':    [['e7e6',2500],['c7c6',2200],['d5c4',1200],['g8f6',500]],
    'd4,d5,Nf3':   [['g8f6',2500],['e7e6',1500],['c7c6',800],['c8f5',500]],
    'd4,d5,Bf4':   [['g8f6',2000],['c7c5',800],['e7e6',800],['c8f5',500]],
    'd4,d5,Nc3':   [['g8f6',2000],['e7e6',800],['c7c6',600]],
    'd4,d5,e3':    [['g8f6',2000],['e7e6',1200],['c7c5',500],['c8f5',400]],

    'd4,Nf6,c4':   [['e7e6',2500],['g7g6',2000],['c7c5',800],['d7d5',500]],
    'd4,Nf6,Nf3':  [['e7e6',2000],['d7d5',1800],['g7g6',1200],['c7c5',500],['b7b6',400]],
    'd4,Nf6,Bf4':  [['d7d5',2000],['e7e6',1500],['g7g6',800],['c7c5',500]],
    'd4,Nf6,Bg5':  [['d7d5',2000],['e7e6',1800],['f6e4',800]],
    'd4,Nf6,Nc3':  [['d7d5',2500],['e7e6',800],['g7g6',600]],
    'd4,Nf6,e3':   [['e7e6',2000],['d7d5',1500],['g7g6',500],['b7b6',400]],

    'd4,e6,c4':    [['g8f6',2500],['d7d5',2000],['f8b4',800]],
    'd4,e6,Nf3':   [['g8f6',2500],['d7d5',1800],['c7c5',500]],
    'd4,e6,e4':    [['d7d5',3000],['c7c5',500]],

    'd4,f5,c4':    [['g8f6',3000],['e7e6',1500]],
    'd4,f5,Nf3':   [['g8f6',2500],['e7e6',1500]],
    'd4,f5,g3':    [['g8f6',2500],['e7e6',1000],['g7g6',800]],

    'd4,g6,c4':    [['f8g7',3500],['d7d5',500]],
    'd4,g6,e4':    [['f8g7',3000],['d7d6',800]],
    'd4,g6,Nf3':   [['f8g7',3000],['d7d5',800]],

    'd4,c5,d5':    [['g8f6',2000],['e7e6',1500],['d7d6',800]],
    'd4,c5,e3':    [['g8f6',2000],['d7d5',1500],['e7e6',800]],
    'd4,d6,e4':    [['g8f6',2500],['g7g6',1500]],
    'd4,d6,Nf3':   [['g8f6',2500],['g7g6',1000]],

    // ── Ply 3 : après 1.Nf3 … ──
    'Nf3,d5,d4':   [['g8f6',2500],['e7e6',1500],['c7c6',800],['c8f5',500]],
    'Nf3,d5,c4':   [['e7e6',2500],['c7c6',2000],['d5c4',800]],
    'Nf3,d5,g3':   [['g8f6',2500],['c7c6',800],['e7e6',800]],
    'Nf3,Nf6,d4':  [['d7d5',2000],['e7e6',1800],['g7g6',1200]],
    'Nf3,Nf6,c4':  [['e7e6',2500],['g7g6',2000],['c7c5',800]],
    'Nf3,Nf6,g3':  [['d7d5',2500],['g7g6',1500],['e7e6',800]],
    'Nf3,c5,c4':   [['b8c6',2000],['g8f6',1800],['g7g6',800]],
    'Nf3,c5,e4':   [['d7d6',2000],['b8c6',1500],['e7e6',800]],
    'Nf3,e6,d4':   [['g8f6',2500],['d7d5',2000],['c7c5',500]],
    'Nf3,g6,d4':   [['f8g7',3500],['d7d5',500]],

    // ── Ply 3 : après 1.c4 … ──
    'c4,e5,Nc3':   [['g8f6',2500],['b8c6',1500],['f8c5',800]],
    'c4,e5,g3':    [['g8f6',2500],['b8c6',1200],['d7d5',800]],
    'c4,e5,Nf3':   [['b8c6',2000],['d7d6',800]],
    'c4,Nf6,Nc3':  [['e7e6',2000],['g7g6',1800],['e7e5',500]],
    'c4,Nf6,d4':   [['e7e6',2500],['g7g6',2000],['d7d5',500]],
    'c4,Nf6,Nf3':  [['e7e6',2000],['g7g6',1500],['b7b6',800]],
    'c4,c5,Nc3':   [['b8c6',2000],['g8f6',1500],['g7g6',800]],
    'c4,c5,Nf3':   [['g8f6',2000],['b8c6',1800]],
    'c4,e6,Nc3':   [['d7d5',2500],['g8f6',1500],['f8b4',800]],
    'c4,e6,d4':    [['g8f6',2500],['d7d5',2000]],
    'c4,g6,d4':    [['f8g7',3000]],
    'c4,g6,Nc3':   [['f8g7',3000],['c7c5',800]],
  };

  let _openingBook = null;

  /**
   * Construit le livre d'ouverture FEN-keyed à partir des séquences SAN.
   * Chaque clé SAN est rejouée via chess.js pour obtenir le FEN exact.
   */
  function _buildOpeningBook() {
    _openingBook = {};
    for (const [sanKey, moves] of Object.entries(_BOOK_RAW)) {
      try {
        const game = new Chess();
        if (sanKey !== '') {
          const sans = sanKey.split(',');
          let valid = true;
          for (const san of sans) {
            if (!game.move(san)) { valid = false; break; }
          }
          if (!valid) {
            console.warn('[Maia] Book: séquence invalide:', sanKey);
            continue;
          }
        }
        const fenKey = game.fen().split(' ').slice(0, 4).join(' ');
        if (_openingBook[fenKey]) {
          const existing = new Map(_openingBook[fenKey].map(m => [m[0], m[1]]));
          for (const [uci, w] of moves) {
            existing.set(uci, (existing.get(uci) || 0) + w);
          }
          _openingBook[fenKey] = [...existing.entries()];
        } else {
          _openingBook[fenKey] = moves;
        }
      } catch (e) {
        console.warn('[Maia] Book: erreur:', sanKey, e);
      }
    }
    console.log(`[Maia] Opening book: ${Object.keys(_openingBook).length} positions`);
  }

  // ── CRÉATION DE SESSION ONNX ────────────────────────────────

  async function _initSession(buffer) {
    // Configurer les chemins WASM avant la création de la session
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
    _session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['wasm'],
    });
  }

  // ── API PUBLIQUE ────────────────────────────────────────────

  return {

    /**
     * Charge les JSON de mapping, ouvre IndexedDB, vérifie le cache.
     * Si le modèle est en cache → crée la session ONNX → status = 'ready'.
     * Sinon → lance automatiquement le téléchargement (silencieux).
     */
    async init() {
      _status  = 'loading';
      _eloDict = _createEloDict();
      _buildOpeningBook();
      _notifyStatus();

      try {
        const [movesRes, movesRevRes] = await Promise.all([
          fetch('lib/maia/all_moves.json'),
          fetch('lib/maia/all_moves_reversed.json'),
        ]);
        _allMoves         = await movesRes.json();
        _allMovesReversed = await movesRevRes.json();

        await _storage.requestPersistentStorage();
        const buffer = await _storage.getModel();

        if (buffer) {
          console.log('[Maia] Modèle trouvé dans IndexedDB, initialisation…');
          await _initSession(buffer);
          _status = 'ready';
          _notifyStatus();
          console.log('[Maia] Prêt');
        } else {
          console.log('[Maia] Pas de modèle en cache — téléchargement automatique');
          await this.downloadModel();
        }
      } catch (e) {
        console.error('[Maia] Init failed:', e);
        _status = 'error';
        _error  = e.message;
        _notifyStatus();
      }
    },

    /**
     * Télécharge le modèle ONNX (~90 Mo), le stocke dans IndexedDB,
     * et crée la session d'inférence. Notifie la progression via _statusCallback.
     */
    async downloadModel() {
      _status   = 'downloading';
      _progress = 0;
      _notifyStatus();

      try {
        const response = await fetch(MODEL_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const reader        = response.body.getReader();
        const contentLength = +(response.headers.get('Content-Length') || 0);
        const chunks        = [];
        let   received      = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) {
            const newPct = Math.floor((received / contentLength) * 100);
            if (newPct > _progress) {
              _progress = newPct;
              _notifyStatus();
            }
          }
        }

        const buffer = new Uint8Array(received);
        let pos = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, pos);
          pos += chunk.length;
        }

        await _storage.storeModel(buffer.buffer);
        await _initSession(buffer.buffer);

        _status   = 'ready';
        _progress = 100;
        _notifyStatus();
        console.log('[Maia] Modèle téléchargé et prêt');
      } catch (e) {
        console.error('[Maia] Téléchargement échoué:', e);
        _status = 'error';
        _error  = e.message;
        _notifyStatus();
        throw e;
      }
    },

    /**
     * Retourne un coup pour la position donnée.
     * Le coup est échantillonné selon la distribution de probabilité du modèle.
     *
     * @param {string} fen
     * @param {number} eloSelf - Elo de l'IA (l'adversaire)
     * @param {number} eloOppo - Elo du joueur humain
     * @returns {Promise<{ move: string, policy: object, value: number }>}
     */
    async getMove(fen, eloSelf, eloOppo) {
      if (!_session) throw new Error('Maia not ready');

      const { boardInput, eloSelfCat, eloOppoCat, legalMoves } =
        _preprocess(fen, eloSelf, eloOppo);

      const feeds = {
        boards:   new ort.Tensor('float32', boardInput, [1, 18, 8, 8]),
        elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloSelfCat)]), [1]),
        elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloOppoCat)]), [1]),
      };

      const results = await _session.run(feeds);
      const { policy, value } = _processOutputs(
        fen, results.logits_maia, results.logits_value, legalMoves
      );

      const move = _sampleMove(policy);
      const top3 = Object.entries(policy).slice(0, 3)
        .map(([m, p]) => `${m}:${(p * 100).toFixed(1)}%`).join(', ');
      console.log(`[Maia] Coup: ${move}  (top: ${top3})  winProb: ${value}`);

      return { move, policy, value };
    },

    // ── OPENING BOOK LOCAL ─────────────────────────────────────

    /**
     * Cherche un coup d'ouverture dans le livre local.
     * Filtre les coups rares (<1%), échantillonne avec température (variété).
     * @param {string} fen
     * @returns {string|null} coup UCI ou null (fallback Maia)
     */
    getOpeningMove(fen, opponentElo) {
      if (!_openingBook) return null;

      // ── Chance de sortir du livre selon l'ELO ──
      // Bas ELO = plus de chances de skip (Maia joue un coup bizarre)
      // 800 → 25% skip, 1200 → 10% skip, 1600+ → 0% skip
      if (opponentElo != null && opponentElo < 1600) {
        const skipChance = Math.max(0, 0.25 - (opponentElo - 800) * 0.00019);
        if (Math.random() < skipChance) {
          console.log(`[Maia] Book skip (elo=${opponentElo}, chance=${(skipChance*100).toFixed(0)}%)`);
          return null;
        }
      }

      const fenKey = fen.split(' ').slice(0, 4).join(' ');
      const moves  = _openingBook[fenKey];
      if (!moves || moves.length === 0) return null;

      const totalWeight = moves.reduce((s, m) => s + m[1], 0);
      if (totalWeight === 0) return null;

      // Filtrer les coups joués dans moins de 1%
      const filtered = moves.filter(m => m[1] / totalWeight >= 0.01);
      if (filtered.length === 0) return null;

      // ── Température ajustée selon l'ELO ──
      // Bas ELO = haute température = plus de coups sous-optimaux
      // 800 → 1.2, 1200 → 0.9, 1600+ → 0.7
      let TEMP = 0.7;
      if (opponentElo != null && opponentElo < 1600) {
        TEMP = Math.min(1.2, 0.7 + (1600 - opponentElo) * 0.000625);
      }

      const freqs = filtered.map(m => Math.pow(m[1], TEMP));
      const total = freqs.reduce((a, b) => a + b, 0);
      const probs = freqs.map(f => f / total);

      const r     = Math.random();
      let   cumul = 0;
      for (let i = 0; i < filtered.length; i++) {
        cumul += probs[i];
        if (r < cumul) {
          console.log(`[Maia] Opening book: ${filtered[i][0]} (temp=${TEMP.toFixed(2)})`);
          return filtered[i][0];
        }
      }
      return filtered[filtered.length - 1][0];
    },

    /**
     * Vérifie si une position FEN est couverte par le livre d'ouverture.
     * @param {string} fen
     * @returns {boolean}
     */
    isBookPosition(fen) {
      if (!_openingBook) return false;
      const fenKey = fen.split(' ').slice(0, 4).join(' ');
      return !!_openingBook[fenKey] && _openingBook[fenKey].length > 0;
    },

    // ── CALLBACK DE STATUT ──────────────────────────────────────

    /** Enregistre un callback appelé à chaque changement de statut/progression. */
    setStatusCallback(fn) { _statusCallback = fn; },

    /** @returns {boolean} */
    isReady()     { return _status === 'ready'; },
    /** @returns {string} */
    getStatus()   { return _status; },
    /** @returns {number} 0-100 */
    getProgress() { return _progress; },
    /** @returns {string|null} */
    getError()    { return _error; },
  };

})();
