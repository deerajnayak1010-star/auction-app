const DEFAULT_BACKGROUND_CONFIG = {
  poster: 'images/cricket-bg-poster.svg',
  defaultScene: 'npl-playground',
  loopWindowSeconds: 0,
  loopRestartSeconds: 0,
  readyTimeoutMs: 5000,
  fallbackPolicy: {
    disableOnReducedMotion: true,
    disableOnSaveData: true,
    slowConnections: ['slow-2g', '2g'],
  },
  scenes: [
    {
      id: 'npl-playground',
      title: 'NPL Playground',
      poster: 'images/cricket-bg-poster.svg',
      sources: [
        {
          src: 'media/cricket-bg.mp4',
          type: 'video/mp4',
        },
      ],
    },
  ],
};

export class BackgroundMediaManager {
  constructor({
    configUrl = 'media/backgrounds.json',
    stageId = 'background-stage',
    storageKey = 'npl_background_video_enabled',
  } = {}) {
    this.configUrl = configUrl;
    this.stageId = stageId;
    this.storageKey = storageKey;
    this.stageEl = null;
    this.posterEl = null;
    this.videoEl = null;
    this.config = DEFAULT_BACKGROUND_CONFIG;
    this.scene = DEFAULT_BACKGROUND_CONFIG.scenes[0];
    this.uiState = {
      active: false,
      enabledPreference: true,
      icon: 'VIDEO',
      label: 'Background Video ON',
      reason: 'video',
    };
    this._prefersReducedMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this._readyTimeout = null;
    this._loopWindowHandler = null;
  }

  async init() {
    this.stageEl = document.getElementById(this.stageId);
    if (!this.stageEl) return;

    this.posterEl = this.stageEl.querySelector('.background-stage__poster');
    this.videoEl = this.stageEl.querySelector('.background-stage__video');
    if (!this.posterEl || !this.videoEl) return;

    this._bindLifecycle();
    this.config = await this._loadConfig();
    this.scene = this._resolveScene(this.config);
    this._applyPoster();
    await this.refresh();
  }

  async refresh() {
    if (!this.stageEl || !this.videoEl) return;

    if (!this.isEnabledPreference()) {
      this._setPosterMode('user-disabled');
      return;
    }

    const autoFallbackReason = this._getAutoFallbackReason();
    if (autoFallbackReason) {
      this._setPosterMode(autoFallbackReason);
      return;
    }

    await this._playScene();
  }

  async toggleUserPreference() {
    const nextEnabled = !this.isEnabledPreference();
    localStorage.setItem(this.storageKey, nextEnabled ? '1' : '0');
    await this.refresh();
    return this.getUiState();
  }

  isEnabledPreference() {
    return localStorage.getItem(this.storageKey) !== '0';
  }

  getUiState() {
    return { ...this.uiState };
  }

