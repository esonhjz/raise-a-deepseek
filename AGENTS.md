# Public extraction repository

This repository is the MIT-licensed, reproducible character-Agent core. It is
not the owner's private companion deployment or its development workspace.

- Develop the private companion in its designated private workspace. Bring
  changes here only as deliberately selected, reusable modules.
- Never merge, cherry-pick wholesale, mirror, or push the private host's Git
  history into this repository. Extract reviewed source changes instead.
- Exclude real conversations, memories, diaries, letters, account identifiers,
  credentials, private paths, runtime configuration and diagnostic exports.
  Use synthetic fixtures and documented configuration placeholders.
- Check third-party code and asset licenses independently of this repository's
  MIT license. Do not relicense third-party content by copying it here.
- Every extracted feature needs a clean-environment usage example and relevant
  offline tests. Private deployment success is not evidence that this package
  works independently.
- Keep public-module status separate from private-host implementation and
  acceptance status. Do not describe planned or private-only features as shipped
  public capabilities.
- Inspect the diff and staged files before commits. Commit and push are separate
  actions; follow the user's current authorization for each. Never stage data/,
  .local/, environment files or other ignored private artifacts.
