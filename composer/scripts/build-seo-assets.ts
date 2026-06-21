import { readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const EXCLUDED_PATHS = new Set(["404"]);

const SKIP_DIRS = new Set(["assets", "static-loader-data"]);

async function collectRoutes(outDir: string): Promise<string[]> {
  const routes = new Set<string>();
  const root = resolve(outDir);

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    const dirWalks: Promise<void>[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        dirWalks.push(walk(join(dir, entry.name), `${prefix}/${entry.name}`));
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html")) continue;

      let path: string;
      if (entry.name === "index.html") {
        path = prefix || "/";
      } else {
        const basename = entry.name.replace(/\.html$/, "");
        path = `${prefix}/${basename}`;
      }
      const normalized = path.replace(/\/+/g, "/") || "/";
      const slugOnly = normalized.replace(/^\//, "");
      if (EXCLUDED_PATHS.has(slugOnly)) continue;
      routes.add(normalized);
    }
    await Promise.all(dirWalks);
  }

  await walk(root, "");
  return Array.from(routes).sort();
}

function buildSitemapXml(origin: string, routes: string[]): string {
  const urls = routes
    .map((route) => {
      const loc = `${origin}${route === "/" ? "/" : route}`;
      const priority = route === "/" ? "1.0" : "0.8";
      return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildRobotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

async function writeSeoAssets(outDir: string, origin: string): Promise<void> {
  const routes = await collectRoutes(outDir);
  const sitemap = buildSitemapXml(origin, routes);
  const robots = buildRobotsTxt(origin);
  await writeFile(join(outDir, "sitemap.xml"), sitemap, "utf8");
  await writeFile(join(outDir, "robots.txt"), robots, "utf8");
  console.log(`[seo] wrote sitemap.xml with ${routes.length} routes`);
}

export { writeSeoAssets };
