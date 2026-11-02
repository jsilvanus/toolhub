# Repository rules

`main` accepts changes only through pull requests, and pull requests are squash-merged. Direct pushes, force pushes and deleting `main` are blocked.

Import this ruleset under Settings → Rules → Rulesets → New ruleset → Import a ruleset, then in Settings → General → Pull Requests keep only "Allow squash merging" ticked (and tick "Automatically delete head branches"):

```json
{
  "name": "main-via-pr",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "test" }]
      }
    }
  ]
}
```

## Workflows

- `ci` runs lint, typecheck and tests on every push and pull request.
- `tunnus-e2e` runs only on pushes to `main`. It starts the Tunnus image (`TUNNUS_IMAGE`, default `ghcr.io/jsilvanus/tunnus:latest`, override with a repository variable of that name) next to PostgreSQL and signs in to toolhub through it (`test/e2e/tunnus-login.mjs`). The image must be pullable by the workflow; a private package needs a registry login step.
