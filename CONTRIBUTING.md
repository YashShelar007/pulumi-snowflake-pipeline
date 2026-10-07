# Contributing

There are no automated tests. Before opening a PR:

1. `npm install`
2. `npx tsc --noEmit` must pass.
3. If you change resources, run `pulumi preview` against a stack you own and paste the summary in the PR.

Open a PR against `main` with a short description of what changed and why. Do not commit `Pulumi.<stack>.yaml` or any credentials.
