import type { FunctionComponent } from "preact";

export interface DocumentProps {
  entryScriptUrl?: string;
}

const Document: FunctionComponent<DocumentProps> = ({
  children,
  entryScriptUrl,
}) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <title>Next.js like Vite template</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="How to create a Vite app with Next.js like routing."
      />
    </head>
    <body>
      <div id="app">{children}</div>
      {entryScriptUrl && <script type="module" src={entryScriptUrl} />}
    </body>
  </html>
);

export default Document;
