import React from 'react';
import { npCollisionNodes } from '../data/np_collision';

const EventStats: React.FC = () => {
  const total = npCollisionNodes.length;
  const avgSeverity = (
    npCollisionNodes.reduce((sum, n) => sum + (n.stats?.severity || 0), 0) / total
  ).toFixed(2);

  return (
    <div>
      <h3>Statistiques Globales</h3>
      <p>Total de nœuds : {total}</p>
      <p>Gravité moyenne : {avgSeverity}</p>
    </div>
  );
};
