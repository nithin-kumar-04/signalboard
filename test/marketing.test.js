'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../assets/marketing.js');

function row(date, spend, revenue, extra) {
  return Object.assign(
    {
      date: A.parseDate(date),
      channel: 'Paid Search',
      campaign: 'Brand Keywords',
      device: 'Mobile',
      spend: spend,
      revenue: revenue,
      conversions: 0,
      clicks: 0,
      impressions: 0,
    },
    extra
  );
}

/* ------------------------------------------------------------------ dates */

test('parseDate understands common date formats', function () {
  assert.equal(A.dayKey(A.parseDate('2025-03-09')), '2025-03-09');
  assert.equal(A.dayKey(A.parseDate('2025/3/9')), '2025-03-09');
  assert.equal(A.dayKey(A.parseDate('03/09/2025')), '2025-03-09');
  assert.equal(A.dayKey(A.parseDate('20250309')), '2025-03-09');
  assert.equal(A.dayKey(A.parseDate('Mar 9, 2025')), '2025-03-09');
  assert.equal(A.dayKey(A.parseDate('2025-03-09T22:15:00Z')), '2025-03-09');
});

test('parseDate handles Excel serials and rejects impossible dates', function () {
  assert.equal(A.dayKey(A.parseDate(45658)), '2025-01-01');
  assert.equal(A.dayKey(A.parseDate('45658')), '2025-01-01');
  assert.equal(A.parseDate('2025-02-30'), null);
  assert.equal(A.parseDate('not a date'), null);
  assert.equal(A.parseDate(''), null);
  assert.equal(A.parseDate(null), null);
});

test('dayKey and addDays are stable across month boundaries', function () {
  const date = A.parseDate('2024-02-28');
  assert.equal(A.dayKey(A.addDays(date, 1)), '2024-02-29');
  assert.equal(A.dayKey(A.addDays(date, 2)), '2024-03-01');
});

/* ---------------------------------------------------------------- filters */

test('filterRows applies inclusive dates, dimensions and search', function () {
  const rows = [
    row('2025-01-01', 10, 30),
    row('2025-01-15', 20, 80, { channel: 'Display', campaign: 'Prospecting', device: 'Desktop' }),
    row('2025-02-01', 30, 120, { channel: 'Email', campaign: 'Newsletter Promo' }),
  ];

  const byDate = A.filterRows(rows, { start: '2025-01-01', end: '2025-01-31' });
  assert.equal(byDate.length, 2);
  assert.equal(A.computeKPIs(byDate).spend, 30);

  const byDimension = A.filterRows(rows, { channels: ['Display'], devices: ['Desktop'] });
  assert.equal(byDimension.length, 1);
  assert.equal(byDimension[0].campaign, 'Prospecting');

  const bySearch = A.filterRows(rows, { search: 'newsletter' });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].channel, 'Email');

  assert.equal(A.filterRows(rows, { campaigns: ['Missing'] }).length, 0);
});

/* ------------------------------------------------------------------- KPIs */

test('computeKPIs derives ROAS, CPA, CTR, CVR and CPC', function () {
  const rows = [
    row('2025-01-01', 100, 300, { conversions: 3, clicks: 30, impressions: 3000 }),
    row('2025-01-02', 100, 300, { conversions: 3, clicks: 30, impressions: 3000 }),
  ];
  const kpis = A.computeKPIs(rows);
  assert.equal(kpis.spend, 200);
  assert.equal(kpis.revenue, 600);
  assert.equal(kpis.conversions, 6);
  assert.equal(kpis.roas, 3);
  assert.equal(kpis.cpa, 200 / 6);
  assert.equal(kpis.ctr, 60 / 6000);
  assert.equal(kpis.cvr, 6 / 60);
  assert.equal(kpis.cpc, 200 / 60);
  assert.equal(kpis.aov, 100);

  const empty = A.computeKPIs([]);
  assert.equal(empty.spend, 0);
  assert.equal(empty.roas, 0);
  assert.equal(empty.cpa, 0);
});

test('deltaPct returns null without a usable baseline', function () {
  assert.equal(A.deltaPct(120, 100), 0.2);
  assert.equal(A.deltaPct(80, 100), -0.2);
  assert.equal(A.deltaPct(10, 0), null);
});

/* ---------------------------------------------------------------- grouping */

