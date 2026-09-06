/**
 * NEMO — Semantic Visual Function Registry
 *
 * The CLOSED, ALLOWLISTED capability catalog, transcribed from
 * "Nemo_Manim_Semantic_Visual_Function_Registry" Part 1 (sections 1-10, 29-33)
 * and Part 2 (sections 11-33).
 *
 * Two distinct ideas live here and must not be confused:
 *
 *   1. CATALOG  — every capability name in the registry documents. The model may
 *                 never invent a name outside this catalog
 *                 (REJECT_UNKNOWN_CAPABILITY).
 *   2. EXECUTOR — the subset this build can deterministically draw. Only these
 *                 are offered to the Visual Director and accepted inside a
 *                 beat's visualActions.
 *
 * A capability in the catalog without an executor is a documented capability,
 * not a claim that it renders today. `implemented: false` says so explicitly
 * rather than silently dropping the action at runtime.
 */

export type CapabilitySection =
  | '1. Core instruction contract'
  | '2. Text, handwriting, and typography'
  | '3. Mathematical writing'
  | '4. Basic geometric drawing'
  | '5. Lines, paths, arrows, vectors'
  | '6. Diagram structure'
  | '7. Highlights and emphasis'
  | '8. Visibility and reveal'
  | '9. Motion and transformation'
  | '10. Drawing-specific animation'
  | '11. Timeline and sequencing'
  | '12. Easing and motion feel'
  | '13. Camera and framing'
  | '14. Spatial relationships and layout'
  | '15. Collision and anti-overlap'
  | '16. Physics visuals'
  | '17. Mathematics / graphs'
  | '18. Chemistry visuals'
  | '19. Biology visuals'
  | '20. Computer science visuals'
  | '21. Environment / natural effects'
  | '22. Characters and vehicles'
  | '23. 3D / spatial concepts for ManimGL'
  | '24. Image and annotation'
  | '25. Assets and media'
  | '26. Interaction and user control'
  | '27. Special instructional transformations'
  | '28. Lesson-control semantics'
  | '29. Visual Instruction IR'
  | '30. Anti-overlap policy'
  | '31. AI output constraints'
  | '32. MVP compatibility aliases'
  | '33. Electrical and embedded systems';

/**
 * Version of the machine-readable registry contract. Bump this when metadata
 * fields or their meaning changes; individual capability additions do not need
 * a schema-version bump.
 */
export const VISUAL_FUNCTION_REGISTRY_VERSION = '1.0.0';

export type CapabilityRenderer = 'browser-canvas' | 'none';
export type CapabilityImplementationStatus = 'implemented' | 'documented-only';
export type CapabilityTestStatus = 'registry-covered' | 'not-implemented';

export interface CapabilityImplementationMetadata {
  status: CapabilityImplementationStatus;
  /** Repository-relative path. Null means there is deliberately no executor. */
  file: string | null;
  entryPoint: string | null;
  /** The action type dispatched by the executor after alias resolution. */
  canonicalType: string;
}

export interface CapabilityTestMetadata {
  status: CapabilityTestStatus;
  /** Registry coverage only; visual regression coverage is tracked separately. */
  file: string;
}

export interface CapabilityExample {
  intent: string;
  action: {
    type: string;
    semanticRole: string;
    parameters: Readonly<Record<string, never>>;
  };
}

export interface Capability {
  /** Canonical registry name, e.g. DRAW_CIRCLE. */
  type: string;
  section: CapabilitySection;
  purpose: string;
  inputs: string;
  notes: string;
  /** True when a deterministic executor exists in this build. */
  implemented: boolean;
  /** For aliases: the canonical capability actually executed. */
  aliasOf?: string;
  /** Metadata used by inventory, search, and function selection. */
  version: string;
  domain: string;
  category: string;
  renderer: CapabilityRenderer;
  implementation: CapabilityImplementationMetadata;
  test: CapabilityTestMetadata;
  example: CapabilityExample;
  /** Deterministically derived search terms; never renderer source code. */
  keywords: readonly string[];
}

/**
 * Capabilities with a deterministic executor in this MVP.
 * Everything else in the catalog is documented but not drawable yet.
 */
const IMPLEMENTED = new Set<string>([
  // text + handwriting
  'DRAW_TEXT', 'WRITE_HANDWRITING', 'WRITE_LABEL', 'WRITE_TITLE', 'WRITE_SUBTITLE',
  'WRITE_BULLET', 'WRITE_NUMBERED_STEP', 'UNDERLINE_TEXT', 'HIGHLIGHT_TEXT',
  'STRIKE_TEXT', 'CIRCLE_TERM', 'BRACKET_TERM',
  // math
  'WRITE_EQUATION', 'WRITE_FORMULA', 'WRITE_FRACTION', 'TRANSFORM_EQUATION',
  'SIMPLIFY_EXPRESSION',
  // geometry
  'DRAW_POINT', 'DRAW_CIRCLE', 'DRAW_ELLIPSE', 'DRAW_RECTANGLE', 'DRAW_SQUARE',
  'DRAW_TRIANGLE', 'DRAW_POLYGON', 'DRAW_REGULAR_POLYGON', 'DRAW_ARC',
  'DRAW_ANGLE', 'DRAW_RIGHT_ANGLE', 'DRAW_TICK_MARK', 'DRAW_GRID',
  // lines + arrows
  'DRAW_LINE', 'DRAW_RAY', 'DRAW_SEGMENT', 'DRAW_ARROW', 'DRAW_DOUBLE_ARROW',
  'DRAW_VECTOR', 'DRAW_DIMENSION', 'DRAW_BRACE', 'DRAW_CALLOUT',
  // structures
  'DRAW_ARRAY', 'HIGHLIGHT_ARRAY_RANGE', 'MARK_LOW', 'MARK_HIGH', 'MARK_MIDPOINT',
  'DRAW_NUMBER_LINE', 'CREATE_AXES', 'PLOT_FUNCTION', 'SHOW_ALGORITHM_STEP',
  // emphasis
  'HIGHLIGHT', 'HIGHLIGHT_REGION', 'GLOW_EMPHASIS', 'PULSE', 'FLASH',
  'DIM_OTHERS', 'RESTORE_EMPHASIS',
  // visibility
  'FADE_IN', 'FADE_OUT', 'REVEAL', 'HIDE', 'ERASE',
  // motion
  'MOVE_TO', 'MOVE_BY', 'SCALE_TO', 'ROTATE_TO', 'ROTATE_BY', 'TRANSFORM', 'MORPH',
  // camera
  'CAMERA_ESTABLISH', 'CAMERA_FOCUS', 'CAMERA_FIT', 'CAMERA_PAN', 'CAMERA_ZOOM',
  'CAMERA_FOLLOW', 'CAMERA_RESET', 'CAMERA_DETAIL', 'CAMERA_COMPARE', 'CAMERA_REVEAL',
  // timeline + lesson control
  'WAIT', 'SECTION_START', 'SECTION_END', 'SHOW_FINAL_ANSWER', 'SUMMARIZE',
  // domain executors: physics, CS structures, chemistry, graphs
  'CREATE_VECTOR', 'DRAW_TRAJECTORY', 'SHOW_COMPONENTS', 'DECOMPOSE_VECTOR', 'CREATE_FORCE_DIAGRAM',
  'CREATE_BLOCK', 'SHOW_FORCE', 'CALCULATE_NORMAL_FORCE', 'CALCULATE_FRICTION', 'CALCULATE_NET_FORCE',
  'APPLY_NEWTON_SECOND_LAW', 'ANIMATE_ACCELERATION',
  'DRAW_TREE', 'DRAW_LINKED_LIST', 'DRAW_STACK', 'DRAW_QUEUE', 'DRAW_POINTER',
  'CREATE_ATOM', 'CREATE_BOND', 'CREATE_MOLECULE', 'CREATE_REACTION_ARROW',
  'CREATE_BENZENE', 'SHOW_PI_CLOUD', 'SHOW_RESONANCE', 'ANIMATE_ELECTRON_DELOCALIZATION', 'SUBSTITUTE_GROUP',
  'PLOT_POINTS', 'SHOW_TANGENT', 'SHADE_AREA',
  'CREATE_RIEMANN_SUM', 'REFINE_PARTITIONS', 'SHOW_AREA', 'SHOW_ANTIDERIVATIVE', 'EVALUATE_BOUNDS',
  // embedded/circuit vertical slice
  'CREATE_ESP32', 'CREATE_GPIO', 'SET_GPIO_STATE', 'CREATE_RESISTOR', 'CREATE_LED',
  'SET_LED_STATE', 'CREATE_GROUND', 'CREATE_WIRE', 'CREATE_CODE_BLOCK',
  'HIGHLIGHT_CODE_LINE', 'SHOW_CURRENT_FLOW',
  // MVP aliases from the build spec
  'DRAW_GRAPH', 'DRAW_AXIS', 'MOVE_OBJECT', 'TRANSFORM_OBJECT', 'FADE_OBJECT',
  'REVEAL_STROKE', 'UNDERLINE', 'STRIKE_TERM', 'HIGHLIGHT_TERM', 'DRAW_SHAPE',
]);

