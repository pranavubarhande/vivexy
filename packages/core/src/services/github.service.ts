import axiosInstance from './axiosInstance.service';

export interface GithubConnection {
  id: string;
  githubUsername: string;
  githubAvatar: string | null;
  scope: string | null;
  createdAt: string;
}

export interface GithubRepo {
  id: string;
  githubRepoId: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  isLinked: boolean;
}

export interface GithubRepoFromApi {
  id: number;
  fullName: string;
  name: string;
  owner: { login: string };
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  updatedAt: string;
  pushedAt: string;
  language: string | null;
}

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
}

export interface GithubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface GithubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  download_url: string | null;
  encoding?: string;
  content?: string;
}

export const githubService = {
  getAuthUrl: async () => {
    const res = await axiosInstance.get<{ url: string }>('/github/auth');
    return res.data;
  },

  getStatus: async () => {
    const res = await axiosInstance.get<{
      connected: boolean;
      connection?: GithubConnection;
    }>('/github/status');
    return res.data;
  },

  getRepos: async (page = 1, perPage = 30) => {
    const res = await axiosInstance.get<GithubRepoFromApi[]>('/github/repos', {
      params: { page, per_page: perPage },
    });
    return res.data;
  },

  linkRepo: async (fullName: string) => {
    const res = await axiosInstance.post<GithubRepo>('/github/repos/link', {
      fullName,
    });
    return res.data;
  },

  unlinkRepo: async (fullName: string) => {
    const res = await axiosInstance.delete<{ success: boolean }>(
      '/github/repos/unlink',
      {
        data: { fullName },
      }
    );
    return res.data;
  },

  getLinkedRepos: async () => {
    const res = await axiosInstance.get<GithubRepo[]>('/github/repos/linked');
    return res.data;
  },

  disconnect: async () => {
    const res = await axiosInstance.delete<{ success: boolean }>(
      '/github/disconnect'
    );
    return res.data;
  },

  getRepoContents: async (fullName: string, path = '', ref?: string) => {
    const res = await axiosInstance.get<GithubContent[]>(
      `/github/repos/${fullName}/contents`,
      {
        params: { path, ref },
      }
    );
    return res.data;
  },

  /** Fetch a single file's metadata + base64 content from GitHub */
  getFileContent: async (
    fullName: string,
    filePath: string,
    ref?: string
  ): Promise<GithubContent> => {
    const res = await axiosInstance.get<GithubContent | GithubContent[]>(
      `/github/repos/${fullName}/contents`,
      { params: { path: filePath, ref } }
    );
    return Array.isArray(res.data) ? res.data[0] : res.data;
  },

  getRepoCommits: async (fullName: string) => {
    const res = await axiosInstance.get<GithubCommit[]>(
      `/github/repos/${fullName}/commits`
    );
    return res.data;
  },

  getRepoBranches: async (fullName: string) => {
    const res = await axiosInstance.get<GithubBranch[]>(
      `/github/repos/${fullName}/branches`
    );
    return res.data;
  },
};
