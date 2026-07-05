# The Wanderer's Codex

A reusable, game-like travel journal. Pure HTML, CSS, and vanilla JavaScript — no build step, no framework, no backend. Every trip — its cities, days, quests, packing list, budget, and achievements — lives entirely in one JSON file. The app itself has no idea what "San Marino" or "Japan" is; it only knows how to read the shape of `trip-data.json` and turn it into a Codex.

This repo ships with one example trip (**San Marino 2027**) so you can see the format in action, but the app is not written for that trip specifically — swap the JSON and it becomes a different journal entirely.

## Files

| File | Purpose |
|---|---|
| `index.html` | The app shell. You should never need to edit this to add a trip. |
| `styles.css` | The pastel-goth / illuminated-manuscript visual theme. |
| `app.js` | All logic: rendering, navigation, local storage, achievements, import/export. |
| `trip-data.example.json` | The example trip (San Marino 2027) and the reference schema. |
| `README.md` | This file. |

## Running it

**Locally, the simple way:** just open `index.html` in a browser. Because browsers block `fetch()` of local files from `file://` pages, the app will detect that trip-data.json couldn't be loaded and show you a "Begin a Codex" screen where you can **paste** the contents of `trip-data.example.json` (or your own file) to load it instantly. Uploading a file works the same way.

**Locally, with a trip pre-loaded:** rename `trip-data.example.json` to `trip-data.json` (same folder as `index.html`), then serve the folder with any static server, e.g.:
```
python3 -m http.server 8000
```
and open `http://localhost:8000`. The app fetches `./trip-data.json` automatically on load.

**Deploying to GitHub Pages:**
1. Push this folder to a repository.
2. In the repo settings, enable GitHub Pages for the branch/folder you pushed to.
3. Rename `trip-data.example.json` to `trip-data.json` (or leave both — the app will fall back to the example file if `trip-data.json` is missing) before or after pushing.

**Deploying to Cloudflare Pages:**
1. Create a new Pages project pointing at this folder (or its repository).
2. No build command is needed — it's static files. Set the build output directory to the project root.
3. Same `trip-data.json` note as above.

## Creating a new trip — edit only the JSON

Never touch `index.html`, `styles.css`, or `app.js` to add a trip. Copy `trip-data.example.json`, rename it `trip-data.json`, and rewrite the content following the schema below. You can also paste/upload a new JSON file at any time from the in-app **Load & Save** screen (Chapter XII) or the "Load a Different Codex" link on the opening screen — no redeploy needed.

Every field except `meta.title`, `cities` (at least one), and `days` (can be an empty array `[]`) is optional — the app fills in sensible defaults for anything missing, so you can start small and grow the file over time.

### `meta`
```json
"meta": {
  "tripId": "my-trip-2028",         // optional — auto-generated from the title if omitted
  "title": "My Trip 2028",          // required
  "subtitle": "A short tagline",
  "dates": { "start": "2028-01-01", "end": "2028-01-10" },
  "travelStyle": ["food", "hiking"],
  "currency": "USD",
  "openingNarrative": "Flavor text shown on the opening screen."
}
```

### `cities`
An array of stops. `coords.x` / `coords.y` are percentages (0–100) used to place the marker on the stylized World Map — they don't need to be real GPS coordinates, just a rough relative layout (e.g. a city in the north-west of your route gets a low `x` and low `y`).
```json
{
  "id": "kyoto",                    // optional — slugified from name if omitted
  "name": "Kyoto",
  "region": "Kansai",
  "coords": { "x": 40, "y": 60 },
  "arrival": "2028-01-03",
  "departure": "2028-01-06",
  "description": "…",
  "highlights": ["Fushimi Inari", "Arashiyama"],
  "transportToNext": "Shinkansen to Osaka, ~15 minutes."
}
```

### `route`
Optional array of city `id`s in visiting order, used to draw the path on the World Map. Defaults to the order of the `cities` array if omitted.

### `days`
The day-by-day itinerary. `questIds` links a day to entries in the `quests` array (optional).
```json
{
  "day": 1,
  "date": "2028-01-03",
  "cityId": "kyoto",
  "title": "Arrival",
  "summary": "…",
  "activities": [{ "time": "14:00", "description": "…" }],
  "questIds": ["q-kyoto-1"]
}
```

### `quests`
```json
{ "id": "q-kyoto-1", "cityId": "kyoto", "type": "main", "title": "…", "description": "…", "reward": "…" }
```
`type` is free text; the Quests screen has built-in filters for `main` and `side`.

### `packing`
Grouped categories of checklist items. Travelers can add their own items in-app on top of these.
```json
{ "id": "clothing", "category": "Clothing", "items": [{ "id": "clo-shoes", "name": "Walking shoes" }] }
```

### `budget`
```json
"budget": {
  "currency": "USD",
  "note": "Optional text shown above the budget table.",
  "categories": [{ "id": "lodging", "name": "Lodging", "estimate": 500 }]
}
```

### `achievements`
The app ships with a small rules engine. `criteria.type` must be one of:

| Type | Extra fields | Unlocks when… |
|---|---|---|
| `quests_completed_all` | — | every quest in the trip is checked off |
| `quests_completed_in_city` | `cityId` | every quest tied to that city is checked off |
| `cities_visited_all` | — | every city is marked "Visited" in City Chapters |
| `packing_complete_all` | — | every packing item (incl. custom ones) is checked |
| `budget_within_total` | — | total actual spend is entered and ≤ total estimate |
| `journal_entries_count` | `target` | at least `target` journal entries exist |
| `decisions_logged_count` | `target` | at least `target` decisions are logged |

```json
{ "id": "a-1", "title": "…", "description": "…", "criteria": { "type": "quests_completed_all" } }
```

### `seed` (optional)
`seed.journalEntries` and `seed.decisions` are only used the **first time** a trip with a given `tripId` is loaded, to pre-fill an example entry so travelers see the expected format. They're editable/deletable like any other entry afterward and are flagged with an "example" tag until edited.

## Data storage: what's saved, and where

Everything the traveler enters is saved in the browser's `localStorage`, namespaced under `wanderersCodex:v1:`, and scoped **per trip** by `meta.tripId`. That means you can load a different trip and come back later to the first one without losing progress, as long as the `tripId` stays the same.

Saved automatically:
- Completed quests
- Visited cities & days marked as traveled
- Packing checklist state, plus any custom items added
- Budget actuals, plus any custom categories added
- Journal entries
- Decision log entries
- Unlocked achievements
- Settings (name, theme, text size, motion preference)

Nothing is sent anywhere — there is no backend and no network calls except the optional Google Fonts request and fetching your own `trip-data.json`.

From **Settings → Data** or **Load & Save (Chapter XII)** you can:
- Export the current trip JSON (a clean copy of what's loaded)
- Export your progress as a backup JSON file
- Import a progress backup back in
- Reset just this trip's progress, or wipe all Codex data from the browser

## Customizing the look

All colors, fonts, spacing, and radii are defined as CSS custom properties at the top of `styles.css` (see the `:root` block and the `[data-theme="parchment"]` override for the light variant). Change the values there rather than hunting through individual rules. The two display/body fonts (Cinzel + EB Garamond) are loaded from Google Fonts with serif fallbacks, so the app still looks intentional if that request is blocked or you're offline.

## A note on the example trip

The San Marino 2027 itinerary is a fictional but plausible trip built around real places. Historical tidbits (founding legends, "oldest" claims, and so on) are written in a storytelling voice on purpose — treat them as flavor text, not verified fact, and double-check opening hours, prices, transport schedules, and any historical claims that matter to you before you travel.
