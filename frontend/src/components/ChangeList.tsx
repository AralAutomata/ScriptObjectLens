'use client';

import { ArchitectureDiff, EntityChange, RelationshipChange } from '@/lib/api';
import './ChangeList.css';

interface ChangeListProps {
  diff: ArchitectureDiff;
  filter: {
    added: boolean;
    removed: boolean;
    modified: boolean;
  };
  onEntityClick?: (entity: EntityChange) => void;
}

export default function ChangeList({ diff, filter, onEntityClick }: ChangeListProps) {
  const { entities, relationships } = diff;

  const filteredEntities = {
    added: filter.added ? entities.added : [],
    removed: filter.removed ? entities.removed : [],
    modified: filter.modified ? entities.modified : []
  };

  return (
    <div className="change-list">
      {filteredEntities.added.length > 0 && (
        <ChangeSection
          title="Added"
          icon="+"
          color="#22c55e"
          changes={filteredEntities.added}
          onEntityClick={onEntityClick}
        />
      )}

      {filteredEntities.removed.length > 0 && (
        <ChangeSection
          title="Removed"
          icon="-"
          color="#ef4444"
          changes={filteredEntities.removed}
          onEntityClick={onEntityClick}
        />
      )}

      {filteredEntities.modified.length > 0 && (
        <ChangeSection
          title="Modified"
          icon="~"
          color="#f59e0b"
          changes={filteredEntities.modified}
          onEntityClick={onEntityClick}
        />
      )}

      {relationships.added.length > 0 && filter.added && (
        <div className="change-list-section">
          <div className="change-list-section-header">
            <span className="change-list-section-title" style={{ color: '#22c55e' }}>
              + New Relationships
            </span>
            <span className="change-list-count">{relationships.added.length}</span>
          </div>
          <div className="change-list-items">
            {relationships.added.slice(0, 20).map((rel, i) => (
              <div key={`rel-added-${i}`} className="change-list-item relationship">
                <span className="change-list-item-icon">→</span>
                <span className="change-list-item-content">
                  <code>{rel.source}</code>
                  <span className="change-list-relationship-type">{rel.type}</span>
                  <code>{rel.target}</code>
                </span>
              </div>
            ))}
            {relationships.added.length > 20 && (
              <div className="change-list-more">
                +{relationships.added.length - 20} more relationships
              </div>
            )}
          </div>
        </div>
      )}

      {relationships.removed.length > 0 && filter.removed && (
        <div className="change-list-section">
          <div className="change-list-section-header">
            <span className="change-list-section-title" style={{ color: '#ef4444' }}>
              – Broken Relationships
            </span>
            <span className="change-list-count">{relationships.removed.length}</span>
          </div>
          <div className="change-list-items">
            {relationships.removed.slice(0, 20).map((rel, i) => (
              <div key={`rel-removed-${i}`} className="change-list-item relationship removed">
                <span className="change-list-item-icon">✕</span>
                <span className="change-list-item-content">
                  <code className="removed">{rel.source}</code>
                  <span className="change-list-relationship-type">{rel.type}</span>
                  <code className="removed">{rel.target}</code>
                </span>
              </div>
            ))}
            {relationships.removed.length > 20 && (
              <div className="change-list-more">
                +{relationships.removed.length - 20} more broken relationships
              </div>
            )}
          </div>
        </div>
      )}

      {filteredEntities.added.length === 0 &&
        filteredEntities.removed.length === 0 &&
        filteredEntities.modified.length === 0 &&
        relationships.added.length === 0 &&
        relationships.removed.length === 0 && (
          <div className="change-list-empty">
            <p>No changes match the current filters.</p>
          </div>
        )}
    </div>
  );
}

function ChangeSection({
  title,
  icon,
  color,
  changes,
  onEntityClick
}: {
  title: string;
  icon: string;
  color: string;
  changes: EntityChange[];
  onEntityClick?: (entity: EntityChange) => void;
}) {
  return (
    <div className="change-list-section">
      <div className="change-list-section-header">
        <span className="change-list-section-title" style={{ color }}>
          {icon} {title}
        </span>
        <span className="change-list-count">{changes.length}</span>
      </div>
      <div className="change-list-items">
        {changes.map((change) => (
          <button
            key={change.id}
            className="change-list-item"
            onClick={() => onEntityClick?.(change)}
          >
            <span
              className="change-list-item-bullet"
              style={{ background: color }}
            />
            <span className="change-list-item-content">
              <span className="change-list-item-name">{change.name}</span>
              <span className="change-list-item-type">{change.type}</span>
            </span>
            {change.changes && (
              <span className="change-list-item-details">
                {change.changes.methodsAdded?.length || 0}+ methods
                {change.changes.propertiesAdded?.length || 0}+ props
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
