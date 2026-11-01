# Signalboard

A small marketing-analytics dashboard that runs entirely in the browser. No frameworks, no build step, no CDN, no tracking - just four JavaScript files and a stylesheet.

![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20SVG-0ea5e9) ![deps](https://img.shields.io/badge/dependencies-0-22d3ee)

## What it does

- **KPI cards** - ad spend, attributed revenue, ROAS and conversions, each with a delta against the immediately preceding period and a sparkline.
- **Spend vs. revenue** - daily/weekly/monthly multi-series line chart with a hover crosshair, per-period tooltip and ROAS context.
- **Channel breakdowns** - spend-share donut and ROAS-by-channel bars, with inefficient channels highlighted in amber or red.
- **Conversion funnel** - impressions, clicks and conversions with CTR/CVR rates plus CPA, average order value and cost per click.
- **Top campaigns** - ranked by attributed revenue, with channel and ROAS context.
- **Automatic insights** - plain-English callouts for ROAS momentum, the most efficient channel, budget concentration, the top campaign and underperforming CPA.
- **Campaign table** - one row per campaign/channel pair with spend, revenue, ROAS, conversions, CPA, CTR and CVR. Sortable and paginated.
- **Flexible filters** - date presets (30D/90D/12M/All), custom dates, channel/campaign/device multi-selects and free-text search.
- **CSV import** - detects the date column, spend/revenue metrics and optional dimensions automatically.
- **CSV export** - exports exactly the filtered rows you are looking at.
- **Private by design** - all parsing and analysis happens on the client; nothing is uploaded anywhere.

## Run it

Requires Node.js 18+ (only for the tiny static server - the app itself is pure HTML/CSS/JS).

```bash
cd signalboard
npm start        # or: node server.js
```

Open <http://localhost:4174>.

You can also just double-click `index.html`; everything works from the file system too. The server is only there to avoid `file://` quirks.

## Use your own data

Click **Upload CSV**. The file needs:

- a **date column** (any of `2025-01-31`, `2025/1/31`, `01/31/2025`, `20250131`, `Jan 31, 2025`, or an Excel serial number)
- at least one of **spend** or **revenue** (`spend`, `cost`, `budget`, `ad spend`; `revenue`, `sales`, `value`, `amount`, `GMV`)
- optional **impressions**, **clicks**, **conversions**, **channel**, **campaign** and **device** columns

Example:

```csv
Date,Channel,Campaign,Device,Spend,Impressions,Clicks,Conversions,Revenue
2025-01-05,Paid Search,Brand Keywords,Mobile,1200.50,40000,2000,90,2600
2025-01-06,Display,Prospecting,Desktop,800,90000,900,18,700
2025-01-07,Paid Social,Retargeting,Mobile,400,20000,560,24,960
2025-01-08,Email,Newsletter,Desktop,50,8000,248,12,480
2025-01-09,Affiliate,Coupon Partners,Mobile,300,15000,330,15,450
```

Column names are matched by common keywords, so `Ad Spend`, `ad_spend` and `Cost` all work. Quoted fields, embedded commas/newlines, semicolons and tabs are supported. Rows with unreadable dates are skipped and reported in a toast. Missing optional columns produce a warning, and derived metrics that need them (for example ROAS without revenue) simply read zero.

> If your export separates `cost` and `revenue` across different files, combine them first. One row should represent one day (or reporting period) for one campaign/channel/device combination.

## Project structure

```
signalboard/
├── index.html              # layout and copy
├── assets/
│   ├── styles.css          # design system, layout, responsive rules
│   ├── marketing.js        # pure marketing analytics helpers (also runs in Node)
│   ├── charts.js           # dependency-free SVG/HTML charts
│   ├── data.js             # deterministic sample dataset
│   └── app.js              # state, filters, rendering, CSV import/export
├── test/
│   └── marketing.test.js   # node:test suite for the analytics layer
├── server.js               # zero-dependency static server
└── README.md
```

`marketing.js` is UMD-style: it attaches to `window.Marketing` in the browser and exports via `module.exports` in Node, so the analysis logic is testable without a DOM.

## How the numbers work

- **ROAS** = attributed revenue / spend.
- **CPA** = spend / conversions.
- **CTR** = clicks / impressions.
- **CVR** = conversions / clicks.
- **CPC** = spend / clicks.
- **AOV** = attributed revenue / conversions.
- **Filtering** - dates are inclusive; dimension filters use OR within a facet and AND across facets. Search matches campaign, channel and device.
- **Previous period** - the comparison window has the same length as the selected range and ends the day before it starts. Dimension/search filters are applied to both windows.
- **Granularity** - "Auto" picks daily for ranges up to 45 days, weekly up to 400 days, monthly beyond that. Empty periods are filled with zeros so the x-axis keeps a constant rhythm.
- **Funnel** - stage bars use a square-root scale so conversions stay visible next to much larger impression counts; the labels always show exact totals and rates.
- **Insights** - derived only from the current filtered rows (and the previous window for momentum). Nothing is hard-coded to the sample data.
- **Sample data** - 540 days x 12 campaigns x 3 devices (~19,440 rows), generated with a seeded RNG, seasonality, weekday effects and gradually improving conversion rates. Reloads produce the same dataset.

## Tests

```bash
node --test
```

Covers date parsing (including Excel serials and invalid dates), filtering, KPIs (ROAS/CPA/CTR/CVR), grouping, gap-filled time series, granularity selection, weekday profiles, funnel metrics, CSV parsing/import edge cases and insight generation.

## Customize

- **Colors** - edit the CSS custom properties at the top of `assets/styles.css` and the `COLORS` array in `assets/charts.js`.
- **Sample data** - change the channel/campaign catalog, device mix or seasonality array in `assets/data.js`; pass a different seed to `createSampleRecords(540, 12345)`.
- **Branding** - the name, tagline and footer live in `index.html`.
- **More metrics** - add fields in `computeKPIs` (`assets/marketing.js`) and a card in `renderKpis` (`assets/app.js`).

## Notes

- Verified in headless Chromium (Edge) at desktop and mobile widths; uses standard DOM/SVG APIs supported by current browsers. Uses `color-mix()` for insight icon tints and `backdrop-filter` for glass cards; both degrade gracefully.
- Respects `prefers-reduced-motion`.
- No cookies, no localStorage, no network requests.
