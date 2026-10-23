# Deploy editor to la
Pushes to `main` and manual workflow runs build the editor with Node 22.
The deploy job downloads that run's `dist` artifact and calls `scripts/deploy-editor.sh`.
Set repository secret `LA_SSH_KEY` to a private key authorized on la.
Optional `LA_SSH_HOST` defaults to `103.114.160.86`; SSH uses alias `la`.
Optional `LA_SSH_USER` defaults to `root`; match your local `Host la` user.
The user needs write access to `/var/www/voo.run/editor/`.
Without `LA_SSH_KEY`, the build runs and the deploy job is skipped.
Manual local deployment still uses `bash scripts/deploy-editor.sh` and your SSH config.
CI sets `VOO_DEPLOY_SKIP_BUILD=1` to rsync the artifact without rebuilding.
