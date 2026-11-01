/*
 * data.js — deterministic marketing sample dataset.
 * Daily records per campaign × device, with seasonality, weekday effects
 * and gradually improving conversion rates.
 */
(function (root) {
  'use strict';

  const CHANNELS = [
    {
      name: 'Paid Search',
      campaigns: [
        { name: 'Brand Keywords', spend: 95, cpc: 0.62, ctr: 0.062, cvr: 0.048, aov: 96 },
        { name: 'Competitor Terms', spend: 55, cpc: 1.55, ctr: 0.026, cvr: 0.018, aov: 88 },
        { name: 'Shopping Feed', spend: 130, cpc: 0.85, ctr: 0.034, cvr: 0.032, aov: 76 },
      ],
    },
    {
      name: 'Paid Social',
      campaigns: [
        { name: 'Lookalike Prospecting', spend: 110, cpc: 0.58, ctr: 0.014, cvr: 0.016, aov: 72 },
        { name: 'Retargeting Social', spend: 65, cpc: 0.48, ctr: 0.028, cvr: 0.042, aov: 78 },
        { name: 'Creator Collabs', spend: 50, cpc: 0.72, ctr: 0.019, cvr: 0.02, aov: 68 },
      ],
    },
    {
      name: 'Display',
      campaigns: [
        { name: 'Programmatic Prospecting', spend: 75, cpc: 0.35, ctr: 0.004, cvr: 0.009, aov: 64 },
        { name: 'Retargeting Display', spend: 40, cpc: 0.42, ctr: 0.012, cvr: 0.028, aov: 70 },
      ],
    },
    {
      name: 'Email',
      campaigns: [
        { name: 'Newsletter Promo', spend: 18, cpc: 0.6, ctr: 0.031, cvr: 0.045, aov: 74 },
        { name: 'Lifecycle Flows', spend: 12, cpc: 0.55, ctr: 0.026, cvr: 0.052, aov: 82 },
      ],
    },
    {
      name: 'Affiliate',
      campaigns: [
        { name: 'Coupon Partners', spend: 45, cpc: 0.5, ctr: 0.022, cvr: 0.035, aov: 62 },
        { name: 'Review Sites', spend: 30, cpc: 0.68, ctr: 0.018, cvr: 0.028, aov: 84 },
      ],
    },
  ];

  const DEVICES = [
    { name: 'Mobile', share: 0.56, ctr: 1.15, cvr: 0.85, aov: 0.92 },
    { name: 'Desktop', share: 0.36, ctr: 0.9, cvr: 1.2, aov: 1.08 },
    { name: 'Tablet', share: 0.08, ctr: 0.85, cvr: 0.95, aov: 0.98 },
  ];

  const MONTH_FACTOR = [0.82, 0.78, 0.9, 0.95, 0.98, 1, 0.92, 0.96, 1.05, 1.12, 1.3, 1.42];

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createSampleRecords(days, seed) {
    const span = Math.max(30, Math.floor(days || 540));
    const random = mulberry32(seed || 20260301);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = [];

    for (let dayIndex = 0; dayIndex < span; dayIndex += 1) {
      const date = new Date(today.getTime());
      date.setDate(today.getDate() - (span - 1 - dayIndex));
      const weekday = date.getDay();
      const season = MONTH_FACTOR[date.getMonth()];
      const spendTrend = 0.82 + 0.36 * (dayIndex / Math.max(1, span - 1));
      const efficiency = 0.94 + 0.14 * (dayIndex / Math.max(1, span - 1));

      for (const channel of CHANNELS) {
        const weekendFactor =
          channel.name === 'Paid Social'
            ? weekday === 0 || weekday === 6
              ? 1.12
              : 1
            : channel.name === 'Email'
              ? weekday === 0 || weekday === 6
                ? 0.72
                : 1
              : weekday === 0 || weekday === 6
                ? 0.76
                : 1;

        for (const campaign of channel.campaigns) {
          for (const device of DEVICES) {
            const noise = 0.82 + random() * 0.36;
            const spend = round2(
              campaign.spend * device.share * season * weekendFactor * spendTrend * noise
            );
            if (spend <= 0) continue;

            const cpc = campaign.cpc * (0.9 + random() * 0.2);
            const clicks = Math.max(0, Math.round(spend / cpc));
            const ctr = clamp(campaign.ctr * device.ctr * (0.85 + random() * 0.3), 0.001, 0.25);
            const impressions = Math.round(clicks / ctr);
            const cvr = clamp(campaign.cvr * device.cvr * efficiency * (0.85 + random() * 0.3), 0.001, 0.5);
            const conversions = Math.round(clicks * cvr);
            const revenue = round2(conversions * campaign.aov * device.aov * (0.9 + random() * 0.2));

            records.push({
              date: new Date(date.getTime()),
              channel: channel.name,
              campaign: campaign.name,
              device: device.name,
              spend: spend,
              impressions: impressions,
              clicks: clicks,
              conversions: conversions,
              revenue: revenue,
            });
          }
        }
      }
    }

    return records;
  }

  root.SampleData = { createSampleRecords: createSampleRecords };
})(typeof window !== 'undefined' ? window : globalThis);
