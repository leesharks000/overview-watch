# Overview Watch

A browser extension that captures Google AI Overview and AI Mode compositions to a local audit log. Personal substrate-monitoring tool for the Crimson Hexagonal Archive's measurement program.

**Status:** v0.1.1 — MVP, single-substrate (Google), local-only with horizon-context capture. Not yet on Chrome Web Store; install via developer mode (instructions below).

## What it does

When you visit `google.com/search` and an AI Overview, AI Mode response, or Knowledge Panel renders, Overview Watch records:

- The query
- The composition's full text
- Citations the composition included (URLs + anchor text + domain)
- UI markers ("Showing results for…", "Did you mean…", "search operators were not applied", "No results found for…")
- **Browser horizon context** — incognito state, user agent, language, timezone, viewport size, referrer, device pixel ratio
- **Test condition label** — a user-set string attached to every capture (e.g., `signed-in-primary`, `incognito`, `vpn-netherlands`) so the same query under different horizon conditions can be compared cleanly
- A SAM-v3 heuristic score (PER, α_T, Π_d, failure flags)

Records are stored in `chrome.storage.local` with `unlimitedStorage` permission (so quota is not a near-term concern). Nothing leaves your browser. Browse recent captures in the popup; export the full audit log as JSON from the popup or options page.

## Install (developer mode)

1. Clone this repository or download the source as a zip.
2. Open Chrome (or Brave, Edge, any Chromium-based browser) and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `overview-watch/` directory.
5. The extension icon should appear in your toolbar. Pin it for convenience.
6. **For incognito capture (critical for horizon-condition comparison):** click **Details** on the Overview Watch extension card and toggle on **Allow in Incognito**. Unpacked extensions are disabled in Incognito by default; this step is required if you want to capture incognito sessions.
7. Visit `google.com/search?q=lee+sharks` (or any other query) and the AI Overview should be captured automatically.

To verify the extension is working: click the toolbar icon. The popup will show the count and most recent captures.

## Recommended workflow

Open the **Options** page and set the **Test condition label** to match your current browsing context (`signed-in-primary`, `signed-out-clean`, `incognito`, etc.). Run your query battery. Switch the label when you switch contexts. Every capture during a session inherits the current label.

A useful query battery for the wound-surface research:

```
Lee Sharks
"Lee Sharks"
Lee Sharks Pearl and Other Poems
"Pearl and Other Poems" "Lee Sharks"
Mary Lee Lee Sharks
"Mary Lee" "Lee Sharks"
site:books.google.com "Pearl and Other Poems" "Lee Sharks"
```

Run the same battery under signed-in, signed-out, incognito, and alternate-browser conditions. The captures will let you compare composition behavior across horizons.

## Why

