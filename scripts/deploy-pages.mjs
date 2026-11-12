// Publica só a pasta public/ no branch gh-pages (o GitHub Pages serve esse branch na raiz).
// Uso: npm run deploy   (antes, commite as mudanças no master)
import { execFileSync } from "node:child_process";

const BRANCH = "gh-pages";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (git("status", "--porcelain")) {
  console.error("Há mudanças sem commit. Faça o commit antes de publicar.");
  process.exit(1);
}

const sha = git("subtree", "split", "--prefix", "public", "HEAD");
git("branch", "-f", BRANCH, sha);
execFileSync("git", ["push", "--force", "origin", `${BRANCH}:${BRANCH}`], { stdio: "inherit" });
console.log(`Publicado em ${BRANCH} (${sha.slice(0, 7)}). O Pages atualiza em cerca de um minuto.`);
