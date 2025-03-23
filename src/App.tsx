import React, { useState } from 'react';
import ButterflyGraph from './components/ButterflyGraph';
import EventFilter from './components/EventFilter';
import EventStats from './components/EventStats';
import SimulationPanel from './components/SimulationPanel';

function App() {
  const [filterType, setFilterType] = useState<string>('');

  const handleFilter = (type: string) => {
    setFilterType(type);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ textAlign: 'center' }}>Nœud Papillon - Collision Ferroviaire</h1>
      <EventFilter onFilter={handleFilter} />
      <EventStats />
      <SimulationPanel />
      <ButterflyGraph />
    </div>
  );
}

export default App;
