import { type FunctionComponent } from "preact/compat";

export interface BlogArticleProps {
  articleId?: number;
}

export const BlogArticle: FunctionComponent<BlogArticleProps> = ({
  articleId,
}) => <h1>Article {articleId}</h1>;
