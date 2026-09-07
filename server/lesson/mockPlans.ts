/**
 * NEMO — deterministic offline lesson plans (Demo Mode).
 *
 * These exist so the demo survives a dead network. They are selected ONLY when
 * the provider is explicitly set to "mock": a live provider that fails reports
 * its failure, it never silently falls back to one of these
 * (registry: REJECT_UNRELATED_FALLBACK).
 *
 * The equation plan is generated from the deterministic solver, so demo mode
 * solves whatever linear equation the learner types, not just the scripted one.
 */

import type { LessonPlan, Solution, TeachingBeat, VisualAction } from '../../shared/contracts.ts';
import { LessonError } from '../../shared/contracts.ts';
import { solveEquation, looksLikeEquation } from '../../shared/solver.ts';

let seq = 0;
const aid = () => `a${++seq}`;

function action(
  beatId: string,
  type: string,
  semanticRole: string,
  parameters: Record<string, unknown>,
  extra: Partial<VisualAction> = {}
): VisualAction {
  return {
    actionId: aid(),
    beatId,
    type,
    semanticRole,
    parameters,
    priority: 'SECONDARY',
    relations: [],
    timing: { pace: 'normal' },
    completionCriteria: ['action_visible'],
    ...extra,
  };
}

function beat(
  beatId: string,
  order: number,
  objective: string,
  explanation: string,
  narration: string,
  visualActions: VisualAction[]
): TeachingBeat {
  return {
    beatId,
    order,
    objective,
    explanation,
    narration,
    visualActions,
    completionCriteria: ['beat_visuals_complete'],
  };
}

const below = (target: string, gap: 'tight' | 'normal' | 'loose' = 'normal') => [
  { type: 'BELOW', target, gap },
];

/* ------------------------------------------------------- binary search */

