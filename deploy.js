// Publish dist/ to the gh-pages branch, which GitHub Pages serves at https://fishygame.github.io.
// gh-pages pushes from its own clone, so tell git to sign in with the GitHub CLI's active account
// (the one that owns the fishygame org) instead of whatever Git Credential Manager has saved.
import { publish } from "gh-pages";

Object.assign(process.env, {
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
  GIT_CONFIG_VALUE_0: "", // clear the inherited helpers first
  GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
  GIT_CONFIG_VALUE_1: "!gh auth git-credential",
});

publish("dist", (err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log("Published");
});