/** Aliases accepted from the model, mapped to the canonical executor. */
const ALIASES: Record<string, string> = {
  DRAW_GRAPH: 'PLOT_FUNCTION',
  DRAW_AXIS: 'CREATE_AXES',
  MOVE_OBJECT: 'MOVE_TO',
  TRANSFORM_OBJECT: 'TRANSFORM',
  FADE_OBJECT: 'FADE_OUT',
  REVEAL_STROKE: 'REVEAL',
  UNDERLINE: 'UNDERLINE_TEXT',
  STRIKE_TERM: 'STRIKE_TEXT',
  HIGHLIGHT_TERM: 'HIGHLIGHT',
  DRAW_SHAPE: 'DRAW_POLYGON',
  CAMERA_LOOK_AT: 'CAMERA_FOCUS',
  CREATE_COORDINATE_SYSTEM: 'CREATE_AXES',
  CREATE_VECTOR: 'DRAW_VECTOR',
  LABEL_REGION: 'WRITE_LABEL',
  WRITE_GLYPH: 'WRITE_HANDWRITING',
  WRITE_WORD: 'WRITE_HANDWRITING',
  WRITE_EQUATION_ANIMATED: 'WRITE_EQUATION',
  SHOW_FORCE_DIAGRAM: 'CREATE_FORCE_DIAGRAM',
  DECOMPOSE_FORCE: 'DECOMPOSE_VECTOR',
  SHOW_ACCELERATION: 'ANIMATE_ACCELERATION',
  SHOW_RIEMANN_SUM: 'CREATE_RIEMANN_SUM',
  SHOW_BOUNDARY_EVALUATION: 'EVALUATE_BOUNDS',
  EVALUATE_LIMITS: 'EVALUATE_BOUNDS',
};

/**
 * The catalog, transcribed section by section from the registry documents.
 * Each row: NAME | purpose | key inputs | result/notes
 */
