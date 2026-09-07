import { useEffect, useId, useReducer, useRef, useState } from 'react';
import type { SceneNode } from '../../shared/contracts.ts';
import type { MermaidRenderPayload } from '../../shared/visuals/mermaid.ts';
import type { SceneStore } from '../scene/store.ts';
import type { Camera } from '../scene/store.ts';

let initialized = false;
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null;

async function loadMermaid() {
  const mermaid = await (mermaidPromise ??= import('mermaid').then((module) => module.default));
  if (initialized) return mermaid;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      background: '#101010',
      primaryColor: '#242424',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#7770e8',
      lineColor: '#8f909b',
      secondaryColor: '#2b2b2b',
      tertiaryColor: '#18181b',
      clusterBkg: '#18181b',
      clusterBorder: '#34343a',
      edgeLabelBackground: '#18181b',
      noteBkgColor: '#242424',
      noteTextColor: '#ffffff',
      noteBorderColor: '#7770e8',
    },
  });
  initialized = true;
  return mermaid;
}

function MermaidCard({
  node,
  payload,
  selectedObjectId,
  camera,
  onSelect,
}: {
  node: SceneNode;
  payload: MermaidRenderPayload;
  selectedObjectId: string | null;
  camera: Camera;
  onSelect(id: string | null): void;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        await mermaid.parse(payload.source);
        const rendered = await mermaid.render(`nemo-mermaid-${reactId}-${node.id}`, payload.source);
        if (!alive) return;
        setSvg(rendered.svg);
        setError('');
      } catch {
        if (!alive) return;
        setSvg('');
        setError(`Could not render this ${payload.visualType} diagram.`);
      }
    })();
    return () => { alive = false; };
  }, [node.id, payload.source, payload.visualType, reactId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.nemo-mermaid-node-selected').forEach((element) =>
      element.classList.remove('nemo-mermaid-node-selected')
    );
    if (!selectedObjectId) return;
    const key = selectedObjectId.toLowerCase();
    root.querySelectorAll<SVGElement>('[id]').forEach((element) => {
      if (element.id.toLowerCase().includes(key)) element.classList.add('nemo-mermaid-node-selected');
    });
  }, [selectedObjectId, svg]);

  const selectFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest('[id]');
    const elementId = element?.id.toLowerCase() ?? '';
    const semantic = payload.semanticObjects.find((item) => elementId.includes(item.id.toLowerCase()));
    onSelect(semantic?.id ?? null);
  };

  return (
    <div
      ref={rootRef}
      className={`nemo-mermaid-card ${selectedObjectId ? 'has-selection' : ''}`}
      style={{
        left: `calc(50% + ${(node.transform.x - camera.x) * camera.zoom}px)`,
        top: `calc(50% + ${(node.transform.y - camera.y) * camera.zoom}px)`,
        transform: `scale(${camera.zoom})`,
      }}
      onClick={selectFromClick}
      role="group"
      aria-label={`${payload.visualType} diagram`}
      data-node-id={node.id}
    >
      {svg ? <div className="nemo-mermaid-card__svg" dangerouslySetInnerHTML={{ __html: svg }} /> : (
        <div className="nemo-mermaid-card__fallback" role={error ? 'alert' : 'status'}>
          {error || `Rendering ${payload.visualType}…`}
        </div>
      )}
      {selectedObjectId && <span className="nemo-mermaid-card__selection">Selected: {selectedObjectId}</span>}
    </div>
  );
}

export function MermaidLayer({ store }: { store: SceneStore }) {
  const [, redraw] = useReducer((value) => value + 1, 0);
  const versionRef = useRef(store.version);

  useEffect(() => {
    let frame = 0;
    const watch = () => {
      if (versionRef.current !== store.version) {
        versionRef.current = store.version;
        redraw();
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [store]);

  const diagrams = store.list().filter(
    (node): node is SceneNode & { renderPayload: MermaidRenderPayload } =>
      node.visible && node.renderPayload?.renderer === 'mermaid'
  );
  const camera = store.camera;

  return (
    <div className="nemo-mermaid-layer" aria-label="Structured visual layer">
      {diagrams.map((node) => (
        <MermaidCard
          key={node.id}
          node={node}
          payload={node.renderPayload}
          selectedObjectId={store.selectedObjectId}
          camera={camera}
          onSelect={(id) => store.selectObject(id)}
        />
      ))}
    </div>
  );
}
