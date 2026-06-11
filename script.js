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
  sensorLocations: document.querySelector('#sensorLocations'),
  pressure1: document.querySelector('#pressure1'),
  temperature1: document.querySelector('#temperature1'),
  density1: document.querySelector('#density1'),
  p2Ratio: document.querySelector('#p2Ratio'),
  t2Ratio: document.querySelector('#t2Ratio'),
  rho2Ratio: document.querySelector('#rho2Ratio'),
  p3Ratio: document.querySelector('#p3Ratio'),
  t3Ratio: document.querySelector('#t3Ratio'),
  rho3Ratio: document.querySelector('#rho3Ratio'),
  pRefRatio: document.querySelector('#pRefRatio'),
  tRefRatio: document.querySelector('#tRefRatio'),
  rhoRefRatio: document.querySelector('#rhoRefRatio'),
};

const controls = document.querySelector('#controls');
const svg = document.querySelector('#diagram');
const warnings = document.querySelector('#warnings');
const legend = document.querySelector('#legend');
const summary = document.querySelector('#caseSummary');
const downloadButton = document.querySelector('#downloadSvg');
const historySummary = document.querySelector('#historySummary');
const historyDownloadButton = document.querySelector('#downloadHistorySvg');
const historyPlots = {
  pressure: document.querySelector('#pressurePlot'),
  temperature: document.querySelector('#temperaturePlot'),
  density: document.querySelector('#densityPlot'),
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = {
  shock: '#d62828',
  contact: '#2a9d8f',
  expansion: '#7b2cbf',
  reflectedShock: '#f77f00',
  reflectedExpansion: '#4361ee',
};
const SENSOR_COLORS = ['#0f766e', '#c2410c', '#6d28d9', '#be123c', '#0369a1', '#4d7c0f'];

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

function parseSensors(value) {
  return value
    .split(/[\n,;]+/)
    .map((entry) => Number.parseFloat(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
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
    sensorLocations: parseSensors(inputs.sensorLocations.value),
    P1: valueOf(inputs.pressure1),
    T1: valueOf(inputs.temperature1),
    rho1: valueOf(inputs.density1),
    p2Ratio: valueOf(inputs.p2Ratio),
    t2Ratio: valueOf(inputs.t2Ratio),
    rho2Ratio: valueOf(inputs.rho2Ratio),
    p3Ratio: valueOf(inputs.p3Ratio),
    t3Ratio: valueOf(inputs.t3Ratio),
    rho3Ratio: valueOf(inputs.rho3Ratio),
    pRefRatio: valueOf(inputs.pRefRatio),
    tRefRatio: valueOf(inputs.tRefRatio),
    rhoRefRatio: valueOf(inputs.rhoRefRatio),
    endType: selectedEndType(),
  };

  const messages = [];
  for (const [key, value] of Object.entries(data)) {
    if (!['endType', 'sensorLocations'].includes(key) && (!Number.isFinite(value) || value <= 0)) {
      messages.push('All numeric values must be positive.');
      break;
    }
  }
  if (data.Uc >= data.Ws) messages.push('Contact speed should be lower than shock speed for a standard incident shock diagram.');
  if (data.expTail >= data.expHead) messages.push('Expansion tail speed should be lower than expansion head speed to show a fan.');
  if (data.sensorLocations.length === 0) messages.push('Add at least one sensor location to draw pressure, temperature, and density histories.');
  if (data.sensorLocations.some((location) => location < -data.L4 || location > data.L1)) {
    messages.push(`Sensor locations should stay within the tube range ${(-data.L4).toFixed(2)} m to ${data.L1.toFixed(2)} m.`);
  }

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
    x: (meters) => margin.left + ((meters - xMin) / (xMax - xMin)) * plotWidth,
    t: (seconds) => margin.top + (1 - seconds / events.maxTime) * plotHeight,
    plotWidth,
    plotHeight,
    xMin,
    xMax,
  };
}

function pathFor(points, scale) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${scale.x(point.x).toFixed(2)} ${scale.t(point.t).toFixed(2)}`).join(' ');
}

function drawAxes(scale, width, height, margin, events) {
  const axis = el('g');
  const xTicks = 6;
  const tTicks = 6;

  for (let i = 0; i <= xTicks; i += 1) {
    const fraction = i / xTicks;
    const meters = scale.xMin + fraction * (scale.xMax - scale.xMin);
    const x = scale.x(meters);
    axis.append(el('line', { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, class: 'grid-line' }));
    axis.append(el('text', { x, y: height - margin.bottom + 22, 'text-anchor': 'middle', class: 'tick-label' }, meters.toFixed(1)));
  }

  for (let i = 0; i <= tTicks; i += 1) {
    const seconds = (i / tTicks) * events.maxTime;
    const y = scale.t(seconds);
    axis.append(el('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: 'grid-line' }));
    axis.append(el('text', { x: margin.left - 10, y: y + 4, 'text-anchor': 'end', class: 'tick-label' }, (seconds * 1000).toFixed(1)));
  }

  axis.append(el('line', { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: 'axis-line' }));
  axis.append(el('line', { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: 'axis-line' }));
  axis.append(el('text', { x: width / 2, y: height - 18, 'text-anchor': 'middle', class: 'axis-label' }, 'position, x (m) →'));
  axis.append(el('text', { x: 22, y: height / 2, transform: `rotate(-90 22 ${height / 2})`, 'text-anchor': 'middle', class: 'axis-label' }, 'time, t (ms) ↑'));
  axis.append(el('line', { x1: scale.x(0), y1: margin.top, x2: scale.x(0), y2: height - margin.bottom, class: 'tube-wall' }));
  axis.append(el('line', { x1: scale.x(events.tubeMax), y1: margin.top, x2: scale.x(events.tubeMax), y2: height - margin.bottom, class: 'tube-wall' }));
  axis.append(el('line', { x1: scale.x(events.tubeMin), y1: margin.top, x2: scale.x(events.tubeMin), y2: height - margin.bottom, class: 'tube-wall' }));
  axis.append(el('text', { x: scale.x(0) + 8, y: margin.top + 18, 'text-anchor': 'start', class: 'tick-label' }, 'diaphragm'));
  axis.append(el('text', { x: scale.x(events.tubeMax) - 8, y: margin.top + 18, 'text-anchor': 'end', class: 'tick-label' }, 'driven end'));
  axis.append(el('text', { x: scale.x(events.tubeMin) + 8, y: margin.top + 18, 'text-anchor': 'start', class: 'tick-label' }, 'driver end'));
  return axis;
}


function drawSensorMarkers(data, scale, height, margin) {
  const group = el('g');
  data.sensorLocations
    .filter((location) => location >= -data.L4 && location <= data.L1)
    .forEach((location, index) => {
      const x = scale.x(location);
      const color = SENSOR_COLORS[index % SENSOR_COLORS.length];
      group.append(el('line', { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, stroke: color, class: 'sensor-marker' }));
      group.append(el('text', { x: x + 6, y: height - margin.bottom - 8, fill: color, class: 'sensor-label' }, `sensor x=${location} m`));
    });
  return group;
}

function drawFan(fan, scale) {
  const group = el('g');
  const polygonPoints = [
    fan.lines[0].points[0],
    fan.lines[0].points[1],
    fan.lines[2].points[1],
  ].map((point) => `${scale.x(point.x).toFixed(2)},${scale.t(point.t).toFixed(2)}`).join(' ');

  group.append(el('polygon', { points: polygonPoints, class: 'fan-fill' }));
  fan.lines.forEach((line) => {
    group.append(el('path', { d: pathFor(line.points, scale), class: 'fan-line' }));
  });
  const labelPoint = fan.lines[2].points[1];
  group.append(el('text', {
    x: scale.x(labelPoint.x) - 12,
    y: scale.t(labelPoint.t) - 10,
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
    x: scale.x(labelPoint.x) - 8,
    y: scale.t(labelPoint.t) - 8,
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

function stateValues(data, ratios) {
  return {
    pressure: data.P1 * ratios.p,
    temperature: data.T1 * ratios.t,
    density: data.rho1 * ratios.rho,
  };
}

function sampleHistoryAtSensor(data, location) {
  const maxTime = data.tLimitMs / 1000;
  const reflectedSpeed = data.endType === 'closed' ? data.refShock : data.refExpansion;
  const times = new Set([0, maxTime]);

  if (location >= 0) {
    times.add(clamp(location / data.Ws, 0, maxTime));
    times.add(clamp(location / data.Uc, 0, maxTime));
    times.add(clamp((data.L1 / data.Ws) + ((data.L1 - location) / reflectedSpeed), 0, maxTime));
  } else {
    const headTime = Math.abs(location) / data.expHead;
    const tailTime = Math.abs(location) / data.expTail;
    times.add(clamp(Math.min(headTime, tailTime), 0, maxTime));
    times.add(clamp(Math.max(headTime, tailTime), 0, maxTime));
  }

  const sortedTimes = [...times].sort((a, b) => a - b);
  return sortedTimes.map((time) => ({ t: time, ...propertiesAt(data, location, time) }));
}

function propertiesAt(data, location, time) {
  const state1 = stateValues(data, { p: 1, t: 1, rho: 1 });
  const state2 = stateValues(data, { p: data.p2Ratio, t: data.t2Ratio, rho: data.rho2Ratio });
  const state3 = stateValues(data, { p: data.p3Ratio, t: data.t3Ratio, rho: data.rho3Ratio });
  const stateR = stateValues(data, { p: data.pRefRatio, t: data.tRefRatio, rho: data.rhoRefRatio });

  if (location >= 0) {
    const tShock = location / data.Ws;
    const tContact = location / data.Uc;
    const reflectedSpeed = data.endType === 'closed' ? data.refShock : data.refExpansion;
    const tReflected = (data.L1 / data.Ws) + ((data.L1 - location) / reflectedSpeed);

    if (time >= tReflected) return stateR;
    if (time >= tContact) return state3;
    if (time >= tShock) return state2;
    return state1;
  }

  const headTime = Math.abs(location) / data.expHead;
  const tailTime = Math.abs(location) / data.expTail;
  const fanStart = Math.min(headTime, tailTime);
  const fanEnd = Math.max(headTime, tailTime);
  if (time <= fanStart) return state1;
  if (time >= fanEnd) return state3;

  const fraction = (time - fanStart) / (fanEnd - fanStart || 1);
  return {
    pressure: state1.pressure + fraction * (state3.pressure - state1.pressure),
    temperature: state1.temperature + fraction * (state3.temperature - state1.temperature),
    density: state1.density + fraction * (state3.density - state1.density),
  };
}

function stepPath(points, property, xScale, yScale) {
  if (points.length === 0) return '';
  let path = `M ${xScale(points[0].t).toFixed(2)} ${yScale(points[0][property]).toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    path += ` L ${xScale(point.t).toFixed(2)} ${yScale(previous[property]).toFixed(2)}`;
    path += ` L ${xScale(point.t).toFixed(2)} ${yScale(point[property]).toFixed(2)}`;
  }
  return path;
}

