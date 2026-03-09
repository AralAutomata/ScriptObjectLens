'use client';

import { useEffect, useState } from 'react';
import { GitRef, fetchGitRefs } from '@/lib/api';
import './RefSelector.css';

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
      const data = await fetchGitRefs(path);
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
                    <span className="ref-selector-icon branch">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" />
                      </svg>
                    </span>
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
                    <span className="ref-selector-icon tag">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775zM6 5a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" />
                      </svg>
                    </span>
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
