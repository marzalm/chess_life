// character-creator.js
//
// Initial character creation screen. Owns its own draft state and
// only writes to CareerManager when the player confirms via
// "Start career". The bootstrap shows this screen on first launch
// (when CareerManager.hasCharacter() is false).
//
// Avatar layers come from AvatarData. The renderer is placeholder
// CSS shapes; replacing it with real pixel art sprites in Phase H
// only requires changing _renderAvatarPreview() — the layer indices
// stored in CareerManager don't change.
//
// Public API:
//   CharacterCreator.init()
//   CharacterCreator.show(onComplete)   // shows screen, hides others
//   CharacterCreator.hide()
//   CharacterCreator.isOpen()

const CharacterCreator = (() => {

  // ── DRAFT STATE ────────────────────────────────────────────

  let _open = false;
  let _onComplete = null;

  /** @type {{ playerName, nationality, gender, avatar }} */
  let _draft = null;

  function _resetDraft() {
    _draft = {
      playerName:  '',
      nationality: 'NO',
      gender:      'M',
      avatar:      AvatarData.random(),
    };
  }

  // ── COUNTRY LIST ───────────────────────────────────────────
  // Top chess nations + a sample of regions. Stored as { code, name, flag }.
  // The code is what we persist in player.nationality.

  const COUNTRIES = [
    { code: 'AR', name: 'Argentina',     flag: '🇦🇷' },
    { code: 'AM', name: 'Armenia',       flag: '🇦🇲' },
    { code: 'AU', name: 'Australia',     flag: '🇦🇺' },
    { code: 'AZ', name: 'Azerbaijan',    flag: '🇦🇿' },
    { code: 'BR', name: 'Brazil',        flag: '🇧🇷' },
    { code: 'CA', name: 'Canada',        flag: '🇨🇦' },
    { code: 'CN', name: 'China',         flag: '🇨🇳' },
    { code: 'CU', name: 'Cuba',          flag: '🇨🇺' },
    { code: 'CZ', name: 'Czechia',       flag: '🇨🇿' },
    { code: 'DK', name: 'Denmark',       flag: '🇩🇰' },
    { code: 'EG', name: 'Egypt',         flag: '🇪🇬' },
    { code: 'EN', name: 'England',       flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { code: 'FR', name: 'France',        flag: '🇫🇷' },
    { code: 'DE', name: 'Germany',       flag: '🇩🇪' },
    { code: 'GE', name: 'Georgia',       flag: '🇬🇪' },
    { code: 'HU', name: 'Hungary',       flag: '🇭🇺' },
    { code: 'IN', name: 'India',         flag: '🇮🇳' },
    { code: 'IR', name: 'Iran',          flag: '🇮🇷' },
    { code: 'IL', name: 'Israel',        flag: '🇮🇱' },
    { code: 'IT', name: 'Italy',         flag: '🇮🇹' },
    { code: 'JP', name: 'Japan',         flag: '🇯🇵' },
    { code: 'KZ', name: 'Kazakhstan',    flag: '🇰🇿' },
    { code: 'MA', name: 'Morocco',       flag: '🇲🇦' },
    { code: 'NL', name: 'Netherlands',   flag: '🇳🇱' },
    { code: 'NO', name: 'Norway',        flag: '🇳🇴' },
    { code: 'PE', name: 'Peru',          flag: '🇵🇪' },
    { code: 'PH', name: 'Philippines',   flag: '🇵🇭' },
    { code: 'PL', name: 'Poland',        flag: '🇵🇱' },
    { code: 'RO', name: 'Romania',       flag: '🇷🇴' },
    { code: 'RU', name: 'Russia',        flag: '🇷🇺' },
    { code: 'RS', name: 'Serbia',        flag: '🇷🇸' },
    { code: 'ES', name: 'Spain',         flag: '🇪🇸' },
    { code: 'SE', name: 'Sweden',        flag: '🇸🇪' },
    { code: 'CH', name: 'Switzerland',   flag: '🇨🇭' },
    { code: 'TR', name: 'Turkey',        flag: '🇹🇷' },
    { code: 'UA', name: 'Ukraine',       flag: '🇺🇦' },
    { code: 'GB', name: 'United Kingdom',flag: '🇬🇧' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'UZ', name: 'Uzbekistan',    flag: '🇺🇿' },
    { code: 'VN', name: 'Vietnam',       flag: '🇻🇳' },
  ];

  function _countryByCode(code) {
    return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
  }

  // ── LAYER CYCLERS ──────────────────────────────────────────

  /** Map of layer key → preset array, used for cycling. */
  const LAYER_SOURCES = {
    skinTone:  () => AvatarData.SKIN_TONES,
    faceShape: () => AvatarData.FACE_SHAPES,
    eyeColor:  () => AvatarData.EYE_COLORS,
    hairStyle: () => AvatarData.HAIR_STYLES,
    hairColor: () => AvatarData.HAIR_COLORS,
    outfit:    () => AvatarData.OUTFITS,
  };

  function _cycle(layerKey, dir) {
    const arr = LAYER_SOURCES[layerKey]();
    const len = arr.length;
    _draft.avatar[layerKey] = (_draft.avatar[layerKey] + dir + len) % len;
    _renderAvatarPreview();
    _renderLayerLabels();
  }

  // ── RENDERERS ──────────────────────────────────────────────

  /**
   * Render the placeholder avatar inside #cc-avatar-preview using
   * stacked CSS divs. Replace with sprite rendering in Phase H.
   */
  function _renderAvatarPreview() {
    const root = document.getElementById('cc-avatar-preview');
    if (!root) return;

    const a = AvatarData.normalize(_draft.avatar);
    const skin   = AvatarData.SKIN_TONES[a.skinTone];
    const hairC  = AvatarData.HAIR_COLORS[a.hairColor];
    const hairS  = AvatarData.HAIR_STYLES[a.hairStyle];
    const eyes   = AvatarData.EYE_COLORS[a.eyeColor];
    const face   = AvatarData.FACE_SHAPES[a.faceShape];
    const outfit = AvatarData.OUTFITS[a.outfit];

    root.innerHTML = `
      <div class="cc-avatar-hair"
           style="height:${hairS.height}px;background:${hairC};
                  border-radius:${hairS.sides}px ${hairS.sides}px 0 0;"></div>
      <div class="cc-avatar-face"
           style="background:${skin};border-radius:${face.borderRadius};">
        <div class="cc-avatar-eye left"  style="background:${eyes};"></div>
        <div class="cc-avatar-eye right" style="background:${eyes};"></div>
      </div>
      <div class="cc-avatar-outfit" style="background:${outfit};"></div>
    `;
  }

  function _renderLayerLabels() {
    const a = AvatarData.normalize(_draft.avatar);
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('cc-label-skinTone',  `${a.skinTone + 1} / ${AvatarData.SKIN_TONES.length}`);
    set('cc-label-faceShape', AvatarData.FACE_SHAPES[a.faceShape].name);
    set('cc-label-eyeColor',  `${a.eyeColor + 1} / ${AvatarData.EYE_COLORS.length}`);
    set('cc-label-hairStyle', AvatarData.HAIR_STYLES[a.hairStyle].name);
    set('cc-label-hairColor', `${a.hairColor + 1} / ${AvatarData.HAIR_COLORS.length}`);
    set('cc-label-outfit',    `${a.outfit + 1} / ${AvatarData.OUTFITS.length}`);
  }

  function _renderCountryDropdown() {
    const sel = document.getElementById('cc-country');
    if (!sel) return;
    sel.innerHTML = '';
    for (const c of COUNTRIES) {
      const opt = document.createElement('option');
      opt.value       = c.code;
      opt.textContent = `${c.flag} ${c.name}`;
      sel.appendChild(opt);
    }
    sel.value = _draft.nationality;
  }

  function _renderGenderRadios() {
    const root = document.getElementById('cc-gender-row');
    if (!root) return;
    const radios = root.querySelectorAll('input[name="cc-gender"]');
    radios.forEach((r) => { r.checked = (r.value === _draft.gender); });
  }

  function _renderName() {
    const inp = document.getElementById('cc-name');
    if (inp) inp.value = _draft.playerName;
  }

  // ── BINDINGS ───────────────────────────────────────────────

  function _bind() {
    // Layer cyclers — buttons share a data-layer / data-dir attribute
    const cyclerBtns = document.querySelectorAll('.cc-layer-btn');
    cyclerBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        const dir   = parseInt(btn.dataset.dir, 10);
        if (layer && (dir === 1 || dir === -1)) _cycle(layer, dir);
      });
    });

    // Name input
    const nameInp = document.getElementById('cc-name');
    if (nameInp) {
      nameInp.addEventListener('input', () => {
        _draft.playerName = nameInp.value;
      });
    }

    // Country dropdown
    const country = document.getElementById('cc-country');
    if (country) {
      country.addEventListener('change', () => {
        _draft.nationality = country.value;
      });
    }

    // Gender radios
    const radios = document.querySelectorAll('input[name="cc-gender"]');
    radios.forEach((r) => {
      r.addEventListener('change', () => {
        if (r.checked) _draft.gender = r.value;
      });
    });

    // Randomize avatar
    const btnRand = document.getElementById('cc-randomize');
    if (btnRand) {
      btnRand.addEventListener('click', () => {
        _draft.avatar = AvatarData.random();
        _renderAvatarPreview();
        _renderLayerLabels();
        if (typeof SoundManager !== 'undefined') SoundManager.playMove();
      });
    }

    // Start career
    const btnStart = document.getElementById('cc-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => _onStartClick());
    }
  }

  function _onStartClick() {
    const name = (_draft.playerName || '').trim();
    if (!name) {
      const inp = document.getElementById('cc-name');
      if (inp) inp.focus();
      _showError('Please enter your name.');
      if (typeof SoundManager !== 'undefined') SoundManager.playBlunder();
      return;
    }
    _hideError();

    CareerManager.player.create({
      playerName:  name,
      nationality: _draft.nationality,
      gender:      _draft.gender,
      avatar:      AvatarData.normalize(_draft.avatar),
      settings:    { difficulty: 'realistic' },
    });

    if (typeof SoundManager !== 'undefined') SoundManager.playFlowEnter(2);

    const cb = _onComplete;
    _onComplete = null;
    hide();
    if (typeof cb === 'function') cb();
  }

  function _showError(msg) {
    const el = document.getElementById('cc-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function _hideError() {
    const el = document.getElementById('cc-error');
    if (el) el.classList.add('hidden');
  }

  // ── PUBLIC API ─────────────────────────────────────────────

  function init() {
    _resetDraft();
    _bind();
  }

  function show(onComplete) {
    _open = true;
    _onComplete = onComplete || null;
    _resetDraft();

    _renderAvatarPreview();
    _renderLayerLabels();
    _renderCountryDropdown();
    _renderGenderRadios();
    _renderName();
    _hideError();

    UICareer.showScreen('character');
  }

  function hide() {
    _open = false;
  }

  function isOpen() {
    return _open;
  }

  return {
    init,
    show,
    hide,
    isOpen,
    COUNTRIES,
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.creator = CharacterCreator;
}
