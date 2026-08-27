(() => {
  'use strict';

  const ENDPOINT = 'https://magic-era-ai.yuxiang10010522.workers.dev';
  const REQUEST_TIMEOUT_MS = 55000;
  let bypass = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const clean = (v, max = 1400) => String(v || '').trim().slice(0, max);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getContext() {
    const story = $('storyFeed');
    const recent = story
      ? Array.from(story.children).slice(-4).map((el) => clean(el.textContent, 520)).filter(Boolean)
      : [];

    return {
      time: clean($('worldTime')?.textContent, 120),
      location: clean($('worldLocation')?.textContent, 160),
      identity: clean($('pIdentity')?.textContent, 220),
      goal: clean($('pGoal')?.textContent, 240),
      stats: clean($('statsPanel')?.textContent, 720),
      relationships: clean($('relationsMini')?.textContent, 520),
      worldPressure: clean($('worldPressure')?.textContent, 100),
      recentEvents: recent
    };
  }

  function setStatus(text, state = '') {
    const el = $('aiStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.state = state;
  }

  function toast(text, duration = 5200) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  function parseMaybeJson(value) {
    if (value == null) return value;
    if (Array.isArray(value)) {
      const text = value.map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      }).join('');
      return parseMaybeJson(text);
    }
    if (typeof value !== 'string') return value;

    let text = value.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(text); } catch {}

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return text;
  }

  function normalizeResult(payload) {
    let result = payload?.result ?? payload;

    for (let i = 0; i < 7; i++) {
      if (result == null) break;
      if (result && typeof result === 'object' && Array.isArray(result.choices) && result.choices.length) {
        const message = result.choices[0]?.message || {};
        result = message.parsed ?? message.content ?? result.choices[0]?.text ?? result;
        continue;
      }
      if (result && typeof result === 'object' && result.response !== undefined) {
        result = result.response;
        continue;
      }
      if (result && typeof result === 'object' && result.result?.response !== undefined) {
        result = result.result.response;
        continue;
      }
      if (result && typeof result === 'object' && result.output_text !== undefined) {
        result = result.output_text;
        continue;
      }
      const parsed = parseMaybeJson(result);
      if (parsed !== result) {
        result = parsed;
        continue;
      }
      break;
    }

    result = parseMaybeJson(result);
    if (result && typeof result === 'object' && !Array.isArray(result)) return result;

    const text = clean(result, 1800);
    return {
      action_type: 'other',
      understood_action: '',
      target: '',
      immediate_step: '',
      narrative: text || 'AI 没有返回可读取的情境描述。'
    };
  }

  async function askOnce(action) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('AI request timeout'), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, context: getContext() }),
        signal: controller.signal
      });

      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch {}

      if (!response.ok || !payload?.ok) {
        const detail = payload?.message || payload?.error || clean(raw, 260) || `HTTP ${response.status}`;
        const err = new Error(`HTTP ${response.status}: ${detail}`);
        err.status = response.status;
        throw err;
      }
      return normalizeResult(payload);
    } catch (error) {
      if (error?.name === 'AbortError' || String(error).includes('AI request timeout')) {
        throw new Error('请求超过55秒，Cloudflare AI 响应超时');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function askAI(action) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt === 2) setStatus('第一次请求未成功，正在自动重试…', 'loading');
        return await askOnce(action);
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(1200);
      }
    }
    throw lastError || new Error('未知 AI 请求错误');
  }

  async function probeWorker() {
    try {
      const response = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store' });
      const data = await response.json().catch(() => null);
      return response.ok && data?.ok;
    } catch {
      return false;
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
    narrative.textContent = clean(ai.narrative || ai.immediate_step || 'AI 已理解行动，但本次没有返回可读取的具体情境。', 1800);
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

      await sleep(260);
      addAINarrative(ai, original);
      setStatus('Cloudflare GLM-4.7 Flash · 自由行动已启用', 'ok');
    } catch (error) {
      console.error('Cloudflare AI failed, using local rules:', error);
      const workerOnline = await probeWorker();
      const reason = clean(error?.message || error, 260);

      input.value = original;
      aiMode.checked = false;
      bypass = true;
      button.disabled = false;
      button.click();
      bypass = false;
      aiMode.checked = true;

      if (workerOnline) {
        setStatus(`Worker在线 · AI请求失败：${reason}`, 'fallback');
        toast(`Cloudflare Worker 在线，但 AI 请求失败：${reason}`);
      } else {
        setStatus(`Worker连接失败 · ${reason}`, 'fallback');
        toast(`无法连接 AI Worker：${reason}`);
      }
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

  setTimeout(boot, 700);
  setTimeout(boot, 1800);
})();