test('groupMetrics sorts, computes shares and respects limits', function () {
  const rows = [
    row('2025-01-01', 100, 300, { channel: 'Paid Search' }),
    row('2025-01-02', 300, 600, { channel: 'Display' }),
  ];

  const byRevenue = A.groupMetrics(rows, 'channel');
  assert.equal(byRevenue.length, 2);
  assert.equal(byRevenue[0].key, 'Display');
  assert.equal(byRevenue[0].revenue, 600);
  assert.equal(byRevenue[0].spendShare, 0.75);
  assert.equal(byRevenue[0].revenueShare, 600 / 900);

  const byRoas = A.groupMetrics(rows, 'channel', { sort: 'roas' });
  assert.equal(byRoas[0].key, 'Paid Search');
  assert.equal(byRoas[0].roas, 3);
  assert.equal(A.groupMetrics(rows, 'channel', { limit: 1 }).length, 1);
});

test('groupCampaigns keeps campaign + channel pairs distinct', function () {
  const rows = [
    row('2025-01-01', 100, 200, { campaign: 'Brand Keywords', channel: 'Paid Search' }),
    row('2025-01-02', 50, 100, { campaign: 'Brand Keywords', channel: 'Affiliate' }),
  ];
  const campaigns = A.groupCampaigns(rows);
  assert.equal(campaigns.length, 2);
  assert.equal(campaigns[0].campaign, 'Brand Keywords');
  assert.equal(campaigns[0].channel, 'Paid Search');
  assert.equal(campaigns[1].channel, 'Affiliate');
  assert.equal(campaigns[0].records, 1);
});

/* ------------------------------------------------------------- time series */

test('metricsByPeriod fills gaps and keeps chronological order', function () {
  const rows = [row('2025-01-01', 40, 100), row('2025-01-15', 60, 200)];
  const weekly = A.metricsByPeriod(rows, 'week');
  assert.equal(weekly.length, 3);
  assert.deepEqual(weekly.map(function (item) { return item.spend; }), [40, 0, 60]);
  assert.deepEqual(weekly.map(function (item) { return item.revenue; }), [100, 0, 200]);
  assert.equal(weekly[0].roas, 2.5);

  const monthly = A.metricsByPeriod(
    [row('2025-01-10', 10, 50), row('2025-03-10', 20, 150)],
    'month'
  );
  assert.deepEqual(monthly.map(function (item) { return item.revenue; }), [50, 0, 150]);
  assert.equal(monthly[2].label, 'Mar 25');
});

test('pickGranularity scales with the selected range', function () {
  assert.equal(A.pickGranularity('2025-01-01', '2025-01-30'), 'day');
  assert.equal(A.pickGranularity('2025-01-01', '2025-06-30'), 'week');
  assert.equal(A.pickGranularity('2024-01-01', '2025-12-31'), 'month');
});

test('weekdayProfile starts on Monday and sums metrics', function () {
  const rows = [
    row('2025-01-06', 10, 20), // Monday
    row('2025-01-05', 30, 40), // Sunday
  ];
  const profile = A.weekdayProfile(rows);
  assert.equal(profile.length, 7);
  assert.equal(profile[0].label, 'Mon');
  assert.equal(profile[0].spend, 10);
  assert.equal(profile[6].label, 'Sun');
  assert.equal(profile[6].spend, 30);
});

test('funnel reports each stage and derived rates', function () {
  const rows = [
    row('2025-01-01', 100, 400, { impressions: 5000, clicks: 100, conversions: 8 }),
  ];
  const steps = A.funnel(rows);
  assert.equal(steps.impressions, 5000);
  assert.equal(steps.clicks, 100);
  assert.equal(steps.conversions, 8);
  assert.equal(steps.ctr, 0.02);
  assert.equal(steps.cvr, 0.08);
  assert.equal(steps.cpa, 12.5);
  assert.equal(steps.aov, 50);
});

/* --------------------------------------------------------------- insights */

test('computeInsights reports momentum and top performers', function () {
  const current = [
    row('2025-02-01', 200, 300, { channel: 'Paid Search', campaign: 'Brand Keywords' }),
    row('2025-02-02', 200, 300, { channel: 'Display', campaign: 'Prospecting' }),
  ];
  const previous = [
    row('2025-01-01', 200, 200, { channel: 'Paid Search', campaign: 'Brand Keywords' }),
    row('2025-01-02', 200, 200, { channel: 'Display', campaign: 'Prospecting' }),
  ];

  const insights = A.computeInsights(current, previous);
  assert.ok(insights.length >= 3);
  assert.match(insights[0].title, /ROAS is up 50\.0% to 1\.50/);
  assert.equal(insights[0].tone, 'positive');
  assert.ok(insights.some(function (item) { return /Paid Search/.test(item.title); }));
  assert.ok(insights.some(function (item) { return /Brand Keywords/.test(item.title); }));
  assert.deepEqual(A.computeInsights([], previous), []);
});

