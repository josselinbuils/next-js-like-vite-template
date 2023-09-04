import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { getServerMiddleware } from "../vitePluginPage";

const HTTP_INTERNAL_ERROR = 500;
const HTTP_NOT_FOUND = 404;
const PORT = 3000;

(async () => {
  const app = express();

  app.use(await getServerMiddleware());

  app.all("*", (_, res) => {
    res.sendStatus(HTTP_NOT_FOUND);
  });

  app.use(
    // next is required even if not used
    (_error: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.sendStatus(HTTP_INTERNAL_ERROR);
    },
  );

  await new Promise<void>((resolve) => app.listen(PORT, resolve));

  console.log(`Server started on http://localhost:${PORT}.`);
})();
