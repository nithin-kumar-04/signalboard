/*
 * charts.js — dependency-free SVG/HTML charts for Signalboard.
 * Supports multi-series line charts, donuts, bars, columns and sparklines.
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#38bdf8', '#f97316'];
  let uid = 0;

  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const integer = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

  function compactMoney(value) {
    return money.format(Number(value) || 0);
  }

  function compactNumber(value) {
    return integer.format(Number(value) || 0);
  }

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] != null) node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function empty(container, message) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'chart-empty';
    box.textContent = message || 'No data for these filters';
    container.appendChild(box);
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const normalized = value / base;
    let step = 10;
    if (normalized <= 1) step = 1;
    else if (normalized <= 2) step = 2;
    else if (normalized <= 2.5) step = 2.5;
    else if (normalized <= 5) step = 5;
    return step * base;
  }

  function colorAt(index) {
    return COLORS[index % COLORS.length];
  }

  /* ------------------------------------------------------- multi-series line */

  function lines(container, data, options) {
    const opts = options || {};
    container.innerHTML = '';
    container.classList.add('chart-host');

    if (!data || !data.length || !opts.series || !opts.series.length) {
      empty(container);
      return;
    }

    const width = Math.max(container.clientWidth || 0, 320);
    const height = opts.height || 300;
    const pad = { top: 18, right: 20, bottom: 32, left: 56 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    const formatAxis = opts.formatAxis || compactMoney;
    const formatValue = opts.formatValue || compactMoney;

    const allValues = [];
    opts.series.forEach(function (series) {
      data.forEach(function (point) {
        const value = Number(point[series.key]) || 0;
        allValues.push(value);
      });
    });
    const yMax = niceMax((Math.max.apply(null, allValues.concat([1]))) * 1.08);

    function xAt(index) {
      if (data.length === 1) return pad.left + innerWidth / 2;
      return pad.left + (index / (data.length - 1)) * innerWidth;
    }

    function yAt(value) {
      return pad.top + innerHeight - (Math.max(0, value) / yMax) * innerHeight;
    }

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      height: height,
      role: 'img',
      'aria-label': opts.ariaLabel || 'Marketing performance over time',
    });

    const defs = el('defs');
    opts.series.forEach(function (series, index) {
      if (!series.fill) return;
      const gradientId = `signal-area-${uid++}`;
      series.__gradient = gradientId;
      const gradient = el('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
      gradient.appendChild(
        el('stop', { offset: '0', 'stop-color': series.color || colorAt(index), 'stop-opacity': '0.34' })
      );
      gradient.appendChild(
        el('stop', { offset: '1', 'stop-color': series.color || colorAt(index), 'stop-opacity': '0.02' })
      );
      defs.appendChild(gradient);
    });
    svg.appendChild(defs);

    // Grid + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i += 1) {
      const value = (yMax / ticks) * i;
      const y = yAt(value);
      svg.appendChild(
        el('line', {
          x1: pad.left,
          x2: width - pad.right,
          y1: y,
          y2: y,
          stroke: 'rgba(148,163,184,0.12)',
          'stroke-width': 1,
        })
      );
      const label = el('text', {
        x: pad.left - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#7d8aa3',
        'font-size': 11,
      });
      label.textContent = formatAxis(value);
      svg.appendChild(label);
    }

    // X labels
    const step = Math.max(1, Math.ceil(data.length / 6));
    const lastIndex = data.length - 1;
    data.forEach(function (point, index) {
      const isLast = index === lastIndex;
      const show = index === 0 || isLast || (index % step === 0 && lastIndex - index > step * 0.6);
      if (!show) return;
      const anchor = data.length === 1 ? 'middle' : index === 0 ? 'start' : isLast ? 'end' : 'middle';
      const label = el('text', {
        x: xAt(index),
        y: height - 10,
        'text-anchor': anchor,
        fill: '#7d8aa3',
        'font-size': 11,
      });
      label.textContent = point.label;
      svg.appendChild(label);
    });

    const baseY = pad.top + innerHeight;

    // Areas first, then lines.
    opts.series.forEach(function (series, index) {
      if (!series.fill) return;
      let path = '';
      data.forEach(function (point, pointIndex) {
        const value = Number(point[series.key]) || 0;
        path += `${pointIndex ? 'L' : 'M'}${xAt(pointIndex).toFixed(1)} ${yAt(value).toFixed(1)} `;
      });
      const area = `${path}L${xAt(data.length - 1).toFixed(1)} ${baseY} L${xAt(0).toFixed(1)} ${baseY} Z`;
      svg.appendChild(el('path', { d: area, fill: `url(#${series.__gradient})` }));
    });

    opts.series.forEach(function (series, index) {
      const color = series.color || colorAt(index);
      let path = '';
      data.forEach(function (point, pointIndex) {
        const value = Number(point[series.key]) || 0;
        path += `${pointIndex ? 'L' : 'M'}${xAt(pointIndex).toFixed(1)} ${yAt(value).toFixed(1)} `;
      });
      svg.appendChild(
        el('path', {
          d: path,
          fill: 'none',
          stroke: color,
          'stroke-width': series.width || 2.2,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          'stroke-dasharray': series.dashed ? '5 5' : null,
        })
      );
      if (data.length === 1) {
        svg.appendChild(
          el('circle', {
            cx: xAt(0),
            cy: yAt(Number(data[0][series.key]) || 0),
            r: 4.5,
            fill: color,
          })
        );
      }
    });

    // Hover layer
    const crosshair = el('line', {
      y1: pad.top,
      y2: baseY,
      stroke: 'rgba(165,180,252,0.5)',
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
      opacity: 0,
    });
    svg.appendChild(crosshair);

    const dots = opts.series.map(function (series, index) {
      const dot = el('circle', {
        r: 4.5,
        fill: '#0b1020',
        stroke: series.color || colorAt(index),
        'stroke-width': 2.5,
        opacity: 0,
      });
      svg.appendChild(dot);
      return dot;
    });

    const overlay = el('rect', {
      x: pad.left,
      y: pad.top,
      width: innerWidth,
      height: innerHeight,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    svg.appendChild(overlay);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;

    function showPoint(index) {
      const point = data[index];
      if (!point) return;
      const x = xAt(index);
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);
      crosshair.setAttribute('opacity', 1);

      tip.innerHTML = '';
      const label = document.createElement('div');
      label.className = 'tip-label';
      label.textContent = point.label;
      tip.appendChild(label);

      opts.series.forEach(function (series, seriesIndex) {
        const value = Number(point[series.key]) || 0;
        dots[seriesIndex].setAttribute('cx', x);
        dots[seriesIndex].setAttribute('cy', yAt(value));
        dots[seriesIndex].setAttribute('opacity', 1);

        const row = document.createElement('div');
        row.className = 'tip-row';
        const swatch = document.createElement('i');
        swatch.style.background = series.color || colorAt(seriesIndex);
        const name = document.createElement('span');
        name.className = 'tip-name';
        name.textContent = series.label;
        const amount = document.createElement('strong');
        amount.textContent = formatValue(value);
        row.appendChild(swatch);
        row.appendChild(name);
        row.appendChild(amount);
        tip.appendChild(row);
      });

      if (typeof opts.extra === 'function') {
        const extra = opts.extra(point);
        if (extra) {
          const meta = document.createElement('div');
          meta.className = 'tip-meta';
          meta.textContent = extra;
          tip.appendChild(meta);
        }
      }

      tip.hidden = false;
      const tipWidth = tip.offsetWidth;
      const left = Math.min(Math.max(x - tipWidth / 2, 4), width - tipWidth - 4);
      const top = Math.max(4, pad.top + 8);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    overlay.addEventListener('pointermove', function (event) {
      const bounds = overlay.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
      const index = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
      showPoint(index);
    });
    overlay.addEventListener('pointerleave', function () {
      crosshair.setAttribute('opacity', 0);
      dots.forEach(function (dot) {
        dot.setAttribute('opacity', 0);
      });
      tip.hidden = true;
    });

    container.appendChild(svg);
    container.appendChild(tip);

    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    opts.series.forEach(function (series, index) {
      const item = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = series.color || colorAt(index);
      if (series.dashed) swatch.className = 'dashed';
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(series.label));
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  /* ------------------------------------------------------------ donut chart */

  function donut(container, data, options) {
    const opts = options || {};
    container.innerHTML = '';

    if (!data || !data.length) {
      empty(container);
      return;
    }

    const total = data.reduce(function (acc, item) {
      return acc + item.value;
    }, 0) || 1;

    const size = 210;
    const radius = 76;
    const stroke = 21;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    const wrap = document.createElement('div');
    wrap.className = 'donut';

    const svg = el('svg', {
      viewBox: `0 0 ${size} ${size}`,
      class: 'donut-svg',
      role: 'img',
      'aria-label': opts.ariaLabel || 'Spend share by channel',
    });
    svg.appendChild(
      el('circle', {
        cx: center,
        cy: center,
        r: radius,
        fill: 'none',
        stroke: 'rgba(148,163,184,0.1)',
        'stroke-width': stroke,
      })
    );

    const valueText = el('text', {
      x: center,
      y: center - 2,
      'text-anchor': 'middle',
      fill: '#eef2ff',
      'font-size': 21,
      'font-weight': 650,
    });
    const labelText = el('text', {
      x: center,
      y: center + 20,
      'text-anchor': 'middle',
      fill: '#93a0b8',
      'font-size': 11,
    });
    valueText.textContent = (opts.formatTotal || compactMoney)(total);
    labelText.textContent = opts.centerLabel || 'Total spend';

    const slices = [];
    let offset = 0;

    data.forEach(function (item, index) {
      const fraction = item.value / total;
      const length = Math.max(fraction * circumference - 3, 0.6);
      const slice = el('circle', {
        cx: center,
        cy: center,
        r: radius,
        fill: 'none',
        stroke: colorAt(index),
        'stroke-width': stroke,
        'stroke-dasharray': `${length} ${circumference - length}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${center} ${center})`,
        style: 'transition:stroke-width .18s ease, opacity .18s ease; cursor:pointer',
      });
      slice.setAttribute('tabindex', '0');
      slice.setAttribute('role', 'img');
      slice.setAttribute(
        'aria-label',
        `${item.label}: ${(fraction * 100).toFixed(0)} percent of total`
      );
      offset += fraction * circumference;
      slices.push(slice);
      svg.appendChild(slice);
    });

    svg.appendChild(valueText);
    svg.appendChild(labelText);

    const legend = document.createElement('ul');
    legend.className = 'donut-legend';

    data.forEach(function (item, index) {
      const row = document.createElement('li');
      const fraction = item.value / total;
      row.innerHTML =
        `<i style="background:${colorAt(index)}"></i>` +
        '<span class="legend-name"></span>' +
        '<span class="legend-value"></span>';
      row.querySelector('.legend-name').textContent = item.label;
      row.querySelector('.legend-value').textContent = `${(fraction * 100).toFixed(0)}%`;
      row.title = `${item.label}: ${(opts.formatTotal || compactMoney)(item.value)}`;

      function activate() {
        slices.forEach(function (slice, sliceIndex) {
          slice.setAttribute('opacity', sliceIndex === index ? 1 : 0.35);
          slice.setAttribute('stroke-width', sliceIndex === index ? stroke + 4 : stroke);
        });
        valueText.textContent = (opts.formatTotal || compactMoney)(item.value);
        labelText.textContent = item.label;
        row.classList.add('active');
      }

      function reset() {
        slices.forEach(function (slice) {
          slice.setAttribute('opacity', 1);
          slice.setAttribute('stroke-width', stroke);
        });
        valueText.textContent = (opts.formatTotal || compactMoney)(total);
        labelText.textContent = opts.centerLabel || 'Total spend';
        row.classList.remove('active');
      }

      row.addEventListener('pointerenter', activate);
      row.addEventListener('pointerleave', reset);
      slices[index].addEventListener('pointerenter', activate);
      slices[index].addEventListener('pointerleave', reset);
      slices[index].addEventListener('focus', activate);
      slices[index].addEventListener('blur', reset);

      legend.appendChild(row);
    });

    wrap.appendChild(svg);
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  /* ------------------------------------------------------------ bar charts */

  function bars(container, items, options) {
    const opts = options || {};
    container.innerHTML = '';
    container.classList.add('bar-list');

    if (!items || !items.length) {
      empty(container);
      return;
    }

    const max = Math.max.apply(
      null,
      items.map(function (item) {
        return item.value;
      })
    ) || 1;

    items.forEach(function (item, index) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const meta = document.createElement('div');
      meta.className = 'bar-meta';

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = item.label;
      label.title = item.label;

      const value = document.createElement('span');
      value.className = 'bar-value';
      value.textContent = (opts.format || compactMoney)(item.value);

      meta.appendChild(label);
      meta.appendChild(value);

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.background = item.color || colorAt(index);
      fill.style.width = '0%';
      track.appendChild(fill);

      row.appendChild(meta);
      row.appendChild(track);
      if (item.detail) {
        const detail = document.createElement('div');
        detail.className = 'bar-detail';
        detail.textContent = item.detail;
        row.appendChild(detail);
      }
      container.appendChild(row);

      requestAnimationFrame(function () {
        fill.style.width = `${Math.max((item.value / max) * 100, 1.5)}%`;
      });
    });
  }

  /* --------------------------------------------------------- column chart */

  function columns(container, items, options) {
    const opts = options || {};
    container.innerHTML = '';

    if (!items || !items.length) {
      empty(container);
      return;
    }

    const max = Math.max.apply(
      null,
      items.map(function (item) {
        return item.value;
      })
    ) || 1;

    const wrap = document.createElement('div');
    wrap.className = 'columns';

    items.forEach(function (item, index) {
      const column = document.createElement('div');
      column.className = 'column';
      column.title = `${item.label}: ${(opts.format || compactMoney)(item.value)}`;

      const value = document.createElement('span');
      value.className = 'column-value';
      value.textContent = (opts.format || compactMoney)(item.value);

      const track = document.createElement('div');
      track.className = 'column-track';
      const fill = document.createElement('div');
      fill.className = 'column-fill';
      fill.style.background = colorAt(index);
      fill.style.height = '0%';
      track.appendChild(fill);

      const label = document.createElement('span');
      label.className = 'column-label';
      label.textContent = item.label;

      column.appendChild(value);
      column.appendChild(track);
      column.appendChild(label);
      wrap.appendChild(column);

      requestAnimationFrame(function () {
        fill.style.height = `${Math.max((item.value / max) * 100, 2)}%`;
      });
    });

    container.appendChild(wrap);
  }

  /* -------------------------------------------------------------- sparkline */

  function sparkline(values, options) {
    const opts = options || {};
    const width = opts.width || 96;
    const height = opts.height || 34;
    const padding = 3;
    const color = opts.color || '#818cf8';

    if (!values || values.length < 2) return '';

    const max = Math.max.apply(null, values);
    const min = Math.min.apply(null, values);
    const span = max - min || 1;
    const points = values.map(function (value, index) {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return [x, y];
    });

    const path = points
      .map(function (point, index) {
        return `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
      })
      .join(' ');
    const area = `${path} L${width - padding} ${height - padding} L${padding} ${height - padding} Z`;
    const gradientId = `signal-spark-${uid++}`;

    return (
      `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">` +
      `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${color}" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<path d="${area}" fill="url(#${gradientId})"/>` +
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` +
      '</svg>'
    );
  }

  root.Charts = {
    colors: COLORS,
    lines: lines,
    donut: donut,
    bars: bars,
    columns: columns,
    sparkline: sparkline,
    compactMoney: compactMoney,
    compactNumber: compactNumber,
  };
})(typeof window !== 'undefined' ? window : globalThis);
