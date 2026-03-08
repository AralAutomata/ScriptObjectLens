'use client';

import './SearchBar.css';

type FilterType = 'all' | 'class' | 'interface' | 'abstract' | 'enum' | 'typeAlias' | 'function';
type RelationFilter = 'all' | 'inheritance' | 'dependency' | 'imports';

type DegreeFilter = 'all' | 'high' | 'cycle';
type ViewMode = 'graph' | 'clusters';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: FilterType;
  onFilterChange: (type: FilterType) => void;
  relationFilter: RelationFilter;
  onRelationChange: (filter: RelationFilter) => void;
  degreeFilter: DegreeFilter;
  onDegreeFilterChange: (filter: DegreeFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  simpleMode: boolean;
  onSimpleModeChange: (enabled: boolean) => void;
}

export default function SearchBar({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  relationFilter,
  onRelationChange,
  degreeFilter,
  onDegreeFilterChange,
  viewMode,
  onViewModeChange,
  simpleMode,
  onSimpleModeChange
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search classes, interfaces, enums..."
        className="search-input"
      />

      <div className="filter-buttons filter-row">
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
        <button
          className={`filter-btn enum ${filterType === 'enum' ? 'active' : ''}`}
          onClick={() => onFilterChange('enum')}
        >
          🟣 Enum
        </button>
        <button
          className={`filter-btn typealias ${filterType === 'typeAlias' ? 'active' : ''}`}
          onClick={() => onFilterChange('typeAlias')}
        >
          📘 Type
        </button>
        <button
          className={`filter-btn fn ${filterType === 'function' ? 'active' : ''}`}
          onClick={() => onFilterChange('function')}
        >
          ⚙️ Fn
        </button>
      </div>

      <div className="relation-group">
        <span className="relation-label">Relationship Focus:</span>
        <select
          className="relation-select"
          value={relationFilter}
          onChange={(e) => onRelationChange(e.target.value as RelationFilter)}
        >
          <option value="all">All Relations</option>
          <option value="inheritance">Inheritance/Implementation</option>
          <option value="dependency">Dependencies</option>
          <option value="imports">Imports</option>
        </select>
      </div>

      <div className="relation-group">
        <span className="relation-label">Node Focus:</span>
        <select
          className="relation-select"
          value={degreeFilter}
          onChange={(e) => onDegreeFilterChange(e.target.value as DegreeFilter)}
        >
          <option value="all">All Nodes</option>
          <option value="high">High Degree (3+)</option>
          <option value="cycle">Cycle Nodes</option>
        </select>
      </div>

      <div className="relation-group">
        <span className="relation-label">View:</span>
        <select
          className="relation-select"
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
        >
          <option value="graph">Graph</option>
          <option value="clusters">Structured Clusters</option>
        </select>
      </div>

      <label className="simple-mode-toggle">
        <input
          type="checkbox"
          checked={simpleMode}
          onChange={(e) => onSimpleModeChange(e.target.checked)}
        />
        Simple Mode (cleaner layout)
      </label>
    </div>
  );
}
