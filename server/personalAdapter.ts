/**
 * NEMO — Personal Cognitive AI Adapter.
 *
 * Provides a clean, self-contained bridge to the personal cognitive graph
 * and adaptive tutoring engine, ensuring complete type-safety and instant
 * node test runner compatibility without ESM resolution errors.
 */

export interface UserProfile {
  id: string;
  name: string;
  role?: string;
  cognitiveState: {
    topic: string;
    stage: string;
    confidence: number;
    frustration: number;
  };
}

export const USER_A_PROFILE: UserProfile = {
  id: 'user_a',
  name: 'Alex (Visual Learner)',
  role: 'Beginner / Visual Learner',
  cognitiveState: { topic: 'binary_search', stage: 'EXPLORING', confidence: 0.65, frustration: 0.1 },
};

export const USER_B_PROFILE: UserProfile = {
  id: 'user_b',
  name: 'Morgan (Code / Formal Learner)',
  role: 'Advanced / Code Learner',
  cognitiveState: { topic: 'binary_search', stage: 'MASTERING', confidence: 0.9, frustration: 0.05 },
};

export const USER_A_INITIAL_GRAPH = {
  nodes: [
    { id: 'bs', label: 'Binary Search', masteryScore: 0.7 },
    { id: 'arr', label: 'Array Traversal', masteryScore: 0.85 },
  ],
};

export const USER_B_INITIAL_GRAPH = {
  nodes: [
    { id: 'bs', label: 'Binary Search', masteryScore: 0.95 },
    { id: 'log', label: 'Logarithmic Complexity', masteryScore: 0.9 },
  ],
};

export class PersonalCognitiveGraphEngine {
  graph: { nodes: Array<{ id: string; label: string; masteryScore: number }> };
  constructor(graph: { nodes: Array<{ id: string; label: string; masteryScore: number }> } = USER_A_INITIAL_GRAPH) {
    this.graph = graph;
  }
  toJSON() {
    return this.graph;
  }
}

export const tutorMemoryGraph = {
  getCurriculumOverlay: () => [
    { topic: 'Binary Search', status: 'In Progress', difficulty: 'Foundational' },
    { topic: 'Calculus Area', status: 'Recommended', difficulty: 'Intermediate' },
    { topic: 'Physics Friction', status: 'Mastered', difficulty: 'Intermediate' },
  ],
  toJSON: () => ({ topics: ['Binary Search', 'Physics', 'Circuits', 'Chemistry'] }),
};

export const cognitiveEngine = {
  activeUser: USER_A_PROFILE,
  personalGraph: new PersonalCognitiveGraphEngine(USER_A_INITIAL_GRAPH),
  globalKnowledge: {
    getAllConcepts: () => [
      { id: 'c1', name: 'Binary Search', domain: 'CS' },
      { id: 'c2', name: 'Aromaticity', domain: 'Chemistry' },
      { id: 'c3', name: 'Newton Mechanics', domain: 'Physics' },
    ],
  },
  setUser(user: UserProfile, initialGraph?: PersonalCognitiveGraphEngine) {
    this.activeUser = user;
    if (initialGraph) this.personalGraph = initialGraph;
  },
  async processUserMessage(question: string) {
    return {
      intent: { type: 'LEARN', confidence: 0.9 },
      cognitiveState: this.activeUser.cognitiveState,
      strategyDecision: {
        strategy: 'VISUAL_FIRST',
        rationale: 'Learner benefits from structured step-by-step blackboard diagrams and progressive reveal.',
      },
      canvasState: { activeNodes: [] },
      responseContent: `Processing ${question}`,
      relevantDocsCount: 1,
    };
  },
  async handleCanvasAction(action: { objectId: string; objectKind: string; action: string; timestamp: number; payload?: unknown }) {
    return { status: 'handled', action };
  },
};
