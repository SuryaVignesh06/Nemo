/**
 * NEMO — deterministic linear equation solver.
 *
 * The model is never the authority on arithmetic. When the learner's input is a
 * solvable equation, this module parses it, solves it, and produces the exact
 * step sequence the lesson will draw. The model may narrate those steps but may
 * not invent them.
 *
 * Supports one variable and linear structure: coefficients, constants,
 * parentheses, unary minus, multiplication and division by numbers.
 *   2x + 5 = 17        ->  x = 6
 *   3(x - 2) = 9       ->  x = 5
 *   x/2 + 3 = 8        ->  x = 10
 */

import type { Solution, SolutionStep } from './contracts.ts';

/** A linear form: coef * x + constant. */
interface Linear {
  coef: number;
  constant: number;
}

class ParseError extends Error {}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isAlpha = (c: string) => /[a-zA-Z]/.test(c);

interface Token {
  kind: 'num' | 'var' | 'op' | 'lparen' | 'rparen';
  value: string;
}

function tokenize(input: string, variable: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, '');
  while (i < s.length) {
    const c = s[i];
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
      tokens.push({ kind: 'num', value: s.slice(i, j) });
      i = j;
    } else if (isAlpha(c)) {
      if (c !== variable) throw new ParseError(`unexpected symbol "${c}"`);
      tokens.push({ kind: 'var', value: c });
      i++;
    } else if ('+-*/'.includes(c)) {
      tokens.push({ kind: 'op', value: c });
      i++;
    } else if (c === '(') {
      tokens.push({ kind: 'lparen', value: c });
      i++;
    } else if (c === ')') {
      tokens.push({ kind: 'rparen', value: c });
      i++;
    } else {
      throw new ParseError(`unexpected character "${c}"`);
    }
  }
  return tokens;
}

/** Insert the implicit multiplication in 2x, 3(x+1), (x+1)(2) is rejected later. */
function insertImplicitMul(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = out[out.length - 1];
    if (
      prev &&
      (prev.kind === 'num' || prev.kind === 'var' || prev.kind === 'rparen') &&
      (t.kind === 'num' || t.kind === 'var' || t.kind === 'lparen')
    ) {
      out.push({ kind: 'op', value: '*' });
    }
    out.push(t);
  }
  return out;
}

const add = (a: Linear, b: Linear): Linear => ({
  coef: a.coef + b.coef,
  constant: a.constant + b.constant,
});
const sub = (a: Linear, b: Linear): Linear => ({
  coef: a.coef - b.coef,
  constant: a.constant - b.constant,
});

function mul(a: Linear, b: Linear): Linear {
  if (a.coef !== 0 && b.coef !== 0) {
    throw new ParseError('equation is not linear (variable multiplied by variable)');
  }
  if (b.coef === 0) return { coef: a.coef * b.constant, constant: a.constant * b.constant };
  return { coef: b.coef * a.constant, constant: a.constant * b.constant };
}

function div(a: Linear, b: Linear): Linear {
  if (b.coef !== 0) throw new ParseError('cannot divide by an expression containing the variable');
  if (b.constant === 0) throw new ParseError('division by zero');
  return { coef: a.coef / b.constant, constant: a.constant / b.constant };
}

/** Recursive-descent parser producing a linear form. */
function parseLinear(tokens: Token[]): Linear {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function expr(): Linear {
    let left = term();
    while (peek()?.kind === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = eat().value;
      const right = term();
      left = op === '+' ? add(left, right) : sub(left, right);
    }
    return left;
  }

  function term(): Linear {
    let left = unary();
    while (peek()?.kind === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = eat().value;
      const right = unary();
      left = op === '*' ? mul(left, right) : div(left, right);
    }
    return left;
  }

  function unary(): Linear {
    if (peek()?.kind === 'op' && (peek().value === '-' || peek().value === '+')) {
      const op = eat().value;
      const v = unary();
      return op === '-' ? { coef: -v.coef, constant: -v.constant } : v;
    }
    return atom();
  }

  function atom(): Linear {
    const t = peek();
    if (!t) throw new ParseError('unexpected end of expression');
    if (t.kind === 'num') {
      eat();
      return { coef: 0, constant: Number(t.value) };
    }
    if (t.kind === 'var') {
      eat();
      return { coef: 1, constant: 0 };
    }
    if (t.kind === 'lparen') {
      eat();
      const v = expr();
      if (peek()?.kind !== 'rparen') throw new ParseError('missing closing parenthesis');
      eat();
      return v;
    }
    throw new ParseError(`unexpected token "${t.value}"`);
  }

  const result = expr();
  if (pos !== tokens.length) throw new ParseError('trailing characters in expression');
  return result;
}

