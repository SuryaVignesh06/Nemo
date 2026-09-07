/**
 * NEMO — Cognitive Tutor & Knowledge Graph Panel
 *
 * Real-time floating interface displaying Personal Cognitive Engine state,
 * active user profiles, cognitive metrics (confusion/frustration/engagement),
 * tutor tuning strategy, and 2-Graph Curriculum overlay map.
 */

import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon.tsx';

export interface CognitiveStateData {
  userProfile: {
    id: string;
    name: string;
    experienceLevel: string;
    currentGoal?: string;
    learningPreferences: {
      visual: number;
      examples: number;
      interactive: number;
      theory: number;
      code: number;
    };
  };
  cognitiveState: {
    topic: string;
    understandingLevel: number;
    confusionLevel: number;
    frustrationLevel: number;
    engagementLevel: number;
    preferredModality?: string;
  };
  graphNodesCount: number;
  curriculumOverlay: Array<{
    conceptId: string;
    label: string;
    category: string;
    difficulty: string;
    knowledgeLevel: number;
    status: string;
    prerequisites: string[];
    prerequisitesMastered: boolean;
    isLearningFrontier: boolean;
  }>;
  insights: string[];
  availableProfiles: Array<{ id: string; name: string; role: string }>;
}

interface Props {
  isOpen: boolean;
  onClose(): void;
}

