const inputs = {
  drivenLength: document.querySelector('#drivenLength'),
  driverLength: document.querySelector('#driverLength'),
  shockSpeed: document.querySelector('#shockSpeed'),
  contactSpeed: document.querySelector('#contactSpeed'),
  expHeadSpeed: document.querySelector('#expHeadSpeed'),
  expTailSpeed: document.querySelector('#expTailSpeed'),
  refShockSpeed: document.querySelector('#refShockSpeed'),
  refExpansionSpeed: document.querySelector('#refExpansionSpeed'),
  timeLimit: document.querySelector('#timeLimit'),
};

const controls = document.querySelector('#controls');
const svg = document.querySelector('#diagram');
const warnings = document.querySelector('#warnings');
const legend = document.querySelector('#legend');
const summary = document.querySelector('#caseSummary');
const downloadButton = document.querySelector('#downloadSvg');

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = {
  shock: '#d62828',
  contact: '#2a9d8f',
  expansion: '#7b2cbf',
  reflectedShock: '#f77f00',
  reflectedExpansion: '#4361ee',
};

function valueOf(input) {
  return Number.parseFloat(input.value);
}

function selectedEndType() {
  return new FormData(controls).get('endType');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function el(name, attributes = {}, text = '') {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function collectInputs() {
  const data = {
    L1: valueOf(inputs.drivenLength),
    L4: valueOf(inputs.driverLength),
    Ws: valueOf(inputs.shockSpeed),
    Uc: valueOf(inputs.contactSpeed),
    expHead: valueOf(inputs.expHeadSpeed),
    expTail: valueOf(inputs.expTailSpeed),
    refShock: valueOf(inputs.refShockSpeed),
    refExpansion: valueOf(inputs.refExpansionSpeed),
    tLimitMs: valueOf(inputs.timeLimit),
    endType: selectedEndType(),
  };

  const messages = [];
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'endType' && (!Number.isFinite(value) || value <= 0)) {
      messages.push('All numeric values must be positive.');
      break;
    }
  }
  if (data.Uc >= data.Ws) messages.push('Contact speed should be lower than shock speed for a standard incident shock diagram.');
  if (data.expTail >= data.expHead) messages.push('Expansion tail speed should be lower than expansion head speed to show a fan.');

  return { data, messages };
}

function xPosition(tSeconds, speed, direction = 1, x0 = 0) {
  return x0 + direction * speed * tSeconds;
}

function buildEvents(data) {
  const tShockEnd = data.L1 / data.Ws;
  const reflectedSpeed = data.endType === 'closed' ? data.refShock : data.refExpansion;
  const tReflectedToDiaphragm = tShockEnd + data.L1 / reflectedSpeed;
  const maxTime = data.tLimitMs / 1000;
  const tubeMin = -data.L4;
  const tubeMax = data.L1;

  const reflectedKind = data.endType === 'closed' ? 'Reflected shock' : 'Reflected expansion wave';
  const reflectedColor = data.endType === 'closed' ? COLORS.reflectedShock : COLORS.reflectedExpansion;

  const waves = [
    {
      id: 'shock',
      name: 'Incident shock',
      color: COLORS.shock,
      points: [
        { t: 0, x: 0 },
        { t: Math.min(tShockEnd, maxTime), x: Math.min(data.L1, xPosition(Math.min(tShockEnd, maxTime), data.Ws)) },
      ],
    },
    {
      id: 'contact',
      name: 'Contact surface',
      color: COLORS.contact,
      points: [
        { t: 0, x: 0 },
        { t: maxTime, x: clamp(xPosition(maxTime, data.Uc), tubeMin, tubeMax) },
      ],
    },
    {
      id: 'reflected',
      name: reflectedKind,
      color: reflectedColor,
      points: [
        { t: tShockEnd, x: data.L1 },
        {
          t: Math.min(tReflectedToDiaphragm, maxTime),
          x: Math.max(0, data.L1 - reflectedSpeed * Math.max(0, Math.min(tReflectedToDiaphragm, maxTime) - tShockEnd)),
        },
      ],
    },
  ];

  const fan = {
    name: 'Expansion fan',
    color: COLORS.expansion,
    lines: [data.expTail, (data.expTail + data.expHead) / 2, data.expHead].map((speed) => ({
      points: [
        { t: 0, x: 0 },
        { t: maxTime, x: clamp(xPosition(maxTime, speed, -1), tubeMin, tubeMax) },
      ],
    })),
  };

  return { waves, fan, maxTime, tubeMin, tubeMax, tShockEnd };
}

function scaleFactory(events, width, height, margin) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMin = events.tubeMin;
  const xMax = events.tubeMax;

  return {
    t: (seconds) => margin.left + (seconds / events.maxTime) * plotWidth,
    x: (meters) => margin.top + (1 - (meters - xMin) / (xMax - xMin)) * plotHeight,
    plotWidth,
    plotHeight,
    xMin,
    xMax,
  };
}

