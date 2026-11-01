/*
 * marketing.js — marketing analytics helpers.
 * Runs in the browser (window.Marketing) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Marketing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MS_DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* ---------------------------------------------------------------- dates */

  function startOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    date.setDate(date.getDate() + amount);
    return startOfDay(date);
  }

  function makeDate(year, month, day) {
    if (![year, month, day].every(Number.isFinite)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return startOfDay(date);
  }

  function fromExcelSerial(serial) {
    const base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + Math.floor(serial));
    return startOfDay(base);
  }

  function parseDate(value) {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : startOfDay(value);

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 20000 && value < 80000) return fromExcelSerial(value);
      if (value > 100000000000) return startOfDay(new Date(value));
      return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
    if (match) return makeDate(+match[1], +match[2], +match[3]);

    match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) return makeDate(+match[1], +match[2], +match[3]);

    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
    if (match) {
      let year = +match[3];
      if (year < 100) year += 2000;
      const first = +match[1];
      const second = +match[2];
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      return makeDate(year, month, day);
    }

    if (/^\d{5}$/.test(text)) {
      const serial = +text;
      if (serial > 20000 && serial < 80000) return fromExcelSerial(serial);
    }

    if (!/[a-zA-Z]/.test(text)) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function dayKey(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function shortDate(date) {
    return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  function weekStart(value) {
    const date = startOfDay(value);
    return addDays(date, -((date.getDay() + 6) % 7));
  }

  /* -------------------------------------------------------------- numbers */

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value == null) return 0;
    let text = String(value).trim();
    if (!text) return 0;

    let negative = false;
    if (/^\(.*\)$/.test(text)) {
      negative = true;
      text = text.slice(1, -1);
    }
    text = text.replace(/[^0-9.eE+-]/g, '');
    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return 0;
    return negative ? -number : number;
  }

  function sumBy(rows, field) {
    let total = 0;
    for (const row of rows) total += toNumber(row[field]);
    return total;
  }

  function deltaPct(current, previous) {
    if (!Number.isFinite(previous) || previous <= 0) return null;
    return (current - previous) / previous;
  }

  function safeDivide(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : 0;
  }

  /* -------------------------------------------------------------- filters */

  function filterRows(rows, filters) {
    const options = filters || {};
    const start = options.start ? startOfDay(options.start) : null;
    const end = options.end ? startOfDay(options.end) : null;
    const channels = options.channels || [];
    const campaigns = options.campaigns || [];
    const devices = options.devices || [];
    const search = String(options.search || '').trim().toLowerCase();

    return rows.filter(function (row) {
      const date = row.date instanceof Date ? startOfDay(row.date) : parseDate(row.date);
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      if (channels.length && !channels.includes(row.channel)) return false;
      if (campaigns.length && !campaigns.includes(row.campaign)) return false;
      if (devices.length && !devices.includes(row.device)) return false;
      if (search) {
        const haystack = [row.campaign, row.channel, row.device]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  /* ---------------------------------------------------------------- KPIs */

  function computeKPIs(rows) {
    const spend = sumBy(rows, 'spend');
    const revenue = sumBy(rows, 'revenue');
    const conversions = sumBy(rows, 'conversions');
    const clicks = sumBy(rows, 'clicks');
    const impressions = sumBy(rows, 'impressions');

    return {
      spend: spend,
      revenue: revenue,
      conversions: conversions,
      clicks: clicks,
      impressions: impressions,
      roas: safeDivide(revenue, spend),
      cpa: safeDivide(spend, conversions),
      ctr: safeDivide(clicks, impressions),
      cvr: safeDivide(conversions, clicks),
      cpc: safeDivide(spend, clicks),
      aov: safeDivide(revenue, conversions),
    };
  }

  function emptyTotals() {
    return { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0, records: 0 };
  }

  function addRow(totals, row) {
    totals.spend += toNumber(row.spend);
    totals.revenue += toNumber(row.revenue);
    totals.conversions += toNumber(row.conversions);
    totals.clicks += toNumber(row.clicks);
    totals.impressions += toNumber(row.impressions);
    totals.records += 1;
  }

  function withMetrics(totals, key) {
    const metrics = computeKPIs([
      {
        spend: totals.spend,
        revenue: totals.revenue,
        conversions: totals.conversions,
        clicks: totals.clicks,
        impressions: totals.impressions,
      },
    ]);
    return Object.assign({ key: key, records: totals.records }, metrics);
  }

  function groupMetrics(rows, field, options) {
    const opts = options || {};
    const buckets = new Map();

    for (const row of rows) {
      const key = row[field] == null || row[field] === '' ? 'Unknown' : String(row[field]);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = emptyTotals();
        buckets.set(key, bucket);
      }
      addRow(bucket, row);
    }

    const totalSpend = Array.from(buckets.values()).reduce(function (acc, item) {
      return acc + item.spend;
    }, 0);
    const totalRevenue = Array.from(buckets.values()).reduce(function (acc, item) {
      return acc + item.revenue;
    }, 0);

    const sortKey = opts.sort || 'revenue';
    const result = Array.from(buckets.entries())
      .map(function (entry) {
        const item = withMetrics(entry[1], entry[0]);
        item.spendShare = safeDivide(item.spend, totalSpend);
        item.revenueShare = safeDivide(item.revenue, totalRevenue);
        return item;
      })
      .sort(function (a, b) {
        return b[sortKey] - a[sortKey];
      });

    return opts.limit ? result.slice(0, opts.limit) : result;
  }

  function groupCampaigns(rows, options) {
    const buckets = new Map();

    for (const row of rows) {
      const key = `${row.campaign || 'Unknown'}\u0000${row.channel || 'Unknown'}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = emptyTotals();
        bucket.campaign = row.campaign || 'Unknown';
        bucket.channel = row.channel || 'Unknown';
        buckets.set(key, bucket);
      }
      addRow(bucket, row);
    }

    const totalSpend = Array.from(buckets.values()).reduce(function (acc, item) {
      return acc + item.spend;
    }, 0);
    const totalRevenue = Array.from(buckets.values()).reduce(function (acc, item) {
      return acc + item.revenue;
    }, 0);

    const result = Array.from(buckets.values()).map(function (bucket) {
      const item = withMetrics(bucket, bucket.campaign);
      item.campaign = bucket.campaign;
      item.channel = bucket.channel;
      item.spendShare = safeDivide(item.spend, totalSpend);
      item.revenueShare = safeDivide(item.revenue, totalRevenue);
      return item;
    });

    const sortKey = (options && options.sort) || 'revenue';
    result.sort(function (a, b) {
      return b[sortKey] - a[sortKey];
    });
    return result;
  }

  /* ------------------------------------------------------------- time series */

  function pickGranularity(start, end) {
    const from = startOfDay(start);
    const to = startOfDay(end);
    if (!from || !to) return 'day';
    const days = Math.round((to - from) / MS_DAY) + 1;
    if (days <= 45) return 'day';
    if (days <= 400) return 'week';
    return 'month';
  }

  function bucketFor(date, granularity) {
    if (granularity === 'month') {
      return {
        key: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`,
        label: `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`,
        date: new Date(date.getFullYear(), date.getMonth(), 1),
        step: 'month',
      };
    }
    if (granularity === 'week') {
      const start = weekStart(date);
      return { key: dayKey(start), label: shortDate(start), date: start, step: 'week' };
    }
    const start = startOfDay(date);
    return { key: dayKey(start), label: shortDate(start), date: start, step: 'day' };
  }

  function advance(date, step, amount) {
    if (step === 'month') return new Date(date.getFullYear(), date.getMonth() + amount, 1);
    return addDays(date, (step === 'week' ? 7 : 1) * amount);
  }

  function metricsByPeriod(rows, granularity) {
    if (!rows.length) return [];
    const step = granularity === 'week' || granularity === 'month' ? granularity : 'day';
    const buckets = new Map();

    for (const row of rows) {
      const date = row.date instanceof Date ? row.date : parseDate(row.date);
      if (!date) continue;
      const info = bucketFor(date, step);
      let bucket = buckets.get(info.key);
      if (!bucket) {
        bucket = emptyTotals();
        bucket.key = info.key;
        bucket.label = info.label;
        bucket.date = info.date;
        buckets.set(info.key, bucket);
      }
      addRow(bucket, row);
    }

    if (!buckets.size) return [];

    const sorted = Array.from(buckets.values()).sort(function (a, b) {
      return a.date - b.date;
    });

    const filled = [];
    let cursor = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    let guard = 0;

    while (cursor <= last && guard < 2500) {
      const info = bucketFor(cursor, step);
      const existing = buckets.get(info.key);
      if (existing) {
        filled.push(withMetrics(existing, existing.key));
        filled[filled.length - 1].label = existing.label;
        filled[filled.length - 1].date = existing.date;
      } else {
        filled.push({
          key: info.key,
          label: info.label,
          date: info.date,
          spend: 0,
          revenue: 0,
          conversions: 0,
          clicks: 0,
          impressions: 0,
          roas: 0,
          cpa: 0,
          ctr: 0,
          cvr: 0,
          cpc: 0,
          aov: 0,
          records: 0,
        });
      }
      cursor = advance(cursor, step, 1);
      guard += 1;
    }

    return filled;
  }

  function weekdayProfile(rows) {
    const buckets = WEEKDAYS.map(function (label) {
      return { label: label, spend: 0, revenue: 0, conversions: 0 };
    });
    for (const row of rows) {
      const date = row.date instanceof Date ? row.date : parseDate(row.date);
      if (!date) continue;
      const bucket = buckets[(date.getDay() + 6) % 7];
      bucket.spend += toNumber(row.spend);
      bucket.revenue += toNumber(row.revenue);
      bucket.conversions += toNumber(row.conversions);
    }
    return buckets;
  }

  function movingAverage(values, window) {
    const size = Math.max(1, Math.floor(window || 3));
    return values.map(function (_, index) {
      const from = Math.max(0, index - size + 1);
      const slice = values.slice(from, index + 1);
      const total = slice.reduce(function (acc, value) {
        return acc + value;
      }, 0);
      return slice.length ? total / slice.length : 0;
    });
  }

  function funnel(rows) {
    const kpis = computeKPIs(rows);
    return {
      impressions: kpis.impressions,
      clicks: kpis.clicks,
      conversions: kpis.conversions,
      ctr: kpis.ctr,
      cvr: kpis.cvr,
      cpa: kpis.cpa,
      cpc: kpis.cpc,
      aov: kpis.aov,
    };
  }

  /* -------------------------------------------------------------- insights */

  function formatMoney(value) {
    const number = Number(value) || 0;
    const decimals = Math.abs(number) < 1000 ? 2 : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(number);
  }

  function formatPercent(value, decimals) {
    return `${(Number(value) || 0).toFixed(decimals == null ? 1 : decimals)}%`;
  }

  function formatRoas(value) {
    return `${(Number(value) || 0).toFixed(2)}×`;
  }

  function computeInsights(rows, previousRows) {
    if (!rows.length) return [];
    const insights = [];
    const current = computeKPIs(rows);
    const previous = computeKPIs(previousRows || []);
    const roasDelta = previous.spend ? deltaPct(current.roas, previous.roas) : null;

    if (roasDelta !== null) {
      const up = roasDelta >= 0;
      insights.push({
        icon: up ? 'trend-up' : 'trend-down',
        tone: up ? 'positive' : 'negative',
        title: `ROAS is ${up ? 'up' : 'down'} ${formatPercent(Math.abs(roasDelta) * 100)} to ${formatRoas(current.roas)}`,
        detail: `${formatMoney(current.revenue)} revenue on ${formatMoney(current.spend)} spend, versus ${formatRoas(previous.roas)} previously.`,
      });
    }

    const channels = groupMetrics(rows, 'channel', { sort: 'roas' });
    const paidChannels = channels.filter(function (channel) {
      return channel.spend > 0;
    });

    if (paidChannels.length > 1) {
      const best = paidChannels[0];
      insights.push({
        icon: 'spark',
        tone: 'positive',
        title: `${best.key} leads efficiency at ${formatRoas(best.roas)}`,
        detail: `${formatMoney(best.revenue)} revenue from ${formatMoney(best.spend)} spend.`,
      });
    }

    const bySpend = groupMetrics(rows, 'channel', { sort: 'spend' });
    if (bySpend.length > 1) {
      const top = bySpend[0];
      insights.push({
        icon: 'pie',
        tone: top.spendShare > 0.5 ? 'warning' : 'neutral',
        title: `${top.key} takes ${formatPercent(top.spendShare * 100, 0)} of budget`,
        detail:
          top.spendShare > 0.5
            ? 'Spend is concentrated in one channel — worth testing a reallocation.'
            : `${formatMoney(top.spend)} of ${formatMoney(current.spend)} total spend.`,
      });
    }

    const campaigns = groupCampaigns(rows, { sort: 'revenue' });
    if (campaigns.length) {
      const best = campaigns[0];
      insights.push({
        icon: 'trophy',
        tone: 'neutral',
        title: `${best.campaign} is the top campaign`,
        detail: `${formatMoney(best.revenue)} revenue at ${formatRoas(best.roas)} ROAS.`,
      });
    }

    const withConversions = channels.filter(function (channel) {
      return channel.conversions >= 20 && channel.spend > 0;
    });
    if (withConversions.length > 1) {
      const worst = withConversions.reduce(function (a, b) {
        return b.cpa > a.cpa ? b : a;
      });
      if (current.cpa > 0 && worst.cpa > current.cpa * 1.25) {
        insights.push({
          icon: 'alert',
          tone: 'warning',
          title: `${worst.key} CPA is ${formatPercent((worst.cpa / current.cpa - 1) * 100, 0)} above average`,
          detail: `${formatMoney(worst.cpa)} per conversion vs ${formatMoney(current.cpa)} account-wide.`,
        });
      }
    }

    if (insights.length < 5) {
      const previousFunnel = computeKPIs(previousRows || []);
      const cvrDelta = previousFunnel.clicks ? deltaPct(current.cvr, previousFunnel.cvr) : null;
      if (cvrDelta !== null) {
        insights.push({
          icon: 'filter',
          tone: cvrDelta >= 0 ? 'positive' : 'negative',
          title: `Conversion rate is ${formatPercent(current.cvr * 100, 2)}`,
          detail: `${cvrDelta >= 0 ? 'Up' : 'Down'} ${formatPercent(Math.abs(cvrDelta) * 100)} versus the previous period.`,
        });
      }
    }

    return insights.slice(0, 5);
  }

  /* ------------------------------------------------------------------ CSV */

  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find(function (item) {
      return item.trim() !== '';
    }) || '';
    const candidates = [',', ';', '\t', '|'];
    let best = ',';
    let bestCount = 0;

    for (const delimiter of candidates) {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') quoted = !quoted;
        else if (char === delimiter && !quoted) count += 1;
      }
      if (count > bestCount) {
        best = delimiter;
        bestCount = count;
      }
    }
    return best;
  }

  function parseCSV(text, delimiter) {
    const source = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const separator = delimiter || detectDelimiter(source);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === separator) {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(function (cells) {
      return cells.some(function (cell) {
        return String(cell).trim() !== '';
      });
    });
  }

  function normalizeName(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  const HINTS = {
    date: ['date', 'day', 'created', 'timestamp', 'period', 'month', 'week'],
    spend: ['spend', 'cost', 'budget', 'investment', 'adspend'],
    revenue: ['revenue', 'sales', 'value', 'amount', 'gmv', 'turnover', 'conversionvalue'],
    conversions: ['conversions', 'conversion', 'orders', 'purchases', 'leads', 'signups', 'acquisitions'],
    clicks: ['clicks', 'click', 'sessions', 'visits'],
    impressions: ['impressions', 'impression', 'views', 'reach', 'exposures'],
    channel: ['channel', 'platform', 'source', 'medium', 'network'],
    campaign: ['campaign', 'campaignname', 'adset', 'adgroup', 'name'],
    device: ['device', 'devicetype', 'platformdevice'],
  };

  function matchesHint(name, kind) {
    const normalized = normalizeName(name);
    return HINTS[kind].some(function (hint) {
      return normalized === hint || normalized.endsWith(hint) || normalized.startsWith(hint);
    });
  }

  function isNumericLike(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || !/\d/.test(text)) return false;
    return /^[(\-+]?[$€£¥]?\s*[\d,.\s]+\)?%?$/.test(text);
  }

  const NON_MEASURE_COLUMNS = new Set([
    'year', 'month', 'day', 'week', 'quarter',
    'zip', 'zipcode', 'postal', 'postalcode', 'phone', 'phonenumber',
  ]);

  function importCSV(text) {
    const clean = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const grid = parseCSV(clean);
    if (grid.length < 2) {
      throw new Error('The file needs a header row and at least one data row.');
    }

    const headers = [];
    grid[0].forEach(function (raw, index) {
      let name = String(raw == null ? '' : raw).trim() || `column_${index + 1}`;
      const base = name;
      let suffix = 2;
      while (headers.includes(name)) name = `${base} ${suffix++}`;
      headers.push(name);
    });

    const records = grid
      .slice(1)
      .filter(function (cells) {
        return cells.some(function (cell) {
          return String(cell).trim() !== '';
        });
      })
      .map(function (cells) {
        const record = {};
        headers.forEach(function (header, index) {
          record[header] = cells[index] == null ? '' : cells[index];
        });
        return record;
      });

    if (!records.length) throw new Error('No data rows found in the file.');

    const sample = records.slice(0, 100);

    function parseRate(column, predicate) {
      const values = sample
        .map(function (record) {
          return record[column];
        })
        .filter(function (value) {
          return String(value == null ? '' : value).trim() !== '';
        });
      if (!values.length) return 0;
      return values.filter(predicate).length / values.length;
    }

    let dateColumn = null;
    let dateScore = 0;
    headers.forEach(function (header) {
      const rate = parseRate(header, function (value) {
        return parseDate(value) !== null;
      });
      const hinted = matchesHint(header, 'date');
      if (rate < (hinted ? 0.5 : 0.8)) return;
      const yearRate = parseRate(header, function (value) {
        return /\b(19|20)\d{2}\b/.test(String(value));
      });
      const score = rate + (hinted ? 1 : 0) + yearRate * 0.5;
      if (score > dateScore) {
        dateScore = score;
        dateColumn = header;
      }
    });

    if (!dateColumn) {
      throw new Error('No date column found. Add a column such as "date" with values like 2025-01-31.');
    }

    const numericColumns = headers.filter(function (header) {
      if (header === dateColumn) return false;
      if (/id$/.test(normalizeName(header))) return false;
      if (NON_MEASURE_COLUMNS.has(normalizeName(header))) return false;
      const dateRate = parseRate(header, function (value) {
        return parseDate(value) !== null;
      });
      if (dateRate >= 0.7) return false;
      return parseRate(header, isNumericLike) >= 0.8;
    });

    const used = new Set();

    function pickMetric(kind) {
      const column = numericColumns.find(function (header) {
        return !used.has(header) && matchesHint(header, kind);
      });
      if (column) used.add(column);
      return column || null;
    }

    const spendColumn = pickMetric('spend');
    const revenueColumn = pickMetric('revenue');
    const conversionsColumn = pickMetric('conversions');
    const clicksColumn = pickMetric('clicks');
    const impressionsColumn = pickMetric('impressions');

    if (!spendColumn && !revenueColumn) {
      throw new Error('No spend or revenue column found. Add a column such as "spend" or "revenue".');
    }

    function pickDimension(kind) {
      return (
        headers.find(function (header) {
          return header !== dateColumn && !used.has(header) && matchesHint(header, kind);
        }) || null
      );
    }

    const channelColumn = pickDimension('channel');
    const campaignColumn = pickDimension('campaign');
    const deviceColumn = pickDimension('device');

    function textValue(record, column, fallback) {
      if (!column) return fallback;
      const value = String(record[column] == null ? '' : record[column]).trim();
      return value || fallback;
    }

    let skipped = 0;
    const rows = [];

    records.forEach(function (record) {
      const date = parseDate(record[dateColumn]);
      if (!date) {
        skipped += 1;
        return;
      }

      rows.push({
        date: date,
        channel: textValue(record, channelColumn, 'Unspecified'),
        campaign: textValue(record, campaignColumn, 'Unspecified'),
        device: textValue(record, deviceColumn, 'Unknown'),
        spend: spendColumn ? toNumber(record[spendColumn]) : 0,
        revenue: revenueColumn ? toNumber(record[revenueColumn]) : 0,
        conversions: conversionsColumn ? toNumber(record[conversionsColumn]) : 0,
        clicks: clicksColumn ? toNumber(record[clicksColumn]) : 0,
        impressions: impressionsColumn ? toNumber(record[impressionsColumn]) : 0,
      });
    });

    if (!rows.length) throw new Error('None of the rows had a readable date.');

    const warnings = [];
    if (skipped) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped (unreadable date).`);
    if (!spendColumn) warnings.push('No spend column found — ROAS and CPA will be empty.');
    if (!revenueColumn) warnings.push('No revenue column found — ROAS will be empty.');
    if (!conversionsColumn) warnings.push('No conversions column found.');
    if (!channelColumn) warnings.push('No channel column detected.');
    if (!campaignColumn) warnings.push('No campaign column detected.');

    return {
      rows: rows,
      columns: headers,
      mapping: {
        date: dateColumn,
        spend: spendColumn,
        revenue: revenueColumn,
        conversions: conversionsColumn,
        clicks: clicksColumn,
        impressions: impressionsColumn,
        channel: channelColumn,
        campaign: campaignColumn,
        device: deviceColumn,
      },
      warnings: warnings,
    };
  }

  return {
    startOfDay: startOfDay,
    addDays: addDays,
    parseDate: parseDate,
    dayKey: dayKey,
    toNumber: toNumber,
    deltaPct: deltaPct,
    filterRows: filterRows,
    computeKPIs: computeKPIs,
    groupMetrics: groupMetrics,
    groupCampaigns: groupCampaigns,
    metricsByPeriod: metricsByPeriod,
    pickGranularity: pickGranularity,
    weekdayProfile: weekdayProfile,
    movingAverage: movingAverage,
    funnel: funnel,
    computeInsights: computeInsights,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatRoas: formatRoas,
    parseCSV: parseCSV,
    importCSV: importCSV,
  };
});
