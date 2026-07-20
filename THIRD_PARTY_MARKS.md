# Compatibility Identifiers and Third-Party Marks

The compatibility API retains class identifiers for Apple, Docker, GitHub, Kubernetes, Linux, and Windows because the existing web console may still request those names. The generated font does not contain those companies' logo outlines.

Each identifier maps to a neutral Lucide symbol:

| Compatibility identifier | Neutral source symbol |
|---|---|
| `apple` | `monitor-cog` |
| `docker` | `package` |
| `github` | `git-branch` |
| `kubernetes` | `network` |
| `linux` | `square-terminal` |
| `windows` | `panels-top-left` |

These identifiers do not imply affiliation, endorsement, or permission to use a third-party mark. A later web-console cleanup may replace the compatibility names themselves after all runtime callers and stored values are migrated.