const TABLE: Array<[CapabilitySection, string]> = [
  ['1. Core instruction contract', `
READ_VISUAL_CONTEXT|Load scene/lesson context.|lessonId, scene summary|No rendering.
CREATE_VISUAL_PLAN|Create complete visual plan.|objective, beats|Must cover start-to-finish.
VALIDATE_VISUAL_PLAN|Reject incomplete or unsafe plans.|VisualInstructionIR|PASS/FAIL + reasons.
VALIDATE_ACTION|Check one semantic action.|action|Allowed/invalid + diagnostics.
EXECUTE_ACTION|Dispatch approved action.|validated action|Scene/timeline changes.
MARK_ACTION_COMPLETED|Close action lifecycle.|actionId|COMPLETED.
MARK_ACTION_FAILED|Close failed action lifecycle.|actionId, reason|FAILED.
MARK_ACTION_CANCELLED|Close cancelled action lifecycle.|actionId|CANCELLED.
WAIT_FOR_COMPLETION|Wait for beat/action completion.|actionId/beatId|Prevents premature lesson completion.`],

  ['2. Text, handwriting, and typography', `
DRAW_TEXT|Create standard readable text.|text, semanticRole, relation, style|Text object.
WRITE_HANDWRITING|Draw text as stroke-based handwriting.|text, style, pace|Ink stroke sequence.
WRITE_LABEL|Write a label attached to a semantic target.|text, target, relation|Attached label.
WRITE_TITLE|Create lesson/title heading.|text, level, emphasis|Title object.
WRITE_SUBTITLE|Create secondary explanatory text.|text, relation|Subtitle.
WRITE_BULLET|Write one bullet item.|text, group, order|Bullet + marker.
WRITE_NUMBERED_STEP|Write numbered teaching step.|number, text, group|Numbered item.
UNDERLINE_TEXT|Underline a semantic text range.|target/range|Underline stroke.
HIGHLIGHT_TEXT|Emphasize a text range.|target/range|Highlight.
STRIKE_TEXT|Cross out a term during transformation.|target/range|Strike stroke.
CIRCLE_TERM|Circle a term or expression.|target|Hand-drawn circle.
BRACKET_TERM|Bracket a term or region.|target, side|Bracket stroke.
ALIGN_TEXT|Align related text.|targets, axis|Semantic alignment.`],

  ['3. Mathematical writing', `
WRITE_EQUATION|Write a complete equation.|expression, style, alignment|Equation visual.
WRITE_FORMULA|Write a standalone formula.|expression, semanticRole|Formula visual.
WRITE_FRACTION|Construct a fraction semantically.|numerator, denominator|Stacked fraction.
WRITE_SUPERSCRIPT|Write an exponent.|base, exponent|Superscript.
WRITE_SUBSCRIPT|Write an index/subscript.|base, subscript|Subscript.
WRITE_MATRIX|Construct a matrix.|entries, rows, cols|Matrix visual.
WRITE_CASES|Construct cases/piecewise notation.|cases|Piecewise block.
WRITE_LIMIT|Write limit notation.|expression, variable, target|Limit formula.
WRITE_INTEGRAL|Write an integral.|integrand, bounds|Integral formula.
WRITE_DERIVATIVE|Write derivative notation.|expression, order|Derivative.
WRITE_SUM|Write summation notation.|term, bounds|Summation.
TRANSFORM_EQUATION|Show one mathematically valid equation transformation.|before, operation, after|Transition.
ALIGN_EQUATION|Maintain equal-sign/column alignment.|equationGroup|Aligned equation stack.
SIMPLIFY_EXPRESSION|Show simplification step.|before, after, rule|Step visual.`],

  ['4. Basic geometric drawing', `
DRAW_POINT|Mark a point.|semantic position, label|Point marker.
DRAW_CIRCLE|Draw a circle.|center relation, radius relation|Circle stroke.
DRAW_ELLIPSE|Draw an ellipse.|center, axes|Ellipse.
DRAW_RECTANGLE|Draw rectangle.|size, relation|Rectangle.
DRAW_SQUARE|Draw square.|side, relation|Square.
DRAW_ROUNDED_RECTANGLE|Draw rounded rectangle.|size, radius|Rounded box.
DRAW_TRIANGLE|Construct triangle.|base, apex, side rules|Triangle.
DRAW_POLYGON|Construct polygon.|vertices/semantic shape|Polygon.
DRAW_REGULAR_POLYGON|Construct regular n-gon.|n, side/circumradius|Regular polygon.
DRAW_ARC|Draw circular arc.|center/radius/angles|Arc.
DRAW_SECTOR|Draw sector.|center/radius/angles|Sector.
DRAW_ANNULUS|Draw ring region.|inner/outer radius|Annulus.
DRAW_ANGLE|Construct angle marker.|vertex, rays, label|Angle.
DRAW_RIGHT_ANGLE|Mark right angle.|vertex, rays|Right-angle marker.
DRAW_TICK_MARK|Mark equal segment.|target segment|Tick.
DRAW_GRID|Draw grid.|bounds, spacing|Grid.`],

  ['5. Lines, paths, arrows, vectors', `
DRAW_LINE|Draw line segment.|start/end relations|Line.
DRAW_RAY|Draw ray.|origin, direction|Ray.
DRAW_SEGMENT|Draw measured segment.|endpoints|Segment.
DRAW_CURVE|Draw curve.|semantic path constraints|Curve.
DRAW_BEZIER|Draw controlled Bezier curve.|control semantics|Bezier.
DRAW_POLYLINE|Draw connected segments.|ordered points or semantic anchors|Polyline.
DRAW_ARROW|Draw directional arrow.|from/to semantic anchors|Arrow + head.
DRAW_DOUBLE_ARROW|Draw arrowheads at both ends.|from/to|Double arrow.
DRAW_VECTOR|Draw vector with magnitude/direction semantics.|origin, direction/magnitude|Vector.
DRAW_NORMAL|Draw normal/perpendicular vector.|target geometry|Normal.
DRAW_TANGENT|Draw tangent line/vector.|curve, point|Tangent.
DRAW_DIMENSION|Draw dimension line.|target geometry, label|Measurement.
DRAW_BRACE|Draw explanatory brace.|target region, side|Brace.
DRAW_CALLOUT|Point from label to target.|label, target|Callout.`],

  ['6. Diagram structure', `
CREATE_GROUP|Create semantic visual group.|role, children|Group node.
GROUP_ELEMENTS|Combine existing elements.|element IDs|Group.
UNGROUP_ELEMENTS|Release group.|groupId|Child elements restored.
CREATE_DIAGRAM|Create structured diagram container.|type, elements|Diagram.
DRAW_FLOWCHART|Construct flowchart.|nodes, edges|Flowchart.
DRAW_PROCESS|Construct process sequence.|steps, arrows|Process diagram.
DRAW_COMPARISON|Create side-by-side comparison.|left/right content|Comparison layout.
DRAW_TIMELINE|Construct chronological timeline.|events|Timeline.
DRAW_CYCLE|Construct cyclic process.|steps, direction|Cycle diagram.
DRAW_HIERARCHY|Construct hierarchy/tree.|root, children|Hierarchy.
DRAW_NETWORK|Construct semantic network.|nodes, edges|Network.`],

  ['7. Highlights and emphasis', `
HIGHLIGHT|Emphasize a visual.|target, style, duration|Highlight.
HIGHLIGHT_REGION|Emphasize region.|bounds/semantic target|Region highlight.
GLOW_EMPHASIS|Subtle attention effect.|target, intensity|Use sparingly.
PULSE|Pulse a target.|target, amplitude, duration|Attention cue.
FLASH|Brief attention flash.|target, duration|Use sparingly.
DIM_OTHERS|De-emphasize non-current objects.|set or scene scope|Relative emphasis.
RESTORE_EMPHASIS|Restore normal visual weight.|targets|Normal style.`],

  ['8. Visibility and reveal', `
FADE_IN|Introduce object.|target, duration|Opacity transition.
FADE_OUT|Remove visual emphasis.|target, duration|Opacity transition.
REVEAL|Reveal previously hidden visual.|target, mode|Visible.
HIDE|Temporarily hide object.|target|Hidden.
DRAW_REVEAL|Reveal along stroke/path.|stroke/path, duration|Progressive drawing.
WRITE_REVEAL|Reveal handwriting progressively.|glyph/stroke sequence|Handwriting animation.
ERASE|Animate erasure.|target, mode|Target disappears.
ERASE_STROKE|Erase individual ink stroke.|strokeId|Removed stroke.`],

  ['9. Motion and transformation', `
MOVE_TO|Move object to semantic destination.|target, destination relation|Position change.
MOVE_BY|Translate object relative to current position.|delta semantics|Translation.
MOVE_ALONG_PATH|Move object along semantic path.|path/target|Path motion.
FOLLOW_OBJECT|Attach follower motion.|follower, target|Linked movement.
ROTATE_TO|Rotate to target orientation.|angle/orientation semantic|Rotation.
ROTATE_BY|Relative rotation.|delta|Rotation.
SCALE_TO|Scale to target size.|scale semantic|Scale.
MORPH|Morph compatible visual topology.|source, target|Validated transition.
TRANSFORM|Map one compatible representation to another.|source, target|Transform.
ORIENT_TO_PATH|Orient object with path tangent.|target, path|Orientation.
ALIGN_TO|Move/align relative to target.|axis, target|Resolved layout change.`],

  ['10. Drawing-specific animation', `
DRAW_STROKE|Reveal one ink stroke progressively.|strokeId, duration|draw_progress 0 to 1.
DRAW_PATH|Reveal path progressively.|path, duration|Progressive path.
TRACE_PATH|Trace an existing path for teaching.|path, pen|Pen follows path.
WRITE_GLYPH|Animate a glyph stroke sequence.|glyph|Stroke-by-stroke.
WRITE_WORD|Animate word glyphs.|text|Letter sequence.
WRITE_EQUATION_ANIMATED|Animate equation writing.|expression|Equation strokes.
MOVE_PEN|Move pen to stroke start.|destination|Pen movement.
LOWER_PEN|Lower pen to begin stroke.|pen|Pen active.
LIFT_PEN|Lift pen after stroke.|pen|Pen inactive.
PAUSE_DRAWING|Pause between strokes.|duration|Timing only.`],

  ['11. Timeline and sequencing', `
SEQUENCE|Run actions in order.|ordered actions|Sequential timeline.
PARALLEL|Run actions concurrently.|action set|Parallel timeline.
DELAY|Offset action start.|duration|Start delay.
REPEAT|Repeat an action/timeline.|count|Repeated execution.
REVERSE|Reverse a reversible visual transition.|target|Reversed timeline.
SEEK|Move timeline to time position.|time|Deterministic state.
PAUSE_TIMELINE|Pause execution.|timelineId|Paused.
RESUME_TIMELINE|Resume execution.|timelineId|Running.
CANCEL_TIMELINE|Cancel safely.|timelineId|Cancelled.
RESET_TIMELINE|Reset timeline.|timelineId|Reset.
WAIT|Insert deliberate teaching pause.|duration, reason|Timing step.
SECTION_START|Start teaching section.|sectionId|Section marker.
SECTION_END|End teaching section.|sectionId|Section completion.`],

  ['12. Easing and motion feel', `
EASE_LINEAR|Constant rate.|duration|Linear interpolation.
EASE_IN|Accelerating start.|duration|Ease in.
EASE_OUT|Decelerating end.|duration|Ease out.
EASE_IN_OUT|Smooth start/end.|duration|Ease in-out.
EASE_QUAD|Quadratic easing family.|direction|Deterministic.
EASE_CUBIC|Cubic easing family.|direction|Deterministic.
EASE_SMOOTH|Smooth educational motion.|duration|Prefer for camera/objects.
SPRING|Soft spring response.|stiffness/damping|Use selectively.
OVERSHOOT|Small controlled overshoot.|amount|Avoid for math correctness.`],

  ['13. Camera and framing', `
CAMERA_ESTABLISH|Set initial teaching frame.|scene/region|Camera state.
CAMERA_FOCUS|Focus current concept.|target|Centered framing.
CAMERA_FIT|Fit all required content.|targets, padding|Zoom/center.
CAMERA_PAN|Pan to region.|target/offset|Camera movement.
CAMERA_ZOOM|Zoom to level/region.|factor/target|Zoom.
CAMERA_FOLLOW|Follow active target.|target|Continuous framing.
CAMERA_LOOK_AT|Orient camera toward target.|target|Orientation.
CAMERA_RESET|Return to established view.|checkpoint|Reset.
CAMERA_REVEAL|Reveal new board region.|target region|Framing transition.
CAMERA_COMPARE|Frame two concepts simultaneously.|targets|Comparison framing.
CAMERA_DETAIL|Zoom into details.|target|Detail framing.
CAMERA_HOLD|Prevent unwanted camera movement.|duration/section|Stability.`],

  ['14. Spatial relationships and layout', `
ABOVE|Place subject above target.|subject,target,gap|Deterministic bounds.
BELOW|Place below.|subject,target,gap|Deterministic.
LEFT_OF|Place left.|subject,target,gap|Deterministic.
RIGHT_OF|Place right.|subject,target,gap|Deterministic.
BESIDE|Place adjacent.|subject,target|Direction resolved.
CENTERED_ON|Center on target.|subject,target|Centered bounds.
ATTACHED_TO|Attach label/object.|subject,target,anchor|Sticky relation.
ALIGNED_WITH|Align axis/edge.|subject,target,axis|Alignment.
NEAR|Compact adjacency.|subject,target|Small semantic gap.
FAR|Separated placement.|subject,target|Large semantic gap.
INSIDE|Contain subject within target.|subject,target,padding|Containment.
BETWEEN|Place between two references.|subject,a,b|Semantic position.
PARALLEL_TO|Maintain parallel relationship.|subject,target|Orientation/placement.
PERPENDICULAR_TO|Maintain perpendicular relationship.|subject,target|Orientation/placement.
FOLLOW|Follow target position.|subject,target|Runtime relation.
ANCHOR_TO|Anchor to named point.|subject,target,anchor|Stable attachment.`],

  ['15. Collision and anti-overlap', `
MEASURE_BOUNDS|Get actual/estimated bounds.|node|Bounds result.
CHECK_OVERLAP|Detect overlap.|A,B|Boolean + overlap.
CHECK_CONTAINMENT|Detect containment.|A,B|Boolean.
CALCULATE_OVERLAP|Compute overlap area.|A,B|Area.
SEPARATION_VECTOR|Compute deterministic minimum separation.|A,B|MTV.
RESOLVE_COLLISION|Move lower-priority item.|collision pair|Updated layout.
PROTECT_PRIMARY|Lock primary content.|priority group|Primary protected.
REFLOW_SECONDARY|Reflow secondary labels.|group|Deterministic reflow.
WRAP_TEXT|Wrap long text.|text,maxWidth|Updated bounds.
REFRAME_CAMERA|Adjust camera for safe space.|region|Camera change.
SPLIT_BEAT|Split dense visual lesson beat.|beat|Multiple beats.
VALIDATE_VIEWPORT|Check safe margins.|layout, viewport|PASS/FAIL.`],

  ['16. Physics visuals', `
CREATE_COORDINATE_SYSTEM|Create axes.|origin, scale|Axes.
CREATE_AXIS|Create single axis.|orientation, range|Axis.
CREATE_VECTOR|Vector entity.|origin, direction, magnitude|Vector.
CREATE_FORCE_DIAGRAM|Free-body/force diagram.|object, forces|Diagram.
CREATE_VELOCITY_VECTOR|Velocity vector.|object/state|Vector.
CREATE_ACCELERATION_VECTOR|Acceleration vector.|object/state|Vector.
CREATE_PROJECTILE|Projectile object.|initial state|Motion object.
DRAW_TRAJECTORY|Draw trajectory.|motion|Curve.
SHOW_COMPONENTS|Resolve vector components.|vector|Components.
DECOMPOSE_VECTOR|Show x/y components.|vector|Component arrows.
SHOW_GRAVITY|Gravity arrow/field.|target|Downward force.
APPLY_FORCE|Semantic force action.|target,force|State update.
APPLY_GRAVITY|Gravity influence.|target|Simulation/visual.
SIMULATE_COLLISION|Visual collision event.|A,B|Collision animation.
CREATE_FIELD|Field visualization.|field type|Field.
DRAW_FIELD_LINES|Field lines.|source, pattern|Lines.
SHOW_MOMENTUM|Momentum vector/annotation.|object|Vector/explanation.
SHOW_WORK|Force-displacement/work visual.|force,path|Diagram.
SHOW_ENERGY_BAR|Energy comparison.|energy values|Bars/labels.
CREATE_BLOCK|Create block entity on surface.|mass,label|Block shape.
SHOW_FORCE|Show force vector at angle.|magnitude,angle,label|Vector arrow.
CALCULATE_NORMAL_FORCE|Calculate normal force.|equation,result|Normal force.
CALCULATE_FRICTION|Calculate friction force.|equation,result|Friction force.
CALCULATE_NET_FORCE|Calculate net horizontal force.|equation,result|Net force.
APPLY_NEWTON_SECOND_LAW|Apply Newton second law F=ma.|equation,result|Acceleration equation.
ANIMATE_ACCELERATION|Animate block acceleration.|direction,acceleration|Block motion.`],

  ['17. Mathematics / graphs', `
CREATE_AXES|Create graph axes.|ranges, scale|Axes.
PLOT_FUNCTION|Plot function.|expression, domain|Graph.
PLOT_PARAMETRIC|Plot parametric curve.|x(t),y(t),range|Curve.
PLOT_POLAR|Plot polar curve.|r(theta),range|Curve.
PLOT_POINTS|Plot discrete points.|points|Point set.
DRAW_NUMBER_LINE|Number line.|range, ticks|Number line.
MOVE_POINT_ON_GRAPH|Animate point.|graph,parameter|Point motion.
SHOW_TANGENT|Tangent line at point.|graph,point|Tangent.
SHOW_SECANT|Secant line.|graph,points|Secant.
SHADE_AREA|Shade region under/within graph.|bounds|Area.
SHADE_BETWEEN|Shade between curves.|f,g,range|Region.
SHOW_INTERCEPTS|Mark intercepts.|function|Markers.
SHOW_ROOTS|Mark roots/solutions.|function|Markers.
TRANSFORM_GRAPH|Animate graph transformation.|source,target|Morph/transform.
REFLECT_GRAPH|Reflect across axis.|graph,axis|Transformation.
TRANSLATE_GRAPH|Translate graph.|graph,delta|Transformation.
SCALE_GRAPH|Scale graph.|graph,factor|Transformation.
ANNOTATE_SLOPE|Show slope.|line,points|Slope triangle.
CREATE_RIEMANN_SUM|Draw Riemann rectangles approximation.|function,interval,partitions|Rectangles.
REFINE_PARTITIONS|Refine partition count for integral.|from,to|Refined rectangles.
SHOW_AREA|Shade area under function curve.|function,interval|Shaded region.
SHOW_ANTIDERIVATIVE|Show antiderivative expression.|expression,antiderivative|Integral step.
EVALUATE_BOUNDS|Evaluate antiderivative at upper/lower bounds.|antiderivative,bounds,result|Bound evaluation.`],

  ['18. Chemistry visuals', `
CREATE_ATOM|Create atom representation.|element, shell model|Atom.
CREATE_NUCLEUS|Create nucleus.|protons,neutrons|Nucleus.
CREATE_ELECTRON|Create electron.|shell/position|Electron.
CREATE_ORBITAL|Represent orbital.|type|Orbital.
CREATE_BOND|Create bond.|atoms,bondType|Bond.
CREATE_MOLECULE|Create molecule.|formula,geometry|Molecule.
CREATE_BENZENE|Create benzene structure.|substituents|Ring.
CREATE_REACTION_ARROW|Create reaction arrow.|reactants,products|Arrow.
CREATE_REACTION_SCHEME|Reaction diagram.|reactants,conditions,products|Scheme.
MOVE_ELECTRON|Animate electron movement.|electron,path|Motion.
BREAK_BOND|Animate bond breaking.|bond|Break.
FORM_BOND|Animate bond formation.|atoms|Form.
ROTATE_MOLECULE|Rotate molecule.|molecule,angle|Rotation.
SHOW_MOLECULAR_COLLISION|Molecule collision.|A,B|Collision.
SHOW_CONSERVATION|Show atom count conservation.|reaction|Count comparison.
BALANCE_EQUATION|Show balanced chemical equation.|equation|Balanced equation.
HIGHLIGHT_ATOM|Highlight selected atom.|atom|Highlight.
SHOW_RESONANCE|Show resonance forms.|fromPattern,toPattern|Resonance equilibrium.
SHOW_PI_CLOUD|Show delocalized pi electron cloud.|radius,innerRadius|Pi cloud.
ANIMATE_ELECTRON_DELOCALIZATION|Animate pi electrons delocalization.|count,speed|Electron motion.
SUBSTITUTE_GROUP|Substitute hydrogen with functional group.|targetAtom,substituent|Substitution reaction.`],

  ['19. Biology visuals', `
CREATE_CELL|Cell structure.|cellType|Cell.
CREATE_ORGANELLE|Create organelle.|type|Organelle.
CREATE_DNA|DNA representation.|sequence/length|DNA.
CREATE_PROTEIN|Protein/chain representation.|structure|Protein.
CREATE_MEMBRANE|Membrane representation.|type|Membrane.
CREATE_PATHWAY|Biological pathway.|steps|Pathway.
DRAW_REPLICATION|DNA replication sequence.|process|Animation.
DRAW_TRANSLATION|Protein translation sequence.|process|Animation.
SHOW_SIGNAL_PATHWAY|Signal transduction.|nodes,edges|Pathway.
ANNOTATE_BIOLOGY_REGION|Label biological image region.|region,label|Annotation.`],

  ['20. Computer science visuals', `
DRAW_ARRAY|Draw indexed array.|values,indices|Array cells.
HIGHLIGHT_ARRAY_RANGE|Highlight subarray.|low,high|Range.
MARK_LOW|Mark lower bound.|array,index|Pointer.
MARK_HIGH|Mark upper bound.|array,index|Pointer.
MARK_MIDPOINT|Mark midpoint.|array,index|Pointer.
DRAW_LINKED_LIST|Draw linked list.|nodes,links|List.
DRAW_TREE|Draw tree.|root,children|Tree.
DRAW_BINARY_SEARCH_TREE|BST diagram.|nodes|Tree.
DRAW_HEAP|Heap diagram.|nodes|Heap.
DRAW_STACK|Stack diagram.|items|Stack.
DRAW_QUEUE|Queue diagram.|items|Queue.
DRAW_GRAPH_CS|Graph data structure.|nodes,edges|Graph.
DRAW_HASH_TABLE|Hash table.|buckets,entries|Table.
DRAW_POINTER|Pointer/reference.|source,target|Pointer.
DRAW_MEMORY_DIAGRAM|Memory visualization.|objects,addresses|Diagram.
DRAW_FLOW|Data/control flow.|nodes,edges|Flow.
SHOW_ALGORITHM_STEP|Mark current algorithm operation.|step|Highlight.`],

  ['21. Environment / natural effects', `
CREATE_PARTICLES|Particle field.|count,region|Particles.
CREATE_RAIN|Rain effect.|region,intensity|Particles/lines.
CREATE_SNOW|Snow effect.|region,intensity|Particles.
CREATE_WIND|Wind visual.|direction,intensity|Flow lines.
CREATE_CLOUDS|Cloud layer.|region|Cloud shapes.
CREATE_SUN|Sun/illumination visual.|position|Sun.
CREATE_RAYS|Light rays.|source,target|Rays.
CREATE_LIGHTNING|Lightning stroke.|origin,target|Lightning.
CREATE_FOG|Fog layer.|region,density|Fog.
CREATE_SMOKE|Smoke effect.|source|Particles.
CREATE_FIRE|Fire effect.|source,intensity|Particles/shape.
CREATE_WATER|Water surface.|region|Water.
CREATE_WAVES|Wave motion.|surface|Wave animation.
CREATE_DUST|Dust particles.|source|Particles.
CREATE_SPARKS|Sparks.|source|Particles.`],

  ['22. Characters and vehicles', `
CREATE_CHARACTER|Simple character entity.|role,pose|Character.
SET_POSE|Change pose.|character,pose|Pose.
PLAY_MOTION|Walk/run/jump/idle/turn.|character,motion|Motion.
LOOK_AT|Character gaze.|character,target|Orientation.
POINT_AT|Character points.|character,target|Gesture.
CREATE_VEHICLE|Vehicle entity.|type|Vehicle.
MOVE_VEHICLE|Move vehicle.|vehicle,path|Motion.
ORIENT_VEHICLE|Orient vehicle.|vehicle,path|Orientation.
SHOW_INTERACTION|Character-object interaction.|actors,targets|Action.`],

  ['23. 3D / spatial concepts for ManimGL', `
CREATE_3D_OBJECT|Create controlled 3D object.|type,semantic role|3D object.
CREATE_MESH|Create mesh.|mesh spec|3D mesh.
LOAD_MODEL|Load approved model asset.|assetId|3D asset.
MOVE_3D|Move object in 3D.|target,semantic destination|3D motion.
ROTATE_3D|Rotate 3D object.|target,axis,angle|Rotation.
SCALE_3D|Scale 3D object.|target,scale|Scale.
HIGHLIGHT_FACE|Highlight 3D face.|object,face|Highlight.
HIGHLIGHT_EDGE|Highlight 3D edge.|object,edge|Highlight.
SECTION_VIEW|Section/cut view.|object,plane|Section.
EXPLODE_VIEW|Exploded assembly.|group|Exploded state.
SHOW_3D_AXIS|3D coordinate axes.|origin,range|Axes.
CREATE_LIGHT|Controlled light.|type,position|Light.
SET_MATERIAL|Set allowed material properties.|object,material|Material.
ORBIT_CAMERA|Orbit around target.|target,angle|Camera motion.
LOOK_AT_3D|Orient camera toward target.|target|Camera.`],

  ['24. Image and annotation', `
CREATE_IMAGE|Place image asset.|assetId|Image node.
RESIZE_IMAGE|Resize image.|image,size|Image bounds.
CROP_IMAGE|Crop image region.|region|Crop.
IMAGE_REGION|Define semantic image region.|bounds,role|Region anchor.
ARROW_TO_REGION|Draw arrow to region.|region,label|Annotation.
CIRCLE_REGION|Circle region.|region|Annotation.
BOX_REGION|Box region.|region|Annotation.
HIGHLIGHT_IMAGE_REGION|Highlight image region.|region|Overlay.
LABEL_REGION|Handwrite label.|region,text|Label.
TRACE_CONTOUR|Trace region outline.|region|Stroke.
DRAW_MEASUREMENT_ON_IMAGE|Dimension image feature.|region,value|Measurement.
COMPARE_IMAGE_REGIONS|Compare two image regions.|regionA,regionB|Comparison.`],

  ['25. Assets and media', `
LOAD_IMAGE_ASSET|Load approved local/remote image asset.|assetId/url policy|Image asset.
LOAD_VIDEO_ASSET|Load approved video asset when explicitly requested.|assetId|Video asset.
LOAD_AUDIO_ASSET|Attach audio asset.|assetId|Audio asset.
CREATE_AUDIO_CUE|Associate audio timing cue.|segmentId|Cue.
LOAD_MODEL_ASSET|Load controlled 3D asset.|assetId|Model.
CREATE_REFERENCE_BOARD|Create visual reference group.|assets|Board/group.
CACHE_ASSET|Cache deterministic asset.|asset hash|Cache record.
RELEASE_ASSET|Release unused asset.|assetId|Resource cleanup.`],

  ['26. Interaction and user control', `
PAUSE_LESSON|Pause teaching.|lessonId|Paused.
RESUME_LESSON|Resume teaching.|lessonId|Running.
CANCEL_LESSON|Cancel teaching.|lessonId|Cancelled.
UNDO_STROKE|Undo learner stroke.|strokeId|User ink updated.
REDO_STROKE|Redo learner stroke.|strokeId|User ink updated.
ERASE_LEARNER_STROKE|Erase learner stroke.|strokeId|Removed.
SELECT_OBJECT|Select visual object.|nodeId|Selection state.
DESELECT_OBJECT|Clear selection.|nodeId|Selection cleared.
LASSO_SELECT|Select region by lasso.|path|Selection set.
DRAG_OBJECT|User drag interaction.|nodeId,delta|Validated update.`],

  ['27. Special instructional transformations', `
SHOW_BEFORE_AFTER|Compare two states.|before,after|Comparison scene.
DUPLICATE_OBJECT|Create explanatory copy.|source,relation|Copy.
SPLIT_OBJECT|Split concept into components.|source,parts|Multiple nodes.
MERGE_OBJECTS|Merge conceptual pieces.|sources,target|Composite.
EXPLODE_OBJECT|Expose internal components.|object|Exploded view.
COLLAPSE_GROUP|Collapse detail into summary.|group|Compact view.
EXPAND_GROUP|Reveal detail.|group|Expanded view.
TRACE_CAUSAL_CHAIN|Draw cause-effect chain.|nodes|Arrows.
COMPARE_STATES|Show state difference.|A,B|Difference highlight.
SHOW_COUNTEREXAMPLE|Introduce counterexample.|concept,example|Contrasting visual.
SHOW_MISTAKE|Intentionally show incorrect state for correction.|mistake|Clearly labeled incorrect state.
CORRECT_MISTAKE|Animate correction.|before,after|Correction.`],

  ['28. Lesson-control semantics', `
INTRODUCE_CONCEPT|Introduce one concept.|concept|Teaching beat.
DEFINE_TERM|Define a term visually.|term,definition|Definition.
GIVE_EXAMPLE|Show example.|example|Example.
GIVE_COUNTEREXAMPLE|Show counterexample.|example|Counterexample.
COMPARE|Compare two concepts.|A,B|Comparison.
SUMMARIZE|Summarize lesson.|key ideas|Summary board.
CHECK_UNDERSTANDING|Insert learner check.|question/options|Checkpoint.
ASK_CLARIFICATION|Ask learner to confirm interpretation.|candidate interpretation|Interactive prompt.
SHOW_FINAL_ANSWER|Reveal final answer.|answer|Final emphasis.
END_LESSON|Close lesson.|summary|Completed state.`],

  ['29. Visual Instruction IR', `
CREATE_VISUAL_STEP|Create one explicit step.|stepId, beatId, objective|Step.
SET_SEMANTIC_ROLE|Name what the object means.|role|Traceable semantics.
SET_RELATION|Define spatial/structural relation.|relation,target|No raw coordinate authority.
SET_PRIORITY|Protect important teaching content.|PRIMARY/SECONDARY/TERTIARY/BACKGROUND|Layout priority.
SET_PACE|Choose drawing pace.|fast/normal/deliberate|Timeline hint.
SET_NARRATION_CUE|Bind visual to narration.|cueId|Synchronization.
SET_COMPLETION_CRITERIA|Define done condition.|criterion|Action completion gate.
DECLARE_DEPENDENCY|Require another action first.|actionId|Execution order.
DECLARE_OPTIONAL_ACTION|Mark nonessential visual.|condition|May be omitted explicitly.`],

  ['30. Anti-overlap policy', `
VALIDATE_TARGET_BOUNDS|Ensure target exists and is measurable.|node/target|Prevent invalid positioning.
RESOLVE_WITH_LAYOUT|Use deterministic semantic layout.|relations, bounds|Do not let AI choose final coordinates.
CHECK_COLLISION|Check all protected overlaps.|resolved layout|PASS/FAIL.
REFRAME_IF_NEEDED|Move camera after local reflow.|scene extent|Preserve teaching focus.
SPLIT_DENSE_STEP|Split crowded instructional beat.|beat|Prefer clarity.`],

  ['31. AI output constraints', `
REJECT_RAW_CODE|Reject Python/Manim/ManimGL/JS/SVG/HTML/code blocks.|model output|Never executable.
REJECT_RAW_COORDINATES|Reject authoritative x/y coordinates from model.|action|Layout owns placement.
REJECT_UNKNOWN_CAPABILITY|Reject functions outside registry.|type|Explicit failure.
REJECT_INCOMPLETE_PLAN|Reject missing final beat/visual actions.|plan|Repair before execution.
REJECT_STALE_REQUEST|Reject superseded request.|request/session IDs|Newest active request wins.
REJECT_UNRELATED_FALLBACK|Never substitute old demo.|failure context|Controlled error.`],

  ['33. Electrical and embedded systems', `
CREATE_ESP32|Create a semantic ESP32 board with CPU, radio, USB, pin headers and named GPIO anchors.|label, highlightedPins|Persistent microcontroller object.
CREATE_GPIO|Expose a named GPIO terminal on a microcontroller.|board, pin|GPIO object attached to the board.
SET_GPIO_STATE|Change a GPIO between LOW and HIGH while preserving the same object.|target, state|Semantic state mutation.
CREATE_RESISTOR|Draw an educational resistor with terminals and value label.|value, label|Circuit component.
CREATE_LED|Draw an LED with electrical terminals and light rays.|label|Circuit component.
SET_LED_STATE|Turn an existing LED ON or OFF without replacing it.|target, state|Semantic state mutation.
CREATE_GROUND|Draw a ground reference with a connection anchor.|label|Circuit component.
CREATE_WIRE|Route an orthogonal wire between semantic anchors.|from, to, fromAnchor, toAnchor|Deterministic connected path.
CREATE_CODE_BLOCK|Draw a compact, line-addressable code panel.|language, code|Code object with line anchors.
HIGHLIGHT_CODE_LINE|Highlight a named line in an existing code block.|target, line|Attached emphasis.
SHOW_CURRENT_FLOW|Draw directional current markers along connected wires.|wires, direction|Current-flow overlay.`],

  ['32. MVP compatibility aliases', `
DRAW_GRAPH|Plot a function graph (alias).|expression, domain|Executes PLOT_FUNCTION.
DRAW_AXIS|Create graph axes (alias).|ranges|Executes CREATE_AXES.
MOVE_OBJECT|Move object (alias).|target, destination|Executes MOVE_TO.
TRANSFORM_OBJECT|Transform object (alias).|source, target|Executes TRANSFORM.
FADE_OBJECT|Fade object out (alias).|target|Executes FADE_OUT.
REVEAL_STROKE|Reveal hidden visual (alias).|target|Executes REVEAL.
UNDERLINE|Underline text (alias).|target|Executes UNDERLINE_TEXT.
STRIKE_TERM|Strike out a term (alias).|target|Executes STRIKE_TEXT.
HIGHLIGHT_TERM|Highlight a term (alias).|target|Executes HIGHLIGHT.
DRAW_SHAPE|Draw a generic polygon (alias).|vertices|Executes DRAW_POLYGON.`],
];

