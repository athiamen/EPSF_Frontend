import React from 'react';

interface EventFilterProps {
  onFilter: (type: string, minSeverity: number) => void;
}

const EventFilter: React.FC<EventFilterProps> = ({ onFilter }) => {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label>Type:
        <select onChange={e => onFilter(e.target.value, 0)}>
          <option value="">Tous</option>
          <option value="cause">Cause</option>
          <option value="consequence">Conséquence</option>
        </select>
      </label>
    </div>
  );
};

export default EventFilter;