  async _loadConfig() {
    try {
      const response = await fetch(this.configUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remoteConfig = await response.json();
      return this._normalizeConfig(remoteConfig);
    } catch (_) {
      return this._normalizeConfig(DEFAULT_BACKGROUND_CONFIG);
    }
  }

  _normalizeConfig(config) {
    const normalized = {
      ...DEFAULT_BACKGROUND_CONFIG,
      ...(config || {}),
      fallbackPolicy: {
        ...DEFAULT_BACKGROUND_CONFIG.fallbackPolicy,
        ...(config?.fallbackPolicy || {}),
      },
      scenes: Array.isArray(config?.scenes) && config.scenes.length > 0
        ? config.scenes.map((scene) => ({
            poster: config.poster || DEFAULT_BACKGROUND_CONFIG.poster,
            ...scene,
            sources: Array.isArray(scene.sources) ? scene.sources : [],
          }))
        : DEFAULT_BACKGROUND_CONFIG.scenes,
    };

    if (!normalized.defaultScene) {
      normalized.defaultScene = normalized.scenes[0]?.id || DEFAULT_BACKGROUND_CONFIG.defaultScene;
    }

    return normalized;
  }

  _resolveScene(config) {
    return config.scenes.find((scene) => scene.id === config.defaultScene) || config.scenes[0] || DEFAULT_BACKGROUND_CONFIG.scenes[0];
  }

  _applyPoster() {
    const poster = this._resolveUrl(this.scene?.poster || this.config.poster || DEFAULT_BACKGROUND_CONFIG.poster);
    this.posterEl.style.backgroundImage = `url("${poster}")`;
  }

  async _playScene() {
    const sources = Array.isArray(this.scene?.sources) ? this.scene.sources : [];
    if (sources.length === 0) {
      this._setPosterMode('missing-source');
      return;
    }

    this.stageEl.dataset.mode = 'loading';
    this.stageEl.dataset.reason = 'loading';
    this.stageEl.classList.remove('is-video-ready');
    this.videoEl.innerHTML = '';
    this.videoEl.poster = this._resolveUrl(this.scene?.poster || this.config.poster || DEFAULT_BACKGROUND_CONFIG.poster);
    this.videoEl.muted = true;
    this.videoEl.defaultMuted = true;
    this.videoEl.loop = true;
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.preload = 'metadata';
    this.videoEl.setAttribute('playsinline', '');
    this.videoEl.setAttribute('muted', '');
    this.videoEl.setAttribute('preload', 'metadata');
    this.videoEl.setAttribute('fetchpriority', 'low');
    this._clearVideoTimers();

    sources.forEach((sourceDef) => {
      const source = document.createElement('source');
      source.src = this._resolveUrl(sourceDef.src);
      source.type = sourceDef.type || 'video/mp4';
      this.videoEl.appendChild(source);
    });

    const readyTimeoutMs = this.scene?.readyTimeoutMs || this.config.readyTimeoutMs || DEFAULT_BACKGROUND_CONFIG.readyTimeoutMs;
    this._readyTimeout = window.setTimeout(() => {
      if (!this.videoEl || this.stageEl?.dataset.mode === 'video') return;
      this._setPosterMode('network-timeout');
    }, readyTimeoutMs);

    const loopWindowSeconds = this.scene?.loopWindowSeconds || this.config.loopWindowSeconds || DEFAULT_BACKGROUND_CONFIG.loopWindowSeconds;
    const loopRestartSeconds = this.scene?.loopRestartSeconds || this.config.loopRestartSeconds || DEFAULT_BACKGROUND_CONFIG.loopRestartSeconds;
    if (loopWindowSeconds > 0) {
      this._loopWindowHandler = () => {
        if (this.videoEl.currentTime >= loopWindowSeconds) {
          this.videoEl.currentTime = loopRestartSeconds;
        }
      };
      this.videoEl.addEventListener('timeupdate', this._loopWindowHandler);
    }

    try {
      this.videoEl.load();
      await this.videoEl.play();
      this._clearVideoTimers();
      this.stageEl.classList.add('is-video-ready');
      this.uiState = {
        active: true,
        enabledPreference: true,
        icon: 'VIDEO',
        label: 'Background Video ON',
        reason: 'video',
      };
      this.stageEl.dataset.mode = 'video';
      this.stageEl.dataset.reason = 'video';
    } catch (_) {
      this._setPosterMode('autoplay-blocked');
    }
  }

  _setPosterMode(reason) {
    if (this.videoEl) {
      this._clearVideoTimers();
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.innerHTML = '';
      this.videoEl.load();
    }

    this.stageEl.classList.remove('is-video-ready');
    this.stageEl.dataset.mode = 'poster';
    this.stageEl.dataset.reason = reason;

    const isUserDisabled = reason === 'user-disabled';
    this.uiState = {
      active: false,
      enabledPreference: this.isEnabledPreference(),
      icon: isUserDisabled ? 'OFF' : 'POSTER',
      label: isUserDisabled ? 'Background Video OFF' : 'Cinematic Poster AUTO',
      reason,
    };
  }

  _getAutoFallbackReason() {
    const policy = this.config.fallbackPolicy || DEFAULT_BACKGROUND_CONFIG.fallbackPolicy;

    if (policy.disableOnReducedMotion && this._prefersReducedMotion?.matches) {
      return 'reduced-motion';
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return '';

    if (policy.disableOnSaveData && connection.saveData) {
      return 'save-data';
    }

    if (policy.slowConnections?.includes(connection.effectiveType)) {
      return 'slow-network';
    }

    return '';
  }

  _clearVideoTimers() {
    if (this._readyTimeout) {
      clearTimeout(this._readyTimeout);
      this._readyTimeout = null;
    }

    if (this.videoEl && this._loopWindowHandler) {
      this.videoEl.removeEventListener('timeupdate', this._loopWindowHandler);
      this._loopWindowHandler = null;
    }
  }

  _resolveUrl(value) {
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    return new URL(value, window.location.href).href;
  }

  _bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (!this.videoEl || this.stageEl?.dataset.mode !== 'video') return;

      if (document.hidden) {
        this.videoEl.pause();
      } else {
        this.videoEl.play().catch(() => {
          this._setPosterMode('resume-blocked');
        });
      }
    });

    this.videoEl?.addEventListener('error', () => {
      this._setPosterMode('media-error');
    });

    if (this._prefersReducedMotion) {
      const handler = () => this.refresh();
      if (typeof this._prefersReducedMotion.addEventListener === 'function') {
        this._prefersReducedMotion.addEventListener('change', handler);
      } else if (typeof this._prefersReducedMotion.addListener === 'function') {
        this._prefersReducedMotion.addListener(handler);
      }
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', () => this.refresh());
    }
  }
}
