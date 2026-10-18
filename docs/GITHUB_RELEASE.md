# GitHub release

Judges can open **[msmalls54/helmet-agent](https://github.com/msmalls54/helmet-agent)**
without signing in. The default branch is `main`; the README links to the
demonstration, evidence, source and engineering notes.

## What was published

The first public commit, `5dba35c`, contains a 240-file snapshot: firmware,
TypeScript MCP server, widgets, tests, launchers, documentation and saved evidence.
The featured images and source files were fetched anonymously and matched to
the release copy. [Publication check](../evidence/github-publication.json).

Live keys, Wi-Fi passwords, encrypted credentials, databases and generated
outputs stay outside the release. Local account and messaging setup values in
six configuration/reference files use public placeholders. Sensor waveforms,
test outcomes and demo receipts retain their meaning. Historical development
commit IDs in receipts refer to the original local history.

## Update from the configured laptop

The live working checkout retains its original local `main` history. Its
`public` remote points to this GitHub repository; `github-release` follows the
public history. The remote's default push mapping publishes `github-release`
to GitHub `main`, rather than the private development history.

The sanitized release checkout is `.cache/github-public-release/`, with its
own `main` branch and `origin` remote. For an update:

1. Commit and check the intended changes in the working project.
2. Refresh the release copy from tracked project files. Preserve its public
   account/routing placeholders; never copy ignored runtime files or `.git`.
3. Check for credentials and private contact values, then check document links
   and the relevant tests if behavior changed.
4. Commit and push from the release checkout, then fetch the public `main`
   into the working checkout's `github-release` branch.

Do not force-push the original development history into the public repository.
Publishing source does not expose the live MCP credentials or host the server;
the demonstration continues to run on the configured laptop.
