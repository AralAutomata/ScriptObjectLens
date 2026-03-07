'use client';

import './SearchBar.css';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: 'all' | 'class' | 'interface' | 'abstract';
  onFilterChange: (type: 'all' | 'class' | 'interface' | 'abstract') => void;
}

export default function SearchBar({ searchQuery, onSearchChange, filterType, onFilterChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search classes, interfaces..."
        className="search-input"
      />
      <div className="filter-buttons">
        <button
          className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          All
        </button>
        <button
          className={`filter-btn class ${filterType === 'class' ? 'active' : ''}`}
          onClick={() => onFilterChange('class')}
        >
          🔵 Class
        </button>
        <button
          className={`filter-btn abstract ${filterType === 'abstract' ? 'active' : ''}`}
          onClick={() => onFilterChange('abstract')}
        >
          🟠 Abstract
        </button>
        <button
          className={`filter-btn interface ${filterType === 'interface' ? 'active' : ''}`}
          onClick={() => onFilterChange('interface')}
        >
          🟢 Interface
        </button>
      </div>
    </div>
  );
}
