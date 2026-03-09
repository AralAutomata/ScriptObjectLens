import { GitRef } from "../../../shared/types.ts";
import { GitBranchInfo, GitTagInfo, GitCommitInfo, GitFileDiff, WorktreeInfo } from "./git-types.ts";

const TEMP_WORKTREE_PREFIX = ".arch-diff-worktree-";

export class GitClient {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Validate a git ref to prevent flag injection
   */
  private validateRef(ref: string): void {
    if (ref.startsWith('-')) {
      throw new Error(`Invalid git ref: "${ref}"`)
    }
  }

  /**
   * Check if the path is a valid git repository
   */
  async isValidRepository(): Promise<boolean> {
    try {
      const result = await this.runGitCommand(["rev-parse", "--git-dir"]);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string | null> {
    try {
      const result = await this.runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (result.success && result.stdout.trim()) {
        return result.stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * List all local branches
   */
  async getBranches(): Promise<GitRef[]> {
    try {
      // Get branch info with latest commit details
      const result = await this.runGitCommand([
        "for-each-ref",
        "--format=%(refname:short)%00%(objectname:short)%00%(subject)%00%(authorname)%00%(authordate:iso)",
        "refs/heads/"
      ]);

      if (!result.success) return [];

      const branches: GitRef[] = [];
      const lines = result.stdout.split("\n").filter(line => line.trim());

      for (const line of lines) {
        const parts = line.split("\0");
        if (parts.length >= 2) {
          branches.push({
            name: parts[0],
            type: "branch",
            hash: parts[1] || ""
          });
        }
      }

      return branches;
    } catch (e) {
      console.error("Error getting branches:", e);
      return [];
    }
  }

  /**
   * List all tags
   */
  async getTags(): Promise<GitRef[]> {
    try {
      const result = await this.runGitCommand([
        "tag",
        "-l",
        "--format=%(refname:short)%00%(objectname:short)%00%(subject)%00%(creatordate:iso)"
      ]);

      if (!result.success) return [];

      const tags: GitRef[] = [];
      const lines = result.stdout.split("\n").filter(line => line.trim());

      for (const line of lines) {
        const parts = line.split("\0");
        if (parts.length >= 2) {
          tags.push({
            name: parts[0],
            type: "tag",
            hash: parts[1] || ""
          });
        }
      }

      return tags;
    } catch (e) {
      console.error("Error getting tags:", e);
      return [];
    }
  }

  /**
   * Get recent commits for ref autocomplete
   */
  async getRecentCommits(limit: number = 20): Promise<GitRef[]> {
    try {
      const result = await this.runGitCommand([
        "log",
        `--max-count=${limit}`,
        "--format=%H%x00%h%x00%s%x00%an%x00%ad",
        "--date=iso"
      ]);

      if (!result.success) return [];

      const commits: GitRef[] = [];
      const lines = result.stdout.split("\n").filter(line => line.trim());

      for (const line of lines) {
        const parts = line.split("\0");
        if (parts.length >= 2) {
          commits.push({
            name: `${parts[2]?.substring(0, 50) || ""} (${parts[3] || "?"})`,
            type: "commit",
            hash: parts[0] || ""
          });
        }
      }

      return commits;
    } catch (e) {
      console.error("Error getting commits:", e);
      return [];
    }
  }

  /**
   * Resolve a git ref to a full commit hash
   */
  async resolveRef(ref: string): Promise<string | null> {
    try {
      this.validateRef(ref)
      const result = await this.runGitCommand(["rev-parse", "--verify", ref]);
      if (result.success && result.stdout.trim()) {
        return result.stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get files changed between two refs
   */
  async getChangedFiles(from: string, to: string): Promise<GitFileDiff[]> {
    try {
      this.validateRef(from)
      this.validateRef(to)
      const result = await this.runGitCommand([
        "diff",
        "--name-status",
        `${from}...${to}`,
        "--"
      ]);

      if (!result.success) return [];

      const files: GitFileDiff[] = [];
      const lines = result.stdout.split("\n").filter(line => line.trim());

      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          const status = parts[0] as GitFileDiff["status"];
          const path = parts[1];
          const oldPath = parts.length > 2 ? parts[2] : undefined;

          files.push({ path, status, oldPath });
        }
      }

      return files;
    } catch (e) {
      console.error("Error getting changed files:", e);
      return [];
    }
  }

  /**
   * Create a temporary worktree at a specific ref
   * Returns the path to the worktree
   */
  async createWorktree(ref: string): Promise<string | null> {
    try {
      this.validateRef(ref)
      const worktreeName = `${TEMP_WORKTREE_PREFIX}${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const worktreePath = `${this.repoPath}/${worktreeName}`;

      // Create worktree
      const result = await this.runGitCommand([
        "worktree",
        "add",
        worktreePath,
        ref,
        "--detach"
      ]);

      if (!result.success) {
        console.error("Failed to create worktree:", result.stderr);
        return null;
      }

      return worktreePath;
    } catch (e) {
      console.error("Error creating worktree:", e);
      return null;
    }
  }

  /**
   * Remove a temporary worktree
   */
  async removeWorktree(worktreePath: string): Promise<boolean> {
    try {
      // Force remove the worktree
      const result = await this.runGitCommand([
        "worktree",
        "remove",
        worktreePath,
        "--force"
      ]);

      return result.success;
    } catch (e) {
      console.error("Error removing worktree:", e);
      // Fallback: try to delete directory directly
      try {
        await Deno.remove(worktreePath, { recursive: true });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Clean up all temporary worktrees (called on startup or manually)
   */
  async cleanupTempWorktrees(): Promise<number> {
    let removed = 0;

    try {
      // List all worktrees
      const result = await this.runGitCommand([
        "worktree",
        "list",
        "--porcelain"
      ]);

      if (!result.success) return removed;

      const lines = result.stdout.split("\n");
      let currentWorktree: { path?: string; ref?: string } = {};

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          if (currentWorktree.path && currentWorktree.path.includes(TEMP_WORKTREE_PREFIX)) {
            await this.removeWorktree(currentWorktree.path);
            removed++;
          }
          currentWorktree = { path: line.replace("worktree ", "").trim() };
        } else if (line.startsWith("HEAD ")) {
          currentWorktree.ref = line.replace("HEAD ", "").trim();
        }
      }

      // Check last worktree
      if (currentWorktree.path && currentWorktree.path.includes(TEMP_WORKTREE_PREFIX)) {
        await this.removeWorktree(currentWorktree.path);
        removed++;
      }
    } catch (e) {
      console.error("Error cleaning up worktrees:", e);
    }

    return removed;
  }

  /**
   * Check if a path is inside a worktree we created
   */
  isTempWorktree(path: string): boolean {
    return path.includes(TEMP_WORKTREE_PREFIX);
  }

  /**
   * Run a git command and return stdout/stderr
   */
  private async runGitCommand(
    args: string[],
    options?: { cwd?: string }
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const command = new Deno.Command("git", {
      args,
      cwd: options?.cwd || this.repoPath,
      stdout: "piped",
      stderr: "piped"
    });

    const { code, stdout, stderr } = await command.output();
    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    return {
      success: code === 0,
      stdout: stdoutText,
      stderr: stderrText
    };
  }

  /**
   * Get all git refs in a single call (optimization)
   */
  async getAllRefs(): Promise<{ branches: GitRef[]; tags: GitRef[]; commits: GitRef[] }> {
    const [branches, tags, commits] = await Promise.all([
      this.getBranches(),
      this.getTags(),
      this.getRecentCommits(50)
    ]);

    return { branches, tags, commits };
  }
}
