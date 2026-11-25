# sqitchcraft

The guide at https://kronor-io.github.io/sqitchcraft/: how Kronor keeps a
PostgreSQL schema in sqitch, and how sqiff, sqint, pgfmt, create-migration
(sqitch-with-templates), psql-retry, statecharts, hasql-check and sqitch-plan
work together. Plain HTML, one stylesheet, Google Fonts; no build step. GitHub
Pages serves the main branch as it is.

Code blocks are highlighted in the browser by `assets/highlight.js`, which has no
dependencies. Give every new `<pre>` a `data-lang`: `sql`, `shell`, `yaml`, `ini`,
`xml`, `plan`, `tree`, `gitout`, `hs` or `plain`. In `shell` blocks, lines after a
`<span class="p">$ </span>` prompt are commands; lines of output that start like
SQL are highlighted as SQL.

Preview it locally:

```bash
python3 -m http.server 8765
```

Reading order:

- `index.html`: the idea, with the edit-and-migration comparison
- `layout.html`: the folder layout, definitions versus migrations, reworks
- `workflow.html`: two developers change an invoice table three times
- `functions.html`: adding and evolving functions and views
- `git.html`: pull requests, review, blame, and plan conflicts
- `pipeline.html`: lock queues, psql-retry, and what to check when
- `architecture.html`: designing the database the tools serve
- `lifecycles.html`: an invoice lifecycle as a statechart, from the `invoices` example
- `agents.html`: the recommended AGENTS.md (`agents/AGENTS.md`) and `agents/check-database`
- `tools.html`: install steps and commands for each tool

## Where the examples come from

The outputs on `workflow.html`, `git.html`, `layout.html` and the lock and retry
examples on `pipeline.html` were captured from a real example project, run with
sqiff 0.1.2.0, sqint 0.1.0.2, create-migration 0.2.0.0, psql-retry 0.1.0.0,
sqitch 1.5.2 and PostgreSQL 18. Long lines and paths are shortened.

`lifecycles.html` was captured from a second example project, `invoices`: an
invoice table whose lifecycle is an `invoice_flow` statechart, run with
pg_statecharts 0.2.0 on PostgreSQL 18 and deployed with sqitch. The pgfmt
example on `tools.html` is pgfmt's output on the first project.

Not captured, and written from the tools' READMEs: the hasql-check examples
and the GitHub Actions workflow. The two
pre-commit hook commands were tested against the example repository.

Re-capture the examples when a tool changes its output.
