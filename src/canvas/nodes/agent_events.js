/**
 * Window-event names the Agent node uses to talk to the shell.
 *
 * Kept in a pure module (no React) so both the node component and the panel
 * can import them without pulling JSX across the bundle boundary.
 */

/** Ask the shell to bind the right-side Agent panel to a node's session. */
export const AGENT_NODE_OPEN_EVENT = "voo:agent-node-open";

/** Ask the bound panel to reset the node's session (artifacts are untouched). */
export const AGENT_NODE_RESET_EVENT = "voo:agent-node-reset";
