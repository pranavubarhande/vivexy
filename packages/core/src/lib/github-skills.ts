/**
 * GitHub-based skills browser for the Vercel Skills Registry (skills.sh ecosystem).
 *
 * Parses the same URL formats as the `skills` CLI:
 *   - "vercel-labs/agent-skills"             (shorthand owner/repo)
 *   - "https://github.com/owner/repo"
 *   - "https://github.com/owner/repo/tree/main/skills/my-skill"  (specific skill path)
 *
 * Uses the GitHub REST API (public, no auth) to discover SKILL.md files.
 * Rate limit: 60 requests/hour unauthenticated.
 */

export interface GithubSkillFile {
  /** Relative path of the file within the repo */
  path: string;
  /** Download URL for the raw content */
  downloadUrl: string;
}

export interface GithubSkill {
  /** Skill name from SKILL.md frontmatter */
  name: string;
  description: string;
  /** Directory path within the repo that holds SKILL.md */
  dirPath: string;
  owner: string;
  repo: string;
  branch: string;
  /** Raw content of SKILL.md */
  content: string;
  /** Supporting files (filename → content) */
  files?: Record<string, string>;
}

export interface ParsedGithubRef {
  owner: string;
  repo: string;
  branch: string;
  /** Path within the repo (empty for root) */
  path: string;
}

// ── URL parsing ────────────────────────────────────────────────────────────────

export const parseGithubUrl = (input: string): ParsedGithubRef | null => {
  const s = input.trim();

  // Full URL: https://github.com/owner/repo[/tree/branch[/path...]]
  const fullMatch = s.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/
  );
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
      branch: fullMatch[3] || 'main',
      path: fullMatch[4] || '',
    };
  }

  // Shorthand: owner/repo[/optional/path]
  const shortMatch = s.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\/.*)?$/);
  if (shortMatch && !s.startsWith('http')) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: 'main',
      path: (shortMatch[3] || '').replace(/^\//, ''),
    };
  }

  return null;
};

// ── GitHub API helpers ─────────────────────────────────────────────────────────

const githubFetch = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status}: ${msg}`);
  }
  return res.json();
};

const rawFetch = async (
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<string> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
  return res.text();
};

// ── Frontmatter parsing ────────────────────────────────────────────────────────

const parseFrontmatter = (
  raw: string
): { name?: string; description?: string; body: string } => {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { body: raw };

  const fm = match[1];
  const body = match[2].trim();

  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    body,
  };
};

// ── Skills discovery ───────────────────────────────────────────────────────────

interface TreeItem {
  path: string;
  type: string;
  url: string;
}

/**
 * Discover all SKILL.md files in a GitHub repo at the given path.
 * Uses the Git Trees API for efficiency (single request for entire tree).
 */
export const listSkillsInRepo = async (
  ref: ParsedGithubRef
): Promise<GithubSkill[]> => {
  const { owner, repo, branch, path: rootPath } = ref;

  // Fetch the tree recursively
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  let treeData: { tree?: TreeItem[]; truncated?: boolean };
  try {
    treeData = (await githubFetch(treeUrl)) as typeof treeData;
  } catch (err) {
    // Try 'master' if 'main' fails
    if (branch === 'main') {
      const fallbackUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
      treeData = (await githubFetch(fallbackUrl)) as typeof treeData;
      (ref as { branch: string }).branch = 'master';
    } else {
      throw err;
    }
  }

  const tree = treeData.tree || [];

  // Filter for SKILL.md files that are under rootPath (if specified)
  const skillMdFiles = tree.filter((item) => {
    if (item.type !== 'blob') return false;
    if (!item.path.endsWith('/SKILL.md') && item.path !== 'SKILL.md')
      return false;
    if (rootPath && !item.path.startsWith(rootPath)) return false;
    return true;
  });

  // Fetch each SKILL.md and parse frontmatter
  const skills = await Promise.allSettled(
    skillMdFiles.map(async (item): Promise<GithubSkill> => {
      const content = await rawFetch(owner, repo, ref.branch, item.path);
      const { name, description, body } = parseFrontmatter(content);

      const dirPath = item.path.replace(/\/SKILL\.md$/, '');
      const skillName = name || dirPath.split('/').pop() || 'unknown';

      // Fetch sibling .md files (supporting files)
      const siblingPaths = tree
        .filter(
          (t) =>
            t.type === 'blob' &&
            t.path !== item.path &&
            t.path.startsWith(dirPath ? dirPath + '/' : '') &&
            t.path.endsWith('.md') &&
            !t.path.slice(dirPath ? dirPath.length + 1 : 0).includes('/')
        )
        .slice(0, 5); // cap at 5 supporting files

      const fileEntries = await Promise.allSettled(
        siblingPaths.map(async (f) => {
          const fc = await rawFetch(owner, repo, ref.branch, f.path);
          return [f.path.split('/').pop() as string, fc] as [string, string];
        })
      );

      const files: Record<string, string> = {};
      for (const r of fileEntries) {
        if (r.status === 'fulfilled') {
          files[r.value[0]] = r.value[1];
        }
      }

      return {
        name: skillName,
        description: description || '',
        dirPath,
        owner,
        repo,
        branch: ref.branch,
        content: body,
        files: Object.keys(files).length > 0 ? files : undefined,
      };
    })
  );

  return skills.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
};

/**
 * Convert a GithubSkill into a partial SkillConfig-compatible object
 * suitable for passing to electronAPI.saveSkill().
 */
export const githubSkillToInstallable = (skill: GithubSkill) => {
  return {
    name: skill.name,
    description: skill.description,
    content: skill.content,
    files: skill.files,
    enabled: true,
  };
};
