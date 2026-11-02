# Editor resources

The Assets tab reuses the workspace storage backend. `Resources/` is a normal
workspace directory (a virtual folder in the default browser workspace), created
on the first import or saved selection. It is visible alongside projects in the
workbench, so the library has one durable home rather than a separate cache.
Selecting a local workspace uses that workspace's directory and permissions.

The source menu provides:

- Workspace: saved selections and imported PNG, JPEG, WebP, SVG and `.voo` files.
  Imports become self-contained `.voo` resources with embedded image bytes.
- In this file: component masters and media already used in the current file.
  Component cards insert linked instances; media cards insert independent copies.
- Templates: the same nine editable template factories used by the welcome page.
  Clicking inserts new content into the active canvas without replacing it.

The existing search button filters resource names. The plus button imports files;
the bookmark-plus button saves the current selection including container children.
Removing a workspace card moves its file to the existing workspace trash. Repeated
imports have unique whitespace-free physical filenames and do not overwrite files.
Each insertion is one undo entry and cloned nodes retain internal parent/clip links.
Imported bitmap identifiers are isolated from unrelated files before hydration.

Resources follow the active workspace. Switching workspaces changes the library;
it does not automatically copy the old workspace's resources. Each file is limited
to 50 MB. Native system permission prompts remain owned by the existing workspace
picker. The initial UI supports click/tap insertion; drag-to-place is not provided.

Verification: `tests/e2e/editor-resources.e2e.mjs` uses the real editor and checks
selection save/reuse/undo, component instances, image pixels after hydration,
templates, search, persistence across reload and the shared workspace directory.
`tests/unit/workspace_resources.test.js` protects subtree and reference isolation.

`editor-resources-built.e2e.mjs` additionally opens the compiled production bundle
and verifies the actual template browser, insertion and undo before deployment.
