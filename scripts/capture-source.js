/* Run on the public FreeLUG site using the local import bridge. */
window.captureFreeLUG = async function (inventory) {
  if (window.captureReport?.running) throw new Error('A capture is already running.');
  const bridge = 'http://127.0.0.1:4174';
  const save = async (route, body, binary = false) => {
    const response = await fetch(bridge + route, {
      method: 'POST', headers: { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' },
      body: binary ? body : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Saving ${route}: HTTP ${response.status}`);
  };
  const report = window.captureReport = {
    errors: [], unavailableAssets: [], articles: 0, assets: 0, running: true,
    skippedArticles: [], phase: 'articles', requestIntervalMs: 5000
  };
  let state;
  try {
    const stateResponse = await fetch(bridge + '/state');
    if (!stateResponse.ok) throw new Error(`Loading capture state: HTTP ${stateResponse.status}`);
    state = await stateResponse.json();
  } catch (error) {
    report.errors.push(error.message);
    report.running = false;
    console.error(error);
    throw error;
  }
  const savedArticles = new Set(state.articles);
  const skippedArticles = new Set((state.skippedArticles || []).map(article => article.id));
  const savedAssets = new Set(state.assets);
  const assetUrls = new Set();
  report.skippedArticles = state.skippedArticles || [];
  report.unavailableAssets = state.unavailableAssets || [];
  window.stopFreeLUGCapture = () => { report.stopRequested = true; };
  const fetchSource = async raw => {
    await new Promise(resolve => setTimeout(resolve, report.requestIntervalMs));
    if (report.stopRequested) throw new Error('Capture paused by user; the checkpoint is saved.');
    const url = new URL(raw, location.origin);
    if (!['freelug.org', 'www.freelug.org'].includes(url.hostname)) throw new Error(`Not a FreeLUG source: ${raw}`);
    const response = await fetch(url.pathname + url.search, { redirect: 'manual' });
    if ([401, 403, 429, 503].includes(response.status)) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Capture stopped: ${raw} returned HTTP ${response.status}.${retryAfter ? ` Retry-After: ${retryAfter}.` : ''} No further source requests will be made.`);
    }
    return response;
  };
  const checkpoint = async () => {
    await save('/inventory', inventory);
    await save('/report', report);
  };
  const remember = record => {
    inventory.articles[record.id] = { id: record.id, url: record.url, title: record.title, section: record.section };
    const section = inventory.sections[record.section];
    if (!section) throw new Error(`Missing section ${record.section} for article ${record.id}`);
    if (!section.articles.includes(record.id)) section.articles.push(record.id);
  };
  const assetKey = async url => {
    const u = new URL(url);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.origin + u.pathname));
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 24);
    const extension = u.pathname.match(/\.[a-z0-9]{1,6}$/i)?.[0].toLowerCase() || '.bin';
    return hash + extension;
  };
  const clean = (node, base) => {
    const container = node.cloneNode(true);
    container.querySelectorAll('script, style, form, input, button, iframe, object, embed').forEach(el => {
      if (['IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName)) {
        const raw = el.getAttribute('src') || el.getAttribute('data');
        if (raw && /^https?:/.test(new URL(raw, base).href)) {
          const link = document.createElement('a');
          link.href = new URL(raw, base).href;
          link.textContent = el.getAttribute('title') || 'Consulter le média sur le site d’origine';
          el.replaceWith(link);
          return;
        }
      }
      el.remove();
    });
    container.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || ['style', 'srcset', 'sizes', 'background'].includes(attr.name)) el.removeAttribute(attr.name);
      }
      for (const attr of ['href', 'src', 'poster']) {
        const raw = el.getAttribute(attr);
        if (!raw || raw.startsWith('#')) continue;
        const url = new URL(raw, base);
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) { el.removeAttribute(attr); continue; }
        if (['freelug.org', 'www.freelug.org'].includes(url.hostname)) {
          url.protocol = 'https:'; url.hostname = 'freelug.org';
          if (/^\/(IMG|local)\//.test(url.pathname)) {
            url.hash = ''; url.search = ''; assetUrls.add(url.href);
          }
        }
        el.setAttribute(attr, url.href);
      }
      if (el.tagName === 'IMG') { el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); }
      if (el.tagName === 'TABLE') {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll'; wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Tableau défilant');
        el.replaceWith(wrapper); wrapper.append(el);
      }
    });
    return container.innerHTML;
  };
  try {
    await save('/inventory', inventory);
    for (const section of Object.values(inventory.sections)) {
      const holder = document.createElement('div');
      holder.innerHTML = section.html;
      section.description = holder.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
      section.html = clean(holder, `https://freelug.org/spip.php?rubrique${section.id}`);
    }
    const candidates = new Map(Object.values(inventory.articles).map(a => [a.id, a]));
    for (const url of inventory.sitemap || []) {
      const match = url.match(/\?article(\d+)$/);
      if (match && !candidates.has(Number(match[1]))) candidates.set(Number(match[1]), { id: Number(match[1]), url });
    }
    const queue = [...candidates.values()];
    report.candidates = queue.length;
    while (queue.length) {
      const article = queue.shift();
      if (skippedArticles.has(article.id)) continue;
      if (savedArticles.has(article.id)) {
        const cached = await fetch(bridge + '/article?id=' + article.id);
        if (!cached.ok) throw new Error(`Loading cached article ${article.id}: HTTP ${cached.status}`);
        const record = await cached.json();
        const holder = document.createElement('div');
        holder.innerHTML = record.html;
        clean(holder, record.url);
        remember(record);
        report.articles++;
        continue;
      }
      report.currentUrl = article.url;
      const response = await fetchSource(article.url);
      if (response.type === 'opaqueredirect') {
        (report.redirectedPages ||= []).push(article.url);
        if (article.section) {
          const record = { ...article, date: '', authors: [],
            description: 'Cet article est un lien vers une ressource externe.',
            html: '<p>Cet article redirige vers une ressource externe. Utilisez le lien vers la publication d’origine ci-dessous.</p>' };
          await save('/article', record);
          remember(record);
          report.articles++;
        } else {
          report.skippedArticles.push({ id: article.id, url: article.url, reason: 'Redirect with no known in-scope section' });
        }
        await checkpoint();
        continue;
      }
      if (!response.ok) throw new Error(`${article.url}: HTTP ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const main = doc.querySelector('#content > .inner > article');
      if (!main?.querySelector('h1') || !main.querySelector('.main')) throw new Error(`Missing article content: ${article.url}`);
      const body = document.createElement('div');
      for (const el of main.querySelectorAll(':scope > .main, :scope > footer .notes, :scope > aside .documents, :scope > aside .notes')) {
        body.append(el.cloneNode(true));
      }
      const category = main.querySelector('.postmeta .category a[href*="rubrique"]')?.getAttribute('href')?.match(/rubrique(\d+)/);
      if (!category || !inventory.sections[Number(category[1])]) {
        if (article.section) throw new Error(`Known article no longer belongs to an in-scope section: ${article.url}`);
        report.skippedArticles.push({ id: article.id, url: article.url, reason: 'Outside Association, Régions and Thèmes' });
        await checkpoint();
        continue;
      }
      const record = {
        ...article, title: main.querySelector('h1').textContent.trim(),
        date: main.querySelector('time')?.getAttribute('datetime') || '',
        authors: [...main.querySelectorAll('.cartouche .author')].map(a => a.textContent.trim()),
        description: (main.querySelector('.chapo, .texte')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        section: category && inventory.sections[Number(category[1])] ? Number(category[1]) : article.section,
        html: clean(body, article.url)
      };
      await save('/article', record);
      remember(record);
      report.articles++;
      await checkpoint();
    }
    report.discoveredAssets = assetUrls.size;
    window.captureAssetUrls = [...assetUrls];
    await save('/inventory', inventory);
    report.phase = 'awaiting-assets';
    await save('/report', report);
    window.captureAssets = async () => {
    if (report.running) throw new Error('A capture is already running.');
    if (report.phase === 'complete') throw new Error('This capture is already complete.');
    if (report.errors.length) throw new Error('Resolve capture errors before downloading assets.');
    report.running = true;
    report.phase = 'assets';
    try {
    for (const url of assetUrls) {
      if (report.stopRequested) throw new Error('Capture paused by user; the checkpoint is saved.');
      if (report.unavailableAssets.some(asset => asset.url === url)) continue;
      const key = await assetKey(url);
      if (savedAssets.has(key)) { report.assets++; continue; }
      report.currentUrl = url;
      const response = await fetchSource(url);
      if (response.status === 404 || response.status === 410) {
        report.unavailableAssets.push({ url, status: response.status });
      } else {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const blob = await response.blob();
        if (/text\/html/.test(blob.type)) throw new Error(`Asset returned HTML: ${url}`);
        await save('/asset?url=' + encodeURIComponent(url), blob, true);
        savedAssets.add(key);
        report.assets++;
      }
      await save('/report', report);
    }
    report.completedAt = new Date().toISOString();
    report.phase = 'complete';
    } catch (error) {
      report.errors.push(error.message);
      console.error(error);
    }
    report.running = false;
    await save('/report', report);
    };
  } catch (error) {
    report.errors.push(error.message);
    console.error(error);
  }
  report.running = false;
  await checkpoint();
  return report;
};
