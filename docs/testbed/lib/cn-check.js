/**
 * 国内校招测试台自检面板。
 *
 * 用法：先把 docs/testbed/fixtures/sample-cn-profile.json 导入扩展的 options 页
 * （「profile.json 导入」卡片），然后在侧边栏点「填写匹配字段」，回到本页看通过率。
 *
 * 每个被检查的控件上标了两个属性：
 *   data-slot="politicalStatus"          期望命中的 FieldSlot（人工核对用）
 *   data-path="basic.politicalStatus"    期望值在夹具里的路径（自检脚本据此取值比对）
 *   data-check-group="stage3"            分组：默认 now（当前应通过），stage3（填充器增强后的目标）
 *
 * 不改造上游 harness.js：它是为 JSON Resume 夹具写的，改造成本高且回归风险大。
 */
(function () {
  const FIXTURE_URL = '../fixtures/sample-cn-profile.json';
  const PANEL_ID = 'cn-check-panel';
  const GROUP_LABELS = {
    now: '当前应通过',
    stage3: '阶段 3 目标控件',
  };

  const state = {
    fixture: null,
    results: [],
  };

  function resolvePath(source, path) {
    return path.split('.').reduce((current, key) => {
      if (current == null) return undefined;
      return current[key];
    }, source);
  }

  function normalize(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function queryWithin(root, selector) {
    return root.querySelectorAll(selector);
  }

  function readValue(element) {
    const root = element.getRootNode();
    const tag = element.tagName.toLowerCase();
    if (element.hasAttribute('contenteditable')) {
      return normalize(element.textContent);
    }
    if (tag === 'select') {
      const option = element.selectedOptions && element.selectedOptions[0];
      return normalize(option ? option.textContent : element.value);
    }
    if (element.type === 'radio' || element.type === 'checkbox') {
      const name = element.getAttribute('name');
      if (!name) return element.checked ? normalize(element.value) : '';
      const group = queryWithin(root, `input[name="${CSS.escape(name)}"]`);
      for (const item of group) {
        if (item.checked) {
          const label = item.closest('label');
          return normalize(label ? label.textContent : item.value);
        }
      }
      return '';
    }
    if (element.hasAttribute('data-value-target')) {
      const target = root.querySelector(element.getAttribute('data-value-target'));
      return target ? normalize(target.textContent) : '';
    }
    return normalize(element.value);
  }

  /** 递归收集（含 open shadow root），与扩展侧扫描器的遍历方式保持一致。 */
  function collectTargets(root, seen) {
    const nodes = Array.from(root.querySelectorAll('*'));
    for (const node of nodes) {
      if (node.hasAttribute && node.hasAttribute('data-path')) {
        const path = node.getAttribute('data-path');
        const key = node.type === 'radio' ? `radio:${node.getAttribute('name') || path}` : path;
        if (!seen.has(key)) {
          seen.set(key, node);
        }
      }
      if (node.shadowRoot) {
        collectTargets(node.shadowRoot, seen);
      }
    }
    return seen;
  }

  function run() {
    if (!state.fixture) return;
    const seen = collectTargets(document, new Map());
    const results = [];
    for (const node of seen.values()) {
      const path = node.getAttribute('data-path');
      const expected = normalize(resolvePath(state.fixture, path));
      const actual = readValue(node);
      results.push({
        group: node.getAttribute('data-check-group') || 'now',
        path,
        slot: node.getAttribute('data-slot') || '',
        label:
          node.getAttribute('data-label') ||
          (node.labels && node.labels[0] ? normalize(node.labels[0].textContent) : '') ||
          node.getAttribute('placeholder') ||
          path,
        expected,
        actual,
        empty: expected.length === 0,
        pass: expected.length > 0 && expected === actual,
      });
    }
    state.results = results;
    render();
  }

  function summarize(results) {
    const checkable = results.filter((item) => !item.empty);
    const passed = checkable.filter((item) => item.pass);
    const rate = checkable.length > 0 ? Math.round((passed.length / checkable.length) * 100) : 0;
    return { passed: passed.length, total: checkable.length, rate, skipped: results.length - checkable.length };
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const groups = new Map();
    for (const item of state.results) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    }

    panel.querySelector('[data-role="summary"]').innerHTML = Array.from(groups.entries())
      .map(([group, items]) => {
        const stats = summarize(items);
        const label = GROUP_LABELS[group] || group;
        return `<span class="cn-check-stat"><strong>${label}</strong> ${stats.passed}/${stats.total}（${stats.rate}%）${
          stats.skipped > 0 ? ` · 跳过 ${stats.skipped}` : ''
        }</span>`;
      })
      .join('');

    panel.querySelector('[data-role="rows"]').innerHTML = state.results
      .map((item) => {
        const status = item.empty ? 'skip' : item.pass ? 'pass' : 'fail';
        const detail =
          status === 'pass'
            ? escapeHtml(item.actual)
            : `期望 <code>${escapeHtml(item.expected)}</code> / 实际 <code>${
                escapeHtml(item.actual) || '(空)'
              }</code>`;
        return `<tr class="cn-check-${status}">
          <td>${escapeHtml(item.label)}</td>
          <td><code>${escapeHtml(item.slot || '-')}</code></td>
          <td>${detail}</td>
        </tr>`;
      })
      .join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildPanel() {
    const panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.className = 'cn-check-panel';
    panel.innerHTML = `
      <header>
        <span>校招字段自检</span>
        <button type="button" data-role="run">重新检查</button>
      </header>
      <p data-role="summary">加载夹具中…</p>
      <div class="cn-check-table-wrap">
        <table>
          <thead><tr><th>字段</th><th>Slot</th><th>结果</th></tr></thead>
          <tbody data-role="rows"></tbody>
        </table>
      </div>
      <footer>先把 <code>fixtures/sample-cn-profile.json</code> 导入扩展，再用侧边栏「填写匹配字段」。</footer>
    `;
    document.body.appendChild(panel);
    panel.querySelector('[data-role="run"]').addEventListener('click', run);
  }

  async function init() {
    buildPanel();
    try {
      const response = await fetch(FIXTURE_URL, { cache: 'no-store' });
      state.fixture = await response.json();
    } catch (error) {
      const summary = document.querySelector(`#${PANEL_ID} [data-role="summary"]`);
      if (summary) summary.textContent = '夹具加载失败，请通过 http 服务打开本页。';
      console.error('Failed to load CN fixture', error);
      return;
    }
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
