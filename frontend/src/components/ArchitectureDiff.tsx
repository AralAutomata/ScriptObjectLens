'use client';

import { useState, useCallback } from 'react';
import type { ArchitectureDiff } from '@/lib/api';
import { fetchArchitectureDiff } from '@/lib/api';
import RefSelector from './RefSelector';
import DiffSummary from './DiffSummary';
import SideBySideGraph from './SideBySideGraph';
import ChangeList from './ChangeList';
import './ArchitectureDiff.css';

interface ArchitectureDiffProps {
  path: string;
}

type ViewMode = 'graph' | 'list';

export default function ArchitectureDiffView({ path }: ArchitectureDiffProps) {
  const [fromRef, setFromRef] = useState('');
  const [toRef, setToRef] = useState('');
  const [diff, setDiff] = useState<ArchitectureDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [filter, setFilter] = useState({
    added: true,
    removed: true,
    modified: true
  });
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);

  const handleCompare = useCallback(async () => {
    if (!fromRef || !toRef) {
      setError('Please select both "from" and "to" references');
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedEntity(null);

    try {
      const response = await fetchArchitectureDiff(path, fromRef, toRef);

      if (response.success && response.data) {
        setDiff(response.data);
      } else {
        setError(response.error || 'Failed to analyze architecture diff');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [path, fromRef, toRef]);

  const handleEntityClick = useCallback((entity: any) => {
    setSelectedEntity(entity);
  }, []);

  const handleNodeClick = useCallback((node: any, side: 'before' | 'after') => {
    setSelectedEntity({ ...node, side });
  }, []);

  return (
    <div className="architecture-diff">
      {!diff ? (
        <div className="diff-setup">
          <div className="diff-setup-header">
            <h2>Architecture Diff</h2>
            <p>Compare code structure between two git references</p>
          </div>

          <div className="diff-inputs">
            <RefSelector
              path={path}
              value={fromRef}
              onChange={setFromRef}
              label="From (Base)"
              disabled={loading}
            />

            <div className="diff-arrow">↓</div>

            <RefSelector
              path={path}
              value={toRef}
              onChange={setToRef}
              label="To (Compare)"
              disabled={loading}
            />
          </div>

          {error && <div className="diff-error">{error}</div>}

          <button
            className="diff-compare-btn"
            onClick={handleCompare}
            disabled={loading || !fromRef || !toRef}
          >
            {loading ? (
              <>
                <span className="diff-compare-btn-spinner" />
                Analyzing...
              </>
            ) : (
              'Compare Architecture'
            )}
          </button>

          <div className="diff-examples">
            <p className="diff-examples-title">Examples:</p>
            <div className="diff-examples-suggestions">
              <button onClick={() => { setFromRef('main'); setToRef('develop'); }}>
                main → develop
              </button>
              <button onClick={() => { setFromRef('HEAD~1'); setToRef('HEAD'); }}>
                HEAD~1 → HEAD
              </button>
              <button onClick={() => { setFromRef('v1.0.0'); setToRef('v2.0.0'); }}>
                v1.0.0 → v2.0.0
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="diff-results">
          <div className="diff-results-header">
            <div className="diff-results-refs">
              <span className="diff-results-ref">{diff.from.name}</span>
              <span className="diff-results-arrow">→</span>
              <span className="diff-results-ref">{diff.to.name}</span>
            </div>

            <div className="diff-results-actions">
              <div className="diff-view-toggle">
                <button
                  className={viewMode === 'graph' ? 'active' : ''}
                  onClick={() => setViewMode('graph')}
                >
                  Graph
                </button>
                <button
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
              </div>

              <button
                className="diff-reset-btn"
                onClick={() => {
                  setDiff(null);
                  setFromRef('');
                  setToRef('');
                  setSelectedEntity(null);
                }}
              >
                New Comparison
              </button>
            </div>
          </div>

          <DiffSummary diff={diff} filter={filter} onFilterChange={setFilter} />

          <div className="diff-results-content">
            {viewMode === 'graph' ? (
              <SideBySideGraph diff={diff} onNodeClick={handleNodeClick} />
            ) : (
              <ChangeList diff={diff} filter={filter} onEntityClick={handleEntityClick} />
            )}
          </div>

          {selectedEntity && (
            <div className="diff-entity-panel">
              <div className="diff-entity-panel-header">
                <h3>{selectedEntity.name || selectedEntity.label}</h3>
                <button onClick={() => setSelectedEntity(null)}>✕</button>
              </div>
              <div className="diff-entity-panel-content">
                <p><strong>Type:</strong> {selectedEntity.type}</p>
                <p><strong>Status:</strong> {selectedEntity.status || 'N/A'}</p>
                {selectedEntity.filePath && (
                  <p><strong>File:</strong> <code>{selectedEntity.filePath}</code></p>
                )}
                {selectedEntity.changes && (
                  <div className="diff-entity-changes">
                    <h4>Changes:</h4>
                    {selectedEntity.changes.methodsAdded && (
                      <p>+ {selectedEntity.changes.methodsAdded.length} methods</p>
                    )}
                    {selectedEntity.changes.methodsRemoved && (
                      <p>- {selectedEntity.changes.methodsRemoved.length} methods</p>
                    )}
                    {selectedEntity.changes.propertiesAdded && (
                      <p>+ {selectedEntity.changes.propertiesAdded.length} properties</p>
                    )}
                    {selectedEntity.changes.propertiesRemoved && (
                      <p>- {selectedEntity.changes.propertiesRemoved.length} properties</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
