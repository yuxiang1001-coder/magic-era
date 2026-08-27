(() => {
  'use strict';

  const ENDPOINT = 'https://magic-era-ai.yuxiang10010522.workers.dev';
  let bypass = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const clean = (v, max = 1400) => String(v || '').trim().slice(0, max);

  function getContext() {
    const story = $('storyFeed');
    const recent = story
      ? Array.from(story.children).slice(-5).map((el) => clean(el.textContent, 700)).filter(Boolean)
      : [];

    return {
      time: clean($('worldTime')?.textContent, 120),
      location: clean($('worldLocation')?.textContent, 160),
      identity: clean($('pIdentity')?.textContent, 240),
      goal: clean($('pGoal')?.textContent, 300),
      stats: clean($('statsPanel')?.textContent, 1000),
      relationships: clean($('relationsMini')?.textContent, 700),
      worldPressure: clean($('worldPressure')?.textContent, 120),
      recentEvents: recent
    };
  }

  function setStatus(text, state = '') {
    const el = $('aiStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.state = state;
  }

  function toast(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function normalizeResult(payload) {
    let result = payload?.result ?? payload;
    for (let i = 0; i < 3; i++) {
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch { break; }
      } else if (result && typeof result === 'object' && typeof result.response === 'string') {
        try { result = JSON.parse(result.response); } catch { result = result.response; break; }
      } else {
        break;
      }
    }
    return result && typeof result === 'object' ? result : { narrative: clean(result, 1200) };
  }

  async function askAI(action) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, context: getContext() }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
      }
      return normalizeResult(payload);
    } finally {
      clearTimeout(timer);
    }
  }

  function fallbackCommand(ai, original) {
    const target = clean(ai.target || ai.immediate_step || ai.understood_action || original, 220);
    const map = {
      study: `学习 ${target}`,
      research: `学习并调查 ${target}`,
      magic: `练习魔法 ${target}`,
      dark_magic: `学习 ${target || '黑魔法相关理论'}`,
      social: `社交 ${target}`,
      family: `社交 ${target}`,
      romance: `社交 ${target}`,
      investigate: `探索并调查 ${target}`,
      explore: `探索 ${target}`,
      stealth: `探索并谨慎行动 ${target}`,
      crime: `探索并秘密行动 ${target}`,
      combat: `训练战斗 ${target}`,
      work: `工作 ${target}`,
      business: `工作并经营 ${target}`,
      politics: `工作并接触政治事务 ${target}`,
      legal: `调查法律事务 ${target}`,
      travel: `旅行 ${target}`,
      rest: '休息',
      other: `探索 ${target}`
    };
    return map[ai.action_type] || `探索 ${target}`;
  }

  function addAINarrative(ai, original) {
    const feed = $('storyFeed');
    if (!feed) return;

    const box = document.createElement('article');
    box.className = 'ai-story-card';

    const title = document.createElement('div');
    title.className = 'ai-story-title';
    title.textContent = '✦ AI 情境裁定';

    const intent = document.createElement('div');
    intent.className = 'ai-story-intent';
    intent.textContent = ai.understood_action
      ? `你的意图：${ai.understood_action}`
      : `你的行动：${original}`;

    const narrative = document.createElement('p');
    narrative.textContent = clean(ai.narrative || ai.immediate_step || '系统理解了你的行动，但没有生成额外叙事。', 1800);

    box.append(title, intent, narrative);

    if (Array.isArray(ai.obstacles) && ai.obstacles.length) {
      const obstacles = document.createElement('p');
      obstacles.className = 'ai-story-meta';
      obstacles.textContent = `具体阻碍：${ai.obstacles.slice(0, 4).join('；')}`;
      box.appendChild(obstacles);
    }

    const metaParts = [];
    if (Number.isFinite(Number(ai.difficulty))) metaParts.push(`难度 ${ai.difficulty}/100`);
    if (Number.isFinite(Number(ai.risk))) metaParts.push(`风险 ${ai.risk}/100`);
    if (ai.legal_status) metaParts.push(`规则状态：${ai.legal_status}`);
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'ai-story-meta';
      meta.textContent = metaParts.join(' · ');
      box.appendChild(meta);
    }

    if (Array.isArray(ai.suggested_next_actions) && ai.suggested_next_actions.length) {
      const next = document.createElement('p');
      next.className = 'ai-story-next';
      next.textContent = `可继续：${ai.suggested_next_actions.slice(0, 3).join(' / ')}`;
      box.appendChild(next);
    }

    feed.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function handleAction(event) {
    if (bypass || busy) return;

    const aiMode = $('aiMode');
    const input = $('freeAction');
    const button = $('btnAct');
    if (!aiMode?.checked || !input || !button) return;

    const original = clean(input.value, 2000);
    if (!original) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    busy = true;
    button.disabled = true;
    setStatus('Cloudflare GLM 正在理解你的行动…', 'loading');

    try {
      const ai = await askAI(original);
      const localCommand = fallbackCommand(ai, original);

      input.value = localCommand;
      aiMode.checked = false;
      bypass = true;
      button.disabled = false;
      button.click();
      bypass = false;
      aiMode.checked = true;

      await new Promise((resolve) => setTimeout(resolve, 260));
      addAINarrative(ai, original);
      setStatus('Cloudflare GLM-4.7 Flash · 自由行动已启用', 'ok');
    } catch (error) {
      console.error('Cloudflare AI failed, using local rules:', error);
      input.value = original;
      aiMode.checked = false;
      bypass = true;
      button.disabled = false;
      button.click();
      bypass = false;
      aiMode.checked = true;
      setStatus('AI 暂时不可用 · 已自动使用本地规则', 'fallback');
      toast('AI 暂时不可用，本次行动已由本地规则继续处理。');
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function boot() {
    const button = $('btnAct');
    if (!button || button.dataset.cloudflareAiBound === '1') return;
    button.dataset.cloudflareAiBound = '1';
    button.addEventListener('click', handleAction, true);
    setStatus('Cloudflare GLM-4.7 Flash · 无需登录', 'ok');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // loader.js 会异步加载游戏引擎；再次确认按钮已绑定。
  setTimeout(boot, 700);
  setTimeout(boot, 1800);
})();
