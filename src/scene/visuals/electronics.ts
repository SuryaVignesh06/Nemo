/** Deterministic ink geometry for embedded-system and circuit lessons. */

import type { InkStroke, SceneNode, Vec2 } from '../../../shared/contracts.ts';
import {
  arrowStrokes,
  circleStrokes,
  lineStrokes,
  polylineStrokes,
  rectStrokes,
  textToStrokes,
  translateStrokes,
} from '../../handwriting/strokes.ts';

export interface VisualGeometry {
  type: SceneNode['type'];
  strokes: InkStroke[];
  color: string;
  anchors?: Record<string, Vec2>;
  state?: Record<string, string | number | boolean>;
}

const CHALK = '#f4f1e8';
const BLUE = '#79b8ff';
const AMBER = '#ffc861';
const GREEN = '#8ce39b';
const RED = '#ff8f8f';
const CYAN = '#6fe3e1';

function textAt(
  text: string,
  size: number,
  x: number,
  y: number,
  seed: string,
  color = CHALK
): InkStroke[] {
  return translateStrokes(
    textToStrokes(text, size, seed, { color, width: Math.max(1.5, size * 0.075) }).strokes,
    x,
    y
  );
}

function esp32(seed: string): VisualGeometry {
  const strokes: InkStroke[] = [];
  strokes.push(...rectStrokes(0, 0, 430, 260, `${seed}:board`, { color: BLUE, width: 3 }));
  strokes.push(...textAt('ESP32', 34, 145, 18, `${seed}:title`, BLUE));

  // The board is semantic, not a labelled rectangle: expose CPU/radio, USB,
  // pin headers, power, and named attachment points used by later actions.
  strokes.push(...rectStrokes(128, 78, 176, 108, `${seed}:chip`, { color: CYAN, width: 2.4 }));
  strokes.push(...textAt('CPU + WiFi', 22, 151, 101, `${seed}:cpu`, CYAN));
  strokes.push(...textAt('BLE', 19, 192, 143, `${seed}:ble`, CYAN));
  strokes.push(...rectStrokes(173, 222, 84, 28, `${seed}:usb`, { color: CHALK, width: 2 }));
  strokes.push(...textAt('USB', 15, 193, 226, `${seed}:usb-label`));

  const anchors: Record<string, Vec2> = {};
  const pins = ['3V3', 'GPIO2', 'GPIO4', 'GPIO18', 'GPIO21', 'GND'];
  pins.forEach((name, index) => {
    const y = 48 + index * 32;
    const left = index % 2 === 0;
    const x0 = left ? 0 : 430;
    const x1 = left ? 22 : 408;
    strokes.push(...lineStrokes(x0, y, x1, y, `${seed}:pin:${name}`, { color: AMBER, width: 2.5 }));
    strokes.push(...textAt(name, 13, left ? 28 : 337, y - 8, `${seed}:pin-label:${name}`, AMBER));
    anchors[name] = { x: x0, y };
  });

  return {
    type: 'microcontroller',
    strokes,
    color: BLUE,
    anchors,
    state: { family: 'ESP32', gpio2: 'LOW' },
  };
}

function gpio(pinName: string, seed: string): VisualGeometry {
  const strokes = [
    ...circleStrokes(15, 15, 12, `${seed}:pin`, { color: AMBER, width: 2.6 }),
    ...textAt(pinName, 15, 34, 5, `${seed}:label`, AMBER),
  ];
  return {
    type: 'component',
    strokes,
    color: AMBER,
    anchors: { terminal: { x: 15, y: 15 }, right: { x: 98, y: 15 } },
    state: { pin: pinName, level: 'LOW' },
  };
}

function resistor(label: string, seed: string): VisualGeometry {
  const points: Array<[number, number]> = [
    [0, 35], [24, 35], [36, 15], [54, 55], [72, 15], [90, 55],
    [108, 15], [126, 55], [138, 35], [162, 35],
  ];
  return {
    type: 'component',
    strokes: [
      ...polylineStrokes(points, `${seed}:zigzag`, { color: AMBER, width: 3 }),
      ...textAt(label, 18, 55, 64, `${seed}:label`, AMBER),
    ],
    color: AMBER,
    anchors: { left: { x: 0, y: 35 }, right: { x: 162, y: 35 } },
    state: { component: 'resistor', value: label },
  };
}