/** Format a number the way a teacher would write it. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 1e9) / 1e9;
  if (Number.isInteger(rounded)) return String(rounded);
  // Prefer a small exact fraction over a long decimal.
  for (let d = 2; d <= 24; d++) {
    const num = rounded * d;
    if (Math.abs(num - Math.round(num)) < 1e-9) return `${Math.round(num)}/${d}`;
  }
  return String(Math.round(rounded * 1e4) / 1e4);
}

/** Render "2x + 5" from a linear form. */
function renderSide(l: Linear, variable: string): string {
  const parts: string[] = [];
  if (l.coef !== 0) {
    if (l.coef === 1) parts.push(variable);
    else if (l.coef === -1) parts.push(`-${variable}`);
    else parts.push(`${fmt(l.coef)}${variable}`);
  }
  if (l.constant !== 0 || parts.length === 0) {
    if (parts.length === 0) parts.push(fmt(l.constant));
    else parts.push(l.constant > 0 ? `+ ${fmt(l.constant)}` : `- ${fmt(Math.abs(l.constant))}`);
  }
  return parts.join(' ');
}

/** Detect whether raw learner input looks like an equation we should solve. */
export function looksLikeEquation(input: string): boolean {
  const s = input.trim();
  if (!s.includes('=')) return false;
  if (s.split('=').length !== 2) return false;
  // Reject prose that merely contains '=' ("what does E = mc^2 mean").
  if (/\b(explain|what|why|how|describe|tell|mean)\b/i.test(s)) return false;
  return /[0-9]/.test(s) && /[a-zA-Z]/.test(s);
}

function detectVariable(s: string): string {
  const letters = s.match(/[a-zA-Z]/g) ?? [];
  const unique = Array.from(new Set(letters));
  if (unique.length === 0) throw new ParseError('no variable found');
  if (unique.length > 1) {
    throw new ParseError(`expected one variable, found ${unique.join(', ')}`);
  }
  return unique[0];
}

/**
 * Solve a linear equation and return the exact teaching steps.
 * Throws with a readable message when the input is not a solvable linear
 * equation — the caller reports that rather than guessing.
 */
export function solveEquation(input: string): Solution {
  const raw = input.trim().replace(/[·×]/g, '*').replace(/÷/g, '/');
  const sides = raw.split('=');
  if (sides.length !== 2) throw new ParseError('an equation needs exactly one "=" sign');

  const variable = detectVariable(raw);
  const left = parseLinear(insertImplicitMul(tokenize(sides[0], variable)));
  const right = parseLinear(insertImplicitMul(tokenize(sides[1], variable)));

  const steps: SolutionStep[] = [];
  let L = left;
  let R = right;
  let n = 0;

  const original = `${renderSide(L, variable)} = ${renderSide(R, variable)}`;

  // 1. Collect variable terms on the left.
  if (R.coef !== 0) {
    const amount = R.coef;
    const opText =
      amount > 0
        ? `subtract ${fmt(amount)}${variable} from both sides`
        : `add ${fmt(Math.abs(amount))}${variable} to both sides`;
    L = { coef: L.coef - amount, constant: L.constant };
    R = { coef: 0, constant: R.constant };
    steps.push({
      step: ++n,
      operation: opText,
      result: `${renderSide(L, variable)} = ${renderSide(R, variable)}`,
      reason: `Move every ${variable} term to the left so the variable lives on one side.`,
    });
  }

  // 2. Move constants to the right.
  if (L.constant !== 0) {
    const amount = L.constant;
    const opText =
      amount > 0
        ? `subtract ${fmt(amount)} from both sides`
        : `add ${fmt(Math.abs(amount))} to both sides`;
    R = { coef: R.coef, constant: R.constant - amount };
    L = { coef: L.coef, constant: 0 };
    steps.push({
      step: ++n,
      operation: opText,
      result: `${renderSide(L, variable)} = ${renderSide(R, variable)}`,
      reason: 'Whatever we do to one side we do to the other, so the equation stays balanced.',
    });
  }

  // 3. Divide by the coefficient.
  if (L.coef === 0) {
    if (R.constant === 0) {
      return {
        original,
        steps,
        finalAnswer: `${variable} can be any number (the equation is always true)`,
        verified: true,
      };
    }
    throw new ParseError('this equation has no solution');
  }

  let finalAnswer: string;
  if (L.coef !== 1) {
    const c = L.coef;
    const value = R.constant / c;
    steps.push({
      step: ++n,
      operation: `divide both sides by ${fmt(c)}`,
      result: `${variable} = ${fmt(value)}`,
      reason: `Dividing by the coefficient ${fmt(c)} leaves ${variable} on its own.`,
    });
    finalAnswer = `${variable} = ${fmt(value)}`;
    R = { coef: 0, constant: value };
  } else {
    finalAnswer = `${variable} = ${fmt(R.constant)}`;
    if (steps.length === 0) {
      steps.push({
        step: ++n,
        operation: 'the equation is already solved',
        result: finalAnswer,
        reason: `${variable} is already isolated.`,
      });
    }
  }

  // Verify by substituting back into the original parsed forms.
  const value = R.constant;
  const lhs = left.coef * value + left.constant;
  const rhs = right.coef * value + right.constant;
  const verified = Math.abs(lhs - rhs) < 1e-9;

  return { original, steps, finalAnswer, verified };
}

export { ParseError };
