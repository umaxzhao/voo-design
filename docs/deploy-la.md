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

Web builds omit `public/models` but still copy fonts, ONNX/CanvasKit runtimes,
brand assets and license notices. Model weights have an independent lifecycle:

```sh
VOO_DEPLOY_MODELS_SOURCE=/path/to/licensed/models bash scripts/deploy-editor-models.sh
```

Run that command when provisioning or changing weights, rather than with every
web build. It preserves existing weights and requires the configured RMBG and
two LaMa files. Normal editor deployment checks these files first and excludes
`models/` from rsync; it never deletes them. Public checks must also confirm
binary responses at `/editor/models/`, since an SPA HTML 200 is not a model.
The server includes `scripts/nginx-editor-models.conf` as
`/etc/nginx/snippets/voo-editor-models.conf` inside its VOO server block. This
separate location returns a genuine 404 for absent weights and permits
credential-free cross-origin GET/HEAD for desktop on-demand downloads. Back up
the site configuration, run `nginx -t`, then reload after changing the snippet.
The three upscale model files are not supplied by this installation; do not
claim that upscaling or an offline desktop package is complete without them.

GitHub Actions builds on main pushes. Its optional deployment requires both
`LA2_SSH_KEY` and `LA2_SSH_HOST`; `LA2_SSH_USER` defaults to root. Without those
secrets only the build runs. This does not prevent direct local SSH deployment.