/* ------------------------------------------------------------------- CSV */

test('parseCSV handles quotes, delimiters and embedded newlines', function () {
  const grid = A.parseCSV('name,note\n"Widget, large","line one\nline two"\n');
  assert.deepEqual(grid, [
    ['name', 'note'],
    ['Widget, large', 'line one\nline two'],
  ]);

  const semicolon = A.parseCSV('a;b;c\n1;2;3\n');
  assert.deepEqual(semicolon, [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('importCSV detects date, metrics and dimensions', function () {
  const csv = [
    'Date,Channel,Campaign,Device,Spend,Impressions,Clicks,Conversions,Revenue',
    '2025-01-05,Paid Search,Brand Keywords,Mobile,"1,200.50",40000,2000,90,2600',
    '2025-01-06,Display,Prospecting,Desktop,800,90000,900,18,700',
  ].join('\n');

  const result = A.importCSV(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.mapping.date, 'Date');
  assert.equal(result.mapping.spend, 'Spend');
  assert.equal(result.mapping.revenue, 'Revenue');
  assert.equal(result.mapping.conversions, 'Conversions');
  assert.equal(result.mapping.clicks, 'Clicks');
  assert.equal(result.mapping.impressions, 'Impressions');
  assert.equal(result.mapping.channel, 'Channel');
  assert.equal(result.mapping.campaign, 'Campaign');
  assert.equal(result.mapping.device, 'Device');
  assert.equal(result.rows[0].spend, 1200.5);
  assert.equal(result.rows[0].revenue, 2600);
  assert.equal(result.rows[0].date.getDate(), 5);
  assert.equal(result.warnings.length, 0);
});

test('importCSV skips unreadable dates and warns about missing columns', function () {
  const csv = [
    'date,spend,revenue',
    '2025-01-01,10,20',
    'oops,5,5',
    '2025-01-03,30,60',
  ].join('\n');

  const result = A.importCSV(csv);
  assert.equal(result.rows.length, 2);
  assert.ok(result.warnings.some(function (warning) {
    return /1 row skipped/.test(warning);
  }));
  assert.ok(result.warnings.some(function (warning) {
    return /No conversions column/.test(warning);
  }));
});

test('importCSV accepts spend-only or revenue-only files', function () {
  const spendOnly = A.importCSV('date,spend\n2025-01-01,100\n2025-01-02,200');
  assert.equal(spendOnly.rows[0].spend, 100);
  assert.equal(spendOnly.rows[0].revenue, 0);
  assert.match(spendOnly.warnings.join(' '), /No revenue column/);

  const revenueOnly = A.importCSV('date,revenue\n2025-01-01,400');
  assert.equal(revenueOnly.rows[0].revenue, 400);
  assert.match(revenueOnly.warnings.join(' '), /No spend column/);
});

test('importCSV prefers full dates over bare month names', function () {
  const csv = [
    'Month,Date,Sales',
    'Jan,2025-01-15,100',
    'Feb,2025-02-15,200',
  ].join('\n');
  const result = A.importCSV(csv);
  assert.equal(result.mapping.date, 'Date');
  assert.equal(result.mapping.revenue, 'Sales');
  assert.equal(result.rows[0].date.getMonth(), 0);
  assert.equal(result.rows[1].date.getMonth(), 1);
});

test('importCSV ignores numeric dimensions such as year', function () {
  const csv = ['date,year,sales', '2025-01-01,2025,100', '2025-01-02,2025,200'].join('\n');
  const result = A.importCSV(csv);
  assert.equal(result.mapping.revenue, 'sales');
  assert.equal(A.computeKPIs(result.rows).revenue, 300);
});

test('importCSV rejects files without a usable date or metric', function () {
  assert.throws(function () {
    A.importCSV('name,value\nfoo,1\nbar,2');
  }, /No date column/);
  assert.throws(function () {
    A.importCSV('date,value');
  }, /header row/);
  assert.throws(function () {
    A.importCSV('date,channel\n2025-01-01,Paid Search');
  }, /No spend or revenue column/);
});

test('toNumber cleans currency strings', function () {
  assert.equal(A.toNumber('$1,234.56'), 1234.56);
  assert.equal(A.toNumber('(250)'), -250);
  assert.equal(A.toNumber('12%'), 12);
  assert.equal(A.toNumber('n/a'), 0);
});
