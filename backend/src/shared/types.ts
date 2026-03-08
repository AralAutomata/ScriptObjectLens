export type EntityType = "class" | "interface" | "abstract" | "enum" | "typeAlias" | "function";

export type GraphNodeType = "class" | "interface" | "abstract" | "enum" | "typeAlias" | "function";

export interface ClassInfo {
  id: string;
  name: string;
  namespace: string;
  filePath: string;
  type: EntityType;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  decorators: DecoratorInfo[];
  extends?: string;
  implements: string[];
  references?: string[];
  imports?: string[];
  signature?: string;
  startLine: number;
  endLine: number;
}

export interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  accessModifier: "public" | "private" | "protected" | "";
  isStatic: boolean;
  isAbstract: boolean;
  decorators: DecoratorInfo[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  accessModifier: "public" | "private" | "protected" | "";
  isStatic: boolean;
  isReadonly: boolean;
  decorators: DecoratorInfo[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface DecoratorInfo {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Relationship {
  source: string;
  target: string;
  type: "extends" | "implements" | "composition" | "uses" | "imports";
  filePath?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  namespace: string;
  filePath: string;
  inDegree?: number;
  outDegree?: number;
  totalDegree?: number;
  isCycleNode?: boolean;
  clusterId?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "extends" | "implements" | "composition" | "uses" | "imports";
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  scanPath: string;
  classes: ClassInfo[];
  relationships: Relationship[];
  graph: GraphData;
  totalFiles: number;
  totalClasses: number;
  totalInterfaces: number;
  totalEnums?: number;
  totalTypeAliases?: number;
  totalFunctions?: number;
  totalEntities?: number;
}

export interface AnalyzeRequest {
  path: string;
  exclude?: string[];
  include?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

export interface EntityDetails {
  class: ClassInfo;
  relatedClasses: ClassInfo[];
  relationships: Relationship[];
}

// File Graph Types
export type FileNodeType = 'page' | 'api' | 'component' | 'lib' | 'config' | 'util'

export interface FileNode {
  id: string;
  path: string;
  name: string;
  type: FileNodeType;
  size: number;
  extension: string;
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

// Route Tree Types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'ALL'

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

// Database Schema Types
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

// ============================================
// Architecture Diff Types
// ============================================

// Git reference (branch, commit, tag)
export interface GitRef {
  name: string;
  type: 'branch' | 'tag' | 'commit';
  hash: string;
}

// Entity-level changes
export interface EntityChange {
  id: string;
  name: string;
  type: EntityType;
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

// Relationship changes
export interface RelationshipChange {
  source: string;
  target: string;
  type: Relationship['type'];
  status: 'added' | 'removed';
}

// File-level changes
export interface FileChange {
  path: string;
  status: 'added' | 'removed' | 'modified';
}

// Impact analysis
export interface ImpactAnalysis {
  directDependencies: string[];
  brokenRelationships: number;
  newRelationships: number;
}

// Complete diff result
export interface ArchitectureDiff {
  from: GitRef;
  to: GitRef;

  // Entity changes
  entities: {
    added: EntityChange[];
    removed: EntityChange[];
    modified: EntityChange[];
  };

  // Relationship changes
  relationships: {
    added: RelationshipChange[];
    removed: RelationshipChange[];
  };

  // File changes
  files: {
    added: string[];
    removed: string[];
    modified: string[];
  };

  // Impact analysis
  impact: ImpactAnalysis;

  // Summary statistics
  summary: {
    totalChanges: number;
    entitiesAdded: number;
    entitiesRemoved: number;
    entitiesModified: number;
    relationshipsAdded: number;
    relationshipsRemoved: number;
    filesChanged: number;
  };

  // Snapshots for visualization
  beforeSnapshot: AnalysisResult;
  afterSnapshot: AnalysisResult;
}

// API Request/Response for Architecture Diff
export interface ArchitectureDiffRequest {
  path: string;
  from: string;
  to: string;
}

export interface ArchitectureDiffResponse {
  success: boolean;
  data?: ArchitectureDiff;
  error?: string;
}

// API Request/Response for Git Refs
export interface GitRefsResponse {
  success: boolean;
  branches?: GitRef[];
  tags?: GitRef[];
  error?: string;
}
