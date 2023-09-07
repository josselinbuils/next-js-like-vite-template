import path from "node:path";
import { glob } from "glob";
import {
  createServer,
  resolveConfig,
  type Plugin,
  type ViteDevServer,
} from "vite";
import express from "express";

// Client side hydration module.
const VIRTUAL_ENTRY_CLIENT_PREFIX = "/virtual:page:entry-client:";

// Server side rendering module.
const VIRTUAL_ENTRY_SERVER_PREFIX = "virtual:page:entry-server:";

const pagesDirPath = path.join(process.cwd(), "src/pages");
const documentPath = path.join(pagesDirPath, "_document.tsx");

/**
 * Vite is nice, but it forces us to have 1 HTML entrypoint by page, so we
 * cannot factorise them.
 *
 * This plugin allows to generate pages HTML dynamically based on Next.js pages
 * folder logic:
 * - A _document.tsx file to generate the common HTML.
 * - A React component as entrypoint by page.
 *
 * It also implements the file routing logic.
 */
export function vitePluginPage(): Plugin {
  let viteDevServerPromise: Promise<ViteDevServer> | undefined;
  let pageNames: string[]; // ex: ['index', 'blog/[articleId]']

  return {
    name: "vite-plugin-page",
    enforce: "pre",

    /**
     *  Adds page entrypoints to Rollup config.
     */
    async config(userConfig) {
      if (userConfig.build?.rollupOptions?.input !== undefined) {
        throw new Error(
          "build.rollupOptions.input must not be set by user because it will be done by vite-plugin-page.",
        );
      }

      pageNames = await listSourcePages();

      return {
        build: {
          rollupOptions: {
            input: Object.fromEntries(
              pageNames.map((pageName) => [pageName, `${pageName}.html`]),
            ),
          },
        },
      };
    },

    /**
     *  Makes Vite dev server compatible with pages folder.
     */
    async configureServer(server) {
      // Add a Vite dev server middleware to render pages
      server.middlewares.use(async (req, res, next) => {
        const { url } = req;

        if (!url) {
          next();
          return;
        }

        const matchingPageName = pageNames.find((pageName) => {
          return new RegExp(
            `^/${
              pageName
                .replace(/index$/, "") // Aliases /index to /.
                .replace(/\[[^/]+]/, "[^/]+") // Matches any character for `[param]` dynamic parameters.
            }$`,
          ).test(url);
        });

        if (matchingPageName) {
          const { render } = (await server.ssrLoadModule(
            `${VIRTUAL_ENTRY_SERVER_PREFIX}${matchingPageName}`,
          )) as any;
          res.end(
            await server.transformIndexHtml?.(
              req.url!,
              withDocType(render()),
              req.originalUrl,
            ),
          );
        } else {
          next();
        }
      });
    },

    /**
     * Tells Rollup what imports will be managed by the plugin.
     */
    resolveId(source) {
      if (
        source.startsWith(VIRTUAL_ENTRY_CLIENT_PREFIX) ||
        source.startsWith(VIRTUAL_ENTRY_SERVER_PREFIX) ||
        source.endsWith(".html")
      ) {
        return source;
      }
    },

    /**
     * Generates the code for virtual modules.
     */
    async load(id) {
      // Generate HTML of page Rollup entrypoints.
      if (id.endsWith(".html")) {
        const pageName = id.replace(/\.html$/, "");

        if (viteDevServerPromise === undefined) {
          viteDevServerPromise = createServer({
            server: { middlewareMode: true },
          });
        }
        const viteDevServer = await viteDevServerPromise;

        const { render } = await viteDevServer.ssrLoadModule(
          `${VIRTUAL_ENTRY_SERVER_PREFIX}${pageName}`,
        );
        return withDocType(render());
      }

      // Server side rendering module.
      if (id.startsWith(VIRTUAL_ENTRY_SERVER_PREFIX)) {
        const pageName = id.replace(VIRTUAL_ENTRY_SERVER_PREFIX, "");
        return `\
import { createElement } from 'preact/compat';
import { renderToString } from 'preact-render-to-string';
import Document from '${documentPath}';
import Page from '${path.join(pagesDirPath, `${pageName}.tsx`)}';

export function render() {
  return renderToString(
   createElement(
     Document,
     { entryScriptUrl: '${VIRTUAL_ENTRY_CLIENT_PREFIX}${pageName}' },
     createElement(Page, null)
   )
  );
}
`;
      }

      // Client side hydration module.
      if (id.startsWith(VIRTUAL_ENTRY_CLIENT_PREFIX)) {
        const pageName = id.replace(VIRTUAL_ENTRY_CLIENT_PREFIX, "");
        return `\
import { createElement, hydrate } from 'preact/compat';
import Page from '${path.join(pagesDirPath, `${pageName}.tsx`)}';

hydrate(createElement(Page, null), document.getElementById('app'));
`;
      }
    },

    async buildEnd() {
      if (viteDevServerPromise) {
        await (await viteDevServerPromise).close();
      }
    },
  };
}

/**
 * Provides Express middleware to handle page URLs in production.
 */
export async function getServerMiddleware() {
  const router = express.Router();
  const viteConfig = await resolveConfig({}, "build");
  const { assetsDir, outDir } = viteConfig.build;
  const distPath = path.join(process.cwd(), outDir);
  const distAssetsPath = path.join(distPath, assetsDir);
  const pagePaths = await glob("**/*.html", { cwd: distPath });

  for (const pagePath of pagePaths) {
    const route = `/${
      pagePath
        .replace(/\[([^\]]+)]/, ":$1") // Replaces `[param]` dynamic parameters by `:param` Express version.
        .replace(/\.html$/, "") // Removes extension.
        .replace(/index$/, "") // Aliases /index to /.
    }`;

    router.get(route, (_, res) => {
      res.sendFile(path.join(distPath, pagePath));
    });
  }

  router.use(`/${assetsDir}`, express.static(distAssetsPath));

  return router;
}

async function listSourcePages() {
  return (
    await glob("**/[!_]*.tsx", { cwd: path.join(process.cwd(), "src/pages") })
  ).map((filePath) => filePath.replace(/\.tsx$/, ""));
}

function withDocType(html: string): string {
  return `<!DOCTYPE html>\n${html}`;
}
