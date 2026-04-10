// dialog-system.js
// Typewriter dialog system. Displays text character by character and
// manages a queue of messages. Pure black box — communicates via
// callbacks.
//
// Phase A: the module is dormant. No caller invokes init() yet.
// Phase D (inbox) and later phases will wire it to a proper DOM host
// (mail reader, coach dialogs, etc.).

const DialogSystem = (() => {

  // ── STATE ────────────────────────────────────────────────────

  let _active    = false;
  let _queue     = [];    // [{ speaker, text, onDone }]
  let _current   = null;  // current message
  let _charIndex = 0;     // index of the displayed character
  let _timer     = null;
  let _speed     = 30;    // ms per character
  let _done      = false; // full text of current message is displayed

  // DOM
  let _overlay = null;
  let _nameEl  = null;
  let _textEl  = null;
  let _hintEl  = null;

  // Callback
  let _onClose = null;    // called when the queue is fully consumed

  // ── INIT ────────────────────────────────────────────────────

  function init() {
    _overlay = document.getElementById('dialog-overlay');
    _nameEl  = document.getElementById('dialog-speaker');
    _textEl  = document.getElementById('dialog-text');
    _hintEl  = document.getElementById('dialog-hint');

    if (!_overlay) {
      console.error('[Dialog] Overlay element not found');
      return;
    }

    window.addEventListener('keydown', _onKey);
    _overlay.addEventListener('click', _advance);
  }

  // ── PUBLIC API ──────────────────────────────────────────────

  /**
   * Display a sequence of messages.
   * @param {Array<{speaker: string, text: string}>} messages
   * @param {Function} [onClose] - callback when the queue is empty
   */
  function show(messages, onClose) {
    _queue   = [...messages];
    _onClose = onClose || null;
    _active  = true;
    _showNext();
  }

  /** Shortcut for a single message. */
  function say(speaker, text, onClose) {
    show([{ speaker, text }], onClose);
  }

  function isActive() { return _active; }

  // ── INTERNAL ────────────────────────────────────────────────

  function _showNext() {
    if (_queue.length === 0) {
      _close();
      return;
    }

    _current   = _queue.shift();
    _charIndex = 0;
    _done      = false;

    _overlay.classList.remove('hidden');
    _nameEl.textContent = _current.speaker || '';
    _textEl.textContent = '';
    _hintEl.style.opacity = '0';

    clearInterval(_timer);
    _timer = setInterval(_typeChar, _speed);
  }

  function _typeChar() {
    if (!_current) return;

    _charIndex++;
    _textEl.textContent = _current.text.substring(0, _charIndex);

    if (_charIndex >= _current.text.length) {
      clearInterval(_timer);
      _done = true;
      _hintEl.style.opacity = '1';
    }
  }

  function _advance() {
    if (!_active) return;

    if (!_done) {
      clearInterval(_timer);
      _textEl.textContent = _current.text;
      _done = true;
      _hintEl.style.opacity = '1';
    } else {
      if (_current && _current.onDone) _current.onDone();
      _showNext();
    }
  }

  function _close() {
    _active  = false;
    _current = null;
    clearInterval(_timer);

    _overlay.classList.add('hidden');

    if (_onClose) {
      const cb = _onClose;
      _onClose = null;
      cb();
    }
  }

  function _onKey(e) {
    if (!_active) return;
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      _advance();
    }
  }

  // ── EXPORT ──────────────────────────────────────────────────

  return {
    init,
    show,
    say,
    isActive,
  };

})();
