/* MMM-SteamUpcoming
 * MagicMirror² module – Upcoming Steam games via Steam Store API
 */

Module.register("MMM-SteamUpcoming", {

  defaults: {
    title:            "Steam – Upcoming",
    maxGames:         5,
    showCovers:       true,
    showReleaseDate:  true,
    showScores:       true,
    language:         "en",         // "en" | "de"
    country:          null,
    daysAhead:        90,           // 0 = no limit
    genres:           [],
    sortBy:           "release",    // "release" | "name"
    rotationEnabled:  false,
    rotationInterval: 10 * 1000,
    rotationShowPage: true,
    updateInterval:   60 * 60 * 1000,
    animationSpeed:   1000,
  },

  // ── i18n ──────────────────────────────────────────────────────────────────
  _i18n: {
    en: { loading: "Loading upcoming games…", empty: "No upcoming games found.",
          updated: "Updated", tba: "TBA", error: "Error",
          today: "Today", tomorrow: "Tomorrow", inDays: "in {n} days" },
    de: { loading: "Kommende Spiele werden geladen…", empty: "Keine kommenden Spiele gefunden.",
          updated: "Aktualisiert", tba: "TBA", error: "Fehler",
          today: "Heute", tomorrow: "Morgen", inDays: "in {n} Tagen" },
  },

  _t(key, vars) {
    const lang = this.config.language === "de" ? "de" : "en";
    let str = (this._i18n[lang] || this._i18n.en)[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
    return str;
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  start() {
    Log.info("[MMM-SteamUpcoming] start()");
    this.games          = [];
    this.loaded         = false;
    this.error          = null;
    this.currentPage    = 0;
    this._rotTimer      = null;   // page-flip interval
    this._tickTimer     = null;   // 1-second DOM-tick interval
    this._secondsLeft   = 0;
    this._lastFetch     = null;   // timestamp of last successful data fetch
    this._scheduleUpdate();
  },

  // ── Fetching ───────────────────────────────────────────────────────────────
  _scheduleUpdate() {
    this._doFetch();
    setInterval(() => this._doFetch(), this.config.updateInterval);
  },

  _doFetch() {
    this.sendSocketNotification("FETCH_UPCOMING", {
      maxGames:        this.config.maxGames,
      daysAhead:       this.config.daysAhead,
      sortBy:          this.config.sortBy,
      genres:          this.config.genres,
      rotationEnabled: this.config.rotationEnabled,
      country:         this.config.country || null,
    });
  },

  // ── Socket ─────────────────────────────────────────────────────────────────
  socketNotificationReceived(notification, payload) {
    if (notification === "UPCOMING_DATA") {
      this.games       = payload;
      this.loaded      = true;
      this.error       = null;
      this.currentPage = 0;
      this._lastFetch  = Date.now();
      this._stopAll();
      this.updateDom(this.config.animationSpeed);
      // Give MagicMirror time to insert the new DOM, then start rotation + tick
      setTimeout(() => this._startRotation(), this.config.animationSpeed + 200);
    } else if (notification === "UPCOMING_ERROR") {
      this.error  = payload;
      this.loaded = true;
      this._stopAll();
      this.updateDom(this.config.animationSpeed);
    }
  },

  // ── Rotation ───────────────────────────────────────────────────────────────
  _totalPages() {
    if (!this.games || this.games.length === 0) return 1;
    return Math.ceil(this.games.length / this.config.maxGames);
  },

  _startRotation() {
    this._stopAll();
    if (!this.config.rotationEnabled) return;
    if (this._totalPages() <= 1) {
      Log.info("[MMM-SteamUpcoming] Rotation skipped: only 1 page (" + this.games.length + " games, maxGames=" + this.config.maxGames + ")");
      return;
    }
    Log.info("[MMM-SteamUpcoming] Rotation started: " + this._totalPages() + " pages");

    const intervalMs  = this.config.rotationInterval;
    const intervalSec = Math.round(intervalMs / 1000);
    this._secondsLeft = intervalSec;

    // Page-flip timer
    this._rotTimer = setInterval(() => {
      this.currentPage = (this.currentPage + 1) % this._totalPages();
      this._secondsLeft = intervalSec;
      this.updateDom(this.config.animationSpeed);
      // Restart tick after DOM is replaced
      this._stopTick();
      setTimeout(() => this._startTick(), this.config.animationSpeed + 200);
    }, intervalMs);

    // Start the 1-second tick immediately
    this._startTick();
  },

  _startTick() {
    this._stopTick();
    // Render initial value into DOM right away
    this._writeToDom();
    this._tickTimer = setInterval(() => {
      this._secondsLeft = Math.max(0, this._secondsLeft - 1);
      this._writeToDom();
    }, 1000);
  },

  _stopTick() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  },

  _stopAll() {
    this._stopTick();
    if (this._rotTimer) { clearInterval(this._rotTimer); this._rotTimer = null; }
  },

  // ── Write countdown into live DOM ─────────────────────────────────────────
  // MagicMirror renders modules inside a div#module_X. We search within
  // that container rather than document-wide to be safe.
  _writeToDom() {
    // Find our module wrapper – MagicMirror gives every module div.module with
    // id "module_N". We stored identifier in start(), use it here.
    const labelId = "su-cd-label-" + this.identifier;
    const barId   = "su-cd-bar-"   + this.identifier;
    const label   = document.getElementById(labelId);
    const bar     = document.getElementById(barId);
    const total   = Math.round(this.config.rotationInterval / 1000);
    if (label) label.textContent = this._secondsLeft + "s";
    if (bar)   bar.style.width   = ((this._secondsLeft / total) * 100) + "%";
  },

  getStyles() { return ["MMM-SteamUpcoming.css"]; },

  // ── Release label ──────────────────────────────────────────────────────────
  _releaseDateLabel(ts) {
    if (ts == null) return this._t("tba");
    const nowDay     = new Date(); nowDay.setHours(0,0,0,0);
    const releaseDay = new Date(ts * 1000); releaseDay.setHours(0,0,0,0);
    const diff       = Math.round((releaseDay - nowDay) / 86400000);
    if (diff === 0) return this._t("today");
    if (diff === 1) return this._t("tomorrow");
    if (diff > 1 && diff <= 14) return this._t("inDays", { n: diff });
    const locale = this.config.language === "de" ? "de-DE" : "en-GB";
    return releaseDay.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  },

  // ── DOM ────────────────────────────────────────────────────────────────────
  getDom() {
    const wrap = document.createElement("div");
    wrap.className = "mmm-steamupcoming";

    // Header
    const hdr = document.createElement("div");
    hdr.className = "su-header";
    hdr.innerHTML = `<span class="su-logo">&#9654;</span> ${this.config.title}`;
    wrap.appendChild(hdr);

    // States
    if (!this.loaded) {
      return this._appendMsg(wrap, "su-loading", this._t("loading"));
    }
    if (this.error) {
      return this._appendMsg(wrap, "su-error", `${this._t("error")}: ${this.error}`);
    }
    if (!this.games || this.games.length === 0) {
      return this._appendMsg(wrap, "su-empty", this._t("empty"));
    }

    // Game list
    const pageGames = this.config.rotationEnabled
      ? this.games.slice(this.currentPage * this.config.maxGames,
                         (this.currentPage + 1) * this.config.maxGames)
      : this.games;

    const list = document.createElement("ul");
    list.className = "su-list";

    pageGames.forEach((game, idx) => {
      const item = document.createElement("li");
      item.className = "su-item";
      item.style.animationDelay = `${idx * 80}ms`;

      // Cover
      if (this.config.showCovers && game.thumb) {
        const img = document.createElement("img");
        img.className = "su-cover";
        img.src = game.thumb; img.alt = game.name; img.loading = "lazy";
        img.onerror = () => { img.style.display = "none"; };
        item.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "su-info";

      // Title
      const titleEl = document.createElement("div");
      titleEl.className = "su-title"; titleEl.textContent = game.name;
      info.appendChild(titleEl);

      // Score badges
      if (this.config.showScores) {
        const hasSteam = game.steamRatingPercent && parseInt(game.steamRatingPercent) > 0;
        const hasMeta  = game.metacriticScore    && parseInt(game.metacriticScore)    > 0;
        if (hasSteam || hasMeta) {
          const row = document.createElement("div"); row.className = "su-scores";
          if (hasSteam) {
            const pct = parseInt(game.steamRatingPercent);
            const tier = pct >= 80 ? "positive" : pct >= 60 ? "mixed" : "negative";
            const b = document.createElement("span");
            b.className = `su-score-badge su-score-steam su-score-${tier}`;
            b.title = game.steamRatingText || ""; b.textContent = `♥ ${pct}%`;
            row.appendChild(b);
          }
          if (hasMeta) {
            const s = parseInt(game.metacriticScore);
            const tier = s >= 75 ? "positive" : s >= 50 ? "mixed" : "negative";
            const b = document.createElement("span");
            b.className = `su-score-badge su-score-meta su-score-${tier}`;
            b.title = "Metacritic"; b.textContent = `MC ${s}`;
            row.appendChild(b);
          }
          info.appendChild(row);
        }
      }

      // Genre tags
      if (game.genres && game.genres.length > 0) {
        const row = document.createElement("div"); row.className = "su-genres";
        game.genres.slice(0, 2).forEach(g => {
          const tag = document.createElement("span");
          tag.className = "su-genre-tag"; tag.textContent = g;
          row.appendChild(tag);
        });
        info.appendChild(row);
      }

      // Release date
      if (this.config.showReleaseDate) {
        const dateRow = document.createElement("div"); dateRow.className = "su-date-row";
        const label   = this._releaseDateLabel(game.releaseTimestamp);
        const isClose = game.releaseTimestamp != null &&
          (game.releaseTimestamp * 1000 - Date.now()) < 14 * 86400000;
        const badge = document.createElement("span");
        badge.className   = "su-release-badge" + (isClose ? " su-release-soon" : "");
        badge.textContent = label;
        dateRow.appendChild(badge);
        // Show raw date string when a timestamp exists (i.e. not pure TBA)
        if (game.releaseDate && game.releaseTimestamp != null) {
          const full = document.createElement("span");
          full.className = "su-release-full"; full.textContent = game.releaseDate;
          dateRow.appendChild(full);
        }
        info.appendChild(dateRow);
      }

      item.appendChild(info);
      list.appendChild(item);
    });

    wrap.appendChild(list);

    // Rotation indicator
    if (this.config.rotationEnabled && this.config.rotationShowPage) {
      const total = this._totalPages();
      const ind   = document.createElement("div"); ind.className = "su-rotation-indicator";

      // Page dots
      const dots = document.createElement("div"); dots.className = "su-page-dots";
      for (let i = 0; i < Math.max(total, 1); i++) {
        const dot = document.createElement("span");
        dot.className = "su-dot" + (i === this.currentPage ? " su-dot-active" : "");
        dots.appendChild(dot);
      }
      ind.appendChild(dots);

      // Countdown – IDs scoped to this module instance
      const cdWrap  = document.createElement("div"); cdWrap.className = "su-countdown";
      const cdLabel = document.createElement("span");
      cdLabel.className   = "su-countdown-label";
      cdLabel.id          = "su-cd-label-" + this.identifier;
      cdLabel.textContent = this._secondsLeft + "s";
      cdWrap.appendChild(cdLabel);

      const track = document.createElement("div"); track.className = "su-countdown-track";
      const bar   = document.createElement("div");
      bar.className   = "su-countdown-bar";
      bar.id          = "su-cd-bar-" + this.identifier;
      const pct       = this.config.rotationInterval > 0
        ? (this._secondsLeft / Math.round(this.config.rotationInterval / 1000)) * 100
        : 100;
      bar.style.width = pct + "%";
      track.appendChild(bar);
      cdWrap.appendChild(track);
      ind.appendChild(cdWrap);
      wrap.appendChild(ind);
    }

    // Footer
    const footer = document.createElement("div"); footer.className = "su-footer";
    const locale  = this.config.language === "de" ? "de-DE" : "en-GB";
    const fetchTime = this._lastFetch
      ? new Date(this._lastFetch).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : "—";
    footer.textContent = `${this._t("updated")}: ${fetchTime}`;
    wrap.appendChild(footer);

    return wrap;
  },

  _appendMsg(wrap, cls, text) {
    const el = document.createElement("div"); el.className = cls; el.textContent = text;
    wrap.appendChild(el); return wrap;
  },

});
