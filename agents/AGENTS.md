# Database changes

This project keeps its PostgreSQL schema in a sqitch project under `database/`,
one file per object, and changes it with sqiff, create-migration, sqint and
psql-retry. Follow this section for any change under `database/` or to
`sqitch.conf`, `sqiff.yaml` or `database/sqitch*.plan`.

The sqitchcraft guide explains the layout, works through examples and gives
the reasons behind each rule below: https://kronor-io.github.io/sqitchcraft/

## Where things are

- `sqitch.conf` is at the repository root with `top_dir = database`. Run
  sqitch, sqiff, sqint and create-migration from the root, never from inside
  `database/`.
- `database/sqitch.plan` is the deploy order. `database/deploy/`,
  `database/revert/` and `database/verify/` are parallel trees; a change's name
  is its path under them, without `.sql`.
- Definitions say what an object is now, one per file:
  - tables: `deploy/<schema>/table/<name>.sql`
  - views: `deploy/<schema>/view/<name>.sql`
  - functions: `deploy/<schema>/function/<name>.sql`
  - triggers: `deploy/<schema>/trigger/<table>/<name>.sql`
  - indexes built on their own: `deploy/<schema>/table/<table>/index/<name>.sql`
  - domains: `deploy/type/<name>.sql`
- Migrations say how an existing database gets there, and run once:
  `deploy/migrations/YYYY/MM/YYYY-MM-DD-HHMMSS-<what>.sql`.
- `<name>@<tag>.sql` files are rework snapshots: earlier versions of a
  definition that old changes still deploy and revert from.

To learn what an object looks like, read its definition file. Do not
reconstruct it from migrations.

## Choose the workflow

| You need to | Do this |
|---|---|
| Create a table, view, function, trigger or domain | `create-migration <kind> …`, then fill in the generated files |
| Change a table that exists | Edit its definition, preview with `sqiff table`, write with `sqiff table --write` |
| Change a function or view that exists | `sqitch tag` if needed, `sqitch rework -n …`, edit the definition, fix the revert |
| Add a `not null` column to a table with rows | `create-migration non-nullable-column` (five changes, see below) |
| Rename a column used by running code | `create-migration rename-column-step-1`, later `rename-column-step-2` |
| Add an index to a big table | `create-migration add-index` (or let sqiff write it from the definition) |
| Backfill data | `create-migration bulk-update` |
| Anything else that alters data or schema | `create-migration migration --description "<what>"` |

Run `create-migration <command> --help` for flags. Pass every value as a flag:
without one, create-migration prompts interactively.

### Create an object

```bash
create-migration table --schema billing --table-name invoice
create-migration view --schema billing --view-name daily_invoiced
create-migration function general --schema billing --function-name outstanding_for
create-migration trigger row --schema billing --trigger-name start_invoice_flow --trigger-table invoice
```

The generated deploy script is a placeholder. Replace it with the real
definition, written as if creating the object today: `create table if not
exists`, `create or replace function`, `create or replace view`, with `comment
on` for the object and its columns. Make the verify script exercise the object
(select from it, call the function) so a broken deploy fails.

### Change a table

1. Edit `database/deploy/<schema>/table/<name>.sql` to the new shape. Never
   write `alter table` in it.
2. Preview: `sqiff table database/deploy/<schema>/table/<name>.sql`. Read every
   `hazard:` line and every dependent object it lists.
3. If sqiff says a column is dropped and another added with the same type,
   it is asking whether that is a rename. Do not guess. Pass
   `--rename old:new` only when the task says it is a rename, `--drop-and-add`
   only when the task says the data may go; otherwise stop and ask.
4. Write it: `sqiff table database/deploy/<schema>/table/<name>.sql --write`.
   This adds the migration, its revert and verify, and reworks the table.
5. Read the generated migration and revert. Check that the revert undoes only
   what the migration did.

If sqiff lists a function or view that names a column you rename or drop,
redefine that object inside the same migration, after the `alter`, and rework
its definition file to match. A later, separate change is not enough: sqitch
commits each change on its own, so the object would be broken in between.
Then fix both reverts, which run in reverse plan order: the migration's revert
puts the old definition back after undoing the `alter`, and the rework's revert
recreates the object as it is now (the column still has its new name when it
runs). sqitch's generated rework revert restores the old definition too early
and fails.

### Change a function or view

1. `sqitch rework <change> -n "<why>"`. If sqitch says it needs an
   intervening tag, add one first:
   `sqitch tag @YYYY-MM-DD_<topic> -n "before <what changes>"`. Always pass
   `-n`: without it, sqitch opens an editor and waits.
   Reuse a tag that already sits after the object's last change instead of
   adding another.
2. Edit the definition file in place. Never edit the `@tag` copy.
3. The revert script is now the previous definition. Check it restores that
   exactly.

