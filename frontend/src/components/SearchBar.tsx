'use client';

import './SearchBar.css';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: 'all' | 'class' | 'interface';
  onFilterChange: (type: 'all' | 'class' | 'interface') => void;
}

export default function SearchBar({ searchQuery, onSearchChange, filterType, onFilterChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search classes..."
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
          Classes
        </button>
        <button
          className={`filter-btn interface ${filterType === 'interface' ? 'active' : ''}`}
          onClick={() => onFilterChange('interface')}
        >
          Interfaces
        </button>
      </div>
    </div>
  );
}
