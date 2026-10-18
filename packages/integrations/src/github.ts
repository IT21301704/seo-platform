// GitHub pull requests (REQUIREMENTS M13 "Custom / framework → opens a pull request with the fix").
// A fine-grained token with Contents + Pull requests (read/write) on one repository. Fixes edit the
// source files on a new branch and open a pull request; nothing changes until someone merges it.
import { ok } from "./http";
import type { JsonHttp } from "./http";

const API = "https://api.github.com";

export interface RepoFile {
  path: string;
  /** UTF-8 text. */
  content: string;
  /** Blob sha (needed to update the file). */
  sha: string;
}

export interface PullRequest {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
}

/** What publishing and rollback need from GitHub (real API or the local demo repository). */
export interface GitHubApi {
  readonly demo?: boolean;
  defaultBranch(): Promise<string>;
  getFile(path: string, ref: string): Promise<RepoFile | null>;
  branchSha(branch: string): Promise<string>;
  createBranch(name: string, fromSha: string): Promise<void>;
  /** Creates or updates one file on a branch (one commit). */
  putFile(args: {
    path: string;
    content: string;
    message: string;
    branch: string;
    sha: string | null;
  }): Promise<void>;
  openPullRequest(args: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<PullRequest>;
  getPullRequest(number: number): Promise<PullRequest>;
  closePullRequest(number: number): Promise<void>;
}

export interface RepoRef {
  owner: string;
  name: string;
}

export function parseRepo(text: string): RepoRef | null {
  const m = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
    text.trim(),
  );
  return m?.[1] && m[2] ? { owner: m[1], name: m[2] } : null;
}

const b64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");
const fromB64 = (text: string): string =>
  Buffer.from(text.replace(/\n/g, ""), "base64").toString("utf8");
const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

export class GitHubClient implements GitHubApi {
  constructor(
    private readonly http: JsonHttp,
    private readonly token: string,
    private readonly repo: RepoRef,
  ) {}

  private async call<T>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    json?: unknown,
    allow404 = false,
  ): Promise<T | null> {
    const res = await this.http.send<T>({
      method,
      url: `${API}/repos/${this.repo.owner}/${this.repo.name}${path}`,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "SEOPlatformBot/1.0",
      },
      ...(json === undefined ? {} : { json }),
    });
    if (allow404 && res.status === 404) return null;
    return ok(res, `GitHub ${method} ${path.split("?")[0]}`);
  }

  async defaultBranch(): Promise<string> {
    const repo = await this.call<{ default_branch: string }>("GET", "");
    return repo?.default_branch ?? "main";
  }

  async getFile(path: string, ref: string): Promise<RepoFile | null> {
    const file = await this.call<{ content: string; sha: string; type: string }>(
      "GET",
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      undefined,
      true,
    );
    if (!file || file.type !== "file") return null;
    return { path, content: fromB64(file.content), sha: file.sha };
  }

  async branchSha(branch: string): Promise<string> {
    const ref = await this.call<{ object: { sha: string } }>(
      "GET",
      `/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    if (!ref) throw new Error(`Branch ${branch} not found`);
    return ref.object.sha;
  }

  async createBranch(name: string, fromSha: string): Promise<void> {
    await this.call("POST", "/git/refs", { ref: `refs/heads/${name}`, sha: fromSha });
  }

  async putFile(args: {
    path: string;
    content: string;
    message: string;
    branch: string;
    sha: string | null;
  }): Promise<void> {
    await this.call("PUT", `/contents/${encodePath(args.path)}`, {
      message: args.message,
      content: b64(args.content),
      branch: args.branch,
      ...(args.sha ? { sha: args.sha } : {}),
    });
  }

  async openPullRequest(args: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<PullRequest> {
    const pr = await this.call<{
      number: number;
      html_url: string;
      state: "open" | "closed";
      merged?: boolean;
    }>("POST", "/pulls", args);
    if (!pr) throw new Error("Pull request was not created");
    return { number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged) };
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const pr = await this.call<{
      number: number;
      html_url: string;
      state: "open" | "closed";
      merged: boolean;
    }>("GET", `/pulls/${number}`);
    if (!pr) throw new Error(`Pull request ${number} not found`);
    return { number: pr.number, url: pr.html_url, state: pr.state, merged: pr.merged };
  }

  async closePullRequest(number: number): Promise<void> {
    await this.call("PATCH", `/pulls/${number}`, { state: "closed" });
  }
}

/** Serialisable state of the local demo repository. */
export interface DemoRepoState {
  branches: Record<string, Record<string, string>>;
  pulls: {
    number: number;
    head: string;
    base: string;
    title: string;
    state: "open" | "closed";
    merged: boolean;
  }[];
}

/**
 * Local test mode: an in-memory repository (state persisted by the caller). "main" is seeded from
 * files the caller provides (the fixture site in development); mergeDemoPullRequest() merges.
 */
export class DemoGitHub implements GitHubApi {
  readonly demo = true;

  constructor(
    private readonly state: DemoRepoState,
    private readonly save: (state: DemoRepoState) => Promise<void>,
    private readonly seed: (path: string) => string | null,
  ) {}

  private files(branch: string): Record<string, string> {
    const files = this.state.branches[branch];
    if (!files) throw new Error(`Branch ${branch} not found`);
    return files;
  }

  async defaultBranch(): Promise<string> {
    this.state.branches["main"] ??= {};
    return "main";
  }

  async getFile(path: string, ref: string): Promise<RepoFile | null> {
    const files = this.files(ref);
    const content = path in files ? (files[path] ?? null) : this.seed(path);
    return content === null ? null : { path, content, sha: `demo-${content.length}` };
  }

  async branchSha(branch: string): Promise<string> {
    this.files(branch);
    return `demo-${branch}`;
  }

  async createBranch(name: string, fromSha: string): Promise<void> {
    const from = fromSha.replace(/^demo-/, "");
    this.state.branches[name] = { ...this.files(from) };
    await this.save(this.state);
  }

  async putFile(args: { path: string; content: string; branch: string }): Promise<void> {
    this.files(args.branch)[args.path] = args.content;
    await this.save(this.state);
  }

  async openPullRequest(args: { title: string; head: string; base: string }): Promise<PullRequest> {
    const number = this.state.pulls.length + 1;
    this.state.pulls.push({
      number,
      head: args.head,
      base: args.base,
      title: args.title,
      state: "open",
      merged: false,
    });
    await this.save(this.state);
    return { number, url: `demo://pull/${number}`, state: "open", merged: false };
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const pr = this.state.pulls.find((p) => p.number === number);
    if (!pr) throw new Error(`Pull request ${number} not found`);
    return { number, url: `demo://pull/${number}`, state: pr.state, merged: pr.merged };
  }

  async closePullRequest(number: number): Promise<void> {
    const pr = this.state.pulls.find((p) => p.number === number);
    if (pr) pr.state = "closed";
    await this.save(this.state);
  }

  /** Demo only: merge the pull request's branch into its base. */
  async mergeDemoPullRequest(number: number): Promise<void> {
    const pr = this.state.pulls.find((p) => p.number === number);
    if (!pr || pr.state !== "open") throw new Error("Only open pull requests can be merged");
    Object.assign(this.files(pr.base), this.files(pr.head));
    pr.state = "closed";
    pr.merged = true;
    await this.save(this.state);
  }
}
