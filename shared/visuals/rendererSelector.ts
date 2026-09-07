import type { Domain } from '../contracts.ts';
import type { VisualRenderer } from './mermaid.ts';

export interface VisualIntent {
  purpose: string;
  domain?: Domain;
  preferredRenderer?: VisualRenderer;
  requiresAnimation?: boolean;
  requires3d?: boolean;
}

export interface RendererSelection {
  primary: Exclude<VisualRenderer, 'auto'>;
  secondary?: Exclude<VisualRenderer, 'auto'>;
  scores: Record<Exclude<VisualRenderer, 'auto'>, number>;
  reason: string;
}

/** Deterministic compatibility guard used before a renderer is offered to the model. */
export function selectVisualRenderer(intent: VisualIntent): RendererSelection {
  const text = `${intent.domain ?? ''} ${intent.purpose}`.toLowerCase();
  const scores = { mermaid: 0, manim: 0, manimgl: 0 };
  const has = (pattern: RegExp) => pattern.test(text);

  if (has(/relationship|architecture|sequence|state machine|class diagram|flowchart|flow chart|flow chat|workflow|pipeline|cycle|process|decision|protocol|dependency|timeline|mindmap|data flow|block diagram|how.*works|how does.*work|processor|cpu/)) scores.mermaid += 6;
  if (has(/algorithm|binary search|sort|equation|math|physics|circuit|signal|waveform|motion|change over time|carrier|electric field/)) scores.manim += 5;
  if (has(/binary search|merge sort|quick sort|compiler|protocol|workflow|pipeline/)) scores.mermaid += 4;
  if (has(/3d|three.dimension|lattice|crystal|spatial|geometry|semiconductor structure/)) scores.manimgl += 7;
  if (intent.requiresAnimation) { scores.manim += 5; scores.mermaid -= 5; }
  if (intent.requires3d) { scores.manimgl += 8; scores.mermaid -= 5; }

  if (intent.preferredRenderer && intent.preferredRenderer !== 'auto') scores[intent.preferredRenderer] += 2;
  if (scores.mermaid === 0 && scores.manim === 0 && scores.manimgl === 0) scores.manim = 1;

  const ranked = (Object.entries(scores) as Array<[keyof typeof scores, number]>).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][0];
  const secondary = ranked[1][1] >= 4 && ranked[0][1] >= 4 ? ranked[1][0] : undefined;
  return {
    primary,
    ...(secondary ? { secondary } : {}),
    scores,
    reason: secondary
      ? `${primary} provides the primary view; ${secondary} adds complementary teaching value.`
      : `${primary} best matches the visual intent.`,
  };
}
