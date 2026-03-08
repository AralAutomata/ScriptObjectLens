'use client';

import { useState, useCallback } from 'react';
import { fetchFileGraph, fetchRouteTree, fetchDatabaseSchema } from '@/lib/api';
import FileGraph from './FileGraph';
import RouteTree from './RouteTree';
import DatabaseSchema from './DatabaseSchema';
import './ViewTabs.css';

type TabType = 'classes' | 'filegraph' | 'routes' | 'schema';

interface ViewTabsProps {
  scanPath: string;
}

interface TabData {
  classes: null; // Handled by parent
  filegraph: { nodes: any[]; edges: any[] } | null | undefined;
  routes: any[] | null | undefined;
  schema: { models: any[]; relations: any[] } | null | undefined;
}

interface TabState {
  loading: Record<TabType, boolean>;
  error: Record<TabType, string | null>;
  loaded: Record<TabType, boolean>;
}

export default function ViewTabs({ scanPath }: ViewTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('classes');
  const [data, setData] = useState<TabData>({
    classes: null,
    filegraph: null,
    routes: null,
    schema: null,
  });
  const [state, setState] = useState<TabState>({
    loading: {
      classes: false,
      filegraph: false,
      routes: false,
      schema: false,
    },
    error: {
      classes: null,
      filegraph: null,
      routes: null,
      schema: null,
    },
    loaded: {
      classes: true, // Classes tab is always available
      filegraph: false,
      routes: false,
      schema: false,
    },
  });

  const loadTabData = useCallback(
    async (tab: TabType) => {
      if (tab === 'classes' || state.loaded[tab] || state.loading[tab]) {
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: { ...prev.loading, [tab]: true },
        error: { ...prev.error, [tab]: null },
      }));

      try {
        switch (tab) {
          case 'filegraph': {
            const fileResult = await fetchFileGraph(scanPath);
            if (fileResult.success && fileResult.data) {
              setData((prev) => ({ ...prev, filegraph: fileResult.data }));
            } else {
              throw new Error(fileResult.error || 'Failed to load file graph');
            }
            break;
          }
          case 'routes': {
            const routeResult = await fetchRouteTree(scanPath);
            if (routeResult.success && routeResult.data) {
              setData((prev) => ({ ...prev, routes: routeResult.data }));
            } else {
              throw new Error(routeResult.error || 'Failed to load route tree');
            }
            break;
          }
          case 'schema': {
            const schemaResult = await fetchDatabaseSchema(scanPath);
            if (schemaResult.success && schemaResult.data) {
              setData((prev) => ({ ...prev, schema: schemaResult.data }));
            } else {
              throw new Error(schemaResult.error || 'Failed to load database schema');
            }
            break;
          }
        }

        setState((prev) => ({
          ...prev,
          loaded: { ...prev.loaded, [tab]: true },
          loading: { ...prev.loading, [tab]: false },
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [tab]: false },
          error: {
            ...prev.error,
            [tab]: err instanceof Error ? err.message : 'Unknown error',
          },
        }));
      }
    },
    [scanPath, state.loaded, state.loading]
  );

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'classes', label: 'Classes' },
    { id: 'filegraph', label: 'File Graph' },
    { id: 'routes', label: 'Route Tree' },
    { id: 'schema', label: 'DB Schema' },
  ];

  return (
    <div className="view-tabs">
      <div className="tabs-header">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''} ${state.loading[tab.id] ? 'loading' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            disabled={state.loading[tab.id]}
          >
            {tab.label}
            {state.loading[tab.id] && <span className="tab-spinner" />}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'classes' && (
          <div className="placeholder-tab">
            <p>Classes view is handled by the parent component.</p>
          </div>
        )}

        {activeTab === 'filegraph' && (
          <TabContent
            loading={state.loading.filegraph}
            error={state.error.filegraph}
            loaded={state.loaded.filegraph}
          >
            {data.filegraph && (
              <FileGraph nodes={data.filegraph.nodes} edges={data.filegraph.edges} />
            )}
          </TabContent>
        )}

        {activeTab === 'routes' && (
          <TabContent
            loading={state.loading.routes}
            error={state.error.routes}
            loaded={state.loaded.routes}
          >
            {data.routes && <RouteTree routes={data.routes} />}
          </TabContent>
        )}

        {activeTab === 'schema' && (
          <TabContent
            loading={state.loading.schema}
            error={state.error.schema}
            loaded={state.loaded.schema}
          >
            {data.schema && (
              <DatabaseSchema models={data.schema.models} relations={data.schema.relations} />
            )}
          </TabContent>
        )}
      </div>
    </div>
  );
}

interface TabContentProps {
  children: React.ReactNode;
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

function TabContent({ children, loading, error, loaded }: TabContentProps) {
  if (loading) {
    return (
      <div className="tab-loading">
        <div className="tab-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tab-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="tab-placeholder">
        <p>Click the tab to load this view</p>
      </div>
    );
  }

  return <>{children}</>;
}