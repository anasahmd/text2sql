import { useState } from 'react';
import { Code, ChevronDown, ChevronUp } from 'lucide-react';

const SqlDisplay = ({ sql }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!sql) return null;

  return (
    <div>
      <button
        className="sql-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Code size={12} />
        {isOpen ? 'Hide SQL' : 'View SQL'}
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isOpen && (
        <div className="sql-display">
          {sql}
        </div>
      )}
    </div>
  );
};

export default SqlDisplay;
