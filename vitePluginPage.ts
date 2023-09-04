import path from "node:path";
import { glob } from "glob";
import {
  createServer,
  resolveConfig,
  type Plugin,
  type ViteDevServer,
} from "vite";
import express from "express";

const VIRTUAL_DOCUMENT_ID = "virtual:page:document";
const VIRTUAL_ENTRY_CLIENT_PREFIX = "/virtual:page:entry-client:";
const VIRTUAL_ENTRY_PAGE_PREFIX = "virtual:page:entry-page:";
const VIRTUAL_ENTRY_SERVER_PREFIX = "virtual:page:entry-server:";

const pagesDirPath = path.join(process.cwd(), "src/pages");
const documentPath = path.join(pagesDirPath, "_document.tsx");

export function vitePluginPage(): Plugin {
  let viteDevServerPromise: Promise<ViteDevServer> | undefined;
  let pageNames: string[];

  return {
    name: "vite-plugin-page",
    enforce: "pre",
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
    async configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { url } = req;

        if (!url) {
          next();
          return;
        }

        const matchingPageName = pageNames.find((pageName) =>
          new RegExp(
            `^/${pageName.replace(/index$/, "").replace(/:[^/]+/, "[^/]+")}$`,
          ).test(url),
        );

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
    resolveId(source) {
      if (source === VIRTUAL_DOCUMENT_ID) {
        return documentPath;
      }
      if (source.startsWith(VIRTUAL_ENTRY_PAGE_PREFIX)) {
        const pageName = source.replace(VIRTUAL_ENTRY_PAGE_PREFIX, "");
        return path.join(pagesDirPath, `${pageName}.tsx`);
      }
      if (
        source.startsWith(VIRTUAL_ENTRY_CLIENT_PREFIX) ||
        source.startsWith(VIRTUAL_ENTRY_SERVER_PREFIX) ||
        source.endsWith(".html")
      ) {
        return source;
      }
    },
    async load(id) {
      if (id.startsWith(VIRTUAL_ENTRY_CLIENT_PREFIX)) {
        const pageName = id.replace(VIRTUAL_ENTRY_CLIENT_PREFIX, "");
        return `\
import { createElement, hydrate } from 'preact/compat';
import Page from '${VIRTUAL_ENTRY_PAGE_PREFIX}${pageName}';

hydrate(createElement(Page, null), document.getElementById('app'));
`;
      }
      if (id.startsWith(VIRTUAL_ENTRY_SERVER_PREFIX)) {
        const pageName = id.replace(VIRTUAL_ENTRY_SERVER_PREFIX, "");
        return `\
import { createElement } from 'preact/compat';
import { renderToString } from 'preact-render-to-string';
import Document from '${VIRTUAL_DOCUMENT_ID}';
import Page from '${VIRTUAL_ENTRY_PAGE_PREFIX}${pageName}';

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
    },
    async buildEnd() {
      if (viteDevServerPromise) {
        await (await viteDevServerPromise).close();
      }
    },
  };
}

export async function getServerMiddleware() {
  const router = express.Router();
  const viteConfig = await resolveConfig({}, "build");
  const { assetsDir, outDir } = viteConfig.build;
  const distPath = path.join(process.cwd(), outDir);
  const distAssetsPath = path.join(distPath, assetsDir);
  const pagePaths = await glob("**/*.html", { cwd: distPath });

  for (const pagePath of pagePaths) {
    const route = `/${pagePath.replace(/\.html$/, "").replace(/index$/, "")}`;

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
