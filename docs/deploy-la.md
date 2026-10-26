# Deploy editor to la2

The production editor is served at https://voo.run/editor/ by SSH host alias `la2`.
Nginx serves `/editor/` from `/srv/voo-run/current/web/public/editor/`.
The old `la` host, `la.voo.run` URL and `/var/www/voo.run/editor/` path are obsolete.

Direct deployment uses the existing local SSH configuration, without copying or
reading its private key:

```sh
bash scripts/deploy-editor.sh
```

Deploy from a clean committed source snapshot; do not publish another task's
unfinished working-tree changes. For an already built artifact:

```sh
VOO_DEPLOY_SKIP_BUILD=1 VOO_DEPLOY_REVISION=<commit> bash scripts/deploy-editor.sh
```

The script permits only `la2`, snapshots the previous directory with hard links
under `/srv/voo-run/editor-backups/`, uploads assets first, and publishes
`index.html` last. It retains old hashed assets for tabs already using them.
Rsync replaces files atomically; it must not use `--inplace` with these backups.
Verify the public index and its referenced assets after deployment. Rollback can
restore the backup entry point while its old assets remain available.

GitHub Actions builds on main pushes. Its optional deployment requires both
`LA2_SSH_KEY` and `LA2_SSH_HOST`; `LA2_SSH_USER` defaults to root. Without those
secrets only the build runs. This does not prevent direct local SSH deployment.
