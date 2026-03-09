'use client';

import { ArchitectureDiff } from '@/lib/api';
import './DiffSummary.css';

interface DiffSummaryProps {
  diff: ArchitectureDiff;
  filter: {
    added: boolean;
    removed: boolean;
    modified: boolean;
  };
  onFilterChange: (filter: { added: boolean; removed: boolean; modified: boolean }) => void;
}

export default function DiffSummary({ diff, filter, onFilterChange }: DiffSummaryProps) {
  const { summary, entities } = diff;

  return (
    <div className="diff-summary">
      <div className="diff-summary-stats">
        <StatCard
          label="Total Changes"
          value={summary.totalChanges}
          color="var(--text-primary)"
          index={0}
        />
        <StatCard
          label="Entities Added"
          value={summary.entitiesAdded}
          color="#22c55e"
          icon="+"
          index={1}
        />
        <StatCard
          label="Entities Removed"
          value={summary.entitiesRemoved}
          color="#ef4444"
          icon="-"
          index={2}
        />
        <StatCard
          label="Entities Modified"
          value={summary.entitiesModified}
          color="#f59e0b"
          icon="~"
          index={3}
        />
        <StatCard
          label="Relationships Added"
          value={summary.relationshipsAdded}
          color="#22c55e"
          sublabel="new deps"
          index={4}
        />
        <StatCard
          label="Relationships Removed"
          value={summary.relationshipsRemoved}
          color="#ef4444"
          sublabel="broken deps"
          index={5}
        />
        <StatCard
          label="Files Changed"
          value={summary.filesChanged}
          color="#64748b"
          index={6}
        />
      </div>

      <div className="diff-summary-filters">
        <span className="diff-summary-filters-label">Show:</span>
        <label className="diff-summary-filter">
          <input
            type="checkbox"
            checked={filter.added}
            onChange={(e) => onFilterChange({ ...filter, added: e.target.checked })}
          />
          <span className="diff-summary-filter-check" />
          <span className="diff-summary-filter-indicator added" />
          Added ({entities.added.length})
        </label>
        <label className="diff-summary-filter">
          <input
            type="checkbox"
            checked={filter.removed}
            onChange={(e) => onFilterChange({ ...filter, removed: e.target.checked })}
          />
          <span className="diff-summary-filter-check" />
          <span className="diff-summary-filter-indicator removed" />
          Removed ({entities.removed.length})
        </label>
        <label className="diff-summary-filter">
          <input
            type="checkbox"
            checked={filter.modified}
            onChange={(e) => onFilterChange({ ...filter, modified: e.target.checked })}
          />
          <span className="diff-summary-filter-check" />
          <span className="diff-summary-filter-indicator modified" />
          Modified ({entities.modified.length})
        </label>
      </div>

      <div className="diff-summary-impact">
        <div className="diff-summary-impact-title">Impact Analysis</div>
        <div className="diff-summary-impact-stats">
          <div className="diff-summary-impact-card">
            <span className="diff-summary-impact-value">
              {diff.impact.directDependencies.length}
            </span>
            <span className="diff-summary-impact-label">Direct Dependencies</span>
          </div>
          <div className="diff-summary-impact-card">
            <span className="diff-summary-impact-value broken">
              {diff.impact.brokenRelationships}
            </span>
            <span className="diff-summary-impact-label">Broken Relationships</span>
          </div>
          <div className="diff-summary-impact-card">
            <span className="diff-summary-impact-value new">
              {diff.impact.newRelationships}
            </span>
            <span className="diff-summary-impact-label">New Relationships</span>
          </div>
        </div>
      </div>

      {(diff.files.added.length > 0 || diff.files.removed.length > 0 || diff.files.modified.length > 0) && (
        <div className="diff-summary-files">
          <div className="diff-summary-files-title">File Changes</div>
          <div className="diff-summary-files-grid">
            {diff.files.added.length > 0 && (
              <FileChangeGroup label="Added" files={diff.files.added} color="var(--diff-green)" />
            )}
            {diff.files.removed.length > 0 && (
              <FileChangeGroup label="Removed" files={diff.files.removed} color="var(--diff-red)" />
            )}
            {diff.files.modified.length > 0 && (
              <FileChangeGroup label="Modified" files={diff.files.modified} color="var(--diff-amber)" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  sublabel,
  index
}: {
  label: string;
  value: number;
  color: string;
  icon?: string;
  sublabel?: string;
  index: number;
}) {
  return (
    <div
      className="diff-stat-card"
      style={{
        '--card-accent': color,
        animationDelay: `${index * 60}ms`
      } as React.CSSProperties}
    >
      <div className="diff-stat-card-header">
        {icon && <span className="diff-stat-card-icon" style={{ color }}>{icon}</span>}
        <span className="diff-stat-card-value" style={{ color }}>
          {value > 999 ? `${(value / 1000).toFixed(1)}k` : value}
        </span>
      </div>
      <div className="diff-stat-card-label">
        {label}
        {sublabel && <span className="diff-stat-card-sublabel">{sublabel}</span>}
      </div>
      <div className="diff-stat-card-bar" />
    </div>
  );
}

function FileChangeGroup({
  label,
  files,
  color
}: {
  label: string;
  files: string[];
  color: string;
}) {
  return (
    <div className="diff-file-group">
      <div className="diff-file-group-header" style={{ color }}>
        {label} ({files.length})
      </div>
      <div className="diff-file-group-list">
        {files.map((file, i) => (
          <div
            key={i}
            className="diff-file-group-item"
            style={{ borderLeftColor: color }}
          >
            {file}
          </div>
        ))}
      </div>
    </div>
  );
}
