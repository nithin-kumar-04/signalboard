/*
 * app.js — UI wiring for Signalboard.
 * State lives in this closure; every render is a pure function of state.
 */
(function () {
  'use strict';

  const A = window.Marketing;
  const C = window.Charts;
  const MS_DAY = 86400000;

  const ICONS = {
    'trend-up': '<polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="15 7 21 7 21 13"></polyline>',
    'trend-down': '<polyline points="3 7 9 13 13 9 21 17"></polyline><polyline points="15 17 21 17 21 11"></polyline>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"></path>',
    pie: '<path d="M12 3a9 9 0 109 9h-9V3z"></path><path d="M15 3.5A9 9 0 0120.5 9H15V3.5z"></path>',
    trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4z"></path><path d="M8 6H5a3 3 0 003 3M16 6h3a3 3 0 01-3 3"></path><path d="M12 13v4M9 21h6M10 17h4"></path>',
    alert: '<path d="M12 4l9 16H3L12 4z"></path><path d="M12 10v4M12 17h.01"></path>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"></path>',
    dot: '<circle cx="12" cy="12" r="4"></circle>',
  };

  const state = {
    rows: [],
    source: { type: 'sample', name: 'Sample dataset', warnings: [], mapping: {} },
    filters: {
      start: null,
      end: null,
      preset: '90d',
      channels: [],
      campaigns: [],
      devices: [],
      search: '',
    },
    granularity: 'auto',
    sort: { key: 'revenue', dir: 'desc' },
    page: 1,
    pageSize: 10,
    dataStart: null,
    dataEnd: null,
    dims: { channels: [], campaigns: [], devices: [] },
    view: null,
  };

  const dom = {};
  let resizeTimer = null;
  let searchTimer = null;

  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  const moneyPrecise = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const integer = new Intl.NumberFormat('en-US');
  const dateFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const TABLE_COLUMNS = [
    { key: 'campaign', label: 'Campaign' },
    { key: 'channel', label: 'Channel' },
    { key: 'spend', label: 'Spend', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'roas', label: 'ROAS', num: true },
    { key: 'conversions', label: 'Conv.', num: true },
    { key: 'cpa', label: 'CPA', num: true },
    { key: 'ctr', label: 'CTR', num: true },
    { key: 'cvr', label: 'CVR', num: true },
  ];

  document.addEventListener('DOMContentLoaded', init);

  /* ------------------------------------------------------------------ init */

  function init() {
    cacheDom();
    loadSample();
    bindEvents();
    render();
  }

  function cacheDom() {
    [
      'datasetBadge', 'sampleBtn', 'uploadBtn', 'csvInput', 'exportBtn',
      'startDate', 'endDate', 'searchInput', 'resetBtn', 'granularity',
      'kpis', 'trendChart', 'rangeLabel', 'channelChart',
      'efficiencyBars', 'funnelChart', 'campaignBars',
      'insights', 'tableHead', 'tableBody', 'tableCount', 'pageSize',
      'pageLabel', 'prevPage', 'nextPage', 'toasts', 'sourceNote',
      'ddChannel', 'ddCampaign', 'ddDevice',
    ].forEach(function (id) {
      dom[id] = document.getElementById(id);
    });
    dom.presets = Array.from(document.querySelectorAll('[data-preset]'));
  }

  function loadSample() {
    state.rows = window.SampleData.createSampleRecords(540);
    state.source = { type: 'sample', name: 'Sample dataset', warnings: [], mapping: {} };
    state.filters.channels = [];
    state.filters.campaigns = [];
    state.filters.devices = [];
    state.filters.search = '';
    state.filters.preset = '90d';
    state.sort = { key: 'revenue', dir: 'desc' };
    state.page = 1;
    state.granularity = 'auto';
    state.dims = { channels: [], campaigns: [], devices: [] };
    dom.searchInput.value = '';
    dom.granularity.value = 'auto';
    dom.pageSize.value = String(state.pageSize);

    const bounds = dateBounds(state.rows);
    state.dataStart = bounds.start;
    state.dataEnd = bounds.end;

    refreshDimensions();
    applyPreset('90d');
  }

  /* --------------------------------------------------------------- helpers */

  function dateBounds(rows) {
    let min = null;
    let max = null;
    rows.forEach(function (row) {
      const date = row.date instanceof Date ? A.startOfDay(row.date) : A.parseDate(row.date);
      if (!date) return;
      const time = date.getTime();
      if (min === null || time < min) min = time;
      if (max === null || time > max) max = time;
    });
    return {
      start: min === null ? null : A.startOfDay(new Date(min)),
      end: max === null ? null : A.startOfDay(new Date(max)),
    };
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function icon(name) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.dot) +
      '</svg>'
    );
  }

  function fmtDate(value) {
    const date = value instanceof Date ? value : A.parseDate(value);
    return date ? dateFormat.format(date) : '--';
  }

  function fmtMoney(value) {
    return money.format(Number(value) || 0);
  }

  function fmtMoneyPrecise(value) {
    return moneyPrecise.format(Number(value) || 0);
  }

  function fmtMoneySmart(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? fmtMoney(number) : fmtMoneyPrecise(number);
  }

  function fmtInt(value) {
    return integer.format(Math.round(Number(value) || 0));
  }

  function fmtRoas(value) {
    return `${(Number(value) || 0).toFixed(2)}x`;
  }

  function fmtPercent(value, decimals) {
    return `${((Number(value) || 0) * 100).toFixed(decimals == null ? 1 : decimals)}%`;
  }

  function currentGranularity() {
    if (state.granularity !== 'auto') return state.granularity;
    return A.pickGranularity(
      state.filters.start || state.dataStart,
      state.filters.end || state.dataEnd
    );
  }

  function granularityLabel(granularity) {
    return granularity === 'day' ? 'daily' : granularity === 'month' ? 'monthly' : 'weekly';
  }

  function clampStart(start) {
    if (!state.dataStart) return start;
    return start.getTime() < state.dataStart.getTime() ? state.dataStart : start;
  }

  /* --------------------------------------------------------------- filters */

  function applyPreset(preset) {
    state.filters.preset = preset;
    const end = state.dataEnd;
    if (!end) return;

    if (preset === 'all') {
      state.filters.start = state.dataStart;
    } else if (preset === '30d') {
      state.filters.start = clampStart(A.addDays(end, -29));
    } else if (preset === '90d') {
      state.filters.start = clampStart(A.addDays(end, -89));
    } else if (preset === '12m') {
      state.filters.start = clampStart(A.addDays(end, -364));
    } else {
      state.filters.preset = 'custom';
    }
    state.filters.end = end;
    syncDateInputs();
    syncPresetButtons();
  }

  function syncDateInputs() {
    if (state.dataStart && state.dataEnd) {
      dom.startDate.min = A.dayKey(state.dataStart);
      dom.startDate.max = A.dayKey(state.dataEnd);
      dom.endDate.min = A.dayKey(state.dataStart);
      dom.endDate.max = A.dayKey(state.dataEnd);
    }
    dom.startDate.value = state.filters.start ? A.dayKey(state.filters.start) : '';
    dom.endDate.value = state.filters.end ? A.dayKey(state.filters.end) : '';
  }

  function syncPresetButtons() {
    dom.presets.forEach(function (button) {
      const active = button.dataset.preset === state.filters.preset;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function uniqueValues(field) {
    const set = new Set();
    state.rows.forEach(function (row) {
      set.add(row[field] || 'Unknown');
    });
    return Array.from(set).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function refreshDimensions() {
    state.dims.channels = uniqueValues('channel');
    state.dims.campaigns = uniqueValues('campaign');
    state.dims.devices = uniqueValues('device');

    state.filters.channels = state.filters.channels.filter(function (value) {
      return state.dims.channels.includes(value);
    });
    state.filters.campaigns = state.filters.campaigns.filter(function (value) {
      return state.dims.campaigns.includes(value);
    });
    state.filters.devices = state.filters.devices.filter(function (value) {
      return state.dims.devices.includes(value);
    });

    renderDropdowns();
  }

  function renderDropdowns() {
    setupDropdown(dom.ddChannel, 'channels', 'Channel', state.dims.channels);
    setupDropdown(dom.ddCampaign, 'campaigns', 'Campaign', state.dims.campaigns);
    setupDropdown(dom.ddDevice, 'devices', 'Device', state.dims.devices);
    syncDropdowns();
  }

  function setupDropdown(host, key, label, options) {
    host.dataset.key = key;
    host.innerHTML =
      `<button type="button" class="dd-toggle" aria-expanded="false" aria-haspopup="true" aria-label="Filter by ${esc(label)}">` +
      `<span class="dd-caption">${esc(label)}</span>` +
      `<span class="dd-value">All</span>` +
      '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>' +
      '</button>' +
      '<div class="dd-panel" hidden>' +
      '<div class="dd-actions">' +
      '<button type="button" data-dd="all">Select all</button>' +
      '<button type="button" data-dd="none">Clear</button>' +
      '</div>' +
      '<div class="dd-options">' +
      options
        .map(function (option) {
          return (
            `<label class="dd-option"><input type="checkbox" value="${esc(option)}">` +
            `<span>${esc(option)}</span></label>`
          );
        })
        .join('') +
      '</div></div>';
  }

  function syncDropdowns() {
    [
      { host: dom.ddChannel, key: 'channels' },
      { host: dom.ddCampaign, key: 'campaigns' },
      { host: dom.ddDevice, key: 'devices' },
    ].forEach(function (entry) {
      const selected = state.filters[entry.key];
      const toggle = entry.host.querySelector('.dd-toggle');
      const value = entry.host.querySelector('.dd-value');
      if (!selected.length) value.textContent = 'All';
      else if (selected.length === 1) value.textContent = selected[0];
      else value.textContent = `${selected.length} selected`;
      toggle.classList.toggle('has-value', selected.length > 0);
      entry.host.querySelectorAll('.dd-options input').forEach(function (input) {
        input.checked = selected.includes(input.value);
      });
    });
  }

  function closeDropdowns(except) {
    document.querySelectorAll('.dropdown').forEach(function (host) {
      if (host === except) return;
      const panel = host.querySelector('.dd-panel');
      const toggle = host.querySelector('.dd-toggle');
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function getView() {
    const f = state.filters;
    const base = {
      start: f.start,
      end: f.end,
      channels: f.channels,
      campaigns: f.campaigns,
      devices: f.devices,
      search: f.search,
    };

    const rows = A.filterRows(state.rows, base);
    let prevRows = [];
    let prevStart = null;
    let prevEnd = null;

    if (f.start && f.end) {
      const span = Math.round((A.startOfDay(f.end) - A.startOfDay(f.start)) / MS_DAY) + 1;
      prevEnd = A.addDays(A.startOfDay(f.start), -1);
      prevStart = A.addDays(prevEnd, -(Math.max(span, 1) - 1));
      prevRows = A.filterRows(
        state.rows,
        Object.assign({}, base, { start: prevStart, end: prevEnd })
      );
    }

    return {
      rows: rows,
      prevRows: prevRows,
      start: f.start,
      end: f.end,
      prevStart: prevStart,
      prevEnd: prevEnd,
    };
  }

  /* --------------------------------------------------------------- render */

  function render() {
    const view = getView();
    state.view = view;

    renderKpis(view);
    renderTrend(view);
    renderChannel(view);
    renderEfficiency(view);
    renderFunnel(view);
    renderCampaignBars(view);
    renderInsights(view);
    renderTable();
    renderMeta();
  }

  function deltaBadge(delta) {
    if (delta === null || !Number.isFinite(delta)) {
      return '<span class="delta flat">--</span>';
    }
    const up = delta >= 0;
    return (
      `<span class="delta ${up ? 'up' : 'down'}">` +
      `${up ? '+' : '-'}${(Math.abs(delta) * 100).toFixed(1)}%` +
      '</span>'
    );
  }

  function renderKpis(view) {
    const kpis = A.computeKPIs(view.rows);
    const previous = A.computeKPIs(view.prevRows);
    const granularity = currentGranularity();
    const periods = A.metricsByPeriod(view.rows, granularity);

    const cards = [
      {
        label: 'Ad spend',
        value: fmtMoney(kpis.spend),
        previous: fmtMoney(previous.spend),
        delta: A.deltaPct(kpis.spend, previous.spend),
        series: periods.map(function (period) {
          return period.spend;
        }),
        color: '#818cf8',
      },
      {
        label: 'Attributed revenue',
        value: fmtMoney(kpis.revenue),
        previous: fmtMoney(previous.revenue),
        delta: A.deltaPct(kpis.revenue, previous.revenue),
        series: periods.map(function (period) {
          return period.revenue;
        }),
        color: '#22d3ee',
      },
      {
        label: 'ROAS',
        value: fmtRoas(kpis.roas),
        previous: fmtRoas(previous.roas),
        delta: A.deltaPct(kpis.roas, previous.roas),
        series: periods.map(function (period) {
          return period.spend ? period.revenue / period.spend : 0;
        }),
        color: '#34d399',
      },
      {
        label: 'Conversions',
        value: fmtInt(kpis.conversions),
        previous: fmtInt(previous.conversions),
        delta: A.deltaPct(kpis.conversions, previous.conversions),
        series: periods.map(function (period) {
          return period.conversions;
        }),
        color: '#fbbf24',
      },
    ];

    dom.kpis.innerHTML = cards
      .map(function (card) {
        const foot = view.prevRows.length
          ? `vs ${esc(card.previous)} previous period`
          : 'No prior period to compare';
        return (
          '<article class="kpi">' +
          '<div class="kpi-head">' +
          `<span class="kpi-label">${esc(card.label)}</span>` +
          deltaBadge(card.delta) +
          '</div>' +
          '<div class="kpi-main">' +
          `<span class="kpi-value">${esc(card.value)}</span>` +
          `<span class="kpi-spark">${C.sparkline(card.series.slice(-14), { color: card.color })}</span>` +
          '</div>' +
          `<div class="kpi-foot">${foot}</div>` +
          '</article>'
        );
      })
      .join('');
  }

  function renderTrend(view) {
    const granularity = currentGranularity();
    const periods = A.metricsByPeriod(view.rows, granularity);

    C.lines(dom.trendChart, periods, {
      height: 300,
      ariaLabel: 'Spend and attributed revenue over time',
      formatAxis: C.compactMoney,
      formatValue: fmtMoneySmart,
      extra: function (point) {
        return `${fmtRoas(point.roas)} ROAS - ${fmtInt(point.conversions)} conversions`;
      },
      series: [
        { key: 'spend', label: 'Spend', color: '#818cf8' },
        { key: 'revenue', label: 'Revenue', color: '#22d3ee', fill: true },
      ],
    });

    const range = view.start && view.end ? `${fmtDate(view.start)} - ${fmtDate(view.end)}` : 'All time';
    dom.rangeLabel.textContent = `${range} - ${granularityLabel(granularity)}`;
  }

  function renderChannel(view) {
    const channels = A.groupMetrics(view.rows, 'channel', { sort: 'spend' });
    C.donut(
      dom.channelChart,
      channels.map(function (channel) {
        return { label: channel.key, value: channel.spend };
      }),
      { formatTotal: C.compactMoney, centerLabel: 'Total spend', ariaLabel: 'Spend share by channel' }
    );
  }

  function renderEfficiency(view) {
    const channels = A.groupMetrics(view.rows, 'channel', { sort: 'roas' }).filter(function (channel) {
      return channel.spend > 0;
    });

    C.bars(
      dom.efficiencyBars,
      channels.map(function (channel) {
        return {
          label: channel.key,
          value: channel.roas,
          detail: `${fmtMoney(channel.spend)} spend - ${fmtMoney(channel.revenue)} revenue`,
          color: channel.roas >= 2 ? '#34d399' : channel.roas >= 1 ? '#fbbf24' : '#fb7185',
        };
      }),
      { format: fmtRoas }
    );
  }

  function renderFunnel(view) {
    const steps = A.funnel(view.rows);
    const stages = [
      { label: 'Impressions', value: steps.impressions, color: '#818cf8' },
      { label: 'Clicks', value: steps.clicks, color: '#22d3ee' },
      { label: 'Conversions', value: steps.conversions, color: '#34d399' },
    ];

    if (!view.rows.length || !steps.impressions) {
      dom.funnelChart.innerHTML = '<div class="chart-empty">No funnel data for these filters</div>';
      return;
    }

    const top = Math.max.apply(null, stages.map(function (stage) {
      return stage.value;
    })) || 1;

    const bars = stages
      .map(function (stage, index) {
        const width = Math.max(10, Math.sqrt(stage.value / top) * 100);
        const rate =
          index === 0
            ? '100% of impressions'
            : index === 1
              ? `${fmtPercent(steps.ctr, 2)} CTR`
              : `${fmtPercent(steps.cvr, 2)} CVR from clicks`;
        return (
          '<div class="funnel-stage">' +
          '<div class="funnel-meta">' +
          `<span class="funnel-label">${esc(stage.label)}</span>` +
          `<span class="funnel-value">${esc(C.compactNumber(stage.value))}</span>` +
          '</div>' +
          '<div class="funnel-track">' +
          `<div class="funnel-fill" style="width:${width.toFixed(1)}%;background:${stage.color}"></div>` +
          '</div>' +
          `<div class="funnel-rate">${esc(rate)}</div>` +
          '</div>'
        );
      })
      .join('');

    dom.funnelChart.innerHTML =
      '<div class="funnel">' +
      bars +
      '<div class="funnel-foot">' +
      `<div><span>CPA</span><strong>${esc(fmtMoneyPrecise(steps.cpa))}</strong></div>` +
      `<div><span>Avg. order value</span><strong>${esc(fmtMoneyPrecise(steps.aov))}</strong></div>` +
      `<div><span>Cost per click</span><strong>${esc(fmtMoneyPrecise(steps.cpc))}</strong></div>` +
      '</div>' +
      '</div>';
  }

  function renderCampaignBars(view) {
    const campaigns = A.groupCampaigns(view.rows, { sort: 'revenue' }).slice(0, 6);
    C.bars(
      dom.campaignBars,
      campaigns.map(function (campaign) {
        return {
          label: campaign.campaign,
          value: campaign.revenue,
          detail: `${campaign.channel} - ${fmtRoas(campaign.roas)} ROAS`,
        };
      }),
      { format: fmtMoney }
    );
  }

  function renderInsights(view) {
    const insights = A.computeInsights(view.rows, view.prevRows);
    if (!insights.length) {
      dom.insights.innerHTML =
        '<p class="empty-note">No insights yet - widen the date range or clear some filters.</p>';
      return;
    }
    dom.insights.innerHTML = insights
      .map(function (insight) {
        return (
          `<article class="insight ${insight.tone}">` +
          `<div class="insight-icon">${icon(insight.icon)}</div>` +
          '<div class="insight-body">' +
          `<h3>${esc(insight.title)}</h3>` +
          `<p>${esc(insight.detail)}</p>` +
          '</div></article>'
        );
      })
      .join('');
  }

  function sortedCampaigns(rows) {
    const key = state.sort.key;
    const direction = state.sort.dir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      let left;
      let right;
      if (key === 'campaign' || key === 'channel') {
        left = String(a[key] == null ? '' : a[key]).toLowerCase();
        right = String(b[key] == null ? '' : b[key]).toLowerCase();
      } else {
        left = Number(a[key]) || 0;
        right = Number(b[key]) || 0;
      }
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return 0;
    });
  }

  function renderTable() {
    if (!state.view) return;
    const campaigns = A.groupCampaigns(state.view.rows, { sort: 'revenue' });
    const rows = sortedCampaigns(campaigns);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const from = (state.page - 1) * state.pageSize;
    const visible = rows.slice(from, from + state.pageSize);

    dom.tableHead.innerHTML =
      '<tr>' +
      TABLE_COLUMNS.map(function (column) {
        const active = state.sort.key === column.key;
        const aria = active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        return (
          `<th scope="col" data-sort="${column.key}" tabindex="0" ` +
          `class="${column.num ? 'num' : ''}${active ? ' sorted' : ''}" aria-sort="${aria}">` +
          `${esc(column.label)}<span class="sort-arrow" aria-hidden="true">` +
          `${active ? (state.sort.dir === 'asc' ? '^' : 'v') : ''}</span></th>`
        );
      }).join('') +
      '</tr>';

    if (!visible.length) {
      dom.tableBody.innerHTML =
        `<tr><td colspan="${TABLE_COLUMNS.length}" class="table-empty">` +
        'No campaigns match these filters. ' +
        '<button type="button" class="link" data-reset-table>Reset filters</button>' +
        '</td></tr>';
    } else {
      dom.tableBody.innerHTML = visible
        .map(function (row) {
          return (
            '<tr>' +
            `<td class="strong">${esc(row.campaign)}</td>` +
            `<td><span class="pill">${esc(row.channel)}</span></td>` +
            `<td class="num">${esc(fmtMoneySmart(row.spend))}</td>` +
            `<td class="num">${esc(fmtMoneySmart(row.revenue))}</td>` +
            `<td class="num strong ${row.roas >= 2 ? 'good' : row.roas < 1 ? 'bad' : ''}">${esc(fmtRoas(row.roas))}</td>` +
            `<td class="num">${esc(fmtInt(row.conversions))}</td>` +
            `<td class="num">${esc(fmtMoneyPrecise(row.cpa))}</td>` +
            `<td class="num">${esc(fmtPercent(row.ctr, 2))}</td>` +
            `<td class="num">${esc(fmtPercent(row.cvr, 2))}</td>` +
            '</tr>'
          );
        })
        .join('');
    }

    const word = 'campaigns';
    dom.tableCount.textContent = `${fmtInt(total)} matching ${word}`;
    dom.pageLabel.textContent = total
      ? `Showing ${fmtInt(from + 1)}-${fmtInt(Math.min(from + state.pageSize, total))} of ${fmtInt(total)} - page ${state.page} of ${totalPages}`
      : 'Nothing to show';
    dom.prevPage.disabled = state.page <= 1;
    dom.nextPage.disabled = state.page >= totalPages;
  }

  function renderMeta() {
    const total = state.rows.length;
    if (state.source.type === 'sample') {
      dom.datasetBadge.textContent = `Sample - ${fmtInt(total)} rows`;
      dom.datasetBadge.title = 'Deterministic demo data generated in your browser';
      dom.sourceNote.textContent = 'Sample dataset - deterministic demo data';
    } else {
      dom.datasetBadge.textContent = `${state.source.name} - ${fmtInt(total)} rows`;
      dom.datasetBadge.title = state.source.warnings.length
        ? state.source.warnings.join('\n')
        : 'Imported CSV';
      const mapping = state.source.mapping;
      dom.sourceNote.textContent =
        `Imported ${state.source.name} - date "${mapping.date || '--'}"` +
        `, spend "${mapping.spend || '--'}", revenue "${mapping.revenue || '--'}"`;
    }
  }

  /* ---------------------------------------------------------------- events */

  function bindEvents() {
    dom.presets.forEach(function (button) {
      button.addEventListener('click', function () {
        applyPreset(button.dataset.preset);
        state.page = 1;
        render();
      });
    });

    dom.startDate.addEventListener('change', onDateChange);
    dom.endDate.addEventListener('change', onDateChange);

    dom.searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.filters.search = dom.searchInput.value;
        state.page = 1;
        render();
      }, 160);
    });

    dom.granularity.addEventListener('change', function () {
      state.granularity = dom.granularity.value;
      if (!state.view) return;
      renderKpis(state.view);
      renderTrend(state.view);
    });

    dom.resetBtn.addEventListener('click', resetFilters);
    dom.tableBody.addEventListener('click', function (event) {
      if (event.target.closest('[data-reset-table]')) resetFilters();
    });

    dom.sampleBtn.addEventListener('click', function () {
      loadSample();
      render();
      toast('Sample dataset loaded.', 'success');
    });

    dom.uploadBtn.addEventListener('click', function () {
      dom.csvInput.click();
    });

    dom.csvInput.addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) importFile(file);
    });

    dom.exportBtn.addEventListener('click', exportCsv);

    dom.tableHead.addEventListener('click', function (event) {
      const header = event.target.closest('th[data-sort]');
      if (header) sortBy(header.dataset.sort);
    });
    dom.tableHead.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const header = event.target.closest('th[data-sort]');
      if (header) {
        event.preventDefault();
        sortBy(header.dataset.sort);
      }
    });

    dom.prevPage.addEventListener('click', function () {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });
    dom.nextPage.addEventListener('click', function () {
      const totalPages = Math.max(1, Math.ceil((state.view ? state.view.rows.length : 0) / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });
    dom.pageSize.addEventListener('change', function () {
      state.pageSize = Number(dom.pageSize.value) || 10;
      state.page = 1;
      renderTable();
    });

    document.addEventListener('click', function (event) {
      const toggle = event.target.closest('.dd-toggle');
      if (toggle) {
        const host = toggle.closest('.dropdown');
        const panel = host.querySelector('.dd-panel');
        const open = panel.hidden;
        closeDropdowns(host);
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      const action = event.target.closest('[data-dd]');
      if (action) {
        const host = action.closest('.dropdown');
        const key = host.dataset.key;
        const options = Array.from(host.querySelectorAll('.dd-options input')).map(function (input) {
          return input.value;
        });
        state.filters[key] = action.dataset.dd === 'all' ? options.slice() : [];
        state.page = 1;
        syncDropdowns();
        render();
        return;
      }

      if (!event.target.closest('.dropdown')) closeDropdowns();
    });

    document.addEventListener('change', function (event) {
      const input = event.target.closest('.dd-options input[type="checkbox"]');
      if (!input) return;
      const host = input.closest('.dropdown');
      const key = host.dataset.key;
      const value = input.value;
      const selected = state.filters[key];
      if (input.checked) {
        if (!selected.includes(value)) selected.push(value);
      } else {
        state.filters[key] = selected.filter(function (item) {
          return item !== value;
        });
      }
      state.page = 1;
      syncDropdowns();
      render();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDropdowns();
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
        event.preventDefault();
        dom.searchInput.focus();
      }
    });

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!state.view) return;
        renderTrend(state.view);
        renderChannel(state.view);
      }, 150);
    });
  }

  function onDateChange() {
    const start = A.parseDate(dom.startDate.value);
    const end = A.parseDate(dom.endDate.value);
    if (!start || !end) return;
    if (start > end) {
      toast('Start date must be on or before the end date.', 'error');
      syncDateInputs();
      return;
    }
    state.filters.start = start;
    state.filters.end = end;
    state.filters.preset = 'custom';
    state.page = 1;
    syncPresetButtons();
    render();
  }

  function resetFilters() {
    state.filters.channels = [];
    state.filters.campaigns = [];
    state.filters.devices = [];
    state.filters.search = '';
    state.sort = { key: 'revenue', dir: 'desc' };
    state.page = 1;
    state.granularity = 'auto';
    dom.searchInput.value = '';
    dom.granularity.value = 'auto';
    applyPreset('90d');
    syncDropdowns();
    render();
    toast('Filters reset.', 'success');
  }

  function sortBy(key) {
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort = {
        key: key,
        dir: key === 'campaign' || key === 'channel' ? 'asc' : 'desc',
      };
    }
    state.page = 1;
    renderTable();
  }

  /* ------------------------------------------------------------------ CSV */

  async function importFile(file) {
    if (file.size > 25 * 1024 * 1024) {
      toast('That file is larger than 25 MB.', 'error');
      return;
    }
    try {
      const text = await file.text();
      const result = A.importCSV(text);

      state.rows = result.rows;
      state.source = {
        type: 'csv',
        name: file.name,
        warnings: result.warnings,
        mapping: result.mapping,
      };
      state.filters.channels = [];
      state.filters.campaigns = [];
      state.filters.devices = [];
      state.filters.search = '';
      state.filters.preset = 'all';
      state.sort = { key: 'revenue', dir: 'desc' };
      state.page = 1;
      state.granularity = 'auto';
      dom.searchInput.value = '';
      dom.granularity.value = 'auto';

      const bounds = dateBounds(state.rows);
      state.dataStart = bounds.start;
      state.dataEnd = bounds.end;

      refreshDimensions();
      applyPreset('all');
      render();

      const warning = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
      toast(
        `Imported ${fmtInt(result.rows.length)} rows from ${file.name}.${warning}`,
        result.warnings.length ? 'warning' : 'success'
      );
    } catch (error) {
      toast(error && error.message ? error.message : 'Could not read that file.', 'error');
    }
  }

  function csvCell(value) {
    const text = String(value == null ? '' : value);
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function exportCsv() {
    if (!state.view || !state.view.rows.length) {
      toast('Nothing to export with the current filters.', 'warning');
      return;
    }
    const rows = state.view.rows.slice().sort(function (a, b) {
      return b.date - a.date;
    });
    const header = ['date', 'channel', 'campaign', 'device', 'spend', 'impressions', 'clicks', 'conversions', 'revenue'];
    const lines = [header.join(',')];
    rows.forEach(function (row) {
      lines.push(
        [
          A.dayKey(row.date),
          row.channel,
          row.campaign,
          row.device,
          row.spend,
          row.impressions,
          row.clicks,
          row.conversions,
          row.revenue,
        ]
          .map(csvCell)
          .join(',')
      );
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `signalboard-${A.dayKey(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${fmtInt(rows.length)} rows.`, 'success');
  }

  /* ----------------------------------------------------------------- toasts */

  function toast(message, tone) {
    const node = document.createElement('div');
    node.className = `toast ${tone || 'info'}`;
    node.setAttribute('role', 'status');
    node.textContent = message;
    dom.toasts.appendChild(node);

    setTimeout(function () {
      node.classList.add('leaving');
      setTimeout(function () {
        node.remove();
      }, 280);
    }, 4600);
  }
})();
