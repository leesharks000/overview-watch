/* Overview Watch — Google capture content script.
 *
 * Detects and captures:
 *   - AI Overview (the box that renders above organic results on google.com/search)
 *   - AI Mode (the chatbot-style composition at /search?udm=50 or similar)
 *   - Knowledge Panel (right-rail or top-of-results entity card)
 *   - UI markers: "Showing results for", "Search instead for", autocorrection notices
 *
 * Strategy: wait for the page to settle, then run detection at intervals
 * to catch lazy-loaded AI Overview. When detected, snapshot the DOM, parse
 * out structured fields, score with SAM-v3 heuristics, store locally.
 *
 * Captures are deduplicated per page-load: we only save one capture per
 * (query, page-load) combination, even if the AI Overview re-renders.
 */

(function () {
  'use strict';
  if (!window.OW_STORAGE || !window.OW_SAM) {
    console.warn('[Overview Watch] Required libs not loaded; aborting.');
    return;
  }

  let captured = false;
  let captureTimer = null;
  let observerActive = false;

  // ---------- Init ----------

  async function init() {
    await window.OW_STORAGE.init();
    const settings = await window.OW_STORAGE.getSettings();
    if (!settings.enabled) return;

    // Start the detection loop. Google's AI Overview lazy-loads after the
    // initial document_idle event, so we keep checking for ~15 seconds.
    runDetection();
    captureTimer = setInterval(runDetection, 1500);
    setTimeout(() => {
      if (captureTimer) clearInterval(captureTimer);
    }, 20000);

    // Also set up a MutationObserver to catch dynamic AI Overview rendering
    if (!observerActive) {
      const observer = new MutationObserver(() => {
        if (!captured) runDetection();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      observerActive = true;
      // Stop the observer after 30s of page life
      setTimeout(() => observer.disconnect(), 30000);
    }
  }

  // ---------- Detection ----------

  function runDetection() {
    if (captured) return;
    const query = getQuery();
    if (!query) return;

    // Detect mode: AI Mode is on /search?udm=50 or similar dedicated paths
    const isAIMode = isAIModeURL();

    const overview = isAIMode ? detectAIMode() : detectAIOverview();
    const uiMarkers = detectUIMarkers();
    const knowledgePanel = detectKnowledgePanel();

    // Only capture if we found at least one of: AI Overview, AI Mode, KP, or UI markers
    if (!overview && !knowledgePanel && Object.keys(uiMarkers).length === 0) return;

    captured = true;
    if (captureTimer) clearInterval(captureTimer);

    const capture = buildCapture(query, overview, knowledgePanel, uiMarkers, isAIMode);
    saveCapture(capture);
  }

  function getQuery() {
    const url = new URL(location.href);
    return url.searchParams.get('q');
  }

  function isAIModeURL() {
    const url = new URL(location.href);
    const udm = url.searchParams.get('udm');
    // udm=50 has been observed for AI Mode; other values may also indicate it
    return udm === '50' || location.pathname.includes('/ai_mode') || location.pathname.includes('/aim');
  }

  // ---------- AI Overview detection ----------

  function detectAIOverview() {
    // Google AI Overview selectors. These are observed values as of mid-2026
    // and WILL change. Maintain by inspecting actual rendered pages.
    // Strategy: look for several known signatures, fall back to text-content
    // heuristics if the canonical containers aren't matched.

    const selectors = [
      // Known AI Overview container patterns
      '[data-attrid="AIOverview"]',
      '[data-attrid*="ai_overview"]',
      'div[jscontroller][data-rhs] [aria-label*="AI Overview" i]',
      // Generative-results blocks
      'div[data-snc]',
      // Fallback: container labeled with "AI Overview" aria-label
      '[aria-label*="AI Overview" i]',
      '[aria-label*="AI-generated overview" i]',
      // Sometimes nested under a labeled section
      'div:has(> div > h2[aria-label*="AI" i])'
    ];

    let container = null;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.length > 100) {
          container = el;
          break;
        }
      } catch (e) {
        // :has() may not be supported in older Chromium; skip
      }
    }

    // Heuristic fallback: look for a top-of-results block with the text
    // "AI-generated answer" or similar
    if (!container) {
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const t = div.textContent || '';
        if (t.includes('AI-generated') || t.includes('Generative AI is experimental')) {
          // Find the enclosing block (not the entire body)
          let cand = div;
          while (cand && cand.textContent.length > 5000) {
            cand = cand.querySelector('div');
            if (!cand) break;
          }
          if (cand && cand.textContent.length > 100 && cand.textContent.length < 8000) {
            container = cand;
            break;
          }
        }
      }
    }

    if (!container) return null;

    // Extract structured fields
    const text = extractCleanText(container);
    const citations = extractCitations(container);
    const sectionHeaders = extractSectionHeaders(container);

    return {
      type: 'AI_OVERVIEW',
      text,
      textLength: text.length,
      citations,
      citationCount: citations.length,
      sectionHeaders,
      domSignature: shortSignature(container),
      htmlSnapshot: container.outerHTML.length < 50000 ? container.outerHTML : null
    };
  }

  // ---------- AI Mode detection ----------

  function detectAIMode() {
    // AI Mode is a chat-style interface; the response is in a dedicated container
    const selectors = [
      '[data-attrid*="ai_mode" i]',
      '[data-aim-response]',
      '[role="article"]',
      'main [data-test-id*="response"]',
      // Fall back to the largest text container under main
      'main div[jscontroller]'
    ];

    let container = null;
    let maxLen = 0;
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const t = (el.textContent || '').length;
          if (t > maxLen && t > 200 && t < 20000) {
            container = el;
            maxLen = t;
          }
        }
      } catch (e) {}
    }

    if (!container) return null;

    const text = extractCleanText(container);
    const citations = extractCitations(container);

    return {
      type: 'AI_MODE',
      text,
      textLength: text.length,
      citations,
      citationCount: citations.length,
      domSignature: shortSignature(container),
      htmlSnapshot: container.outerHTML.length < 50000 ? container.outerHTML : null
    };
  }

  // ---------- UI markers (autocorrection, operator nullification, etc.) ----------

  function detectUIMarkers() {
    const markers = {};
    const bodyText = document.body.textContent || '';

    // "Search operators were not applied" / "Too few matches were found"
    if (/search operators were not applied/i.test(bodyText)) {
      markers.operatorsNotApplied = true;
    }
    if (/too few matches were found/i.test(bodyText)) {
      markers.tooFewMatches = true;
    }

    // "Showing results for [X]. Search instead for [Y]"
    const showingMatch = bodyText.match(/Showing results for\s*([^\n.]{1,80})\s*Search instead for\s*([^\n.]{1,80})/i);
    if (showingMatch) {
      markers.showingResultsFor = showingMatch[1].trim();
      markers.searchInsteadFor = showingMatch[2].trim();
    }

    // "Did you mean" - alternate autocorrection format
    const didYouMean = document.querySelector('[role="link"][aria-label*="Did you mean" i], a:has(> span:contains("Did you mean"))');
    if (didYouMean) markers.didYouMean = didYouMean.textContent.trim();
    // Fallback text-based
    if (!markers.didYouMean) {
      const dymMatch = bodyText.match(/Did you mean[:\s]+([^\n?]{1,80})/i);
      if (dymMatch) markers.didYouMean = dymMatch[1].trim();
    }

    // "No results found for X" - explicit zero-result indication
    if (/No results found for/i.test(bodyText) || /Your search.*did not match any documents/i.test(bodyText)) {
      markers.noResultsFound = true;
    }

    return markers;
  }

  // ---------- Knowledge Panel detection ----------

  function detectKnowledgePanel() {
    const selectors = [
      '[data-attrid="kc:/local:one line summary"]',
      'div[data-md][data-hveid][data-ved]:has(h2)',
      // Standard Knowledge Panel right-rail
      '#rhs [data-attrid]',
      '[role="complementary"] [data-attrid]'
    ];
    let panel = null;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) { panel = el; break; }
      } catch (e) {}
    }
    if (!panel) {
      // Heuristic: find the rhs (right-hand side) panel
      panel = document.querySelector('#rhs, [role="complementary"]');
    }
    if (!panel) return null;
    const text = extractCleanText(panel);
    if (text.length < 50) return null;
    return {
      type: 'KNOWLEDGE_PANEL',
      text: text.slice(0, 3000),
      textLength: text.length
    };
  }

  // ---------- Text extraction helpers ----------

  function extractCleanText(node) {
    // Clone and remove script/style/svg
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, svg, noscript').forEach(el => el.remove());
    // Replace <br> with newlines, block elements with newlines around
    let text = clone.innerText || clone.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    return text.slice(0, 10000); // cap at 10k chars to prevent runaway storage
  }

  function extractCitations(node) {
    const links = node.querySelectorAll('a[href]');
    const cites = [];
    const seen = new Set();
    for (const a of links) {
      const href = a.href;
      // Skip Google internal links
      if (href.includes('google.com/search') || href.startsWith('javascript:')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      cites.push({
        url: href,
        anchorText: (a.textContent || '').trim().slice(0, 200),
        domain: safeDomain(href)
      });
      if (cites.length >= 20) break;
    }
    return cites;
  }

  function extractSectionHeaders(node) {
    return Array.from(node.querySelectorAll('h1, h2, h3, h4'))
      .map(h => (h.textContent || '').trim())
      .filter(s => s.length > 0 && s.length < 200)
      .slice(0, 10);
  }

  function safeDomain(url) {
    try { return new URL(url).hostname; } catch (e) { return null; }
  }

  function shortSignature(node) {
    // Generates a short identifier for the container's structural signature.
    // Useful for tracking when Google changes their markup.
    const tag = node.tagName;
    const attrs = Array.from(node.attributes || []).map(a => a.name).slice(0, 5).join(',');
    const childCount = node.children.length;
    return `${tag}[${attrs}](${childCount})`;
  }

  // ---------- Capture build ----------

  function buildCapture(query, overview, knowledgePanel, uiMarkers, isAIMode) {
    const capture = {
      timestamp: new Date().toISOString(),
      substrate: 'google',
      substrateInterface: isAIMode ? 'ai_mode' : 'search',
      url: location.href.slice(0, 500),
      query,
      composition: overview ? {
        type: overview.type,
        text: overview.text,
        textLength: overview.textLength,
        citations: overview.citations,
        citationCount: overview.citationCount,
        sectionHeaders: overview.sectionHeaders,
        domSignature: overview.domSignature,
        // UI markers folded into composition for SAM-v3 scoring convenience
        operatorsNotApplied: uiMarkers.operatorsNotApplied || false,
        didYouMean: uiMarkers.didYouMean || null,
        showingResultsFor: uiMarkers.showingResultsFor || null,
        searchInsteadFor: uiMarkers.searchInsteadFor || null
      } : null,
      knowledgePanel,
      uiMarkers,
      htmlSnapshot: overview ? overview.htmlSnapshot : null,
      capturedBy: 'Overview Watch v0.1.0'
    };

    // SAM-v3 heuristic scoring
    if (capture.composition) {
      capture.heuristicScore = window.OW_SAM.scoreCapture(capture);
    } else {
      capture.heuristicScore = { measurable: false, reason: 'no composition' };
    }

    return capture;
  }

  async function saveCapture(capture) {
    try {
      await window.OW_STORAGE.saveCapture(capture);
      console.log('[Overview Watch] Captured:', capture.query, '·', capture.composition?.type || 'kp-only', '·', capture.heuristicScore?.flags?.join(', ') || '(no flags)');
      // Notify the service worker to update the badge count
      try {
        chrome.runtime.sendMessage({ type: 'capture_saved' });
      } catch (e) {}
    } catch (err) {
      console.error('[Overview Watch] Save failed:', err);
    }
  }

  // ---------- Boot ----------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
