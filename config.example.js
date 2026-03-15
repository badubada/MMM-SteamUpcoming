/* config.example.js
 * Full configuration reference for MMM-SteamUpcoming.
 * Do NOT include this file directly – copy the values you need into config.js.
 */

{
  module:   "MMM-SteamUpcoming",
  position: "top_right",

  config: {

    // ── Display ──────────────────────────────────────────────────────────────
    title:           "Steam – Upcoming",
    maxGames:        5,             // Games shown (per page when rotation active)
    showCovers:      true,          // Show capsule artwork
    showReleaseDate: true,          // Show release date badge
    showScores:      true,          // Steam / Metacritic badges (if available)
    language:        "en",          // "en" | "de"

    // ── Region ───────────────────────────────────────────────────────────────
    // ISO 3166-1 alpha-2 country code (uppercase).
    // When set, games not listed/available in this country are filtered out.
    //
    // null / "" = no region filter (show all upcoming games, fastest)
    //
    // ── Supported country codes ──────────────────────────────────────────────
    //  Europe:
    //    "DE" – Germany       "FR" – France        "GB" – United Kingdom
    //    "ES" – Spain         "IT" – Italy         "NL" – Netherlands
    //    "PL" – Poland        "RU" – Russia        "UA" – Ukraine
    //    "CH" – Switzerland   "AT" – Austria       "BE" – Belgium
    //    "PT" – Portugal      "CZ" – Czech Rep.    "HU" – Hungary
    //    "RO" – Romania       "TR" – Turkey        "SE" – Sweden
    //    "NO" – Norway        "DK" – Denmark       "FI" – Finland
    //
    //  Americas:
    //    "US" – United States  "CA" – Canada        "BR" – Brazil
    //    "AR" – Argentina      "MX" – Mexico        "CL" – Chile
    //    "CO" – Colombia       "PE" – Peru
    //
    //  Asia / Pacific:
    //    "CN" – China     "JP" – Japan     "KR" – South Korea  "HK" – Hong Kong
    //    "TW" – Taiwan    "SG" – Singapore "TH" – Thailand     "MY" – Malaysia
    //    "ID" – Indonesia "PH" – Philippines "IN" – India      "AU" – Australia
    //    "NZ" – New Zealand  "KZ" – Kazakhstan
    //
    //  Middle East / Africa:
    //    "AE" – UAE       "SA" – Saudi Arabia  "ZA" – South Africa
    // ─────────────────────────────────────────────────────────────────────────
    country: null,                  // e.g. "DE" – or null to disable

    // ── Filters ──────────────────────────────────────────────────────────────
    // Only show games that release within this many days from today.
    // 0 = no limit (show all upcoming games incl. far-future / TBA titles).
    daysAhead: 90,

    // ── Genre filter ─────────────────────────────────────────────────────────
    // Same genre strings as MMM-SteamDeals.
    // [] = no filter. Requires one Steam appdetails call per game.
    //
    // Main genres:
    //   "Action" | "Adventure" | "Casual" | "Indie" | "RPG" | "Simulation"
    //   "Strategy" | "Sports" | "Racing" | "Massively Multiplayer"
    //   "Early Access" | "Free to Play"
    //
    // Gameplay tags:
    //   "Single-player" | "Multi-player" | "Co-op" | "Online Co-op"
    //   "Local Co-op" | "VR Support"
    //
    // Sub-genres:
    //   "Shooter" | "Puzzle" | "Horror" | "Platformer" | "Open World"
    //   "Tower Defense" | "Card Game" | "Roguelite" | "Roguelike"
    //
    // Accepted aliases: "Multiplayer" → "Multi-player" ✓
    genres: [],

    // ── Sorting ──────────────────────────────────────────────────────────────
    // "release"  – soonest release first (TBA games at the end)  [default]
    // "name"     – alphabetical
    sortBy: "release",

    // ── Rotation ─────────────────────────────────────────────────────────────
    rotationEnabled:  false,
    rotationInterval: 10 * 1000,    // ms per page (recommended min: 8000)
    rotationShowPage: true,          // page dots + countdown bar

    // ── Timing ───────────────────────────────────────────────────────────────
    updateInterval:  60 * 60 * 1000, // 1 hour (upcoming list changes slowly)
    animationSpeed:  1000,
  }
}
