(function () {
  "use strict";

  // ─── HTML helpers (scoped fallbacks if app.js globals aren't accessible) ──
  function escHtmlLocal(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function escAttr(value) {
    return escHtmlLocal(value);
  }
  // Use global escHtml from app.js if available, otherwise use local version
  function escHtml(value) {
    return typeof window.escHtml === "function" ? window.escHtml(value) : escHtmlLocal(value);
  }

  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  let learnCache = null;
  let learnTab = "articles";
  let learnFilter = "all";

  const CATEGORY_META = {
    nutrition: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>`, color: "#f97316" },
    fitness: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 9h4"/><path d="M2 15h4"/><path d="M18 9h4"/><path d="M18 15h4"/><path d="M6 12h12"/></svg>`, color: "#2563eb" },
    recovery: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>`, color: "#16a34a" },
    mindset: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`, color: "#7c3aed" },
    sleep: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`, color: "#0891b2" },
    health: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`, color: "#dc2626" }
  };

  function getAvailableLearnTabs() {
    if (!learnCache) {
      return [];
    }
    const tabs = [];
    if (Array.isArray(learnCache.articles) && learnCache.articles.length) {
      tabs.push("articles");
    }
    if (Array.isArray(learnCache.videos) && learnCache.videos.length) {
      tabs.push("videos");
    }
    return tabs;
  }

  function syncLearnTabsUi() {
    const availableTabs = getAvailableLearnTabs();
    const tabRow = document.querySelector(".learn-tabs");
    if (tabRow) {
      tabRow.classList.toggle("hidden", availableTabs.length <= 1);
    }
    document.querySelectorAll(".learn-tab").forEach((btn) => {
      const isAvailable = availableTabs.includes(btn.dataset.tab);
      btn.classList.toggle("hidden", !isAvailable);
      btn.disabled = !isAvailable;
    });
    if (!availableTabs.length) {
      learnTab = "articles";
      return;
    }
    if (!availableTabs.includes(learnTab)) {
      learnTab = availableTabs[0];
    }
    document.querySelectorAll(".learn-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === learnTab);
    });
  }

  function initLearn() {
    try {
      const cached = JSON.parse(localStorage.getItem("hale_learn_cache") || "null");
      const hasVideoIds = cached && Array.isArray(cached.videos) && cached.videos.length > 0 && cached.videos[0].youtubeVideoId !== undefined;
      if (
        cached &&
        cached.generatedAt &&
        hasVideoIds &&
        Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL_MS
      ) {
        learnCache = cached;
      } else if (cached && !hasVideoIds) {
        localStorage.removeItem("hale_learn_cache");
      }
    } catch (_e) {
      localStorage.removeItem("hale_learn_cache");
    }
  }

  function onLearnPageShow() {
    if (learnCache) {
      syncLearnTabsUi();
      renderLearnFeed();
    } else {
      loadLearnContent();
    }
  }

  async function loadLearnContent() {
    setLearnLoading(true);
    hideLearnError();

    try {
      const context = buildUserContext();
      const requestMethod = "POST";
      const response = await fetch("/api/health-content", {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context })
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (_e) {
        data = {};
      }
      if (!response.ok) {
        const debugParts = [
          `Request method: ${requestMethod}`,
          `Endpoint response status: ${response.status}`,
          `Raw backend error: ${rawText || data.error || "No response body"}`
        ];
        throw new Error(debugParts.join("\n"));
      }

      learnCache = { ...data, generatedAt: new Date().toISOString() };
      localStorage.setItem("hale_learn_cache", JSON.stringify(learnCache));
      syncLearnTabsUi();
      renderLearnFeed();
    } catch (err) {
      showLearnError(err.message || "Could not load content. Please try again.");
    } finally {
      setLearnLoading(false);
    }
  }

  function buildUserContext() {
    if (typeof state === "undefined") return {};
    const goals = state.goals || {};
    const recentSessions = (state.workoutSessions || []).slice(-3).map((ws) => ({
      routineName: ws.routineName || "Workout",
      durationMinutes: Math.round((ws.durationSeconds || 0) / 60),
      totalVolume: Number(ws.totalVolume) || 0
    }));
    const last3Days = [-2, -1, 0].map((offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return date.toISOString().slice(0, 10);
    });
    const recentLogs = (state.logs || []).filter((log) => last3Days.includes(log.date));
    const recentAvgMacros = recentLogs.length ? {
      cal: Math.round(recentLogs.reduce((sum, log) => sum + (log.cal || 0), 0) / last3Days.length),
      protein: Math.round(recentLogs.reduce((sum, log) => sum + (log.pro || 0), 0) / last3Days.length),
      carb: Math.round(recentLogs.reduce((sum, log) => sum + (log.carb || 0), 0) / last3Days.length),
      fat: Math.round(recentLogs.reduce((sum, log) => sum + (log.fat || 0), 0) / last3Days.length)
    } : {};
    const latestRecord = Array.isArray(state.bloodTests) && state.bloodTests.length
      ? state.bloodTests.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
      : null;
    const healthMarkers = latestRecord
      ? (latestRecord.markers || []).map((m) => ({ name: m.name, value: m.value, unit: m.unit, status: m.status }))
      : [];

    return {
      goalType: "maintain",
      goals: {
        cal: goals.cal || 2000,
        protein: goals.pro || 150,
        carb: goals.carb || 220,
        fat: goals.fat || 65,
        water: goals.water || 2.5,
        steps: goals.steps || 8000
      },
      recentAvgMacros,
      recentWorkouts: recentSessions,
      healthMarkers,
      conditions: [],
      activityLevel: "moderate",
      ageYears: null,
      sex: ""
    };
  }

  function renderLearnFeed() {
    const feed = document.getElementById("learn-feed");
    if (!feed || !learnCache) return;

    syncLearnTabsUi();
    if (!getAvailableLearnTabs().length) {
      feed.innerHTML = `<div class="learn-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
        <p>No Learn content is available right now.<br>Refresh to try again.</p>
      </div>`;
      return;
    }

    const isArticles = learnTab === "articles";
    const items = isArticles ? (learnCache.articles || []) : (learnCache.videos || []);
    const filtered = learnFilter === "all" ? items : items.filter((item) => item.category === learnFilter);

    if (!filtered.length) {
      feed.innerHTML = `<div class="learn-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
        <p>No ${learnFilter} content available.<br>Try a different filter or refresh.</p>
      </div>`;
      return;
    }

    feed.innerHTML = filtered.map(isArticles ? renderArticleCard : renderVideoCard).join("");
  }

  function renderArticleCard(article) {
    const meta = CATEGORY_META[article.category] || CATEGORY_META.health;
    const safeId = escAttr(article.id);
    return `
      <button class="learn-card learn-card--article" type="button" onclick="openArticleReader('${safeId}')">
        <div class="learn-card-meta">
          <span class="learn-category-pill" style="--cat-color:${meta.color}">${meta.icon}${escHtml(capitalise(article.category))}</span>
          <span class="learn-read-time">${article.readTimeMinutes} min read</span>
        </div>
        <h3 class="learn-card-title">${escHtml(article.title)}</h3>
        <p class="learn-card-summary">${escHtml(article.summary)}</p>
        <div class="learn-relevance">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${escHtml(article.relevanceReason)}
        </div>
        <div class="learn-card-tags">${(article.tags || []).slice(0, 3).map((tag) => `<span class="learn-tag">${escHtml(tag)}</span>`).join("")}</div>
      </button>`;
  }

  function renderVideoCard(video) {
    const meta = CATEGORY_META[video.category] || CATEGORY_META.fitness;
    const hasId = Boolean(video.youtubeVideoId);
    const thumbnailUrl = hasId
      ? `https://img.youtube.com/vi/${encodeURIComponent(video.youtubeVideoId)}/hqdefault.jpg`
      : "";
    const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(video.searchQuery)}`;
    const clickHandler = hasId
      ? `openVideoPlayer('${escAttr(video.id)}')`
      : `window.open('${escAttr(fallbackUrl)}', '_blank', 'noopener')`;

    return `
      <button class="learn-card learn-card--video" type="button" onclick="${clickHandler}">
        <div class="learn-video-thumbnail ${hasId ? "has-thumb" : "no-thumb"}">
          ${hasId
            ? `<img class="learn-video-thumb-img" src="${escAttr(thumbnailUrl)}"
               alt="${escAttr(video.title)}"
               onerror="this.style.display='none';this.parentElement.classList.add('no-thumb');this.parentElement.classList.remove('has-thumb')">`
            : ""}
          <div class="learn-video-play-btn">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div class="learn-video-duration-badge">${escHtml(video.durationEstimate)}</div>
          ${!hasId ? `<div class="learn-video-search-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Opens YouTube
          </div>` : ""}
        </div>
        <div class="learn-card-body">
          <div class="learn-card-meta">
            <span class="learn-category-pill" style="--cat-color:${meta.color}">${meta.icon}${escHtml(capitalise(video.category))}</span>
          </div>
          <h3 class="learn-card-title">${escHtml(video.title)}</h3>
          <p class="learn-card-summary">${escHtml(video.description)}</p>
          <div class="learn-video-channel">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
            ${escHtml(video.channelSuggestion)}
          </div>
          <div class="learn-card-tags">${(video.tags || []).slice(0, 3).map((tag) => `<span class="learn-tag">${escHtml(tag)}</span>`).join("")}</div>
        </div>
      </button>`;
  }

  function openArticleReader(articleId) {
    if (!learnCache) return;
    const article = (learnCache.articles || []).find((item) => item.id === articleId);
    if (!article) return;

    const meta = CATEGORY_META[article.category] || CATEGORY_META.health;

    // Set category pill in nav
    const categoryEl = document.getElementById("article-reader-category");
    if (categoryEl) {
      categoryEl.innerHTML = `<span class="learn-category-pill" style="--cat-color:${meta.color}">${meta.icon}${escHtml(capitalise(article.category))}</span>`;
    }

    // Set accent bar colour
    const accentBar = document.getElementById("article-reader-accent-bar");
    if (accentBar) {
      accentBar.style.background = meta.color;
      accentBar.style.opacity = "0.7";
    }

    // Render article content
    const contentEl = document.getElementById("article-reader-content");
    if (contentEl) {
      contentEl.innerHTML = `
        <h2 class="article-reader-title">${escHtml(article.title)}</h2>
        <div class="article-reader-byline">
          <span>${article.readTimeMinutes} min read</span>
          <span class="article-reader-dot">·</span>
          <span>${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
        <div class="article-reader-divider"></div>
        ${renderArticleBody(article.body)}
        <div class="article-relevance-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Why this article? ${escHtml(article.relevanceReason)}</span>
        </div>
        <div class="article-reader-tags">${(article.tags || []).map((tag) => `<span class="learn-tag">${escHtml(tag)}</span>`).join("")}</div>
      `;
      // Scroll content area back to top
      contentEl.scrollTop = 0;
    }

    // Open overlay with slide-in animation
    const overlay = document.getElementById("overlay-article-reader");
    if (overlay) {
      overlay.classList.remove("hidden", "closing");
      // Force a paint before adding 'open' so the transition fires from translateX(100%)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add("open");
        });
      });
    }
  }

  function closeArticleReader() {
    const overlay = document.getElementById("overlay-article-reader");
    if (!overlay) return;
    overlay.classList.add("closing");
    overlay.classList.remove("open");
    // Wait for slide-out animation to finish before hiding
    const onEnd = () => {
      overlay.classList.remove("closing");
      overlay.classList.add("hidden");
      overlay.removeEventListener("transitionend", onEnd);
    };
    overlay.addEventListener("transitionend", onEnd);
    // Fallback in case transitionend doesn't fire
    setTimeout(() => {
      if (overlay.classList.contains("closing")) {
        overlay.classList.remove("closing");
        overlay.classList.add("hidden");
      }
    }, 380);
  }

  function openVideoPlayer(videoId) {
    if (!learnCache) return;
    const video = (learnCache.videos || []).find((v) => v.id === videoId);
    if (!video || !video.youtubeVideoId) return;

    const meta = CATEGORY_META[video.category] || CATEGORY_META.fitness;
    const categoryEl = document.getElementById("video-player-category");
    if (categoryEl) {
      categoryEl.innerHTML = `<span class="learn-category-pill" style="--cat-color:${meta.color}">${meta.icon}${escHtml(capitalise(video.category))}</span>`;
    }

    const embedEl = document.getElementById("video-player-embed");
    if (embedEl) {
      embedEl.innerHTML = `
        <iframe
          src="https://www.youtube.com/embed/${encodeURIComponent(video.youtubeVideoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
          title="${escAttr(video.title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          class="video-player-iframe">
        </iframe>`;
    }

    const metaEl = document.getElementById("video-player-meta");
    if (metaEl) {
      metaEl.innerHTML = `
        <h3 class="video-player-title">${escHtml(video.title)}</h3>
        <div class="video-player-channel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
          ${escHtml(video.channelSuggestion)}
          <span class="video-player-dot">·</span>
          ${escHtml(video.durationEstimate)}
        </div>
        <p class="video-player-description">${escHtml(video.description)}</p>
        <div class="video-player-tags">${(video.tags || []).map((t) => `<span class="learn-tag">${escHtml(t)}</span>`).join("")}</div>
        <a class="video-player-yt-link" href="https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeVideoId)}" target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open in YouTube
        </a>
      `;
    }

    const overlay = document.getElementById("overlay-video-player");
    if (overlay) {
      overlay.classList.remove("hidden", "closing");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add("open"));
      });
    }
  }

  function closeVideoPlayer() {
    const overlay = document.getElementById("overlay-video-player");
    if (!overlay) return;

    const embedEl = document.getElementById("video-player-embed");
    if (embedEl) embedEl.innerHTML = "";

    overlay.classList.add("closing");
    overlay.classList.remove("open");

    const onEnd = () => {
      overlay.classList.remove("closing");
      overlay.classList.add("hidden");
      overlay.removeEventListener("transitionend", onEnd);
    };
    overlay.addEventListener("transitionend", onEnd);
    setTimeout(() => {
      if (overlay.classList.contains("closing")) {
        overlay.classList.remove("closing");
        overlay.classList.add("hidden");
      }
    }, 380);
  }

  function renderArticleBody(body) {
    if (!body) return "";
    const lines = body.split("\n");
    const html = [];
    let inList = false;

    lines.forEach((line) => {
      if (line.startsWith("## ")) {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push(`<h3 class="article-body-heading">${escHtml(line.slice(3))}</h3>`);
      } else if (line.startsWith("- ")) {
        if (!inList) { html.push('<ul class="article-body-list">'); inList = true; }
        html.push(`<li class="article-body-li">${renderInline(line.slice(2))}</li>`);
      } else if (line.trim() === "") {
        if (inList) { html.push("</ul>"); inList = false; }
      } else {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push(`<p class="article-body-p">${renderInline(line)}</p>`);
      }
    });

    if (inList) html.push("</ul>");
    return html.join("");
  }

  function renderInline(text) {
    return escHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function switchLearnTab(tab) {
    if (!getAvailableLearnTabs().includes(tab)) {
      return;
    }
    learnTab = tab;
    document.querySelectorAll(".learn-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    resetFilterPills();
    renderLearnFeed();
  }

  function filterLearnContent(cat) {
    learnFilter = cat;
    document.querySelectorAll(".learn-filter").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.cat === cat);
    });
    renderLearnFeed();
  }

  function resetFilterPills() {
    learnFilter = "all";
    document.querySelectorAll(".learn-filter").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.cat === "all");
    });
  }

  function setLearnLoading(on) {
    document.getElementById("learn-loading")?.classList.toggle("hidden", !on);
    document.getElementById("learn-feed")?.classList.toggle("hidden", on);
  }

  function showLearnError(msg) {
    const el = document.getElementById("learn-error");
    if (el) {
      el.textContent = msg;
      el.style.whiteSpace = "pre-wrap";
      el.classList.remove("hidden");
    }
  }

  function hideLearnError() {
    document.getElementById("learn-error")?.classList.add("hidden");
  }

  function capitalise(str) {
    return str ? str[0].toUpperCase() + str.slice(1) : "";
  }

  window.initLearn = initLearn;
  window.onLearnPageShow = onLearnPageShow;
  window.switchLearnTab = switchLearnTab;
  window.filterLearnContent = filterLearnContent;
  window.openArticleReader = openArticleReader;
  window.closeArticleReader = closeArticleReader;
  window.openVideoPlayer = openVideoPlayer;
  window.closeVideoPlayer = closeVideoPlayer;
})();