export function binarySearchPlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const values = [3, 7, 10, 14, 18, 21, 27];
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce binary search',
      'Write the title and core idea.',
      'Binary search is a fast way to find something inside a sorted list. Instead of checking every item one by one, we repeatedly look at the middle of the remaining search range and throw away the half that cannot contain the answer.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Binary Search' }, {
          target: 'title',
          priority: 'PRIMARY',
        }),
        action(
          'beat-1',
          'WRITE_SUBTITLE',
          'core_idea',
          { text: 'Halve the search space every step' },
          { target: 'subtitle', relations: below('title', 'tight') }
        ),
        action(
          'beat-1',
          'CREATE_FLOWCHART',
          'binary_search_overview',
          {
            direction: 'LR',
            nodes: [
              { id: 'start', label: 'Start' },
              { id: 'midpoint', label: 'Calculate midpoint' },
              { id: 'compare', label: 'Compare target' },
              { id: 'found', label: 'Found' },
              { id: 'left', label: 'Search left half' },
              { id: 'right', label: 'Search right half' },
            ],
            edges: [
              { from: 'start', to: 'midpoint' },
              { from: 'midpoint', to: 'compare' },
              { from: 'compare', to: 'found', label: 'equal' },
              { from: 'compare', to: 'left', label: 'smaller' },
              { from: 'compare', to: 'right', label: 'larger' },
            ],
          },
          { target: 'binary-search-flow', relations: below('subtitle', 'normal'), priority: 'PRIMARY' }
        ),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Establish the sorted-data requirement',
      'State the precondition before showing the data.',
      'There is one important requirement. The data must already be sorted. Here, the numbers go from smallest to largest, so we can safely reason about which half of the array might contain our target.',
      [
        action(
          'beat-2',
          'DRAW_TEXT',
          'precondition',
          { text: 'Requires: the list is sorted' },
          { target: 'precondition', relations: below('binary-search-flow', 'loose') }
        ),
        action('beat-2', 'UNDERLINE_TEXT', 'emphasise_precondition', {}, {
          target: 'precondition',
        }),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Draw the sorted array and the target',
      'Draw the seven-element array and state the target.',
      'Here is our sorted list of seven numbers. We are searching for eighteen.',
      [
        action('beat-3', 'DRAW_ARRAY', 'search_space', { values }, {
          target: 'array',
          priority: 'PRIMARY',
          timing: { pace: 'deliberate' },
        }),
        action(
          'beat-3',
          'WRITE_LABEL',
          'search_target',
          { text: 'Target = 18', color: 'amber' },
          { target: 'target-label', relations: [{ type: 'ABOVE', target: 'array', gap: 'loose' }] }
        ),
        action('beat-3', 'CAMERA_FIT', 'frame_board', {}, { target: 'array' }),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Mark the initial search bounds',
      'Place low pointer at index 0 and high pointer at index 6.',
      'At the beginning, our low pointer is at the first element and our high pointer is at the last element.',
      [
        action('beat-4', 'MARK_LOW', 'low_pointer', { array: 'array', index: 0 }, {
          target: 'low-1',
        }),
        action('beat-4', 'MARK_HIGH', 'high_pointer', { array: 'array', index: 6 }, {
          target: 'high-1',
        }),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Compute the first midpoint',
      'Show midpoint formula and mark index 3 (value 14).',
      'The midpoint is low plus high divided by two. Zero plus six over two is three, which holds fourteen.',
      [
        action(
          'beat-5',
          'WRITE_EQUATION',
          'midpoint_formula_1',
          { expression: 'mid = (0 + 6) / 2 = 3' },
          { target: 'mid-calc-1', relations: below('array', 'loose'), priority: 'PRIMARY' }
        ),
        action('beat-5', 'MARK_MIDPOINT', 'mid_pointer_1', { array: 'array', index: 3 }, {
          target: 'mid-1',
          timing: { pace: 'deliberate' },
        }),
      ]
    ),
    beat(
      'beat-6',
      6,
      'First comparison: 18 > 14, discard left half',
      'Compare 18 > 14, discard range 0 to 3, move low to index 4.',
      'Eighteen is larger than fourteen, so the target cannot be in the left half. We discard everything up to index three and move low to index four.',
      [
        action(
          'beat-6',
          'WRITE_EQUATION',
          'first_comparison',
          { expression: '18 > 14  (discard left half)', color: 'amber' },
          { target: 'cmp-1', relations: below('mid-calc-1', 'tight'), priority: 'PRIMARY' }
        ),
        action(
          'beat-6',
          'HIGHLIGHT_ARRAY_RANGE',
          'discarded_left_1',
          { array: 'array', low: 0, high: 3, mode: 'discard' },
          { target: 'discard-1', timing: { pace: 'deliberate' } }
        ),
        action('beat-6', 'MARK_LOW', 'low_pointer_2', { array: 'array', index: 4 }, {
          target: 'low-2',
        }),
      ]
    ),
    beat(
      'beat-7',
      7,
      'Second iteration: mid index 5 (21), compare 18 < 21 and discard right half',
      'Compute mid index 5, compare 18 < 21, discard 5 to 6, move high to index 4.',
      'Now the search range is index four to six. The new midpoint is index five, which holds twenty-one. Eighteen is smaller than twenty-one, so this time we discard the right half and move high down to index four.',
      [
        action(
          'beat-7',
          'WRITE_EQUATION',
          'midpoint_formula_2',
          { expression: 'mid = (4 + 6) / 2 = 5' },
          { target: 'mid-calc-2', relations: below('cmp-1', 'tight'), priority: 'PRIMARY' }
        ),
        action('beat-7', 'MARK_MIDPOINT', 'mid_pointer_2', { array: 'array', index: 5 }, {
          target: 'mid-2',
        }),
        action(
          'beat-7',
          'WRITE_EQUATION',
          'second_comparison',
          { expression: '18 < 21  (discard right half)', color: 'amber' },
          { target: 'cmp-2', relations: below('mid-calc-2', 'tight') }
        ),
        action(
          'beat-7',
          'HIGHLIGHT_ARRAY_RANGE',
          'discarded_right_1',
          { array: 'array', low: 5, high: 6, mode: 'discard' },
          { target: 'discard-2' }
        ),
        action('beat-7', 'MARK_HIGH', 'high_pointer_2', { array: 'array', index: 4 }, {
          target: 'high-2',
        }),
      ]
    ),
    beat(
      'beat-8',
      8,
      'Third iteration finds target 18 at index 4',
      'Low and high meet at index 4 (18). Target found.',
      'Low and high have met at index four. The midpoint is index four, and that cell holds eighteen. Found it.',
      [
        action(
          'beat-8',
          'WRITE_EQUATION',
          'midpoint_formula_3',
          { expression: 'mid = (4 + 4) / 2 = 4' },
          { target: 'mid-calc-3', relations: below('cmp-2', 'tight'), priority: 'PRIMARY' }
        ),
        action(
          'beat-8',
          'HIGHLIGHT_ARRAY_RANGE',
          'found_cell',
          { array: 'array', low: 4, high: 4, mode: 'keep' },
          { target: 'found', timing: { pace: 'deliberate' } }
        ),
        action(
          'beat-8',
          'SHOW_FINAL_ANSWER',
          'search_result',
          { answer: 'Found 18 at index 4' },
          { target: 'result', relations: below('mid-calc-3'), priority: 'PRIMARY' }
        ),
        action('beat-8', 'CAMERA_FOCUS', 'focus_result', {}, { target: 'result' }),
      ]
    ),
    beat(
      'beat-9',
      9,
      'Explain logarithmic complexity O(log n)',
      'Show halving chain n -> n/2 -> n/4 -> 1 and time complexity O(log n).',
      'Each step threw away about half the remaining elements. Seven elements became three, then one. The number of steps grows logarithmically with list size, so the time complexity of binary search is O of log n.',
      [
        action(
          'beat-9',
          'DRAW_TEXT',
          'halving_chain',
          { text: 'n  ->  n / 2  ->  n / 4  ->  1' },
          { target: 'halving', relations: below('result', 'loose'), priority: 'PRIMARY' }
        ),
        action(
          'beat-9',
          'WRITE_FORMULA',
          'complexity',
          { expression: 'Time Complexity = O(log n)' },
          { target: 'complexity', relations: below('halving') }
        ),
        action('beat-9', 'CIRCLE_TERM', 'emphasise_complexity', {}, { target: 'complexity' }),
      ]
    ),
    beat(
      'beat-10',
      10,
      'Summarise binary search takeaways',
      'List key steps.',
      'Remember the five steps: start with sorted data, check the middle, compare the target, discard the impossible half, and repeat until found.',
      [
        action(
          'beat-10',
          'SUMMARIZE',
          'lesson_summary',
          { text: '1. Sorted data  2. Check middle  3. Compare  4. Discard half  5. Repeat.' },
          { target: 'summary', relations: below('complexity', 'loose'), priority: 'PRIMARY' }
        ),
        action('beat-10', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-10', 'SECTION_END', 'end_of_lesson', { sectionId: 'binary-search' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'computer_science',
    answer:
      'Binary search repeatedly halves a sorted range: compare the target with the middle element, discard the half that cannot contain it, and repeat. Searching [3, 7, 10, 14, 18, 21, 27] for 18 finds it at index 4 in three comparisons. It runs in O(log n) time.',
    objective: 'Understand how binary search works and why it costs O(log n).',
    finalSummary: 'Sort the data, check the middle, discard the impossible half, repeat.',
    comprehensionCheck: {
      question: 'What would happen if the array was not sorted before running binary search for a target value?',
      options: [
        { id: 'a', label: 'It would still find the target, but take O(n) linear time.' },
        { id: 'b', label: 'Discarding half could permanently eliminate the target, causing an incorrect "not found" result.' },
        { id: 'c', label: 'The midpoint calculation would cause an out-of-bounds array indexing exception.' },
        { id: 'd', label: 'The algorithm would loop indefinitely between the low and high pointers.' },
      ],
      correctOptionId: 'b',
      rationale: 'Binary search relies strictly on sorted order to guarantee the target cannot reside in the discarded half; without sorting, the target might be in the discarded segment and never be checked.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- equation */

export function equationPlan(
  lessonId: string,
  requestId: string,
  question: string,
  solution: Solution
): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [];

  beats.push(
    beat(
      'beat-1',
      1,
      'Read the equation',
      'Write the original equation on the board.',
      `We are solving ${speak(solution.original)}. The goal is to get the variable on its own.`,
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Solving an Equation' }, {
          target: 'title',
        }),
        action(
          'beat-1',
          'WRITE_EQUATION',
          'original_equation',
          { expression: solution.original },
          {
            target: 'eq-0',
            priority: 'PRIMARY',
            relations: below('title', 'loose'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-1', 'CAMERA_FIT', 'frame_board', {}, {}),
      ]
    )
  );

  let previousId = 'eq-0';
  solution.steps.forEach((step, i) => {
    const beatId = `beat-${i + 2}`;
    const opId = `op-${i + 1}`;
    const eqId = `eq-${i + 1}`;
    beats.push(
      beat(
        beatId,
        i + 2,
        `Step ${step.step}: ${step.operation}`,
        `Show the operation applied to both sides, then the resulting equation.`,
        `${capitalise(speak(step.operation))}. ${step.reason} That leaves ${speak(step.result)}.`,
        [
          action(
            beatId,
            'WRITE_LABEL',
            'balancing_operation',
            { text: step.operation, color: 'amber' },
            { target: opId, relations: below(previousId, 'tight') }
          ),
          action(
            beatId,
            'WRITE_EQUATION',
            'equation_after_step',
            { expression: step.result },
            {
              target: eqId,
              priority: 'PRIMARY',
              relations: below(opId, 'tight'),
              timing: { pace: 'deliberate' },
            }
          ),
          action(beatId, 'CAMERA_FOCUS', 'follow_current_line', {}, { target: eqId }),
        ]
      )
    );
    previousId = eqId;
  });

  const finalBeatId = `beat-${beats.length + 1}`;
  // The last algebra step usually already writes "x = 6"; do not write it twice.
  const lastStepIsAnswer =
    solution.steps.length > 0 &&
    solution.steps[solution.steps.length - 1].result.replace(/\s+/g, '') ===
      solution.finalAnswer.replace(/\s+/g, '');
  beats.push(
    beat(
      finalBeatId,
      beats.length + 1,
      'Reveal and check the answer',
      'Highlight the solved value and confirm it satisfies the original equation.',
      `So ${speak(solution.finalAnswer)}. Substituting it back into the original equation makes both sides equal, so the answer checks out.`,
      [
        ...(lastStepIsAnswer
          ? []
          : [
              action(
                finalBeatId,
                'SHOW_FINAL_ANSWER',
                'final_answer',
                { answer: solution.finalAnswer },
                {
                  target: 'final-answer',
                  priority: 'PRIMARY',
                  relations: below(previousId, 'normal'),
                  timing: { pace: 'deliberate' },
                }
              ),
            ]),
        action(finalBeatId, 'CIRCLE_TERM', 'emphasise_answer', {}, {
          target: lastStepIsAnswer ? previousId : 'final-answer',
        }),
        action(finalBeatId, 'PULSE', 'pulse_answer', {}, {
          target: lastStepIsAnswer ? previousId : 'final-answer',
        }),
        action(
          finalBeatId,
          'SUMMARIZE',
          'lesson_summary',
          { text: 'Undo each operation, keeping both sides balanced.' },
          { target: 'summary', relations: below('final-answer', 'normal') }
        ),
        action(finalBeatId, 'CAMERA_FIT', 'final_frame', {}, {}),
        action(finalBeatId, 'SECTION_END', 'end_of_lesson', { sectionId: 'equation' }, {}),
      ]
    )
  );

  return {
    lessonId,
    requestId,
    question,
    domain: 'mathematics',
    answer: `${solution.original} gives ${solution.finalAnswer}.`,
    objective: 'Solve the equation by keeping both sides balanced.',
    finalSummary: `${solution.finalAnswer}. Each step undoes one operation, applied to both sides.`,
    comprehensionCheck: {
      question: 'When solving 2x + 5 = 17, why do we subtract 5 from both sides first rather than dividing by 2 first?',
      options: [
        { id: 'a', label: 'Dividing first is mathematically invalid.' },
        { id: 'b', label: 'Subtracting 5 isolates the variable term 2x directly; dividing first would require dividing every single term (yielding x + 2.5 = 8.5).' },
        { id: 'c', label: 'Because addition always takes precedence over division in algebra.' },
      ],
      correctOptionId: 'b',
      rationale: 'Dividing first is allowed but requires dividing all terms: (2x + 5)/2 = 17/2 -> x + 2.5 = 8.5. Subtracting the constant first avoids introducing fractions.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- triangle */

export function trianglePlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce the problem',
      'Title the lesson.',
      'Let us work out why the area of a triangle is one half base times height.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Area of a Triangle' }, {
          target: 'title',
        }),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Draw the triangle',
      'Draw a scalene triangle as the central object.',
      'Here is a triangle. Any triangle will do; nothing here depends on it being special.',
      [
        action(
          'beat-2',
          'DRAW_TRIANGLE',
          'main_triangle',
          { base: 360, height: 240, apex: 0.34 },
          {
            target: 'triangle',
            priority: 'PRIMARY',
            relations: below('title', 'loose'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-2', 'CAMERA_FIT', 'frame_diagram', {}, {}),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Identify the base',
      'Mark the bottom edge as the base and label it b.',
      'Pick one side and call it the base. We will label it b.',
      [
        action(
          'beat-3',
          'DRAW_DIMENSION',
          'base_measure',
          { length: 360, label: 'b', color: 'amber' },
          { target: 'base-dim', relations: [{ type: 'BELOW', target: 'triangle', gap: 'tight' }] }
        ),
        action('beat-3', 'PULSE', 'emphasise_base', {}, { target: 'base-dim' }),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Draw the height',
      'Drop a perpendicular from the apex to the base and label it h.',
      'Now drop a perpendicular from the opposite corner straight down to that base. That distance is the height, h.',
      [
        action(
          'beat-4',
          'DRAW_LINE',
          'height_altitude',
          { from: 'apex', to: 'footOfHeight', color: 'blue' },
          {
            target: 'height',
            priority: 'PRIMARY',
            relations: [{ type: 'INSIDE', target: 'triangle', gap: 'tight' }],
            timing: { pace: 'deliberate' },
          }
        ),
        action(
          'beat-4',
          'WRITE_LABEL',
          'height_label',
          { text: 'h', color: 'blue' },
          { target: 'label-h', relations: [{ type: 'RIGHT_OF', target: 'height', gap: 'tight' }] }
        ),
        action('beat-4', 'DRAW_RIGHT_ANGLE', 'perpendicular_mark', { size: 18 }, {
          target: 'right-angle',
          relations: [{ type: 'ANCHOR_TO', target: 'height', anchor: 'end' }],
        }),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Compare with the rectangle',
      'Explain that the triangle fills half of the enclosing rectangle.',
      'Imagine the rectangle with the same base and the same height. The triangle fills exactly half of it — the two leftover corners fold in to fill the other half.',
      [
        action(
          'beat-5',
          'DRAW_TEXT',
          'rectangle_insight',
          { text: 'A rectangle b by h has area b h.' },
          { target: 'insight-1', relations: below('triangle', 'loose') }
        ),
        action(
          'beat-5',
          'DRAW_TEXT',
          'half_insight',
          { text: 'The triangle covers exactly half of it.' },
          { target: 'insight-2', relations: below('insight-1', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-6',
      6,
      'Write the formula',
      'Write A = 1/2 b h and emphasise it.',
      'So the area of the triangle is one half times base times height.',
      [
        action(
          'beat-6',
          'WRITE_FORMULA',
          'area_formula',
          { expression: 'A = 1/2 b h' },
          {
            target: 'formula',
            priority: 'PRIMARY',
            relations: below('insight-2', 'normal'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-6', 'CIRCLE_TERM', 'emphasise_formula', {}, { target: 'formula' }),
        action('beat-6', 'CAMERA_FOCUS', 'focus_formula', {}, { target: 'formula' }),
      ]
    ),
    beat(
      'beat-7',
      7,
      'Summarise',
      'Close with the takeaway.',
      'Whatever shape the triangle has, measure a base, measure the perpendicular height to it, multiply, and halve.',
      [
        action(
          'beat-7',
          'SUMMARIZE',
          'lesson_summary',
          { text: 'Base times perpendicular height, halved.' },
          { target: 'summary', relations: below('formula', 'normal'), priority: 'PRIMARY' }
        ),
        action('beat-7', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-7', 'SECTION_END', 'end_of_lesson', { sectionId: 'triangle' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'mathematics',
    answer:
      'The area of a triangle is A = 1/2 x base x height, because a triangle fills exactly half of the rectangle that shares its base and height.',
    objective: 'Understand where A = 1/2 b h comes from.',
    finalSummary: 'Base times perpendicular height, halved.',
    comprehensionCheck: {
      question: 'Why does the formula for the area of ANY triangle always include the factor of 1/2?',
      options: [
        { id: 'a', label: 'Any triangle can be paired with an identical copy to form a parallelogram of area b × h.' },
        { id: 'b', label: 'Because a triangle has only half as many sides as a square.' },
        { id: 'c', label: 'The factor of 1/2 only strictly applies to right triangles and approximates other triangles.' },
      ],
      correctOptionId: 'a',
      rationale: 'Any triangle forms exactly half of a parallelogram with the same base and perpendicular height, so its area is always exactly 1/2 × base × height.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- benzene */

export function benzenePlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce Benzene Title & Carbon Skeleton',
      'Display Benzene title and draw planar hexagonal carbon ring with hydrogen atoms.',
      'Let us explore the structure and electronic nature of Benzene, starting from its six carbon hexagonal skeleton.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Benzene: Structure & Electron Delocalization' }, {
          target: 'title',
        }),
        action(
          'beat-1',
          'CREATE_BENZENE',
          'carbon_skeleton',
          { radius: 120, showHydrogens: true, doubleBonds: [0, 2, 4] },
          {
            target: 'benzene-ring',
            priority: 'PRIMARY',
            relations: below('title', 'loose'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-1', 'CAMERA_FIT', 'frame_skeleton', {}, {}),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Explain Kekule Structure',
      'Highlight alternating double bonds in the classic Kekule structure.',
      'In the classical Kekulé representation, Benzene is drawn with alternating single and double carbon bonds.',
      [
        action(
          'beat-2',
          'WRITE_LABEL',
          'kekule_label',
          { text: 'Kekule Representation (Alternating Double Bonds)', color: 'amber' },
          { target: 'kekule-label', relations: below('benzene-ring', 'normal') }
        ),
        action('beat-2', 'PULSE', 'pulse_kekule', {}, { target: 'benzene-ring' }),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Show Resonance Equilibrium',
      'Morph double bond positions between alternating Kekule forms.',
      'However, experimental measurement shows all six carbon bonds are equal in length. The double bonds alternate dynamically in resonance.',
      [
        action(
          'beat-3',
          'SHOW_RESONANCE',
          'resonance_shift',
          { fromPattern: [0, 2, 4], toPattern: [1, 3, 5] },
          { target: 'benzene-ring', priority: 'PRIMARY', timing: { pace: 'deliberate' } }
        ),
        action(
          'beat-3',
          'WRITE_LABEL',
          'resonance_label',
          { text: 'Resonance Equilibrium Between Kekule Forms', color: 'blue' },
          { target: 'resonance-label', relations: below('kekule-label', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Animate Delocalized Pi Cloud',
      'Morph localized double bonds into a continuous pi electron cloud and animated orbital paths.',
      'Rather than distinct localized bonds, the six pi electrons are delocalized evenly in a continuous cloud above and below the planar ring.',
      [
        action(
          'beat-4',
          'SHOW_PI_CLOUD',
          'pi_cloud',
          { radius: 140, innerRadius: 85, color: '#38bdf8' },
          { target: 'pi-cloud', priority: 'PRIMARY', relations: [{ type: 'INSIDE', target: 'benzene-ring', gap: 'tight' }] }
        ),
        action(
          'beat-4',
          'ANIMATE_ELECTRON_DELOCALIZATION',
          'electron_motion',
          { count: 6, speed: 1 },
          { target: 'electron-orbit' }
        ),
        action(
          'beat-4',
          'WRITE_LABEL',
          'aromatic_label',
          { text: 'Delocalized Aromatic Pi System', color: 'emerald' },
          { target: 'pi-label', relations: below('resonance-label', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Demonstrate Substituent Replacement',
      'Replace one hydrogen atom with functional group X.',
      'Because of aromatic stabilization, benzene resists addition reactions and instead undergoes substitution, replacing a hydrogen with a new functional group.',
      [
        action(
          'beat-5',
          'SUBSTITUTE_GROUP',
          'substituent_reaction',
          { targetAtom: 'H2', substituent: 'X' },
          { target: 'substituent-x', priority: 'PRIMARY', timing: { pace: 'deliberate' } }
        ),
        action(
          'beat-5',
          'WRITE_LABEL',
          'substituent_label',
          { text: 'Electrophilic Aromatic Substitution (C6H5X)', color: 'purple' },
          { target: 'sub-label', relations: [{ type: 'RIGHT_OF', target: 'benzene-ring', gap: 'normal' }] }
        ),
      ]
    ),
    beat(
      'beat-6',
      6,
      'Summarize Benzene Aromaticity',
      'Provide final summary box and fit camera frame.',
      'In summary, Benzene is a planar hexagonal molecule whose aromatic stability comes from six delocalized pi electrons.',
      [
        action(
          'beat-6',
          'SUMMARIZE',
          'lesson_summary',
          { text: 'Planar C6H6 ring with 6 delocalized pi-electrons providing aromatic stability.' },
          { target: 'summary', relations: below('pi-label', 'normal'), priority: 'PRIMARY' }
        ),
        action('beat-6', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-6', 'SECTION_END', 'end_of_lesson', { sectionId: 'benzene' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'chemistry',
    answer:
      'Benzene is a planar hexagonal C6H6 molecule stabilized by six delocalized pi electrons forming a continuous aromatic pi system.',
    objective: 'Understand Benzene structure, Kekule resonance, and aromatic pi-electron delocalization.',
    finalSummary: 'Planar C6H6 ring with 6 delocalized pi-electrons providing aromatic stability.',
    comprehensionCheck: {
      question: 'Why are all six carbon-carbon bond lengths in benzene completely identical (139 pm) rather than alternating between single and double bonds?',
      options: [
        { id: 'a', label: 'The six π electrons are fully delocalized into continuous ring clouds above and below the planar carbon skeleton.' },
        { id: 'b', label: 'The molecule rapidly oscillates back and forth between two distinct Kekulé isomers.' },
        { id: 'c', label: 'The attached hydrogen atoms compress the double bonds to match the single bonds.' },
      ],
      correctOptionId: 'a',
      rationale: 'Benzene is a true resonance hybrid: all six 2p orbitals overlap equally in a unified delocalized π system, giving each bond an identical intermediate order of 1.5.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- physics */

export function physicsPlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce Problem & Block Setup',
      'Draw title, ground surface line, and 2 kg block entity.',
      'Let us calculate the acceleration of a 2 kilogram block pulled along a rough surface by a 10 Newton force at 30 degrees.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Physics: Block Pulled on a Rough Surface' }, {
          target: 'title',
        }),
        action(
          'beat-1',
          'CREATE_BLOCK',
          'main_block',
          { mass: 2, label: '2 kg' },
          {
            target: 'block',
            priority: 'PRIMARY',
            relations: below('title', 'loose'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-1', 'CAMERA_FIT', 'frame_setup', {}, {}),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Draw Applied Force Vector',
      'Draw 10 N applied force vector at 30 degree angle.',
      'An applied force of 10 Newtons acts at an angle of 30 degrees above the horizontal.',
      [
        action(
          'beat-2',
          'SHOW_FORCE',
          'applied_force',
          { magnitude: 10, angle: 30, label: '10 N at 30°' },
          { target: 'applied-force', priority: 'PRIMARY', relations: [{ type: 'CONNECTED_TO', target: 'block' }] }
        ),
        action(
          'beat-2',
          'WRITE_LABEL',
          'force_label',
          { text: 'Applied Force: 10 N at 30°', color: 'amber' },
          { target: 'force-label', relations: below('block', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Decompose Force into Components',
      'Decompose applied force into horizontal Fx = 8.66 N and vertical Fy = 5 N.',
      'First, we split the force into horizontal component F x equals 10 cosine 30 degrees, about 8.66 Newtons, and vertical component F y equals 5 Newtons.',
      [
        action(
          'beat-3',
          'DECOMPOSE_VECTOR',
          'force_components',
          { vector: '10 N', components: ['Fx = 8.66 N', 'Fy = 5 N'] },
          { target: 'force-components', priority: 'PRIMARY', relations: [{ type: 'RIGHT_OF', target: 'block', gap: 'normal' }] }
        ),
        action(
          'beat-3',
          'WRITE_EQUATION',
          'component_equations',
          { expression: 'F_x = 10 cos 30° = 8.66 N,   F_y = 10 sin 30° = 5 N' },
          { target: 'comp-eq', relations: below('force-label', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Calculate Normal Force N',
      'Apply vertical equilibrium N + Fy - mg = 0 to calculate Normal force N = 14.6 N.',
      'From vertical equilibrium, Normal force plus F y minus m g equals zero. That gives Normal force N equals 14.6 Newtons.',
      [
        action(
          'beat-4',
          'CALCULATE_NORMAL_FORCE',
          'normal_force_calc',
          { equation: 'N + F_y - mg = 0', result: 'N = 2(9.8) - 5 = 14.6 N' },
          { target: 'normal-force', priority: 'PRIMARY', relations: below('comp-eq', 'tight') }
        ),
        action('beat-4', 'PULSE', 'pulse_normal', {}, { target: 'normal-force' }),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Calculate Kinetic Friction Force fk',
      'Calculate kinetic friction fk = mu N = 0.2 x 14.6 = 2.92 N pointing left.',
      'Kinetic friction force f k equals mu times N, giving 0.2 times 14.6 equals 2.92 Newtons opposing motion.',
      [
        action(
          'beat-5',
          'CALCULATE_FRICTION',
          'friction_calc',
          { equation: 'f_k = μN = 0.2(14.6)', result: 'f_k = 2.92 N' },
          { target: 'friction-force', priority: 'PRIMARY', relations: below('normal-force', 'tight') }
        ),
        action(
          'beat-5',
          'WRITE_LABEL',
          'friction_direction',
          { text: 'Kinetic Friction f_k = 2.92 N (Opposing Motion)', color: 'red' },
          { target: 'friction-label', relations: [{ type: 'LEFT_OF', target: 'block', gap: 'normal' }] }
        ),
      ]
    ),
    beat(
      'beat-6',
      6,
      'Net Horizontal Force & Newton Second Law',
      'Calculate Fnet,x = 8.66 - 2.92 = 5.74 N and acceleration a = Fnet / m = 2.87 m/s².',
      'Subtracting friction from horizontal force gives net force 5.74 Newtons. By Newton second law, acceleration a equals 5.74 over 2, approximately 2.87 meters per second squared.',
      [
        action(
          'beat-6',
          'CALCULATE_NET_FORCE',
          'net_force_calc',
          { equation: 'F_net,x = 8.66 - 2.92', result: 'F_net,x = 5.74 N' },
          { target: 'net-force', relations: below('friction-force', 'tight') }
        ),
        action(
          'beat-6',
          'APPLY_NEWTON_SECOND_LAW',
          'acceleration_calc',
          { equation: 'a = F_net / m = 5.74 / 2', result: 'a ≈ 2.87 m/s²' },
          { target: 'acc-eq', priority: 'PRIMARY', relations: below('net-force', 'normal') }
        ),
        action(
          'beat-6',
          'SHOW_FINAL_ANSWER',
          'final_answer',
          { answer: 'a ≈ 2.87 m/s²' },
          { target: 'final-answer', priority: 'PRIMARY', relations: below('acc-eq', 'normal') }
        ),
      ]
    ),
    beat(
      'beat-7',
      7,
      'Animate Motion & Summary',
      'Animate rightward block acceleration motion and state summary.',
      'The block accelerates to the right at 2.87 meters per second squared.',
      [
        action(
          'beat-7',
          'ANIMATE_ACCELERATION',
          'block_acceleration_motion',
          { direction: 'RIGHT', acceleration: '2.87 m/s²' },
          { target: 'block-motion', priority: 'PRIMARY' }
        ),
        action(
          'beat-7',
          'SUMMARIZE',
          'lesson_summary',
          { text: 'Block accelerates right at a = 2.87 m/s² (F_net,x = 5.74 N, m = 2 kg).' },
          { target: 'summary', relations: below('final-answer', 'normal') }
        ),
        action('beat-7', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-7', 'SECTION_END', 'end_of_lesson', { sectionId: 'physics_friction' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'physics',
    answer:
      'The block accelerates along the horizontal surface at a ≈ 2.87 m/s² to the right (F_net,x = 5.74 N, m = 2 kg).',
    objective: 'Calculate normal force, kinetic friction, net horizontal force, and acceleration using Newton second law.',
    finalSummary: 'Block accelerates right at a = 2.87 m/s² (F_net,x = 5.74 N, m = 2 kg).',
    comprehensionCheck: {
      question: 'Why does pulling the block at an upward 30° angle reduce friction compared to pulling it purely horizontally?',
      options: [
        { id: 'a', label: 'The upward component of force (F·sin 30°) relieves part of the block’s weight, reducing normal force N and thus friction f_k = μ·N.' },
        { id: 'b', label: 'The coefficient of kinetic friction μ decreases at higher pull angles.' },
        { id: 'c', label: 'Gravity exerts less downward force on objects moving at an angle.' },
      ],
      correctOptionId: 'a',
      rationale: 'In vertical equilibrium, N = mg - F·sin(30°). The upward pull lifts the block slightly, decreasing the normal contact force and directly lowering kinetic friction.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- integral */

export function integralPlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce Definite Integral',
      'Display lesson title and standard definite integral equation.',
      'Let us evaluate the definite integral of x squared from zero to two and explain what it represents geometrically.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Definite Integral: Area Under a Curve' }, {
          target: 'title',
        }),
        action(
          'beat-1',
          'WRITE_EQUATION',
          'integral_question',
          { expression: '∫₀² x² dx' },
          {
            target: 'question-eq',
            priority: 'PRIMARY',
            relations: below('title', 'loose'),
            timing: { pace: 'deliberate' },
          }
        ),
        action('beat-1', 'CAMERA_FIT', 'frame_title', {}, {}),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Plot Coordinate Axes & Curve y = x²',
      'Draw coordinate axes and plot parabolic function y = x².',
      'We start by drawing coordinate axes and plotting the parabola y equals x squared.',
      [
        action(
          'beat-2',
          'CREATE_AXES',
          'coordinate_axes',
          { xMin: -0.5, xMax: 3.0, yMin: -0.5, yMax: 4.5 },
          { target: 'axes', priority: 'PRIMARY', relations: below('question-eq', 'normal') }
        ),
        action(
          'beat-2',
          'PLOT_FUNCTION',
          'parabola_curve',
          { expression: 'x^2', domain: [0, 2.5] },
          { target: 'curve', priority: 'PRIMARY', relations: [{ type: 'INSIDE', target: 'axes', gap: 'tight' }] }
        ),
        action(
          'beat-2',
          'WRITE_LABEL',
          'function_label',
          { text: 'y = x²', color: 'amber' },
          { target: 'func-label', relations: [{ type: 'RIGHT_OF', target: 'curve', gap: 'tight' }] }
        ),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Riemann Rectangles Approximation',
      'Approximate area under curve using 12 thin Riemann rectangles.',
      'To measure the region between x equals 0 and x equals 2, we approximate the area using thin Riemann rectangles.',
      [
        action(
          'beat-3',
          'CREATE_RIEMANN_SUM',
          'riemann_rectangles',
          { function: 'x^2', interval: [0, 2], partitions: 12 },
          { target: 'rectangles', priority: 'PRIMARY', relations: [{ type: 'INSIDE', target: 'axes', gap: 'tight' }] }
        ),
        action(
          'beat-3',
          'WRITE_LABEL',
          'riemann_label',
          { text: 'Riemann Sum Approximation (12 Rectangles)', color: 'amber' },
          { target: 'riemann-lbl', relations: below('axes', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Refine Partitions toward Infinity',
      'Increase rectangle partition count to 30 to show finer approximation.',
      'As the number of rectangles increases and their width approaches zero, the approximation becomes exact.',
      [
        action(
          'beat-4',
          'REFINE_PARTITIONS',
          'fine_rectangles',
          { function: 'x^2', interval: [0, 2], partitions: 30 },
          { target: 'fine-rects', priority: 'PRIMARY', relations: [{ type: 'INSIDE', target: 'axes', gap: 'tight' }] }
        ),
        action('beat-4', 'PULSE', 'pulse_refinement', {}, { target: 'fine-rects' }),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Shade Exact Accumulated Area',
      'Shade continuous area under y = x^2 from x = 0 to x = 2.',
      'The definite integral yields the exact accumulated area under y equals x squared on the interval zero to two.',
      [
        action(
          'beat-5',
          'SHOW_AREA',
          'exact_shaded_area',
          { function: 'x^2', interval: [0, 2] },
          { target: 'shaded-area', priority: 'PRIMARY', relations: [{ type: 'INSIDE', target: 'axes', gap: 'tight' }] }
        ),
        action(
          'beat-5',
          'WRITE_LABEL',
          'area_meaning_label',
          { text: 'Definite Integral = Exact Accumulated Area', color: 'blue' },
          { target: 'area-lbl', relations: below('axes', 'tight') }
        ),
      ]
    ),
    beat(
      'beat-6',
      6,
      'Evaluate Antiderivative & Bounds',
      'Show antiderivative x^3 / 3 and evaluate bounds [x^3 / 3]_0^2 = 8/3.',
      'Algebraically, the antiderivative of x squared is x cubed over 3. Substituting upper bound 2 minus lower bound 0 gives eight over three.',
      [
        action(
          'beat-6',
          'SHOW_ANTIDERIVATIVE',
          'antiderivative_step',
          { expression: '∫ x² dx = x³/3 + C' },
          { target: 'anti-step', relations: [{ type: 'RIGHT_OF', target: 'axes', gap: 'normal' }] }
        ),
        action(
          'beat-6',
          'EVALUATE_BOUNDS',
          'bounds_step',
          { expression: '[x³/3]₀² = 2³/3 - 0³/3 = 8/3' },
          { target: 'bounds-step', priority: 'PRIMARY', relations: below('anti-step', 'tight') }
        ),
        action(
          'beat-6',
          'SHOW_FINAL_ANSWER',
          'final_answer',
          { answer: '∫₀² x² dx = 8/3 ≈ 2.67' },
          { target: 'final-answer', priority: 'PRIMARY', relations: below('bounds-step', 'normal') }
        ),
      ]
    ),
    beat(
      'beat-7',
      7,
      'Summarize Geometric Meaning',
      'Summary box linking definite integral to accumulated area 8/3.',
      'Therefore, the integral of x squared from 0 to 2 equals eight thirds square units.',
      [
        action(
          'beat-7',
          'SUMMARIZE',
          'lesson_summary',
          { text: 'Definite integral = exact area under y = x^2 on [0, 2] = 8/3.' },
          { target: 'summary', relations: below('final-answer', 'normal') }
        ),
        action('beat-7', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-7', 'SECTION_END', 'end_of_lesson', { sectionId: 'calculus_integral' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'mathematics',
    answer:
      'The definite integral of x^2 from 0 to 2 equals 8/3, representing the exact accumulated area under y = x^2.',
    objective: 'Evaluate definite integral using antiderivative bounds and connect to area under curve.',
    finalSummary: 'Definite integral = exact area under y = x^2 on [0, 2] = 8/3.',
    comprehensionCheck: {
      question: 'Geometrically, what does the definite integral ∫₀² x² dx calculate?',
      options: [
        { id: 'a', label: 'The slope of the tangent line to the parabola at x = 2.' },
        { id: 'b', label: 'The exact area of the curved 2D region bounded between y = x², the x-axis, and the vertical lines x = 0 and x = 2.' },
        { id: 'c', label: 'The arc length of the parabolic curve from (0,0) to (2,4).' },
      ],
      correctOptionId: 'b',
      rationale: 'The definite integral represents the infinite limit of Riemann sum rectangle areas, yielding the exact accumulated area under the curve y = f(x) over the interval [0, 2].',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- ESP32 LED */

export function esp32LedPlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce the complete control path',
      'An ESP32 GPIO output can source a logic-high voltage into a protected LED circuit.',
      'We will follow one command all the way from software to visible light: code changes a GPIO output, current passes through a resistor and LED, and returns to ground.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'ESP32 turns on an LED' }, { target: 'title', priority: 'PRIMARY' }),
        action('beat-1', 'WRITE_SUBTITLE', 'lesson_goal', { text: 'code -> GPIO -> current -> light' }, { target: 'goal', relations: below('title', 'tight') }),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Build the hardware path',
      'GPIO2 drives a resistor and LED connected to ground.',
      'Here is the physical path. GPIO2 is the controlled output. The two hundred and twenty ohm resistor limits current so the LED and ESP32 pin stay safe.',
      [
        action('beat-2', 'CREATE_ESP32', 'microcontroller', {}, { target: 'esp32', relations: below('goal', 'normal'), priority: 'PRIMARY', timing: { pace: 'deliberate' } }),
        action('beat-2', 'CREATE_GPIO', 'gpio_output', { board: 'esp32', pin: 'GPIO2' }, { target: 'gpio2', relations: [{ type: 'ATTACHED_TO', target: 'esp32', anchor: 'GPIO2', gap: 'tight' }], priority: 'PRIMARY' }),
        action('beat-2', 'CREATE_RESISTOR', 'current_limiter', { value: '220 ohm' }, { target: 'resistor', relations: [{ type: 'RIGHT_OF', target: 'esp32', gap: 'normal' }], priority: 'PRIMARY' }),
        action('beat-2', 'CREATE_LED', 'light_output', { label: 'LED' }, { target: 'led', relations: [{ type: 'RIGHT_OF', target: 'resistor', gap: 'normal' }], priority: 'PRIMARY' }),
        action('beat-2', 'CREATE_GROUND', 'return_path', {}, { target: 'ground', relations: [{ type: 'BELOW', target: 'led', gap: 'normal' }], priority: 'PRIMARY' }),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Connect the circuit',
      'The runtime routes wires from semantic terminals and avoids existing components.',
      'Now connect the named terminals. NEMO chooses no pixel coordinates here; the router uses the GPIO, resistor, LED and ground anchors to build the path.',
      [
        action('beat-3', 'CREATE_WIRE', 'gpio_to_resistor', { from: 'gpio2', to: 'resistor', fromAnchor: 'right', toAnchor: 'left' }, { target: 'wire_gpio_resistor', priority: 'SECONDARY' }),
        action('beat-3', 'CREATE_WIRE', 'resistor_to_led', { from: 'resistor', to: 'led', fromAnchor: 'right', toAnchor: 'anode' }, { target: 'wire_resistor_led', priority: 'SECONDARY' }),
        action('beat-3', 'CREATE_WIRE', 'led_to_ground', { from: 'led', to: 'ground', fromAnchor: 'cathode', toAnchor: 'top' }, { target: 'wire_led_ground', priority: 'SECONDARY' }),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Connect software to the GPIO state',
      'digitalWrite sets the output latch for GPIO2 to HIGH.',
      'The program configures the pin as an output, then digitalWrite sets it HIGH. HIGH means the pin presents a voltage relative to ground.',
      [
        action('beat-4', 'CREATE_CODE_BLOCK', 'source_code', { language: 'cpp', code: 'pinMode(2, OUTPUT);\ndigitalWrite(2, HIGH);' }, { target: 'code', relations: [{ type: 'BELOW', target: 'esp32', gap: 'loose' }], priority: 'PRIMARY' }),
        action('beat-4', 'HIGHLIGHT_CODE_LINE', 'active_statement', { line: 2 }, { target: 'code', priority: 'SECONDARY' }),
        action('beat-4', 'SET_GPIO_STATE', 'logic_high', { state: 'HIGH' }, { target: 'gpio2', priority: 'PRIMARY' }),
      ]
    ),
    beat(
      'beat-5',
      5,
      'Show electrical cause and effect',
      'Conventional current flows through the resistor and LED, which emits light.',
      'With GPIO2 high, conventional current flows through the resistor, through the LED, and toward ground. The resistor controls the current; the LED converts electrical energy into light.',
      [
        action('beat-5', 'SHOW_CURRENT_FLOW', 'current_path', { wires: ['wire_gpio_resistor', 'wire_resistor_led', 'wire_led_ground'] }, { target: 'current_flow', priority: 'SECONDARY', timing: { pace: 'deliberate' } }),
        action('beat-5', 'SET_LED_STATE', 'visible_output', { state: 'ON' }, { target: 'led', priority: 'PRIMARY', timing: { pace: 'deliberate' } }),
      ]
    ),
    beat(
      'beat-6',
      6,
      'Conclude',
      'The software instruction changes a physical output through a protected current path.',
      'So the complete chain is: digitalWrite sets GPIO2 high, current flows through the limiting resistor and LED to ground, and the LED turns on.',
      [
        action('beat-6', 'SHOW_FINAL_ANSWER', 'lesson_conclusion', { text: 'GPIO HIGH -> limited current -> LED ON' }, { target: 'final_answer', relations: below('code', 'normal'), priority: 'PRIMARY' }),
        action('beat-6', 'CAMERA_FIT', 'final_frame', {}, {}),
        action('beat-6', 'SECTION_END', 'end_of_lesson', { sectionId: 'esp32_led' }, {}),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'embedded_systems',
    answer: 'The ESP32 turns on the LED by setting GPIO2 HIGH. That creates a voltage across the series path, current flows through a 220 ohm limiting resistor and the LED to ground, and the LED emits light.',
    objective: 'Trace an ESP32 LED command from code through GPIO state and circuit current to emitted light.',
    finalSummary: 'digitalWrite sets GPIO2 HIGH; the resistor limits current; the LED turns ON and current returns to ground.',
    comprehensionCheck: {
      question: 'Why is a current-limiting resistor strictly required in series with an LED connected to an ESP32 GPIO pin?',
      options: [
        { id: 'a', label: 'To reduce the GPIO digital clock frequency down to DC.' },
        { id: 'b', label: 'An active LED has very low internal resistance and would draw excessive current, destroying the LED or frying the ESP32 GPIO pin.' },
        { id: 'c', label: 'To step up the ESP32 3.3V voltage so the LED can turn on.' },
      ],
      correctOptionId: 'b',
      rationale: 'Diodes have exponential I-V curves; without a series resistor to drop the remaining voltage (3.3V - V_forward) and limit current to ~10-15 mA, the circuit draws destructive current.',
    },
    beats,
    status: 'READY',
  };
}

/* -------------------------------------------------------- brain structure */

export function brainStructurePlan(lessonId: string, requestId: string, question: string): LessonPlan {
  seq = 0;
  const beats: TeachingBeat[] = [
    beat(
      'beat-1',
      1,
      'Introduce Brain Structure & Gross Anatomy',
      'Display lesson title and overview of the human brain divisions.',
      'The human brain is structured into two cerebral hemispheres, the cerebellum, and the brain stem.',
      [
        action('beat-1', 'WRITE_TITLE', 'lesson_title', { text: 'Human Brain Structure & Neuroanatomy' }, { target: 'title' }),
        action('beat-1', 'WRITE_SUBTITLE', 'lesson_sub', { text: 'Cerebrum, Cortical Lobes, Cerebellum & Brain Stem' }, { target: 'subtitle', relations: below('title', 'tight') }),
        action('beat-1', 'CAMERA_FIT', 'frame_title', {}, {}),
      ]
    ),
    beat(
      'beat-2',
      2,
      'Procedural 3D Wireframe Brain',
      'Generate procedural wireframe of cerebral hemispheres, cortical folds, and fissures.',
      'Here is the procedural wireframe brain displaying the dual hemispheres, cortical folds, longitudinal fissure, cerebellum, and brain stem.',
      [
        action(
          'beat-2',
          'CREATE_WIREFRAME_BRAIN',
          'wireframe_brain_model',
          { labels: true, color: 'blue' },
          { target: 'brain', priority: 'PRIMARY', relations: below('subtitle', 'normal') }
        ),
        action('beat-2', 'CAMERA_FOCUS', 'focus_brain', {}, { target: 'brain' }),
      ]
    ),
    beat(
      'beat-3',
      3,
      'Explain the Four Cerebral Lobes',
      'Detail functional specializations of frontal, parietal, temporal, and occipital lobes.',
      'The frontal lobe directs decision making, the parietal lobe decodes sensory touch, the temporal lobe processes language, and the occipital lobe interprets vision.',
      [
        action('beat-3', 'WRITE_LABEL', 'frontal_lbl', { text: '• Frontal Lobe: Executive control, reasoning & motor planning', color: 'amber' }, { target: 'lbl-frontal', relations: below('brain', 'normal') }),
        action('beat-3', 'WRITE_LABEL', 'parietal_lbl', { text: '• Parietal Lobe: Somatosensory spatial awareness & touch', color: 'chalk' }, { target: 'lbl-parietal', relations: below('lbl-frontal', 'tight') }),
        action('beat-3', 'WRITE_LABEL', 'temporal_lbl', { text: '• Temporal Lobe: Memory formation, auditory processing & speech', color: 'green' }, { target: 'lbl-temporal', relations: below('lbl-parietal', 'tight') }),
      ]
    ),
    beat(
      'beat-4',
      4,
      'Cerebellum & Brain Stem Autonomic Functions',
      'Detail motor coordination in the cerebellum and vital reflexes in the brain stem.',
      'The cerebellum governs coordination and balance, while the brain stem regulates autonomic survival functions like breathing and heart rate.',
      [
        action('beat-4', 'WRITE_LABEL', 'cerebellum_lbl', { text: '• Cerebellum: Coordination, fine motor accuracy & posture', color: 'violet' }, { target: 'lbl-cerebellum', relations: below('lbl-temporal', 'tight') }),
        action('beat-4', 'WRITE_LABEL', 'stem_lbl', { text: '• Brain Stem: Cardiac pulse, respiration & visceral reflexes', color: 'cyan' }, { target: 'lbl-stem', relations: below('lbl-cerebellum', 'tight') }),
        action('beat-4', 'SHOW_FINAL_ANSWER', 'brain_summary', { answer: 'Brain Divisions: Cerebrum (cognition) + Cerebellum (motor) + Brain Stem (life support)' }, { target: 'summary-box', priority: 'PRIMARY', relations: below('lbl-stem', 'normal') }),
      ]
    ),
  ];

  return {
    lessonId,
    requestId,
    question,
    domain: 'biology',
    answer: 'The human brain comprises three primary anatomical divisions: the cerebrum (split into two hemispheres and four functional lobes: frontal, parietal, temporal, and occipital), the cerebellum (responsible for motor coordination, balance, and precision), and the brain stem (which connects to the spinal cord and manages autonomic survival functions including breathing and cardiac regulation).',
    objective: 'Understand human brain anatomy, the three major structural divisions, and cortical functional specializations.',
    finalSummary: 'The cerebrum executes higher cognition, the cerebellum coordinates movement, and the brain stem maintains vital autonomic life support.',
    comprehensionCheck: {
      question: 'If an individual suffers acute damage localized specifically to the cerebellum, which neurological deficit is most characteristic?',
      options: [
        { id: 'a', label: 'Immediate cessation of involuntary breathing and autonomic heart rate control.' },
        { id: 'b', label: 'Ataxia: profound impairment in motor coordination, balance, and precision, while conscious thought remains intact.' },
        { id: 'c', label: 'Complete loss of executive decision-making and personality alteration.' },
      ],
      correctOptionId: 'b',
      rationale: 'The cerebellum acts as the brain’s motor coordination and calibration engine (damage produces cerebellar ataxia); the brain stem manages respiration, and the frontal lobe controls executive decision-making.',
    },
    beats,
    status: 'READY',
  };
}

/* ------------------------------------------------------------- dispatch */

/** Route a question to a scripted plan, or fail explicitly. */
export function mockPlanFor(lessonId: string, requestId: string, question: string): LessonPlan {
  const q = question.toLowerCase();

  if (looksLikeEquation(question)) {
    let solution: Solution;
    try {
      solution = solveEquation(question);
    } catch (err) {
      throw new LessonError(
        'UNSUPPORTED',
        `Demo mode could not read that equation: ${(err as Error).message}`
      );
    }
    return equationPlan(lessonId, requestId, question, solution);
  }

  if (/brain|neuro|cerebr|cort(ex|ical)/.test(q)) return brainStructurePlan(lessonId, requestId, question);
  if (/binary\s*search/.test(q)) return binarySearchPlan(lessonId, requestId, question);
  if (/esp32/.test(q) && /(led|light|gpio|turn\s*on)/.test(q)) return esp32LedPlan(lessonId, requestId, question);
  if (/benzene|aromatic|chemistry/.test(q)) return benzenePlan(lessonId, requestId, question);
  if (/physics|force|friction|block|acceleration/.test(q)) return physicsPlan(lessonId, requestId, question);
  if (/integral|area\s*under|calculus|\\int/.test(q)) return integralPlan(lessonId, requestId, question);
  if (/triangle/.test(q) && /area/.test(q)) return trianglePlan(lessonId, requestId, question);

  throw new LessonError(
    'UNSUPPORTED',
    'Demo Mode only covers the scripted scenarios: "Human brain structure", "How does an ESP32 turn on an LED?", "Explain binary search", "Benzene chemistry structure", "Physics block force & friction", "Definite integral area under curve", a linear equation such as "2x + 5 = 17", and "Explain the area of a triangle". Switch to a live provider in the config panel to ask anything else.'
  );
}

/* ---------------------------------------------------------------- utils */

/** Make symbols readable aloud so ElevenLabs does not spell them out. */
function speak(text: string): string {
  return text
    .replace(/\s*\/\s*/g, ' over ')
    .replace(/\s*\*\s*/g, ' times ')
    .replace(/\s*=\s*/g, ' equals ')
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 minus $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
