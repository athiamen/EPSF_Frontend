import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { npCollisionNodes, npCollisionLinks } from '../data/np_collision';

const ButterflyGraph: React.FC = () => {
  const nodes: Node[] = useMemo(() => {
    return npCollisionNodes.map((node, index) => ({
      id: node.id,
      data: { label: node.label },
      position: {
        x: node.type === 'cause' ? 0 : node.type === 'collision' ? 300 : 600,
        y: index * 100
      },
      style: {
        background:
          node.type === 'cause'
            ? '#ffe0e0'
            : node.type === 'consequence'
            ? '#e0ffe0'
            : '#e0e0ff',
        padding: 10,
        borderRadius: 5
      }
    }));
  }, []);

  const edges: Edge[] = useMemo(() => {
    return npCollisionLinks.map(link => ({
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      animated: true
    }));
  }, []);

  return (
    <div style={{ height: '600px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-left">
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
};

export default ButterflyGraph;
