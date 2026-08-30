import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "";
const isProjectPages = process.env.GITHUB_ACTIONS === "true"
  && repositoryName !== `${repositoryOwner}.github.io`;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isProjectPages ? `/${repositoryName}` : "",
};

export default nextConfig;
