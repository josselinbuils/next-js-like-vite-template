import { type FC } from "preact/compat";
import { BlogArticle } from "../../components/BlogArticle";

const BlogArticlePage: FC = () => {
  const articleId =
    typeof window !== "undefined"
      ? Number(window.location.pathname.split("/")[2])
      : undefined;

  return <BlogArticle articleId={articleId} />;
};

export default BlogArticlePage;
