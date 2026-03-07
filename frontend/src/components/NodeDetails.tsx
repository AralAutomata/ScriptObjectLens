'use client';

import { useState, useEffect } from 'react';
import { getEntityDetails, getFileContent } from '@/lib/api';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import './NodeDetails.css';

interface ClassInfo {
  id: string;
  name: string;
  namespace: string;
  filePath: string;
  type: 'class' | 'interface' | 'abstract';
  methods: any[];
  properties: any[];
  decorators: any[];
  extends?: string;
  implements: string[];
  startLine: number;
  endLine: number;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'class' | 'interface' | 'abstract';
  namespace: string;
  filePath: string;
}

interface AnalysisResult {
  classes: ClassInfo[];
  relationships: any[];
}

interface NodeDetailsProps {
  node: GraphNode;
  result: AnalysisResult;
  onClose: () => void;
}

export default function NodeDetails({ node, result, onClose }: NodeDetailsProps) {
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [relatedClasses, setRelatedClasses] = useState<ClassInfo[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [codeContent, setCodeContent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'code'>('details');
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        setPanelWidth(Math.max(300, Math.min(800, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const info = result.classes.find(c => c.id === node.id);
    if (info) {
      setClassInfo(info);
      
      const related = result.relationships.filter(r => 
        r.source === node.id || r.target === node.id
      );
      setRelationships(related);
      
      const relatedIds = new Set<string>();
      related.forEach(r => {
        if (r.source === node.id) relatedIds.add(r.target);
        if (r.target === node.id) relatedIds.add(r.source);
      });
      setRelatedClasses(result.classes.filter(c => relatedIds.has(c.id)));

      getFileContent(info.filePath).then(res => {
        if (res.success && res.content) {
          const lines = res.content.split('\n');
          const start = Math.max(0, info.startLine - 3);
          const end = Math.min(lines.length, info.endLine + 2);
          setCodeContent(lines.slice(start, end).join('\n'));
        }
      });
    }
  }, [node, result]);

  if (!classInfo) return null;

  return (
    <div className="node-details" style={{ width: panelWidth }}>
      <div 
        className="resize-handle"
        onMouseDown={() => setIsResizing(true)}
      />
      <div className="details-header">
        <div className="header-info">
          <span className={`type-badge ${classInfo.type}`}>
            {classInfo.type === 'interface' ? 'Interface' : classInfo.type === 'abstract' ? 'Abstract' : 'Class'}
          </span>
          <h2>{classInfo.name}</h2>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button 
          className={`tab ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          Code
        </button>
      </div>

      {activeTab === 'details' && (
        <div className="details-content">
          <section className="detail-section">
            <h3>Location</h3>
            <p className="file-path">{classInfo.filePath}</p>
            <p className="lines">Lines {classInfo.startLine} - {classInfo.endLine}</p>
            {classInfo.namespace && <p className="namespace">Namespace: {classInfo.namespace}</p>}
          </section>

          {(classInfo.extends || classInfo.implements.length > 0) && (
            <section className="detail-section">
              <h3>Relationships</h3>
              {classInfo.extends && (
                <p className="relationship">
                  <span className="rel-type">extends</span>
                  <span className="rel-name">{classInfo.extends}</span>
                </p>
              )}
              {classInfo.implements.map(imp => (
                <p key={imp} className="relationship">
                  <span className="rel-type">implements</span>
                  <span className="rel-name">{imp}</span>
                </p>
              ))}
            </section>
          )}

          {classInfo.properties.length > 0 && (
            <section className="detail-section">
              <h3>Properties ({classInfo.properties.length})</h3>
              <ul className="member-list">
                {classInfo.properties.map((prop, i) => (
                  <li key={i} className="member">
                    <span className="member-access">{prop.accessModifier || ''}</span>
                    <span className="member-name">{prop.name}</span>
                    <span className="member-type">{prop.type}</span>
                    {prop.isStatic && <span className="member-flag">static</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {classInfo.methods.length > 0 && (
            <section className="detail-section">
              <h3>Methods ({classInfo.methods.length})</h3>
              <ul className="member-list">
                {classInfo.methods.map((method, i) => (
                  <li key={i} className="member">
                    <span className="member-access">{method.accessModifier || ''}</span>
                    <span className="member-name">{method.name}</span>
                    <span className="member-params">
                      ({method.parameters.map((p: any) => p.name).join(', ')})
                    </span>
                    <span className="member-type">: {method.returnType}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {relatedClasses.length > 0 && (
            <section className="detail-section">
              <h3>Related Classes</h3>
              <ul className="related-list">
                {relatedClasses.map(rc => (
                  <li key={rc.id}>
                    <span className={`related-type ${rc.type}`}>{rc.type[0].toUpperCase()}</span>
                    {rc.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {activeTab === 'code' && (
        <div className="code-content">
          {codeContent ? (
            <pre>
              <code 
                className="language-typescript"
                dangerouslySetInnerHTML={{
                  __html: Prism.highlight(
                    codeContent,
                    Prism.languages.typescript || Prism.languages.javascript,
                    'typescript'
                  )
                }}
              />
            </pre>
          ) : (
            <p className="no-code">Source code not available</p>
          )}
        </div>
      )}
    </div>
  );
}