function drawHistoryPlot(targetSvg, histories, property, title, unit, data) {
  const width = 900;
  const height = 360;
  const margin = { top: 42, right: 120, bottom: 58, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allValues = histories.flatMap((history) => history.points.map((point) => point[property]));
  if (allValues.length === 0) allValues.push(0, 1);
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 1);
  const padding = (maxValue - minValue || 1) * 0.08;
  const yMin = Math.max(0, minValue - padding);
  const yMax = maxValue + padding;
  const xScale = (seconds) => margin.left + (seconds / (data.tLimitMs / 1000)) * plotWidth;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  targetSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  targetSvg.innerHTML = '';
  targetSvg.append(el('title', {}, `${title} versus time`));
  targetSvg.append(el('desc', {}, `${title} plotted against time for selected sensor locations.`));

  for (let i = 0; i <= 5; i += 1) {
    const time = (i / 5) * (data.tLimitMs / 1000);
    const x = xScale(time);
    targetSvg.append(el('line', { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, class: 'grid-line' }));
    targetSvg.append(el('text', { x, y: height - margin.bottom + 22, 'text-anchor': 'middle', class: 'tick-label' }, (time * 1000).toFixed(1)));
  }
  for (let i = 0; i <= 5; i += 1) {
    const value = yMin + (i / 5) * (yMax - yMin);
    const y = yScale(value);
    targetSvg.append(el('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: 'grid-line' }));
    targetSvg.append(el('text', { x: margin.left - 10, y: y + 4, 'text-anchor': 'end', class: 'tick-label' }, value.toFixed(property === 'density' ? 2 : 1)));
  }

  targetSvg.append(el('line', { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: 'axis-line' }));
  targetSvg.append(el('line', { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: 'axis-line' }));
  targetSvg.append(el('text', { x: width / 2, y: 24, 'text-anchor': 'middle', class: 'axis-label' }, title));
  targetSvg.append(el('text', { x: width / 2, y: height - 16, 'text-anchor': 'middle', class: 'axis-label' }, 'time, t (ms) →'));
  targetSvg.append(el('text', { x: 23, y: height / 2, transform: `rotate(-90 23 ${height / 2})`, 'text-anchor': 'middle', class: 'axis-label' }, `${unit} ↑`));

  histories.forEach((history, index) => {
    const color = SENSOR_COLORS[index % SENSOR_COLORS.length];
    targetSvg.append(el('path', { d: stepPath(history.points, property, xScale, yScale), stroke: color, class: 'history-line' }));
    const legendY = margin.top + 20 + index * 22;
    targetSvg.append(el('line', { x1: width - margin.right + 18, y1: legendY - 4, x2: width - margin.right + 46, y2: legendY - 4, stroke: color, class: 'history-line' }));
    targetSvg.append(el('text', { x: width - margin.right + 54, y: legendY, class: 'tick-label' }, `x=${history.location} m`));
  });
}

function renderHistories(data) {
  const locations = data.sensorLocations.filter((location) => location >= -data.L4 && location <= data.L1);
  const histories = locations.map((location) => ({
    location,
    points: sampleHistoryAtSensor(data, location),
  }));

  historySummary.textContent = histories.length > 0
    ? `Plotting ${histories.length} sensor location${histories.length === 1 ? '' : 's'} versus time. Step changes occur when waves cross each sensor.`
    : 'Add valid sensor locations inside the tube to draw pressure, temperature, and density histories.';

  drawHistoryPlot(historyPlots.pressure, histories, 'pressure', 'Pressure history', 'P (kPa)', data);
  drawHistoryPlot(historyPlots.temperature, histories, 'temperature', 'Temperature history', 'T (K)', data);
  drawHistoryPlot(historyPlots.density, histories, 'density', 'Density history', 'ρ (kg/m³)', data);
}

function downloadHistorySvg() {
  Object.entries(historyPlots).forEach(([name, plot]) => {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(plot);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shock-tube-${name}-history.svg`;
    link.click();
    URL.revokeObjectURL(url);
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
  svg.innerHTML = '<title id="diagramTitle">Shock tube x-t diagram</title><desc id="diagramDesc">Position is plotted on the horizontal axis increasing rightward and time is plotted on the vertical axis increasing upward.</desc>';

  const events = buildEvents(data);
  const scale = scaleFactory(events, width, height, margin);

  svg.append(drawAxes(scale, width, height, margin, events));
  svg.append(drawSensorMarkers(data, scale, height, margin));
  svg.append(drawFan(events.fan, scale));
  events.waves.forEach((wave) => svg.append(drawWave(wave, scale)));

  updateLegend([
    { name: 'Incident shock', color: COLORS.shock },
    { name: 'Contact surface', color: COLORS.contact },
    { name: 'Expansion fan', color: COLORS.expansion },
    events.waves[2],
  ]);
  renderHistories(data);
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
historyDownloadButton.addEventListener('click', downloadHistorySvg);
render();
