import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RouteInfo {
  /** URL path, e.g. "/products/:productId" */
  urlPath: string;
  /** Absolute path to the .page.ts file */
  filePath: string;
  /** Absolute path to the paired .server.ts file, if it exists */
  serverFilePath?: string;
  /** Dynamic parameter names extracted from the path */
  params: string[];
  /** True if this route uses a catch-all pattern */
  isCatchAll: boolean;
}

interface ProjectRoutes {
  /** Project root directory (parent of src/app/pages) */
  projectRoot: string;
  routes: RouteInfo[];
}

/**
 * Converts a page filename to a raw path segment.
 * Adapted from @analogjs/router routes.ts toRawPath().
 */
function toRawPath(filename: string): string {
  return filename
    .replace(
      /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts)$)|(\.(ts|md)$)/g,
      '',
    )
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, '(opt-$1)')
    .replace(/\[\.{3}.+\]/, '**')
    .replace(/\[([^\]]+)\]/g, ':$1');
}

/**
 * Converts a raw segment to a clean URL segment.
 * Adapted from @analogjs/router routes.ts toSegment().
 */
function toSegment(rawSegment: string): string {
  return rawSegment
    .replace(/index|\(.*?\)/g, '')
    .replace(/\.|\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Convert a page file path to a URL path.
 */
function fileToUrlPath(filePath: string): string {
  const raw = toRawPath(filePath);
  const segments = raw.split('/').map(toSegment).filter(Boolean);
  return '/' + segments.join('/');
}

/**
 * Extract dynamic parameter names from a URL path.
 */
function extractParams(urlPath: string): string[] {
  const params: string[] = [];
  for (const match of urlPath.matchAll(/:([^/]+)/g)) {
    params.push(match[1]);
  }
  return params;
}

/**
 * Recursively collect files matching a test under a directory.
 */
function collectFiles(dir: string, test: (name: string) => boolean): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, test));
    } else if (entry.isFile() && test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Find all projects with `src/app/pages` directories.
 * Returns an array of { projectRoot, pagesDir } pairs.
 */
function findProjects(root: string): { projectRoot: string; pagesDir: string }[] {
  const results: { projectRoot: string; pagesDir: string }[] = [];
  const seen = new Set<string>();

  function add(projectRoot: string, pagesDir: string) {
    const resolved = path.resolve(pagesDir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    results.push({ projectRoot: path.resolve(projectRoot), pagesDir: resolved });
  }

  // Direct project: root/src/app/pages
  const direct = path.join(root, 'src', 'app', 'pages');
  if (fs.existsSync(direct)) {
    add(root, direct);
  }

  // Monorepo: scan common app directories
  const monorepoParents = ['apps', 'projects', 'packages'];
  for (const parent of monorepoParents) {
    const parentDir = path.join(root, parent);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(parentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectRoot = path.join(parentDir, entry.name);
      const candidate = path.join(projectRoot, 'src', 'app', 'pages');
      if (fs.existsSync(candidate)) {
        add(projectRoot, candidate);
      }
    }
  }

  return results;
}

/**
 * Scans the workspace for Analog page files and builds a route map,
 * grouped by project so monorepo routes are scoped correctly.
 */
export class RouteScanner {
  private projects: ProjectRoutes[] = [];
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Perform initial scan of all pages directories in the workspace.
   */
  scan(): void {
    this.projects = findProjects(this.workspaceRoot).map(({ projectRoot, pagesDir }) => {
      const pageFiles = collectFiles(pagesDir, (name) => name.endsWith('.page.ts'));

      const routes = pageFiles.map((filePath) => {
        const urlPath = fileToUrlPath(filePath);
        const serverFilePath = filePath.replace(/\.page\.ts$/, '.server.ts');
        const hasServer = fs.existsSync(serverFilePath);

        return {
          urlPath,
          filePath,
          serverFilePath: hasServer ? serverFilePath : undefined,
          params: extractParams(urlPath),
          isCatchAll: urlPath.includes('**'),
        };
      });

      return { projectRoot, routes };
    });
  }

  /**
   * Determine which project a document belongs to based on its file path.
   */
  private getProjectForFile(documentPath: string): ProjectRoutes | undefined {
    const resolved = path.resolve(documentPath);
    // Find the project whose root is an ancestor of the document.
    // Sort by longest projectRoot first so nested projects match correctly.
    return this.projects
      .filter((p) => resolved.startsWith(p.projectRoot + path.sep) || resolved.startsWith(p.projectRoot + '/'))
      .sort((a, b) => b.projectRoot.length - a.projectRoot.length)[0];
  }

  /**
   * Get routes scoped to the project containing the given document.
   * Falls back to all routes if no project match is found.
   */
  getRoutes(documentPath?: string): RouteInfo[] {
    if (documentPath) {
      const project = this.getProjectForFile(documentPath);
      if (project) return project.routes;
    }
    // Fallback: return all routes
    return this.projects.flatMap((p) => p.routes);
  }

  /**
   * Find a route by its URL path, scoped to the document's project.
   */
  findByUrlPath(urlPath: string, documentPath?: string): RouteInfo | undefined {
    return this.getRoutes(documentPath).find((r) => r.urlPath === urlPath);
  }

  /**
   * Get the paired .server.ts file for a .page.ts file, or vice versa.
   */
  getPairedFile(filePath: string): string | undefined {
    if (filePath.endsWith('.page.ts')) {
      const serverPath = filePath.replace(/\.page\.ts$/, '.server.ts');
      return fs.existsSync(serverPath) ? serverPath : undefined;
    }
    if (filePath.endsWith('.server.ts')) {
      const pagePath = filePath.replace(/\.server\.ts$/, '.page.ts');
      return fs.existsSync(pagePath) ? pagePath : undefined;
    }
    return undefined;
  }

  /**
   * Find routes whose URL path matches a given string (for go-to-definition).
   * Scoped to the project containing the given document.
   */
  findByUrlString(urlString: string, documentPath?: string): RouteInfo[] {
    const normalized = urlString.startsWith('/') ? urlString : '/' + urlString;
    const routes = this.getRoutes(documentPath);
    const exact = routes.filter((r) => r.urlPath === normalized);
    if (exact.length > 0) return exact;

    // Try matching parameterized routes: "/products/123" against "/products/:productId"
    return routes.filter((r) => {
      if (r.isCatchAll) return false;
      const routeParts = r.urlPath.split('/');
      const urlParts = normalized.split('/');
      if (routeParts.length !== urlParts.length) return false;
      return routeParts.every(
        (part, i) => part.startsWith(':') || part === urlParts[i],
      );
    });
  }
}
