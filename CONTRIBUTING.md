# Contributing

Before opening a PR:

1. `npm install`
2. `npx tsc --noEmit` and `npm test` must pass. `npm test` runs `index.ts` against Pulumi mocks, so it needs no credentials.
3. If you change resources, run `pulumi preview` against a stack you own and paste the summary in the PR.

Open a PR against `main` with a short description of what changed and why. Do not commit `Pulumi.<stack>.yaml` or any credentials.
