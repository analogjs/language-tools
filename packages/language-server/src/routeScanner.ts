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
 * Find all `pages` directories under a root by looking for the
 * `src/app/pages` convention at any nesting depth.
 * Handles both standalone projects (src/app/pages) and monorepos
 * (apps/my-app/src/app/pages, projects/foo/src/app/pages).
 */
function findPagesDirs(root: string): string[] {
  const results: string[] = [];

  // Direct project: root/src/app/pages
  const direct = path.join(root, 'src', 'app', 'pages');
  if (fs.existsSync(direct)) {
    results.push(direct);
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
      const candidate = path.join(parentDir, entry.name, 'src', 'app', 'pages');
      if (fs.existsSync(candidate)) {
        results.push(candidate);
      }
    }
  }

  return results;
}

/**
 * Scans the workspace for Analog page files and builds a route map.
 */
export class RouteScanner {
  private routes: RouteInfo[] = [];
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Perform initial scan of all pages directories in the workspace.
   */
  scan(): void {
    const pagesDirs = findPagesDirs(this.workspaceRoot);
    const pageFiles: string[] = [];
    for (const dir of pagesDirs) {
      pageFiles.push(...collectFiles(dir, (name) => name.endsWith('.page.ts')));
    }

    this.routes = pageFiles.map((filePath) => {
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
  }

  /**
   * Get all discovered routes.
   */
  getRoutes(): RouteInfo[] {
    return this.routes;
  }

  /**
   * Find a route by its URL path.
   */
  findByUrlPath(urlPath: string): RouteInfo | undefined {
    return this.routes.find((r) => r.urlPath === urlPath);
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
   * Matches both exact paths and parameterized patterns.
   */
  findByUrlString(urlString: string): RouteInfo[] {
    const normalized = urlString.startsWith('/') ? urlString : '/' + urlString;
    const exact = this.routes.filter((r) => r.urlPath === normalized);
    if (exact.length > 0) return exact;

    // Try matching parameterized routes: "/products/123" against "/products/:productId"
    return this.routes.filter((r) => {
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