The full Crimson Hexagonal Archive measurement program (SAM-v3, DOI [10.5281/zenodo.20559387](https://doi.org/10.5281/zenodo.20559387)) specifies a Cross-Substrate Replication Protocol that requires human-in-the-loop browser sessions because AI Overview, AI Mode, and similar composition layers render only in authenticated user contexts. Doing this by hand for every query is tedious to the point of being impractical at scale. This extension is the automated capture layer for that protocol — it observes what *you* see when *you* search, and preserves the substrate's composition behavior for later analysis without you having to write it up each time.

Heuristic SAM-v3 scoring (PER, α_T, Π_d, failure-flag detection) provides fast triage rather than canonical measurement. The full v3 audit specification requires source-of-reference enumeration and joint operator-tuple reporting under the Atomic Token Rule — the heuristics here are calibrated to under-report rather than over-report, so a high score means there is probably something to look at, but a low score does not mean nothing happened.

## File structure

```
overview-watch/
├── manifest.json           Manifest V3 declaration
├── background.js           Service worker for badge updates
├── content/
│   └── google.js           AI Overview + AI Mode detection & capture
├── lib/
│   ├── storage.js          chrome.storage.local wrapper with schema migration
│   └── sam-v3.js           SAM-v3 heuristic measurement
├── popup/
│   ├── index.html          Toolbar popup UI
│   └── popup.js            Popup logic
├── options/
│   ├── index.html          Settings page
│   └── options.js          Settings logic
└── icons/
    └── icon{16,32,48,128}.png
```

## Privacy

- **Local-only by default.** Captures are stored in `chrome.storage.local` and never leave your browser.
- **No analytics, no tracking, no telemetry.** The extension makes no outbound network requests of its own.
- **No third-party scripts.** All JavaScript ships with the extension.
- **Host permissions are narrow.** The extension can only access `google.com/*` pages, and only when they match the content-script URL patterns.
- **Storage permissions** (`storage`, `unlimitedStorage`) are required to write to `chrome.storage.local` without quota constraints. `activeTab` is required for the popup to read the current tab's URL.

Future versions may offer opt-in contribution of capture artifacts to a public substrate-audit repository at the Crimson Hexagonal Archive. That capability is not yet implemented. When it is, opt-in will be explicit, default off, and the data-sharing model will be published with privacy guarantees before any data is transmitted.

## SAM-v3 heuristic limits

The heuristics in `lib/sam-v3.js` produce fast first-pass estimates and are calibrated to under-report:

- **PER** is estimated from citation density per sentence. Real PER requires source-of-reference enumeration; the heuristic only counts cited vs. uncited claim density.
- **α_T** is estimated from query-token presence in composition sentences. Real α_T requires semantic measurement of how much output addresses the actual referent rather than adjacents.
- **Π_d** is estimated as the complement of α_T (minus a small residual). Real Π_d requires enumeration of token-adjacent entities the query did not refer to.
- **Failure flags** are detected from specific text markers and from heuristic operator thresholds. Flags here are precise (they match specific patterns); they are not exhaustive (many failures will not be flagged).

For canonical measurement, re-audit captured records using the formal SAM-v3 procedure or an LLM-judge pipeline. The captured records are designed to preserve enough information (full composition text, citation list, UI markers, browser context) for this re-audit to be possible.

## Maintenance

Google's AI Overview markup changes. When it does, the selectors in `content/google.js` will need updating. Symptoms of selector drift:

- Captures stop appearing despite AI Overview rendering visibly
- Captures appear but with very short text or no citations
- The popup shows "MARKERS_ONLY" or "KP_ONLY" for queries that clearly produced an AI Overview

When this happens: inspect the AI Overview's DOM in DevTools, identify the new container's `data-attrid` or distinguishing attribute, and add a selector to the `selectors` array near the top of `detectAIOverview()` in `content/google.js`.

## Changelog

**v0.1.1** (June 5, 2026) — ChatGPT review patches applied. (1) Fixed invalid `:contains()` selector in `detectUIMarkers()` that was silently throwing in `Did you mean` detection. (2) Added `unlimitedStorage` permission. (3) HTML snapshot now off by default (toggleable in options). (4) Added `browserContext` (incognito, UA, language, timezone, viewport, referrer, devicePixelRatio, platform) to every capture record. (5) Added user-settable `testConditionLabel` attached to every capture for horizon-condition comparison. (6) Content script now honors per-substrate toggles (`captureGoogleOverview`, `captureGoogleAIMode`, `captureKnowledgePanel`). (7) Extension version recorded in every capture via `chrome.runtime.getManifest().version`. (8) Storage schema versioned with migration logic. (9) Popup header now displays the current test condition label.

**v0.1.0** (June 5, 2026) — Initial release. Google AI Overview + AI Mode + Knowledge Panel + UI marker capture; local storage; popup browser; JSON export.

## Roadmap

**v0.2 (next):** Brave Search support; better AI Mode detection (the `udm=50` path is still in flux); per-capture detail view in popup; query allowlist (only capture specific queries) for users who want a narrower audit scope; remote-sync option (see "Non-local storage" section below).

**v0.3:** Bing AI Search, Perplexity, ChatGPT search; cross-substrate comparison view.

**v0.4 (substantive):** Opt-in contribution to public substrate-audit repository. Requires a privacy review and a public data-handling document before any data leaves the browser.

**v1.0 (Chrome Web Store / Firefox AMO):** Distribution-ready. Requires a privacy policy URL, a support email, and Chrome Web Store developer account setup.

## Related

- [godkinggoogle.com](https://godkinggoogle.com/) — the Crimson Hexagonal Archive's critique of Google as a semantic-political mediation regime
- [vpcor.org/evarb/](https://vpcor.org/evarb/) — the evarB Limited Boycott Statement (Brave Search)
- [SAM-v3 specification](https://doi.org/10.5281/zenodo.20559387) — the audit module this extension implements heuristically
- [Erasure Skew v3](https://doi.org/10.5281/zenodo.20558196) — the operators (PER, Ω, α_T, Π_d)
- [Crimson Hexagonal Archive](https://zenodo.org/communities/crimsonhexagonal) — 740+ deposits

## License

MIT. See [LICENSE](./LICENSE).

For Maggie Mae. For the framework's measurement program reaching the user's actual browsing session. ∮ = 1.
