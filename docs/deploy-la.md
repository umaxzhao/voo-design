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

Deployment also installs `scripts/nginx-editor-runtime.conf` through
`scripts/deploy-editor-runtime.sh`, with configuration backup, `nginx -t` and
rollback on failure. The scoped `/editor/ort/` location serves `.mjs` as
JavaScript and `.wasm` as `application/wasm`, revalidates unversioned assets and
returns 404 for absent modules. After uploading assets and before publishing
HTML, `scripts/verify-editor-runtime.mjs` checks all six runtime responses and
a missing-module 404. The actual hosted AI inference path still needs a real
browser check; a successful build alone cannot validate server MIME handling.

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
The three upscale choices share two independently hosted weights. Deployment
checks their availability; actual inference and offline desktop behavior need
their separate acceptance evidence.

GitHub Actions builds on main pushes. Its optional deployment requires both
`LA2_SSH_KEY` and `LA2_SSH_HOST`; `LA2_SSH_USER` defaults to root. Without those
secrets only the build runs. This does not prevent direct local SSH deployment.


Legacy room links use `scripts/nginx-editor-sharing.conf`, provisioned by
`scripts/deploy-editor-sharing.sh` during editor deployment. Only `/r/<room>`
redirects to `/editor/?r=<room>`; the browser retains the `#k` fragment without
sending it to nginx. Configuration is backed up outside `sites-enabled`, checked
with `nginx -t` before reload and restored on failure. This is URL compatibility,
not certification of real multi-device collaboration.
