// Git-specific types (backend only)

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitTagInfo {
  name: string;
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  authorEmail: string;
  date: string;
  body: string;
}

export interface GitFileDiff {
  path: string;
  status: 'A' | 'D' | 'M' | 'R' | 'C'; // Added, Deleted, Modified, Renamed, Copied
  oldPath?: string; // For renamed files
}

export interface WorktreeInfo {
  path: string;
  ref: string;
  isTemp: boolean;
}