function pathFor(points, scale) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${scale.t(point.t).toFixed(2)} ${scale.x(point.x).toFixed(2)}`).join(' ');
}

function drawAxes(scale, width, height, margin, events) {
  const axis = el('g');
  const xTicks = 6;
  const tTicks = 6;

  for (let i = 0; i <= xTicks; i += 1) {
    const fraction = i / xTicks;
    const meters = scale.xMin + fraction * (scale.xMax - scale.xMin);
    const y = scale.x(meters);
    axis.append(el('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: 'grid-line' }));
    axis.append(el('text', { x: margin.left - 10, y: y + 4, 'text-anchor': 'end', class: 'tick-label' }, meters.toFixed(1)));
  }

  for (let i = 0; i <= tTicks; i += 1) {
    const seconds = (i / tTicks) * events.maxTime;
    const x = scale.t(seconds);
    axis.append(el('line', { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, class: 'grid-line' }));
    axis.append(el('text', { x, y: height - margin.bottom + 22, 'text-anchor': 'middle', class: 'tick-label' }, (seconds * 1000).toFixed(1)));
  }

  axis.append(el('line', { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: 'axis-line' }));
  axis.append(el('line', { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: 'axis-line' }));
  axis.append(el('text', { x: width / 2, y: height - 18, 'text-anchor': 'middle', class: 'axis-label' }, 'time, t (ms) →'));
  axis.append(el('text', { x: 22, y: height / 2, transform: `rotate(-90 22 ${height / 2})`, 'text-anchor': 'middle', class: 'axis-label' }, 'distance, x (m) ↑'));
  axis.append(el('line', { x1: margin.left, y1: scale.x(0), x2: width - margin.right, y2: scale.x(0), class: 'tube-wall' }));
  axis.append(el('line', { x1: margin.left, y1: scale.x(events.tubeMax), x2: width - margin.right, y2: scale.x(events.tubeMax), class: 'tube-wall' }));
  axis.append(el('line', { x1: margin.left, y1: scale.x(events.tubeMin), x2: width - margin.right, y2: scale.x(events.tubeMin), class: 'tube-wall' }));
  axis.append(el('text', { x: width - margin.right, y: scale.x(0) - 8, 'text-anchor': 'end', class: 'tick-label' }, 'diaphragm'));
  axis.append(el('text', { x: width - margin.right, y: scale.x(events.tubeMax) - 8, 'text-anchor': 'end', class: 'tick-label' }, 'driven end'));
  axis.append(el('text', { x: width - margin.right, y: scale.x(events.tubeMin) + 18, 'text-anchor': 'end', class: 'tick-label' }, 'driver end'));
  return axis;
}

function drawFan(fan, scale) {
  const group = el('g');
  const polygonPoints = [
    fan.lines[0].points[0],
    fan.lines[0].points[1],
    fan.lines[2].points[1],
  ].map((point) => `${scale.t(point.t).toFixed(2)},${scale.x(point.x).toFixed(2)}`).join(' ');

  group.append(el('polygon', { points: polygonPoints, class: 'fan-fill' }));
  fan.lines.forEach((line) => {
    group.append(el('path', { d: pathFor(line.points, scale), class: 'fan-line' }));
  });
  const labelPoint = fan.lines[2].points[1];
  group.append(el('text', {
    x: scale.t(labelPoint.t) - 12,
    y: scale.x(labelPoint.x) - 10,
    'text-anchor': 'end',
    fill: fan.color,
    class: 'wave-label',
  }, fan.name));
  return group;
}

function drawWave(wave, scale) {
  const group = el('g');
  group.append(el('path', { d: pathFor(wave.points, scale), stroke: wave.color, class: 'wave-line' }));
  const labelPoint = wave.points[wave.points.length - 1];
  group.append(el('text', {
    x: scale.t(labelPoint.t) - 8,
    y: scale.x(labelPoint.x) - 8,
    'text-anchor': 'end',
    fill: wave.color,
    class: 'wave-label',
  }, wave.name));
  return group;
}

function updateLegend(items) {
  legend.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('span');
    row.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = item.color;
    row.append(swatch, document.createTextNode(item.name));
    legend.append(row);
  });
}

function render() {
  const { data, messages } = collectInputs();
  warnings.textContent = messages.join(' ');
  summary.textContent = data.endType === 'closed'
    ? 'Closed end selected: a reflected shock is plotted from the driven end.'
    : 'Open end selected: a reflected expansion wave is plotted from the driven end (no reflected shock).';

  const width = 900;
  const height = 650;
  const margin = { top: 34, right: 32, bottom: 66, left: 74 };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = '<title id="diagramTitle">Shock tube x-t diagram</title><desc id="diagramDesc">Time is plotted on the horizontal axis and distance is plotted on the vertical axis increasing upward.</desc>';

  const events = buildEvents(data);
  const scale = scaleFactory(events, width, height, margin);

  svg.append(drawAxes(scale, width, height, margin, events));
  svg.append(drawFan(events.fan, scale));
  events.waves.forEach((wave) => svg.append(drawWave(wave, scale)));

  updateLegend([
    { name: 'Incident shock', color: COLORS.shock },
    { name: 'Contact surface', color: COLORS.contact },
    { name: 'Expansion fan', color: COLORS.expansion },
    events.waves[2],
  ]);
}

function downloadSvg() {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shock-tube-xt-${selectedEndType()}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

controls.addEventListener('input', render);
controls.addEventListener('change', render);
downloadButton.addEventListener('click', downloadSvg);
render();
