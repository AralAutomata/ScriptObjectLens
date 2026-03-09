const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
  }
  return response.json()
}

export interface AnalyzeRequest {
  path: string;
  exclude?: string[];
  include?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  result?: {
    id: string;
    timestamp: number;
    scanPath: string;
    classes: any[];
    relationships: any[];
    graph: {
      nodes: any[];
      edges: any[];
    };
    totalFiles: number;
    totalClasses: number;
    totalInterfaces: number;
  };
  error?: string;
}

export async function analyzeProject(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function getAnalysisResult(id: string): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/result/${id}`);
  return handleResponse<AnalyzeResponse>(response);
}

export async function getEntityDetails(id: string): Promise<any> {
  const response = await fetch(`${API_BASE}/entity/${id}`);
  return handleResponse(response);
}

export async function getFileContent(analysisId: string, filePath: string): Promise<{ success: boolean; content?: string }> {
  const response = await fetch(`${API_BASE}/file?analysisId=${encodeURIComponent(analysisId)}&path=${encodeURIComponent(filePath)}`);
  return handleResponse<{ success: boolean; content?: string }>(response);
}

// New API functions for additional tabs
export interface FileNode {
  id: string;
  path: string;
  name: string;
  type: 'page' | 'api' | 'component' | 'lib' | 'config' | 'util';
  size: number;
  extension: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

export interface FileEdge {
  source: string;
  target: string;
  type: 'import' | 'dynamic';
}

export interface FileGraphData {
  nodes: FileNode[];
  edges: FileEdge[];
}

export interface FileGraphResponse {
  success: boolean;
  data?: FileGraphData;
  error?: string;
}

export async function fetchFileGraph(path: string): Promise<FileGraphResponse> {
  const response = await fetch(`${API_BASE}/filegraph?path=${encodeURIComponent(path)}`);
  return handleResponse<FileGraphResponse>(response);
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'ALL';

export interface RouteNode {
  id: string;
  path: string;
  segment: string;
  fullPath: string;
  method: HttpMethod;
  type: 'page' | 'api' | 'layout' | 'middleware';
  filePath: string;
  children: RouteNode[];
}

export interface RouteTreeResponse {
  success: boolean;
  data?: RouteNode[];
  error?: string;
}

export async function fetchRouteTree(path: string): Promise<RouteTreeResponse> {
  const response = await fetch(`${API_BASE}/routes?path=${encodeURIComponent(path)}`);
  return handleResponse<RouteTreeResponse>(response);
}

export interface SchemaField {
  name: string;
  type: string;
  isId: boolean;
  isOptional: boolean;
  isUnique: boolean;
  defaultValue?: string;
  isRelation: boolean;
}

export interface SchemaModel {
  id: string;
  name: string;
  fields: SchemaField[];
  dbName?: string;
}

export interface SchemaRelation {
  source: string;
  target: string;
  sourceField: string;
  targetField: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'many-to-one';
}

export interface DatabaseSchema {
  models: SchemaModel[];
  relations: SchemaRelation[];
  type: 'prisma' | 'drizzle';
}

export interface DatabaseSchemaResponse {
  success: boolean;
  data?: DatabaseSchema;
  error?: string;
}

export async function fetchDatabaseSchema(path: string): Promise<DatabaseSchemaResponse> {
  const response = await fetch(`${API_BASE}/schema?path=${encodeURIComponent(path)}`);
  return handleResponse<DatabaseSchemaResponse>(response);
}

// ============================================
// Architecture Diff API
// ============================================

export interface GitRef {
  name: string;
  type: 'branch' | 'tag' | 'commit';
  hash: string;
}

export interface EntityChange {
  id: string;
  name: string;
  type: 'class' | 'interface' | 'abstract' | 'enum' | 'typeAlias' | 'function';
  status: 'added' | 'removed' | 'modified';
  filePath?: string;
  changes?: {
    methodsAdded?: string[];
    methodsRemoved?: string[];
    propertiesAdded?: string[];
    propertiesRemoved?: string[];
    extendsChanged?: { from?: string; to?: string };
    implementsChanged?: { added: string[]; removed: string[] };
  };
}

export interface RelationshipChange {
  source: string;
  target: string;
  type: 'extends' | 'implements' | 'composition' | 'uses' | 'imports';
  status: 'added' | 'removed';
}

export interface ImpactAnalysis {
  directDependencies: string[];
  brokenRelationships: number;
  newRelationships: number;
}

export interface ArchitectureDiff {
  from: GitRef;
  to: GitRef;
  entities: {
    added: EntityChange[];
    removed: EntityChange[];
    modified: EntityChange[];
  };
  relationships: {
    added: RelationshipChange[];
    removed: RelationshipChange[];
  };
  files: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  impact: ImpactAnalysis;
  summary: {
    totalChanges: number;
    entitiesAdded: number;
    entitiesRemoved: number;
    entitiesModified: number;
    relationshipsAdded: number;
    relationshipsRemoved: number;
    filesChanged: number;
  };
  beforeSnapshot: any;
  afterSnapshot: any;
}

export interface ArchitectureDiffResponse {
  success: boolean;
  data?: ArchitectureDiff;
  error?: string;
}

export interface GitRefsResponse {
  success: boolean;
  branches?: GitRef[];
  tags?: GitRef[];
  error?: string;
}

export async function fetchArchitectureDiff(
  path: string,
  from: string,
  to: string
): Promise<ArchitectureDiffResponse> {
  const response = await fetch(`${API_BASE}/arch-diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, from, to }),
  });
  return handleResponse<ArchitectureDiffResponse>(response);
}

export async function fetchGitRefs(path: string): Promise<GitRefsResponse> {
  const response = await fetch(`${API_BASE}/git-refs?path=${encodeURIComponent(path)}`);
  return handleResponse<GitRefsResponse>(response);
}
