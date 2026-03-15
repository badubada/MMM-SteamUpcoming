/* node_helper.js – MMM-SteamUpcoming
 * Fetches upcoming Steam games from the Steam Store search API.
 */

const NodeHelper = require("node_helper");

const GENRE_ALIASES = {
  "multiplayer":   "multi-player",
  "singleplayer":  "single-player",
  "single player": "single-player",
  "multi player":  "multi-player",
  "freetoplay":    "free to play",
  "free-to-play":  "free to play",
  "mmo":           "massively multiplayer",
};
function normalizeGenre(g) {
  const lower = g.toLowerCase().trim();
  return GENRE_ALIASES[lower] ?? lower;
}

const VALID_COUNTRIES = new Set([
  "US","GB","DE","FR","ES","IT","NL","PL","RU","UA",
  "BR","AR","MX","CL","CO","PE",
  "CN","JP","KR","HK","TW","SG","TH","MY","ID","PH","IN",
  "AU","NZ","CA",
  "NO","SE","DK","FI",
  "CH","AT","BE","PT","CZ","HU","RO","TR",
  "AE","SA","ZA","KZ",
]);

// English month abbreviations Steam uses in appdetails dates
const MONTH_MAP = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

const FETCH_POOL = 100;
// Max games to enrich via appdetails. Each call takes ~400ms (throttle).
// 30 games = ~12s load time, enough for 6 pages of rotation.
const MAX_ENRICH = 30;

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-SteamUpcoming] node_helper started");
    this._fetchFn = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_UPCOMING") this.fetchUpcoming(payload);
  },

  async _getFetch() {
    if (!this._fetchFn)
      this._fetchFn = typeof fetch !== "undefined" ? fetch : require("node-fetch");
    return this._fetchFn;
  },

  // ── Main ──────────────────────────────────────────────────────────────────
  async fetchUpcoming({ maxGames, daysAhead, sortBy, genres, rotationEnabled, country }) {
    try {
      const fetchFn = await this._getFetch();

      const cc = (country && VALID_COUNTRIES.has(country.toUpperCase()))
        ? country.toUpperCase() : null;

      const normalizedGenreFilter = (genres && genres.length > 0)
        ? genres.map(g => normalizeGenre(g)) : null;

      const needsDetails = normalizedGenreFilter !== null || cc !== null;

      // ── 1. Steam search: coming soon ────────────────────────────────────
      const ccParam = cc || "US";
      const url = `https://store.steampowered.com/search/results/?filter=comingsoon&json=1&cc=${ccParam}&l=english&count=${FETCH_POOL}`;
      console.log(`[MMM-SteamUpcoming] Search: ${url}`);

      const res = await fetchFn(url, {
        headers: { "User-Agent": "MagicMirror-MMM-SteamUpcoming/1.0" },
        signal:  AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`Steam search HTTP ${res.status}`);

      const json  = await res.json();
      const items = json.items || [];
      console.log(`[MMM-SteamUpcoming] ${items.length} raw items`);

      // ── 2. Map search results ────────────────────────────────────────────
      // Log first item to understand actual field names
      if (items.length > 0) {
        console.log(`[MMM-SteamUpcoming] Sample item keys: ${Object.keys(items[0]).join(", ")}`);
        console.log(`[MMM-SteamUpcoming] Sample item: ${JSON.stringify(items[0])}`);
      }

      let games = items.map(item => {
        const appId = this._extractAppId(item);
        // Steam search JSON uses different field names depending on endpoint.
        // Known fields for comingsoon: name, logo, release_date, metascore, type, id
        const rawDate = item.release_date || item.releasedate || item.date || "";
        return {
          appId,
          name:             item.name || "Unknown",
          thumb:            item.logo || null,
          releaseRaw:       rawDate,
          releaseDate:      null,
          releaseTimestamp: null,
          genres:           [],
          availableInRegion: true,
        };
      }).filter(g => g.appId);

      // ── 3. Parse dates ───────────────────────────────────────────────────
      const nowMs = Date.now();
      games = games.map(g => ({ ...g, ...this._parseDate(g.releaseRaw) }));

      // ── 4. daysAhead filter ──────────────────────────────────────────────
      if (daysAhead > 0) {
        const cutoff = nowMs + daysAhead * 86400000;
        games = games.filter(g =>
          g.releaseTimestamp == null || g.releaseTimestamp * 1000 <= cutoff
        );
        console.log(`[MMM-SteamUpcoming] After daysAhead filter: ${games.length}`);
      }

      // ── 5. Enrich via appdetails when needed ─────────────────────────────
      if (needsDetails) {
        games = await this._enrich(games.slice(0, MAX_ENRICH), fetchFn, cc, normalizedGenreFilter !== null);

        games = games.filter(g => {
          if (cc && !g.availableInRegion) return false;
          if (normalizedGenreFilter) {
            if (!g.genres || g.genres.length === 0) return false;
            const gg = g.genres.map(x => normalizeGenre(x));
            return normalizedGenreFilter.some(f => gg.includes(f));
          }
          return true;
        });
        console.log(`[MMM-SteamUpcoming] After enrich filter: ${games.length}`);
      } else {
        games = games.map(g => ({ ...g, genres: [], availableInRegion: true }));
      }

      // ── 6. Sort ──────────────────────────────────────────────────────────
      if (sortBy === "name") {
        games.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        games.sort((a, b) => {
          if (a.releaseTimestamp == null && b.releaseTimestamp == null) return 0;
          if (a.releaseTimestamp == null) return 1;
          if (b.releaseTimestamp == null) return -1;
          return a.releaseTimestamp - b.releaseTimestamp;
        });
      }

      // ── 7. Cap ───────────────────────────────────────────────────────────
      const cap    = rotationEnabled ? Math.min(games.length, MAX_ENRICH) : maxGames;
      const result = games.slice(0, cap).map(g => ({
        appId:              g.appId,
        name:               g.name,
        thumb:              g.thumb,
        releaseDate:        g.releaseDate        ?? null,
        releaseTimestamp:   g.releaseTimestamp   ?? null,
        genres:             g.genres             || [],
        steamRatingPercent: g.steamRatingPercent ?? null,
        steamRatingText:    g.steamRatingText    ?? null,
        metacriticScore:    g.metacriticScore    ?? null,
      }));

      console.log(`[MMM-SteamUpcoming] Sending ${result.length} games (rotation=${rotationEnabled})`);
      this.sendSocketNotification("UPCOMING_DATA", result);

    } catch (err) {
      console.error("[MMM-SteamUpcoming] fetchUpcoming error:", err.message);
      this.sendSocketNotification("UPCOMING_ERROR", err.message);
    }
  },

  // ── Extract AppID ─────────────────────────────────────────────────────────
  _extractAppId(item) {
    // Steam search results have `id` as a number
    if (item.id && Number(item.id) > 0) return String(item.id);
    // Fallback: parse from logo/capsule URL  .../apps/12345/...
    const url = item.logo || "";
    const m   = url.match(/\/apps\/(\d+)\//);
    if (m) return m[1];
    // Older URL pattern: .../capsule_sm_120/12345/...
    const m2  = url.match(/\/(\d+)\//);
    return m2 ? m2[1] : null;
  },

  // ── Parse date string → { releaseDate, releaseTimestamp } ─────────────────
  // Handles formats Steam actually uses:
  //   "18 Mar, 2026"   "Mar 18, 2026"   "Mar 2026"   "2026"
  //   "Q2 2026"        "Coming Soon"    ""
  _parseDate(raw) {
    if (!raw || !raw.trim()) return { releaseDate: null, releaseTimestamp: null };
    const s = raw.trim();

    // "18 Mar, 2026" or "18 Mar 2026"
    let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})[,\s]+(\d{4})$/);
    if (m) {
      const ts = this._toTs(m[3], m[2], m[1]);
      if (ts) return { releaseDate: s, releaseTimestamp: ts };
    }

    // "Mar 18, 2026" or "March 18, 2026"
    m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const ts = this._toTs(m[3], m[1], m[2]);
      if (ts) return { releaseDate: s, releaseTimestamp: ts };
    }

    // "Mar 2026" or "March 2026"
    m = s.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
    if (m) {
      const ts = this._toTs(m[2], m[1], "1");
      if (ts) return { releaseDate: s, releaseTimestamp: ts };
    }

    // "2026"
    m = s.match(/^(\d{4})$/);
    if (m) {
      const ts = this._toTs(m[1], "Jan", "1");
      if (ts) return { releaseDate: s, releaseTimestamp: ts };
    }

    // "Q1/Q2/Q3/Q4 2026"
    m = s.match(/Q([1-4])\s*(\d{4})/i);
    if (m) {
      const month = (parseInt(m[1]) - 1) * 3 + 1; // 1,4,7,10
      const d = new Date(parseInt(m[2]), month - 1, 1);
      if (!isNaN(d)) return { releaseDate: s, releaseTimestamp: Math.floor(d.getTime() / 1000) };
    }

    // TBA / Coming Soon / unknown → keep raw string, no timestamp
    return { releaseDate: s, releaseTimestamp: null };
  },

  // Convert year(string) + month-name + day(string) → unix timestamp or null
  _toTs(yearStr, monthStr, dayStr) {
    const mon = MONTH_MAP[monthStr.slice(0, 3).toLowerCase()];
    if (!mon) return null;
    const d = new Date(parseInt(yearStr), mon - 1, parseInt(dayStr));
    return isNaN(d) ? null : Math.floor(d.getTime() / 1000);
  },

  // ── Enrich via appdetails ─────────────────────────────────────────────────
  async _enrich(games, fetchFn, cc, fetchGenres) {
    const results    = [];
    // "release_date" is the correct Steam filter for release date info.
    // "genres" is a separate filter. "basic" does NOT include release_date.
    const filters    = fetchGenres ? "release_date,genres" : "release_date";
    const ccParam    = (cc || "us").toLowerCase();

    for (const game of games) {
      try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${game.appId}&filters=${filters}&cc=${ccParam}&l=english`;
        const res = await fetchFn(url, {
          headers: { "User-Agent": "MagicMirror-MMM-SteamUpcoming/1.0" },
          signal:  AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          console.warn(`[MMM-SteamUpcoming] appdetails HTTP ${res.status} for ${game.appId}`);
          results.push({ ...game, genres: [], availableInRegion: true });
          continue;
        }

        const json    = await res.json();
        const appData = json[game.appId];

        if (!appData || !appData.success || !appData.data) {
          // success:false → game blocked/unavailable in this region
          results.push({ ...game, genres: [], availableInRegion: false });
          continue;
        }

        const d = appData.data;

        // Region: if appdetails returns success+data the game exists in this cc.
        // Only mark unavailable if Steam explicitly says so (d.available===false).
        const availableInRegion = (d.available !== false);

        // Genres
        const genres = (fetchGenres && d.genres)
          ? d.genres.map(g => g.description) : [];

        // Release date from appdetails is more reliable than search snippet.
        // d.release_date = { coming_soon: true, date: "18 Mar, 2026" }
        let { releaseDate, releaseTimestamp } = game;
        if (d.release_date && typeof d.release_date.date === "string") {
          const parsed = this._parseDate(d.release_date.date);
          if (parsed.releaseDate)      releaseDate      = parsed.releaseDate;
          if (parsed.releaseTimestamp) releaseTimestamp = parsed.releaseTimestamp;
        }

        if (game.appId === games[0].appId) {
          // Log first game for debugging
          console.log(`[MMM-SteamUpcoming] appdetails sample – name: "${d.name}", release_date: ${JSON.stringify(d.release_date)}, genres: ${JSON.stringify(genres)}`);
        }

        results.push({ ...game, genres, availableInRegion, releaseDate, releaseTimestamp });
        await new Promise(r => setTimeout(r, 400));

      } catch (err) {
        console.warn(`[MMM-SteamUpcoming] enrich error for ${game.appId}: ${err.message}`);
        results.push({ ...game, genres: [], availableInRegion: true });
      }
    }
    return results;
  },
});