const DOMAIN_BY_SECTION: Readonly<Record<CapabilitySection, string>> = Object.freeze({
  '1. Core instruction contract': 'runtime',
  '2. Text, handwriting, and typography': 'typography',
  '3. Mathematical writing': 'mathematics',
  '4. Basic geometric drawing': 'geometry',
  '5. Lines, paths, arrows, vectors': 'geometry',
  '6. Diagram structure': 'diagramming',
  '7. Highlights and emphasis': 'presentation',
  '8. Visibility and reveal': 'presentation',
  '9. Motion and transformation': 'animation',
  '10. Drawing-specific animation': 'animation',
  '11. Timeline and sequencing': 'timeline',
  '12. Easing and motion feel': 'animation',
  '13. Camera and framing': 'camera',
  '14. Spatial relationships and layout': 'layout',
  '15. Collision and anti-overlap': 'layout',
  '16. Physics visuals': 'physics',
  '17. Mathematics / graphs': 'mathematics',
  '18. Chemistry visuals': 'chemistry',
  '19. Biology visuals': 'biology',
  '20. Computer science visuals': 'computer-science',
  '21. Environment / natural effects': 'environment',
  '22. Characters and vehicles': 'storytelling',
  '23. 3D / spatial concepts for ManimGL': 'spatial-3d',
  '24. Image and annotation': 'imaging',
  '25. Assets and media': 'media',
  '26. Interaction and user control': 'interaction',
  '27. Special instructional transformations': 'pedagogy',
  '28. Lesson-control semantics': 'pedagogy',
  '29. Visual Instruction IR': 'runtime',
  '30. Anti-overlap policy': 'layout',
  '31. AI output constraints': 'safety',
  '32. MVP compatibility aliases': 'compatibility',
  '33. Electrical and embedded systems': 'embedded-systems',
});

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function categoryFor(section: CapabilitySection): string {
  return section
    .replace(/^\d+\.\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildMetadata(
  type: string,
  section: CapabilitySection,
  purpose: string,
  inputs: string,
  notes: string,
  implemented: boolean
): Pick<
  Capability,
  'version' | 'domain' | 'category' | 'renderer' | 'implementation' | 'test' | 'example' | 'keywords'
> {
  const canonical = ALIASES[type] ?? type;
  const domain = DOMAIN_BY_SECTION[section];
  const category = categoryFor(section);
  const implementation: CapabilityImplementationMetadata = Object.freeze({
    status: implemented ? 'implemented' : 'documented-only',
    file: implemented ? 'src/scene/execute.ts' : null,
    entryPoint: implemented ? 'applyAction' : null,
    canonicalType: canonical,
  });
  const test: CapabilityTestMetadata = Object.freeze({
    status: implemented ? 'registry-covered' : 'not-implemented',
    file: 'tests/registry.test.ts',
  });
  const example: CapabilityExample = Object.freeze({
    intent: purpose.replace(/\.$/, ''),
    action: Object.freeze({
      type,
      semanticRole: category,
      parameters: Object.freeze({}),
    }),
  });
  const keywords = Object.freeze(
    Array.from(
      new Set(words([type, canonical, section, purpose, inputs, notes, domain, category].join(' ')))
    ).sort()
  );

  return {
    version: VISUAL_FUNCTION_REGISTRY_VERSION,
    domain,
    category,
    renderer: implemented ? 'browser-canvas' : 'none',
    implementation,
    test,
    example,
    keywords,
  };
}

function build(): Capability[] {
  const out: Capability[] = [];
  const seen = new Set<string>();
  for (const [section, block] of TABLE) {
    for (const raw of block.trim().split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split('|');
      const type = parts[0];
      if (!type || seen.has(type)) continue; // first definition wins
      seen.add(type);
      const purpose = parts[1] ?? '';
      const inputs = parts[2] ?? '';
      const notes = parts[3] ?? '';
      const implemented = IMPLEMENTED.has(type);
      const cap: Capability = Object.freeze({
        type,
        section,
        purpose,
        inputs,
        notes,
        implemented,
        ...(ALIASES[type] ? { aliasOf: ALIASES[type] } : {}),
        ...buildMetadata(type, section, purpose, inputs, notes, implemented),
      });
      out.push(cap);
    }
  }
  return out;
}

/** Every capability name in the registry documents. */
export const CAPABILITIES: readonly Capability[] = Object.freeze(build());

export const CAPABILITY_BY_TYPE: ReadonlyMap<string, Capability> = new Map(
  CAPABILITIES.map((c) => [c.type, c])
);

/** Capability names this build can actually draw. */
export const EXECUTABLE_TYPES: readonly string[] = Object.freeze(
  CAPABILITIES.filter((c) => c.implemented).map((c) => c.type)
);

/** True when the name exists anywhere in the registry documents. */
export function isKnownCapability(type: string): boolean {
  return CAPABILITY_BY_TYPE.has(type);
}

/** True when the name has a deterministic executor in this build. */
export function isExecutable(type: string): boolean {
  return CAPABILITY_BY_TYPE.get(type)?.implemented === true;
}

/** Resolve an alias to the capability the engine actually runs. */
export function canonicalType(type: string): string {
  return ALIASES[type] ?? type;
}

/** Spatial relation names the layout engine understands (section 14). */
export const RELATION_TYPES: readonly string[] = Object.freeze([
  'ABOVE', 'BELOW', 'LEFT_OF', 'RIGHT_OF', 'BESIDE', 'CENTERED_ON', 'ATTACHED_TO',
  'ALIGNED_WITH', 'NEAR', 'FAR', 'INSIDE', 'BETWEEN', 'ANCHOR_TO', 'FOLLOW',
  'POINTS_TO', 'CONNECTED_TO',
]);

export const PRIORITIES: readonly string[] = Object.freeze([
  'PRIMARY', 'SECONDARY', 'TERTIARY', 'BACKGROUND',
]);

export interface CapabilityFilter {
  domain?: string;
  category?: string;
  section?: CapabilitySection;
  renderer?: CapabilityRenderer;
  implemented?: boolean;
  includeAliases?: boolean;
}

export interface CapabilitySearchOptions extends CapabilityFilter {
  /** Maximum number of ranked matches. Defaults to 10. */
  limit?: number;
}

export interface CapabilitySearchResult {
  capability: Capability;
  score: number;
  matchedTerms: readonly string[];
}

export interface CapabilityValidationOptions {
  /** Model-selected functions must be executable. Defaults to true. */
  requireImplemented?: boolean;
}

export interface CapabilityValidationResult {
  ok: boolean;
  errors: readonly string[];
  capability?: Capability;
  canonicalType?: string;
}

/** Source-code-free capability description safe to include in a model prompt. */
export interface ModelCapability {
  name: string;
  version: string;
  description: string;
  domain: string;
  category: string;
  parameters: {
    type: 'semantic-object';
    description: string;
  };
  output: {
    description: string;
  };
  example: CapabilityExample;
  aliasOf?: string;
}

const SEARCH_SYNONYM_GROUPS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['create', 'construct', 'draw', 'make', 'render', 'show', 'visualize']),
  Object.freeze(['array', 'list', 'sequence']),
  Object.freeze(['graph', 'plot', 'chart', 'curve', 'function']),
  Object.freeze(['emphasize', 'focus', 'highlight', 'mark']),
  Object.freeze(['erase', 'fade', 'hide', 'remove']),
  Object.freeze(['move', 'shift', 'translate']),
  Object.freeze(['handwriting', 'label', 'text', 'word', 'writing']),
  Object.freeze(['equation', 'expression', 'formula', 'math', 'mathematical']),
  Object.freeze(['arrow', 'direction', 'vector']),
  Object.freeze(['camera', 'frame', 'framing', 'viewport', 'zoom']),
  Object.freeze(['hierarchy', 'node', 'tree']),
  Object.freeze(['atom', 'bond', 'chemical', 'chemistry', 'molecule']),
  Object.freeze(['code', 'computer', 'programming', 'algorithm']),
  Object.freeze(['esp32', 'embedded', 'gpio', 'microcontroller']),
  Object.freeze(['circuit', 'electrical', 'electronics', 'resistor', 'wire']),
  Object.freeze(['led', 'light', 'diode']),
  Object.freeze(['box', 'rectangle', 'square']),
  Object.freeze(['delay', 'pause', 'wait']),
  Object.freeze(['display', 'reveal', 'show']),
  Object.freeze(['image', 'photo', 'picture']),
  Object.freeze(['spatial', '3d', 'three-dimensional']),
]);