function led(label: string, seed: string): VisualGeometry {
  const strokes: InkStroke[] = [
    ...circleStrokes(48, 45, 34, `${seed}:bulb`, { color: RED, width: 3 }),
    ...lineStrokes(14, 45, 0, 45, `${seed}:left-lead`, { color: CHALK, width: 2.4 }),
    ...lineStrokes(82, 45, 96, 45, `${seed}:right-lead`, { color: CHALK, width: 2.4 }),
    ...polylineStrokes([[33, 26], [33, 64], [65, 45], [33, 26]], `${seed}:diode`, { color: RED, width: 2.4 }),
    ...lineStrokes(68, 25, 68, 65, `${seed}:bar`, { color: RED, width: 2.4 }),
    ...arrowStrokes({ x: 59, y: 17 }, { x: 82, y: 0 }, `${seed}:ray1`, { color: AMBER, width: 2 }, 7),
    ...arrowStrokes({ x: 70, y: 24 }, { x: 94, y: 8 }, `${seed}:ray2`, { color: AMBER, width: 2 }, 7),
    ...textAt(label, 18, 31, 88, `${seed}:label`, RED),
  ];
  return {
    type: 'component',
    strokes,
    color: RED,
    anchors: { anode: { x: 0, y: 45 }, cathode: { x: 96, y: 45 } },
    state: { component: 'LED', power: 'OFF' },
  };
}

function ground(seed: string): VisualGeometry {
  return {
    type: 'component',
    strokes: [
      ...lineStrokes(45, 0, 45, 22, `${seed}:stem`, { color: CHALK, width: 2.5 }),
      ...lineStrokes(10, 22, 80, 22, `${seed}:g1`, { color: CHALK, width: 2.5 }),
      ...lineStrokes(20, 34, 70, 34, `${seed}:g2`, { color: CHALK, width: 2.5 }),
      ...lineStrokes(31, 46, 59, 46, `${seed}:g3`, { color: CHALK, width: 2.5 }),
      ...textAt('GND', 17, 27, 56, `${seed}:label`),
    ],
    color: CHALK,
    anchors: { top: { x: 45, y: 0 } },
    state: { component: 'ground' },
  };
}

function codeBlock(code: string, language: string, seed: string): VisualGeometry {
  const lines = code.split(/\r?\n/).slice(0, 8);
  const width = 500;
  const lineHeight = 28;
  const height = 48 + lines.length * lineHeight;
  const strokes: InkStroke[] = [
    ...rectStrokes(0, 0, width, height, `${seed}:frame`, { color: BLUE, width: 2.2 }),
    ...textAt(language.toUpperCase(), 14, 16, 10, `${seed}:language`, BLUE),
    ...lineStrokes(0, 38, width, 38, `${seed}:divider`, { color: BLUE, width: 1.4, opacity: 0.6 }),
  ];
  const anchors: Record<string, Vec2> = {};
  lines.forEach((line, index) => {
    const y = 48 + index * lineHeight;
    strokes.push(...textAt(`${index + 1}  ${line}`, 17, 15, y, `${seed}:line:${index}`, CHALK));
    anchors[`line${index + 1}`] = { x: width / 2, y: y + 9 };
  });
  return { type: 'code', strokes, color: BLUE, anchors, state: { language, lines: lines.length } };
}

export function electronicsGeometry(
  type: string,
  parameters: Record<string, unknown>,
  seed: string
): VisualGeometry | null {
  const value = (key: string, fallback: string) =>
    typeof parameters[key] === 'string' && parameters[key] ? String(parameters[key]) : fallback;
  switch (type) {
    case 'CREATE_ESP32':
      return esp32(seed);
    case 'CREATE_GPIO':
      return gpio(value('pin', 'GPIO2'), seed);
    case 'CREATE_RESISTOR':
      return resistor(value('label', value('value', '220 ohm')), seed);
    case 'CREATE_LED':
      return led(value('label', 'LED'), seed);
    case 'CREATE_GROUND':
      return ground(seed);
    case 'CREATE_CODE_BLOCK':
      return codeBlock(value('code', 'digitalWrite(LED_PIN, HIGH);'), value('language', 'cpp'), seed);
    default:
      return null;
  }
}

export function currentMarker(from: Vec2, to: Vec2, seed: string): InkStroke[] {
  return arrowStrokes(from, to, seed, { color: GREEN, width: 4 }, 12);
}