A function is identified by its name and argument types. If you add or remove
an argument, change the return type or rename a parameter:

- In the definition, `drop function if exists <schema>.<name>(<old types>);`
  then `create or replace function` with the new signature, in the same
  transaction. Otherwise both versions exist and existing calls become
  ambiguous, or PostgreSQL refuses the change.
- Give new arguments defaults, so code that is already running keeps working.
- Do not give a parameter the name of a column the body reads: in a SQL
  function the column wins. Qualify the column (`i.currency`) or name the
  parameter differently.
- Restate the comment and grants: dropping a function removes them.
- In the revert script, add `drop function if exists <schema>.<name>(<new types>);`
  before it recreates the old signature.

For a view, `create or replace view` may only add columns at the end. To rename
or remove a column, `drop view` and `create view` in the definition, restating
comments and grants, and handle anything that reads the view.

### Changes that take several releases

Some changes cannot be read off the final definition, because the application
has to change in the middle. Use the recipe and say in your report which
release each part belongs to.

- `non-nullable-column`: add the column, add `check (… is not null) not valid`,
  backfill in batches, validate, then `set not null`. Before the check ships,
  every insert must already set the column (application, default or trigger).
  Then bring the table's definition up to date with `sqiff table --write`.
  sqiff before 0.1.3.0 cannot do it after a batched backfill: it replays the
  branch's earlier changes in one transaction, and the backfill commits, so it
  stops with `invalid transaction termination`. With those versions, use
  `sqitch rework` and edit the file.
- `rename-column-step-1` adds the new column, keeps both in sync and backfills.
  `rename-column-step-2` drops the old column. Ship step 2 only after no
  running code uses the old name.

## Rules

Never:

- put `alter table` in a definition file;
- create, edit or delete a `@tag` snapshot by hand;
- edit a deploy script that is already on the main branch, except by
  `sqitch rework`;
- reword, reorder or remove lines of `sqitch.plan` that exist on the main
  branch;
- rework the same object twice in one branch: edit the definition again, and
  run `sqiff table` again for tables (it moves the rework after the new
  migration);
- build an index without `concurrently` on an existing table, or add a check
  or foreign key without `not valid` (validate it in its own change);
- raise or remove the `lock_timeout` a template sets;
- use `exception when` blocks to retry inside PL/pgSQL;
- deploy to, or connect to, any database other than a local or scratch one.

Always:

- start new objects and hand-written migrations from create-migration;
- keep definitions safe to run twice (`if not exists`, `or replace`,
  `drop … if exists` for an old signature);
- keep every change backwards compatible with the code that is running while
  it deploys: add first, remove in a later release.

## Merging and rebasing

`sqitch.plan` conflicts at the end of the file whenever two branches change
the schema. Resolve it by regenerating, not by hand:

1. Take the main branch's `sqitch.plan`, and its revert and verify scripts for
   every object your branch reworked.
2. Delete the files your branch generated: its migrations and its `@tag`
   snapshots.
3. Keep your edits to definition files; git usually merges them cleanly.
4. Run `sqiff table … --write` again for each table you changed, and redo
   `sqitch rework` for each function or view.

A snapshot generated before the rebase holds the definition from before the
main branch's changes. Keeping it makes reverts of views and functions restore
the wrong version.

## Check before you finish

Run all of these, and report each one's result:

```bash
scripts/check-database                 # lint, plan rules, fresh deploy, revert and redeploy
```

- `sqint` findings: fix every `BLOCK`. Do not add `-- lint:ignore` yourself.
  If you believe a finding is acceptable, say so in your report with the
  reason, and leave the decision to a human.
- If the project has Haskell services:
  `find src -name '*.hs' -print0 | hasql-check --nullability --types --files0-from -`
  against the migrated scratch database.

sqint's dynamic pass (`--with-postgres`) before 0.1.1.0 can skip or stop when
changes are reworked; 0.1.1.0 handles reworks. The static pass and
`scripts/check-database` do not depend on it. sqint deploys to sqitch's default
target, so when you run the dynamic pass set `SQITCH_TARGET` to the scratch
database as well as `PG*`.

## Stop and ask a human when

- sqiff or sqint reports a table rewrite, an `ACCESS EXCLUSIVE` lock held
  during a scan, or `deletes data`, unless the task already says the cost is
  accepted;
- a change drops a column, table, function or view, or renames anything that
  running code uses;
- a conflict in `sqitch.plan` involves lines that are already on the main
  branch;
- a check fails and the fix would break one of the rules above.

## Report

End with:

1. What changed: each definition edited, each change added to the plan.
2. Hazards: every `hazard:` line and sqint finding, and what you did about it.
   List every backfill with the table it updates, and say whether you know how
   many rows that table has in production.
3. Releases: if the change spans releases, what ships now and what later.
4. Checks: the commands you ran and their results; anything you could not run.