export function CognitiveTutorPanel({ isOpen, onClose }: Props) {
  const [data, setData] = useState<CognitiveStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tuning' | 'graph' | 'insights'>('tuning');

  const fetchState = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/personal/state');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch personal cognitive state:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    setLoading(true);
    try {
      await fetch('/api/personal/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      await fetchState();
    } catch (err) {
      console.error('Failed to switch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchState();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const confusionPct = Math.round((data?.cognitiveState?.confusionLevel ?? 0.1) * 100);
  const frustrationPct = Math.round((data?.cognitiveState?.frustrationLevel ?? 0.05) * 100);
  const engagementPct = Math.round((data?.cognitiveState?.engagementLevel ?? 0.85) * 100);
  const masteryPct = Math.round((data?.cognitiveState?.understandingLevel ?? 0.4) * 100);

  return (
    <aside
      className="nemo-panel nemo-panel--right"
      style={{
        position: 'fixed',
        top: '62px',
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '92vw',
        backgroundColor: '#0d1117',
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        borderTopLeftRadius: '14px',
        zIndex: 'var(--z-drawer, 70)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        color: '#f0f6fc',
        fontSize: '13px',
        backdropFilter: 'blur(16px)',
      }}
      aria-label="Cognitive Tutor Panel"
    >
      {/* Header */}
      <header
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(30,38,54,0.6) 0%, rgba(13,17,23,0.8) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🧠</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#e6edf3' }}>
              Cognitive AI Tutor & Graph
            </h3>
            <span style={{ fontSize: '11px', color: '#8b949e' }}>
              Personal1 Engine Connected
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
          }}
          title="Close Panel"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#161b22',
        }}
      >
        <button
          onClick={() => setActiveTab('tuning')}
          style={{
            flex: 1,
            padding: '10px 0',
            background: activeTab === 'tuning' ? 'rgba(56, 139, 253, 0.15)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'tuning' ? '2px solid #58a6ff' : '2px solid transparent',
            color: activeTab === 'tuning' ? '#58a6ff' : '#8b949e',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ⚙️ Tutor Tuning
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          style={{
            flex: 1,
            padding: '10px 0',
            background: activeTab === 'graph' ? 'rgba(56, 139, 253, 0.15)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'graph' ? '2px solid #58a6ff' : '2px solid transparent',
            color: activeTab === 'graph' ? '#58a6ff' : '#8b949e',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          🕸️ Knowledge Graph
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          style={{
            flex: 1,
            padding: '10px 0',
            background: activeTab === 'insights' ? 'rgba(56, 139, 253, 0.15)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'insights' ? '2px solid #58a6ff' : '2px solid transparent',
            color: activeTab === 'insights' ? '#58a6ff' : '#8b949e',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          💡 Insights
        </button>
      </div>

      {/* Body Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading && !data && (
          <div style={{ color: '#8b949e', textAlign: 'center', padding: '24px' }}>
            Loading cognitive state...
          </div>
        )}

        {data && activeTab === 'tuning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* User Profile Selector */}
            <section
              style={{
                background: '#161b22',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8b949e', marginBottom: '8px' }}>
                Active Student Profile
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {data.availableProfiles.map((p) => {
                  const isSelected = p.id === data.userProfile.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProfile(p.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid #388bfd' : '1px solid rgba(255,255,255,0.1)',
                        background: isSelected ? 'rgba(56, 139, 253, 0.2)' : '#0d1117',
                        color: isSelected ? '#58a6ff' : '#c9d1d9',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{p.role}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Cognitive State Gauges */}
            <section
              style={{
                background: '#161b22',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8b949e', marginBottom: '12px' }}>
                Real-Time Cognitive State Gauges
              </div>

              {/* Confusion Gauge */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Confusion Index</span>
                  <span style={{ color: confusionPct > 50 ? '#f85149' : '#3fb950' }}>{confusionPct}%</span>
                </div>
                <div style={{ height: '6px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${confusionPct}%`,
                      height: '100%',
                      background: confusionPct > 50 ? '#f85149' : '#3fb950',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Frustration Gauge */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Frustration Index</span>
                  <span style={{ color: frustrationPct > 40 ? '#d29922' : '#3fb950' }}>{frustrationPct}%</span>
                </div>
                <div style={{ height: '6px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${frustrationPct}%`,
                      height: '100%',
                      background: frustrationPct > 40 ? '#d29922' : '#3fb950',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Engagement Gauge */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Engagement Level</span>
                  <span style={{ color: '#58a6ff' }}>{engagementPct}%</span>
                </div>
                <div style={{ height: '6px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${engagementPct}%`,
                      height: '100%',
                      background: '#58a6ff',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Topic Mastery */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Topic Mastery ({data.cognitiveState.topic.toUpperCase()})</span>
                  <span style={{ color: '#a371f7' }}>{masteryPct}%</span>
                </div>
                <div style={{ height: '6px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${masteryPct}%`,
                      height: '100%',
                      background: '#a371f7',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Tutor Strategy & Teaching Dials */}
            <section
              style={{
                background: '#161b22',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8b949e', marginBottom: '10px' }}>
                Teaching Dials
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>Experience Level</div>
                  <div style={{ fontWeight: 600, color: '#e6edf3', textTransform: 'capitalize' }}>
                    {data.userProfile.experienceLevel}
                  </div>
                </div>
                <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>Preferred Modality</div>
                  <div style={{ fontWeight: 600, color: '#e6edf3', textTransform: 'capitalize' }}>
                    {data.cognitiveState.preferredModality ?? '—'}
                  </div>
                </div>
              </div>

              {([
                ['visual', 'Visual'],
                ['examples', 'Analogy / Examples'],
                ['interactive', 'Socratic / Interactive'],
                ['code', 'Code-First'],
                ['theory', 'Theory-First'],
              ] as const).map(([key, label]) => {
                const value = Math.round((data.userProfile.learningPreferences[key] ?? 0) * 100);
                return (
                  <div key={key} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>{label}</span>
                      <span style={{ color: '#a371f7' }}>{value}%</span>
                    </div>
                    <div style={{ height: '5px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${value}%`,
                          height: '100%',
                          background: '#a371f7',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        )}

        {data && activeTab === 'graph' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '12px', color: '#8b949e' }}>
              Curriculum Overlay & Topic Prerequisite Map:
            </div>
            {data.curriculumOverlay.map((item) => (
              <div
                key={item.conceptId}
                style={{
                  background: '#161b22',
                  padding: '12px',
                  borderRadius: '8px',
                  border: item.isLearningFrontier ? '1px solid rgba(56, 139, 253, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#58a6ff' }}>{item.label}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      background: 'rgba(56, 139, 253, 0.2)',
                      color: '#58a6ff',
                    }}
                  >
                    Mastery: {Math.round(item.knowledgeLevel * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '6px' }}>
                  Status: <strong style={{ color: '#c9d1d9', textTransform: 'capitalize' }}>{item.status.toLowerCase().replace('_', ' ')}</strong>
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>{item.difficulty}</span>
                  {item.isLearningFrontier && (
                    <span style={{ color: '#58a6ff' }}> · Ready to learn</span>
                  )}
                </div>
                {!item.prerequisitesMastered && item.prerequisites.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#f85149', marginTop: '6px' }}>
                    ⚠️ Missing Prerequisites: {item.prerequisites.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data && activeTab === 'insights' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: '#8b949e' }}>
              Continuous Cognitive Graph Insights:
            </div>
            {data.insights.map((insight, idx) => (
              <div
                key={idx}
                style={{
                  background: '#161b22',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  borderLeft: '3px solid #388bfd',
                  fontSize: '12px',
                  color: '#c9d1d9',
                }}
              >
                {insight}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#161b22',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={fetchState}
          style={{
            background: 'rgba(56, 139, 253, 0.15)',
            color: '#58a6ff',
            border: '1px solid rgba(56, 139, 253, 0.3)',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          🔄 Refresh State
        </button>
        <span style={{ fontSize: '11px', color: '#8b949e' }}>
          Nodes: {data?.graphNodesCount ?? 0}
        </span>
      </footer>
    </aside>
  );
}
