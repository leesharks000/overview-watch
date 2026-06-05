# Overview Watch

A browser extension that captures Google AI Overview and AI Mode compositions to a local audit log. Personal substrate-monitoring tool for the Crimson Hexagonal Archive's measurement program.

**Status:** v0.1.0 — MVP, single-substrate (Google), local-only. Not yet on Chrome Web Store; install via developer mode (instructions below).

## What it does

When you visit `google.com/search` and an AI Overview, AI Mode response, or Knowledge Panel renders, Overview Watch records:

- The query
- The composition's full text
- Citations the composition included (URLs + anchor text + domain)
- UI markers ("Showing results for…", "Did you mean…", "search operators were not applied")
- A SAM-v3 heuristic score (PER, α_T, Π_d, failure flags)

Records are stored in `chrome.storage.local` on your device. Nothing leaves your browser. Browse recent captures in the popup; export the full audit log as JSON from the popup or options page.

## Why

The full Crimson Hexagonal Archive measurement program (SAM-v3, DOI [10.5281/zenodo.20559387](https://doi.org/10.5281/zenodo.20559387)) specifies a Cross-Substrate Replication Protocol that requires human-in-the-loop browser sessions because AI Overview, AI Mode, and similar composition layers render only in authenticated user contexts. Doing this by hand for every query is tedious to the point of being impractical at scale. This extension is the automated capture layer for that protocol — it observes what *you* see when *you* search, and preserves the substrate's composition behavior for later analysis without you having to write it up each time.

The heuristic SAM-v3 scoring (PER, α_T, Π_d, and failure-flag detection) is fast triage rather than canonical measurement. The full v3 audit specification requires source-of-reference enumeration and joint operator-tuple reporting under the Atomic Token Rule — the heuristics here are calibrated to under-report rather than over-report, so a high score means there is probably something to look at, but a low score does not mean nothing happened.

## Install (developer mode)

1. Clone this repository or download the source.
2. Open Chrome (or Brave, Edge, or any Chromium-based browser) and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `overview-watch/` directory.
5. The extension icon should appear in your toolbar. Pin it for convenience.
6. Visit `google.com/search?q=lee+sharks` (or any other query) and the AI Overview should be captured automatically.

To verify the extension is working: click the toolbar icon. The popup will show the count and most recent captures.

## File structure

```
overview-watch/
├── manifest.json           Manifest V3 declaration
├── background.js           Service worker for badge updates
├── content/
│   └── google.js           AI Overview + AI Mode detection & capture
├── lib/
│   ├── storage.js          chrome.storage.local wrapper
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
- **Storage permission** is required to write to `chrome.storage.local`. This is the only permission beyond the host match.

Future versions may offer opt-in contribution of capture artifacts to a public substrate-audit repository at the Crimson Hexagonal Archive. That capability is not yet implemented. When it is, opt-in will be explicit, default off, and the data-sharing model will be published with privacy guarantees before any data is transmitted.

## SAM-v3 heuristic limits

The heuristics in `lib/sam-v3.js` produce fast first-pass estimates and are calibrated to under-report:

- **PER** is estimated from citation density per sentence. Real PER requires source-of-reference enumeration; the heuristic only counts cited vs. uncited claim density.
- **α_T** is estimated from query-token presence in composition sentences. Real α_T requires semantic measurement of how much output addresses the actual referent rather than adjacents.
- **Π_d** is estimated as the complement of α_T (minus a small residual). Real Π_d requires enumeration of token-adjacent entities the query did not refer to.
- **Failure flags** are detected from specific text markers and from heuristic operator thresholds. Flags here are precise (they match specific patterns); they are not exhaustive (many failures will not be flagged).

For canonical measurement, re-audit captured records using the formal SAM-v3 procedure or an LLM-judge pipeline. The captured records are designed to preserve enough information (full composition text, citation list, UI markers) for this re-audit to be possible.

## Maintenance

Google's AI Overview markup changes. When it does, the selectors in `content/google.js` will need updating. Symptoms of selector drift:

- Captures stop appearing despite AI Overview rendering visibly
- Captures appear but with very short text or no citations
- The popup shows "MARKERS_ONLY" or "KP_ONLY" for queries that clearly produced an AI Overview

When this happens: inspect the AI Overview's DOM in DevTools, identify the new container's `data-attrid` or distinguishing attribute, and add a selector to the `selectors` array near the top of `detectAIOverview()` in `content/google.js`.

## Roadmap

**v0.1 (this release):** Google AI Overview + AI Mode + Knowledge Panel + UI marker capture; local storage; popup browser; JSON export.

**v0.2 (next):** Brave Search support; better AI Mode detection (the `udm=50` path is still in flux); per-capture detail view in popup; query allowlist (only capture specific queries) for users who want a narrower audit scope.

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