const SEARCH_SYNONYMS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const out = new Map<string, ReadonlySet<string>>();
  for (const group of SEARCH_SYNONYM_GROUPS) {
    const terms = new Set(group);
    for (const term of group) out.set(term, terms);
  }
  return out;
})();

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with',
]);

function normaliseCapabilityName(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

function matchesFilter(capability: Capability, filter: CapabilityFilter): boolean {
  if (filter.domain && capability.domain !== filter.domain) return false;
  if (filter.category && capability.category !== filter.category) return false;
  if (filter.section && capability.section !== filter.section) return false;
  if (filter.renderer && capability.renderer !== filter.renderer) return false;
  if (filter.implemented !== undefined && capability.implemented !== filter.implemented) return false;
  if (filter.includeAliases === false && capability.aliasOf) return false;
  return true;
}

function isParameterObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Immutable query facade over the closed catalog. It intentionally has no
 * `register` method: runtime/model output cannot mutate the allowlist.
 */
export class VisualFunctionRegistry {
  readonly version = VISUAL_FUNCTION_REGISTRY_VERSION;
  readonly #capabilities: readonly Capability[];
  readonly #byType: ReadonlyMap<string, Capability>;

  constructor(capabilities: readonly Capability[] = CAPABILITIES) {
    this.#capabilities = Object.freeze([...capabilities]);
    this.#byType = new Map(capabilities.map((capability) => [capability.type, capability]));
  }

  get(name: string): Capability | undefined {
    return this.#byType.get(normaliseCapabilityName(name));
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  list(filter: CapabilityFilter = {}): readonly Capability[] {
    return Object.freeze(this.#capabilities.filter((capability) => matchesFilter(capability, filter)));
  }

  search(query: string, options: CapabilitySearchOptions = {}): readonly CapabilitySearchResult[] {
    const { limit = 10, ...filter } = options;
    const queryTokens = Array.from(new Set(words(query))).filter(
      (term) => !SEARCH_STOP_WORDS.has(term)
    );
    const normalizedQuery = normaliseCapabilityName(query);
    const results: CapabilitySearchResult[] = [];

    for (const capability of this.#capabilities) {
      if (!matchesFilter(capability, filter)) continue;
      const typeTokens = new Set(words(capability.type));
      const index = new Set(capability.keywords);
      const matched = new Set<string>();
      let score = 0;

      if (normalizedQuery && capability.type === normalizedQuery) score += 1_000;
      else if (normalizedQuery && capability.type.includes(normalizedQuery)) score += 80;

      for (const term of queryTokens) {
        if (typeTokens.has(term)) {
          score += 24;
          matched.add(term);
          continue;
        }
        if (index.has(term)) {
          score += 12;
          matched.add(term);
          continue;
        }

        const synonyms = SEARCH_SYNONYMS.get(term);
        if (synonyms) {
          const synonym = Array.from(synonyms).find(
            (candidate) => typeTokens.has(candidate) || index.has(candidate)
          );
          if (synonym) {
            score += typeTokens.has(synonym) ? 10 : 5;
            matched.add(`${term}:${synonym}`);
            continue;
          }
        }

        const prefix = Array.from(index).find(
          (candidate) => candidate.startsWith(term) || term.startsWith(candidate)
        );
        if (prefix) {
          score += 3;
          matched.add(`${term}:${prefix}`);
        }
      }

      if (score === 0) continue;
      score += matched.size * 2;
      if (capability.implemented) score += 1;
      results.push({
        capability,
        score,
        matchedTerms: Object.freeze(Array.from(matched).sort()),
      });
    }

    const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 10;
    return Object.freeze(
      results
        .sort((a, b) => b.score - a.score || a.capability.type.localeCompare(b.capability.type))
        .slice(0, boundedLimit)
        .map((result) => Object.freeze(result))
    );
  }

  validate(
    candidate: unknown,
    options: CapabilityValidationOptions = {}
  ): CapabilityValidationResult {
    const errors: string[] = [];
    let rawName: unknown = candidate;
    let parameters: unknown;
    let parametersProvided = false;

    if (isParameterObject(candidate)) {
      rawName = candidate.type ?? candidate.name;
      parametersProvided = Object.hasOwn(candidate, 'parameters');
      parameters = candidate.parameters;
    }

    if (typeof rawName !== 'string' || !rawName.trim()) {
      return Object.freeze({
        ok: false,
        errors: Object.freeze(['REGISTRY_INVALID_NAME: expected a non-empty capability name']),
      });
    }

    const capability = this.get(rawName);
    if (!capability) {
      return Object.freeze({
        ok: false,
        errors: Object.freeze([
          `REJECT_UNKNOWN_CAPABILITY: "${normaliseCapabilityName(rawName)}" is not registered`,
        ]),
      });
    }

    if (parametersProvided && !isParameterObject(parameters)) {
      errors.push('REGISTRY_INVALID_PARAMETERS: parameters must be an object');
    }
    if ((options.requireImplemented ?? true) && !capability.implemented) {
      errors.push(`REGISTRY_NOT_IMPLEMENTED: "${capability.type}" has no deterministic executor`);
    }

    const result: CapabilityValidationResult = {
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      capability,
      canonicalType: capability.implementation.canonicalType,
    };
    return Object.freeze(result);
  }

  /** Only executable entries are exposed to a model for function selection. */
  modelCatalog(filter: Omit<CapabilityFilter, 'implemented'> = {}): readonly ModelCapability[] {
    return Object.freeze(
      this.list({ ...filter, implemented: true }).map((capability) => {
        const item: ModelCapability = {
          name: capability.type,
          version: capability.version,
          description: capability.purpose,
          domain: capability.domain,
          category: capability.category,
          parameters: Object.freeze({
            type: 'semantic-object',
            description: capability.inputs,
          }),
          output: Object.freeze({ description: capability.notes }),
          example: capability.example,
          ...(capability.aliasOf ? { aliasOf: capability.aliasOf } : {}),
        };
        return Object.freeze(item);
      })
    );
  }
}

/** Shared immutable registry instance used by tools and agents. */
export const VISUAL_FUNCTIONS = new VisualFunctionRegistry();

/** Source-code-free model catalog; executable entries only. */
export function modelCapabilityCatalog(
  filter: Omit<CapabilityFilter, 'implemented'> = {}
): readonly ModelCapability[] {
  return VISUAL_FUNCTIONS.modelCatalog(filter);
}

/**
 * Compact, deterministic rendering of the drawable capabilities, grouped by
 * registry section, for inclusion in an agent prompt.
 *
 * This is the mechanism that stops a planner hallucinating SUMMON_DRAGON: the
 * registry answers "what can be drawn?", the model only selects from the answer.
 * It is a pure function of the registry, so the same build always produces the
 * same sheet.
 */
export function capabilitySheet(): string {
  const bySection = new Map<string, string[]>();
  for (const cap of CAPABILITIES) {
    if (!cap.implemented) continue;
    const list = bySection.get(cap.section) ?? [];
    list.push(`${cap.type} — ${cap.purpose} (inputs: ${cap.inputs})`);
    bySection.set(cap.section, list);
  }
  return Array.from(bySection.entries())
    .map(([section, rows]) => `${section}\n${rows.map((r) => `  ${r}`).join('\n')}`)
    .join('\n\n');
}

/**
 * The capability sheet narrowed to a specific set of types.
 *
 * The composer does not need all 126 drawable capabilities described to it —
 * the planner has already chosen which ones the lesson uses. Sending the full
 * catalog made the composer prompt enormous, which cost latency and, on a
 * capped budget, truncated the reply before the JSON was finished.
 */
export function capabilitySheetFor(types: readonly string[]): string {
  const wanted = new Set(types.map(canonicalType));
  const bySection = new Map<string, string[]>();
  for (const cap of CAPABILITIES) {
    if (!cap.implemented || !wanted.has(cap.type)) continue;
    const list = bySection.get(cap.section) ?? [];
    list.push(`${cap.type} - ${cap.purpose} (inputs: ${cap.inputs})`);
    bySection.set(cap.section, list);
  }
  if (bySection.size === 0) return capabilitySheet();
  return Array.from(bySection.entries())
    .map(([section, rows]) => `${section}\n${rows.map((r) => `  ${r}`).join('\n')}`)
    .join('\n\n');
}

/**
 * Sections every lesson needs whatever the subject: writing, shapes, arrows,
 * emphasis, reveal, motion, camera and lesson control.
 */
const CORE_SECTIONS: readonly string[] = [
  '2. Text, handwriting, and typography',
  '3. Mathematical writing',
  '4. Basic geometric drawing',
  '5. Lines, paths, arrows, vectors',
  '7. Highlights and emphasis',
  '8. Visibility and reveal',
  '9. Motion and transformation',
  '13. Camera and framing',
  '28. Lesson-control semantics',
];

const DOMAIN_SECTION: Record<string, string> = {
  physics: '16. Physics visuals',
  mathematics: '17. Mathematics / graphs',
  chemistry: '18. Chemistry visuals',
  biology: '19. Biology visuals',
  computer_science: '20. Computer science visuals',
  electrical_engineering: '33. Electrical and embedded systems',
  semiconductor: '33. Electrical and embedded systems',
  embedded_systems: '33. Electrical and embedded systems',
};

/**
 * The capability sheet narrowed to one subject.
 *
 * A chemistry lesson has no use for the sorting-visualisation capabilities, and
 * describing all 126 of them costs tokens on every request. On a metered or
 * free-tier key that waste is the difference between a lesson working and the
 * reply being truncated before its JSON is finished.
 */
export function capabilitySheetForDomain(domain: string): string {
  const wanted = new Set<string>(CORE_SECTIONS);
  const specific = DOMAIN_SECTION[domain];
  if (specific) wanted.add(specific);

  const bySection = new Map<string, string[]>();
  for (const cap of CAPABILITIES) {
    if (!cap.implemented || !wanted.has(cap.section)) continue;
    const list = bySection.get(cap.section) ?? [];
    list.push(`${cap.type} - ${cap.purpose} (inputs: ${cap.inputs})`);
    bySection.set(cap.section, list);
  }
  if (bySection.size === 0) return capabilitySheet();
  return Array.from(bySection.entries())
    .map(([section, rows]) => `${section}\n${rows.map((r) => `  ${r}`).join('\n')}`)
    .join('\n\n');
}
