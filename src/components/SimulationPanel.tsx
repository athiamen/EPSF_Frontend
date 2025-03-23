import React, { useState } from 'react';
import { npCollisionNodes } from '../data/np_collision';

const SimulationPanel: React.FC = () => {
  const allBarriers = Array.from(
    new Set(npCollisionNodes.flatMap(n => n.barriers || []))
  );

  const [removed, setRemoved] = useState<string[]>([]);

  const handleToggle = (barrier: string) => {
    setRemoved(prev =>
      prev.includes(barrier) ? prev.filter(b => b !== barrier) : [...prev, barrier]
    );
  };

  const impacted = npCollisionNodes.filter(node =>
    node.barriers?.some(b => removed.includes(b))
  );

  return (
    <div>
      <h3>Simulation (Barrières supprimées)</h3>
      {allBarriers.map(barrier => (
        <label key={barrier}>
          <input
            type="checkbox"
            checked={removed.includes(barrier)}
            onChange={() => handleToggle(barrier)}
          />
          {barrier}
        </label>
      ))}

      <h4>Impacts potentiels :</h4>
      <ul>
        {impacted.map(n => (
          <li key={n.id}>{n.label}</li>
        ))}
      </ul>
    </div>
  );
};

export default SimulationPanel;
