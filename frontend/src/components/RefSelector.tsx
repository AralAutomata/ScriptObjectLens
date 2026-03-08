'use client';

import { useEffect, useState } from 'react';
import { GitRef } from '@/lib/api';

interface RefSelectorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}

export default function RefSelector({ path, value, onChange, label, disabled }: RefSelectorProps) {
  const [refs, setRefs] = useState<{ branches: GitRef[]; tags: GitRef[] }>({ branches: [], tags: [] });
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (path) {
      loadRefs();
    }
  }, [path]);

  const loadRefs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/git-refs?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (data.success) {
        setRefs({ branches: data.branches || [], tags: data.tags || [] });
      }
    } catch (e) {
      console.error('Failed to load git refs:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredRefs = {
    branches: refs.branches.filter(r => r.name.toLowerCase().includes(filter.toLowerCase())),
    tags: refs.tags.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()))
  };

  const allRefs = [...filteredRefs.branches, ...filteredRefs.tags];

  const handleSelect = (refName: string) => {
    onChange(refName);
    setShowDropdown(false);
    setFilter('');
  };

  return (
    <div className="ref-selector">
      <label className="ref-selector-label">{label}</label>
      <div className="ref-selector-input-wrapper">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          placeholder="branch, tag, or commit"
          className="ref-selector-input"
          disabled={disabled}
        />
        {loading && <span className="ref-selector-loading" />}
        <button
          className="ref-selector-toggle"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
        >
          ▼
        </button>
      </div>

      {showDropdown && (
        <div className="ref-selector-dropdown">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter refs..."
            className="ref-selector-filter"
            autoFocus
          />

          <div className="ref-selector-content">
            {filteredRefs.branches.length > 0 && (
              <div className="ref-selector-group">
                <div className="ref-selector-group-title">Branches</div>
                {filteredRefs.branches.map((ref) => (
                  <button
                    key={`branch-${ref.name}`}
                    className={`ref-selector-option ${value === ref.name ? 'selected' : ''}`}
                    onClick={() => handleSelect(ref.name)}
                  >
                    <span className="ref-selector-icon branch">📦</span>
                    <span className="ref-selector-name">{ref.name}</span>
                    <span className="ref-selector-hash">{ref.hash.substring(0, 7)}</span>
                  </button>
                ))}
              </div>
            )}

            {filteredRefs.tags.length > 0 && (
              <div className="ref-selector-group">
                <div className="ref-selector-group-title">Tags</div>
                {filteredRefs.tags.map((ref) => (
                  <button
                    key={`tag-${ref.name}`}
                    className={`ref-selector-option ${value === ref.name ? 'selected' : ''}`}
                    onClick={() => handleSelect(ref.name)}
                  >
                    <span className="ref-selector-icon tag">🏷️</span>
                    <span className="ref-selector-name">{ref.name}</span>
                    <span className="ref-selector-hash">{ref.hash.substring(0, 7)}</span>
                  </button>
                ))}
              </div>
            )}

            {allRefs.length === 0 && filter && (
              <div className="ref-selector-empty">
                No matching refs. Type to use as custom ref.
              </div>
            )}
          </div>

          <div className="ref-selector-footer">
            <button
              className="ref-selector-use-custom"
              onClick={() => {
                if (value) {
                  setShowDropdown(false);
                  setFilter('');
                }
              }}
            >
              Use: <strong>{value || 'custom ref'}</strong>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
