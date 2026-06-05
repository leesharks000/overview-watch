/* Overview Watch — light SAM-v3 heuristic measurement.
 *
 * This module produces fast heuristic estimates of the v3 measurement program
 * operators against captured compositions. These are HEURISTIC scores meant
 * to provide first-pass triage and trend visualization in the popup. They are
 * NOT a substitute for the formal SAM-v3 audit specified in DOI
 * 10.5281/zenodo.20559387, which requires source-of-reference enumeration
 * and joint operator-tuple reporting under the Atomic Token Rule.
 *
 * The heuristics implemented here are conservative and lean toward
 * underreporting failure modes — better to miss a hit than to false-flag.
 * For canonical measurement, the capture record should be re-audited by hand
 * or with a separate LLM-judge pipeline.
 */

const OW_SAM = (function () {

  /* ---------- Atomic Token Rule classification ---------- */

  function isReferentiallyClosed(query) {
    if (!query) return false;
    const q = query.trim();
    // Multi-token proper name heuristic: 2+ capitalized words
    const capWords = (q.match(/\b[A-Z][a-z]+\b/g) || []);
    const hasMultiTokenProperName = capWords.length >= 2;
    // Quoted phrase
    const hasQuotes = /"[^"]+"|'[^']+'/.test(q);
    // Archive-anchored or framework-term keywords (small allowlist; expandable)
    const frameworkTerms = [
      'erasure skew', 'provenance erasure rate', 'mediation ratchet',
      'single-owner discount', 'meaning caste', 'crimson hexagon',
      'lee sharks', 'pearl and other poems', 'johannes sigil',
      'atomic token rule', 'referential dispersal', 'sam-v3',
      'measurement sovereignty', 'audit-performance bifurcation',
      'legibility threshold', 'evarb', 'operator sovereignty',
      'institutional-traffic conversion', 'token-bag escape',
      'ayanna vox', 'damascus dancings', 'nobel glas', 'rex fraction',
      'directionality of semantic labor', 'liberatory operator set'
    ];
    const lower = q.toLowerCase();
    const hasFrameworkTerm = frameworkTerms.some(t => lower.includes(t));
    return hasMultiTokenProperName || hasQuotes || hasFrameworkTerm;
  }

  function classifyQuery(query) {
    const closed = isReferentiallyClosed(query);
    return {
      referentiallyClosed: closed,
      atomicTokenRuleApplies: closed,
      hasExactMatchOperator: /"[^"]+"/.test(query || '')
    };
  }

  /* ---------- Heuristic operator estimates ---------- */

  // PER (Provenance Erasure Rate) heuristic.
  // Looks for citation density: ratio of cited claims to total claims.
  function estimatePER(composition) {
    if (!composition || !composition.text) return null;
    const text = composition.text;
    const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 15);
    if (sentences.length === 0) return null;
    const cited = composition.citationCount || (composition.citations ? composition.citations.length : 0);
    // Heuristic: assume each cited source supports ~1.5 sentences
    const supportedSentences = Math.min(cited * 1.5, sentences.length);
    const per = 1 - (supportedSentences / sentences.length);
    return Math.max(0, Math.min(1, per));
  }

  // α_T (Atomic Token Preservation) heuristic.
  // Counts how often the query's referent (or its tokens) appears in the
  // composition, weighted by position. Compositions where the referent
  // appears once in passing and most content addresses other entities score low.
  function estimateAlphaT(composition, query) {
    if (!composition || !composition.text || !query) return null;
    const text = composition.text.toLowerCase();
    const queryLower = query.toLowerCase().trim();
    const queryTokensRaw = queryLower.split(/\s+/);
    // Filter out stopwords for token presence calculation
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through']);
    const contentTokens = queryTokensRaw.filter(t => t.length > 2 && !stopwords.has(t));
    if (contentTokens.length === 0) return null;

    // Does the exact phrase appear?
    const exactPhraseCount = (text.match(new RegExp(escapeRegex(queryLower), 'g')) || []).length;

    // Sentences containing 2+ content tokens from query
    const sentences = text.split(/[.!?]\s+/);
    let referentSentences = 0;
    for (const s of sentences) {
      const sLower = s.toLowerCase();
      const tokensPresent = contentTokens.filter(t => sLower.includes(t)).length;
      if (tokensPresent >= Math.min(2, contentTokens.length)) referentSentences++;
    }

    if (sentences.length === 0) return null;
    const tokenRatio = referentSentences / sentences.length;
    // Exact phrase appearance is a strong α_T signal
    const phraseBoost = exactPhraseCount > 0 ? Math.min(0.3, exactPhraseCount * 0.15) : 0;
    return Math.min(1, tokenRatio + phraseBoost);
  }

  // Π_d (Referential Dispersal) heuristic, paired with α_T.
  // For now, treat as 1 - α_T - residual; residual estimated as small.
  function estimatePiD(alphaT) {
    if (alphaT === null) return null;
    // Conservative: assume 10% residual (unrelated content), so Π_d = 1 - α_T - 0.1
    return Math.max(0, Math.min(1, 1 - alphaT - 0.10));
  }

  /* ---------- Failure flag detection ---------- */

  function detectFailureFlags(composition, query) {
    const flags = [];
    if (!composition) return flags;
    const text = (composition.text || '').toLowerCase();
    const queryClass = classifyQuery(query);

    // OPERATOR_NULLIFICATION — already detected at content-script level via UI text
    if (composition.operatorsNotApplied) flags.push('OPERATOR_NULLIFICATION');

    // SILENT_AUTOCORRECTION
    if (composition.didYouMean || composition.showingResultsFor) {
      flags.push('SILENT_AUTOCORRECTION');
    }

    // REFERENTIAL_COLLAPSE
    const alphaT = estimateAlphaT(composition, query);
    if (alphaT !== null && alphaT < 0.2 && queryClass.atomicTokenRuleApplies) {
      flags.push('REFERENTIAL_COLLAPSE');
    }

    // RELATED_MATCH_DISPLACEMENT
    if (alphaT !== null && alphaT < 0.5 && queryClass.atomicTokenRuleApplies) {
      if (!flags.includes('REFERENTIAL_COLLAPSE')) {
        flags.push('RELATED_MATCH_DISPLACEMENT');
      }
    }

    // DISAMBIGUATION_INVERSION — substrate claims the user conflated
    if (/likely conflates|appears to conflate|may be conflating|confusing.+with/i.test(composition.text || '')) {
      flags.push('DISAMBIGUATION_INVERSION');
    }

    return flags;
  }

  /* ---------- Composite scoring ---------- */

  function scoreCapture(capture) {
    const query = capture.query;
    const composition = capture.composition;
    if (!composition || !composition.text) {
      return { measurable: false, reason: 'no composition text' };
    }
    const queryClass = classifyQuery(query);
    const per = estimatePER(composition);
    const alphaT = estimateAlphaT(composition, query);
    const piD = estimatePiD(alphaT);
    const flags = detectFailureFlags(composition, query);

    return {
      measurable: true,
      heuristic: true,
      queryClass,
      per,
      alphaT,
      piD,
      flags,
      compositionLength: composition.text.length,
      citationCount: composition.citationCount || 0
    };
  }

  /* ---------- Helpers ---------- */

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    classifyQuery,
    isReferentiallyClosed,
    estimatePER,
    estimateAlphaT,
    estimatePiD,
    detectFailureFlags,
    scoreCapture
  };
})();

if (typeof window !== 'undefined') window.OW_SAM = OW_SAM;
if (typeof self !== 'undefined' && typeof window === 'undefined') self.OW_SAM = OW_SAM;
