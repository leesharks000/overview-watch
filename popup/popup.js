/* Overview Watch — popup logic. */

(async function () {
  const STORAGE = window.OW_STORAGE;
  await STORAGE.init();

  const countDisplay = document.getElementById('count-display');
  const statsEl = document.getElementById('stats');
  const listEl = document.getElementById('captures-list');

  async function refresh() {
    const count = await STORAGE.getCount();
    const settings = await STORAGE.getSettings();
    const labelHTML = settings.testConditionLabel
      ? ` <span style="color:var(--terracotta);font-weight:600;">· ${escapeHTML(settings.testConditionLabel)}</span>`
      : '';
    countDisplay.innerHTML = `<strong>${count}</strong> capture${count === 1 ? '' : 's'}${labelHTML}`;

    const recent = await STORAGE.getRecentCaptures(50);
    renderStats(recent);
    renderList(recent);
  }

  function renderStats(captures) {
    if (captures.length === 0) {
      statsEl.textContent = '';
      return;
    }
    const flagCounts = {};
    let withOverview = 0;
    let withAIMode = 0;
    let withKP = 0;
    let opNullified = 0;
    let autocorrected = 0;

    for (const c of captures) {
      if (c.composition?.type === 'AI_OVERVIEW') withOverview++;
      if (c.composition?.type === 'AI_MODE') withAIMode++;
      if (c.knowledgePanel) withKP++;
      if (c.uiMarkers?.operatorsNotApplied) opNullified++;
      if (c.uiMarkers?.didYouMean || c.uiMarkers?.showingResultsFor) autocorrected++;
      if (c.heuristicScore?.flags) {
        for (const f of c.heuristicScore.flags) {
          flagCounts[f] = (flagCounts[f] || 0) + 1;
        }
      }
    }

    const parts = [];
    parts.push(`<span>${withOverview}</span> Overview`);
    if (withAIMode > 0) parts.push(`<span>${withAIMode}</span> AI Mode`);
    if (withKP > 0) parts.push(`<span>${withKP}</span> KP`);
    if (opNullified > 0) parts.push(`<span class="flag-stat">${opNullified}</span> op-nullified`);
    if (autocorrected > 0) parts.push(`<span class="flag-stat">${autocorrected}</span> autocorrected`);

    let statsHTML = `Last ${captures.length}: ${parts.join(' · ')}`;
    if (Object.keys(flagCounts).length > 0) {
      const flagBits = Object.entries(flagCounts).slice(0, 4).map(([f, n]) => `<span class="flag-stat">${n}</span> ${f.toLowerCase().replace(/_/g, ' ')}`).join(' · ');
      statsHTML += `<br>Flags: ${flagBits}`;
    }
    statsEl.innerHTML = statsHTML;
  }

  function renderList(captures) {
    if (captures.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <p>No captures yet.</p>
          <p style="font-size:10px">Visit google.com/search and run a query that produces an AI Overview.</p>
        </div>`;
      return;
    }

    const html = captures.map(c => renderCapture(c)).join('');
    listEl.innerHTML = html;

    // Wire up clicks to toggle detail views
    listEl.querySelectorAll('.capture').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return; // let links work
        const detail = el.querySelector('.detail');
        if (detail) detail.classList.toggle('visible');
      });
    });
  }

  function renderCapture(c) {
    const dt = new Date(c.timestamp);
    const timeStr = dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const type = c.composition?.type || (c.knowledgePanel ? 'KP_ONLY' : 'MARKERS_ONLY');
    const text = c.composition?.text || c.knowledgePanel?.text || '';
    const snippet = text.slice(0, 200).replace(/</g, '&lt;');

    const flagsHTML = (c.heuristicScore?.flags || []).map(f =>
      `<span class="flag">${f.replace(/_/g, ' ').toLowerCase()}</span>`
    ).join('');

    const scoresHTML = c.heuristicScore?.measurable ? `
      <div class="scores">
        ${c.heuristicScore.per !== null ? `<span class="score">PER: <span class="score-val">${c.heuristicScore.per.toFixed(2)}</span></span>` : ''}
        ${c.heuristicScore.alphaT !== null ? `<span class="score">α_T: <span class="score-val">${c.heuristicScore.alphaT.toFixed(2)}</span></span>` : ''}
        ${c.heuristicScore.piD !== null ? `<span class="score">Π_d: <span class="score-val">${c.heuristicScore.piD.toFixed(2)}</span></span>` : ''}
        <span class="score">cites: <span class="score-val">${c.heuristicScore.citationCount}</span></span>
      </div>` : '';

    const citationsHTML = (c.composition?.citations || []).slice(0, 5).map(cite =>
      `<a href="${escapeHTML(cite.url)}" target="_blank" rel="noopener">${escapeHTML(cite.domain || cite.url)}</a>`
    ).join('');

    const detailMarkers = [];
    if (c.uiMarkers?.operatorsNotApplied) detailMarkers.push('"search operators were not applied"');
    if (c.uiMarkers?.tooFewMatches) detailMarkers.push('"too few matches were found"');
    if (c.uiMarkers?.didYouMean) detailMarkers.push(`Did you mean: "${c.uiMarkers.didYouMean}"`);
    if (c.uiMarkers?.showingResultsFor) detailMarkers.push(`Showing results for "${c.uiMarkers.showingResultsFor}" instead of "${c.uiMarkers.searchInsteadFor}"`);

    return `
      <div class="capture" data-key="${c._key}">
        <div class="cap-top">
          <div class="cap-query" title="${escapeHTML(c.query || '')}">${escapeHTML(c.query || '(no query)')}</div>
          <div class="cap-time">${timeStr}</div>
        </div>
        <div class="cap-meta">
          <span class="cap-type">${type.replace(/_/g, ' ')}</span>
          ${c.substrateInterface || 'search'} · ${(c.composition?.textLength || 0)} chars · ${(c.composition?.citationCount || 0)} cites
        </div>
        <div class="cap-snippet">${snippet}${text.length > 200 ? '…' : ''}</div>
        ${flagsHTML ? `<div class="flags">${flagsHTML}</div>` : ''}
        ${scoresHTML}
        <div class="detail">
          ${detailMarkers.length > 0 ? `
            <div class="field">
              <div class="field-label">UI markers</div>
              <div>${detailMarkers.map(m => escapeHTML(m)).join('<br>')}</div>
            </div>
          ` : ''}
          ${text ? `
            <div class="field">
              <div class="field-label">Full text</div>
              <div class="text-content">${escapeHTML(text)}</div>
            </div>
          ` : ''}
          ${citationsHTML ? `
            <div class="field">
              <div class="field-label">Cited sources (top 5)</div>
              <div class="citations">${citationsHTML}</div>
            </div>
          ` : ''}
          <div class="field">
            <div class="field-label">URL</div>
            <div style="font-size:9px;word-break:break-all;color:var(--paper-dim);">${escapeHTML(c.url || '')}</div>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // Export to JSON
  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = await STORAGE.exportAsJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overview-watch-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('refresh-btn').addEventListener('click', refresh);

  await refresh();
})();
