/** User-facing copy for the 4-step setup guide (workspace, agent, CLI detection, ready). */
export default {
  "onboardingGuide.step.workspace": "Choose a workspace",
  "onboardingGuide.step.agent": "Choose an agent",
  "onboardingGuide.step.detect": "Detect CLI",
  "onboardingGuide.step.ready": "Ready to go",
  "onboardingGuide.close": "Close guide",
  "onboardingGuide.skip": "Set up later (skip)",
  "onboardingGuide.enterCanvas": "Enter the canvas",

  "onboardingGuide.workspace.native": "Local disk",
  "onboardingGuide.workspace.nativeCustom": "Choose another folder",
  "onboardingGuide.workspace.choosing": "Choosing…",
  "onboardingGuide.workspace.fsa": "Local folder",
  "onboardingGuide.workspace.fsaAvailable": "Grant access to read and write the chosen folder directly",
  "onboardingGuide.workspace.fsaUnavailable": "This browser cannot mount folders directly",
  "onboardingGuide.workspace.fsaChoose": "Choose folder",
  "onboardingGuide.workspace.virtual": "Sandbox workspace",
  "onboardingGuide.workspace.virtualDesc": "Stored in the browser, no permission needed",
  "onboardingGuide.workspace.selected": "Selected:",
  "onboardingGuide.workspace.fsaUnsupported":
    "This browser cannot mount local folders. The sandbox workspace is recommended.",
  "onboardingGuide.workspace.chooseFailed": "Could not select the directory.",
  "onboardingGuide.workspace.fsaFailed": "Could not access the folder.",

  "onboardingGuide.ready.workspace": "Workspace",

  "onboardingGuide.detect.checking": "Detecting…",
  "onboardingGuide.detect.recheck": "Detect again",
  "onboardingGuide.detect.idle": "Preparing to detect…",
  "onboardingGuide.detect.ready": "CLI ready",
  "onboardingGuide.detect.unauthenticated": "CLI detected, but not signed in",
  "onboardingGuide.detect.bridgeMissing": "Web mode needs the local bridge service",
  "onboardingGuide.detect.notInstalled": "CLI not detected",
  "onboardingGuide.detect.path": "Path: {path}",
  "onboardingGuide.detect.unauthenticatedHint":
    "The CLI is installed but not signed in. Run the sign-in command in a terminal.",
  "onboardingGuide.detect.bridgeHint":
    "Web mode needs the local bridge running to reach the CLI on this machine.",
  "onboardingGuide.detect.loginGuide": "Run the sign-in command in a terminal to authenticate:",
  "onboardingGuide.detect.bridgeGuide":
    "Start the local bridge (a WebSocket bridge that talks to the local CLI):",
  "onboardingGuide.detect.installGuide": "Not installed? Run in a terminal:",
  "onboardingGuide.detect.copy": "Copy",
  "onboardingGuide.detect.copied": "Copied",
  "onboardingGuide.detect.bridgeReason": "In a web browser, start the local bridge service first.",
  "onboardingGuide.detect.errorReason": "An error occurred while detecting the CLI.",
};
