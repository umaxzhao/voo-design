/**
 * English (en) dictionary. Complete aggregate dictionary.
 * 100% key parity with zh.js is maintained here.
 */
import coreEn from "./core-en.js";
import extendedEn from "./extended-en.js";
import uxEn from "./ux-en.js";
import storyboardEn from "./storyboard-en.js";
import gameAssetsEn from "./game-assets-en.js";
import designAssetsEn from "./design-assets-en.js";
import adminEn from "./admin-en.js";
import accountAvatarEn from "./account-avatar-en.js";
import hunyuan3dEn from "./hunyuan3d-en.js";
import feedbackEn from "./feedback-en.js";

import sceneEditorEn from "./scene-editor-en.js";
import presentationEn from "./presentation-en.js";
import creationTypesEn from "./creation-types-en.js";

export default {
  "canvas.start.loading": "Loading template…",
  "editor.wf.conn.templateLoad":
    "Could not load template. Refresh and try again.",
  "error.chatgptWorkMode":
    "ChatGPT is in Work mode. Save the current draft or finish its task, switch to Chat, then try again.",
  "run.recovery.collectingWeb": "Recovering existing webpage results…",
  "run.recovery.webConnectionRequired":
    "Connect the browser extension to recover existing results.",
  "editor.assetUnavailable":
    "A document asset could not be read. The file was not saved.",
  "error.projectAssetUnavailable":
    "A project asset could not be read. The project was not saved.",
  "agent.quickPrompts": "Quick prompts",
  "workspace.showDesign": "Design editor",
  "workspace.showWorkflow": "Workflow",
  "library.typeLabel": "Type",
  ...sceneEditorEn,
  ...presentationEn,
  ...creationTypesEn,
  ...adminEn,
  ...accountAvatarEn,
  ...hunyuan3dEn,
  "nodeStore.videoScript.name": "Video script and storyboard",
  "nodeStore.videoScript.description":
    "Story Prompt → script Prompt → Storyboard → video clips.",
  "nodeStore.videoScript.source": "Story brief",
  "nodeStore.videoScript.script": "Video script",
  "nodeStore.videoScript.storyboard": "Storyboard",
  "nodeStore.videoScript.video": "Video shots",
  "nodeStore.videoScript.scriptPrompt":
    "Write a concise video script from this story. Include a character continuity card, visual style card, and 6–9 shots with varied framing. Keep character identity and environment consistent.",
  "nodeStore.videoScript.storyboardPrompt":
    "Turn the script into 6–9 numbered shots. For each shot include action, framing, a still-image prompt, and a separate motion/video prompt. Keep characters and visual style consistent.",
  "nodeStore.videoScript.shotStill": "Shot {number} · Still prompt",
  "nodeStore.videoScript.shotImage": "Shot {number} · Image",
  "nodeStore.videoScript.shotMotion": "Shot {number} · Motion prompt",
  "nodeStore.videoScript.shotVideo": "Shot {number} · Video",
  "nodeStore.videoScript.continueShot":
    "Review or edit shot {number}'s prompt nodes on the canvas, then choose Continue. Choose Previous shot to revisit an earlier result.",
  "nodeStore.videoScript.back": "Previous shot",
  "nodeStore.videoScript.feedback":
    "Added to this shot's still and motion prompts: {feedback}. Review the nodes, then choose Continue or Previous shot.",
  "nodeStore.videoScript.feedbackLine": "Additional direction: {feedback}",
  "nodeStore.videoScript.promptMissing":
    "This shot's prompt nodes are missing. Restore the storyboard before continuing.",
  "nodeStore.videoScript.browserRouteRequired":
    "Shot {number} needs open image and video website sessions. Open the websites, then choose Continue. Your storyboard and edits are saved.",
  "nodeStore.videoScript.continue": "Continue",
  "nodeStore.videoScript.stop": "Stop",
  "nodeStore.videoScript.building": "Building {count} storyboard shots",
  "nodeStore.videoScript.progress": "{count} storyboard shots processed",
  "nodeStore.storyboard.promptTitle": "Script outline and shot descriptions",
  "nodeStore.storyboard.batchTitle": "Storyboard batch",
  "nodeStore.storyboard.groupTitle": "Storyboard board",
  "nodeStore.poster.promptTitle": "Poster brief and copy",
  "nodeStore.poster.generateTitle": "Poster hero image",
  "nodeStore.poster.groupTitle": "Poster board",
  "nodeStore.uiux.promptTitle": "Product brief and design spec",
  "nodeStore.uiux.agentTitle": "UI/UX design agent",
  "nodeStore.uiux.groupTitle": "Interface design board",
  "nodeStore.uiux.agentBrief":
    "Use the connected product brief to create editable web app screens in the bound Group. Include the key screens, layout, and interface states.",
  "nodeStore.multiStyle.promptTitle": "Core concept",
  "nodeStore.multiStyle.realTitle": "Cinematic realism",
  "nodeStore.multiStyle.neonTitle": "Cyber neon",
  "nodeStore.multiStyle.clayTitle": "Minimal 3D clay",
  "nodeStore.multiStyle.batchTitle": "Style exploration batch",
  "nodeStore.multiStyle.groupTitle": "Style comparison board",
  "nodeStore.photoMaster.promptTitle": "Photo concept",
  "nodeStore.photoMaster.agentTitle": "Photography agent",
  "nodeStore.photoMaster.groupTitle": "Photography board",
  "nodeStore.photoMaster.agentBrief":
    "Use the connected photo concept to refine camera, lighting, and composition. Generate and run an image node in the bound Group.",
  "nodeStore.skill.inputTitle": "{name} input",
  "nodeStore.skill.agentTitle": "{name} agent",
  "nodeStore.skill.groupTitle": "{name} output board",
  "nodeStore.skill.defaultBrief":
    "Use the connected input to complete the {name} task and save the result in the bound Group.",
  "agent.deliverables.unspecified":
    "Delivery criteria were not recorded for this run",
  "agent.deliverables.complete": "Delivery complete",
  "agent.deliverables.incomplete": "Delivery incomplete",
  "agent.deliverables.progress": "{type} {generated}/{count}",
  "agent.deliverables.pendingReview": "Review pending",
  "agent.deliverables.verification.pending_review": "Review pending",
  "agent.deliverables.verification.failed": "Verification failed",
  "agent.deliverables.verification.needs_human_judgment":
    "Human judgment needed",
  "agent.deliverables.verification.unverifiable":
    "Visual verification unavailable",
  "agent.deliverables.verification.unverified": "Verification pending",
  "agent.deliverables.exportUnconfirmed": "Export unconfirmed",
  "agent.deliverables.inspectRecovery":
    "Check existing generation before retrying",
  "agent.deliverables.type.image": "Images",
  "agent.deliverables.type.video": "Videos",
  "agent.deliverables.type.audio": "Audio",
  "agent.deliverables.type.model3d": "3D models",
  "agent.deliverables.type.slides": "Slides",
  "agent.deliverables.type.html": "HTML",
  "agent.deliverables.type.pptx": "PowerPoint",
  "agent.deliverables.type.markdown": "Markdown",
  "agent.deliverables.type.mindmap": "Mind map",
  "agent.deliverables.preview": "Preview",
  "agent.deliverables.previewTitle": "Preview {name}",
  "agent.deliverables.closePreview": "Close preview",
  "agent.deliverables.showFile": "Show file",
  "agent.deliverables.fileUnavailable": "File unavailable",
  "agent.deliverables.noPreview": "No preview available",
  "agent.deliverables.noFile": "No file delivered",
  "agent.deliverables.fileDelivered": "File delivered",
  "agent.deliverables.canvasResult": "Canvas result",
  "error.webSubmissionUncertain":
    "The send action could not be confirmed. Check the platform conversation before retrying.",
  "error.referenceImageMissing":
    "A required reference image is missing. Restore it before running this node.",
  "error.platformDisabled":
    "This node's website is turned off in Settings → Creative websites. Turn it back on, or pick another route for the node.",
  "error.webSessionBusy":
    "The previous web task needs attention. Later tasks were stopped.",
  "error.webSessionChanged":
    "The web conversation changed. Return to the original conversation to recover results.",
  "error.webRecoveryUnavailable":
    "This web task is no longer available on the page. Check the original conversation before starting a new generation.",
  "error.mediaGenerationIncomplete":
    "The platform has not finished generating all media. Check its page before running again.",
  "error.mediaCollectionIncomplete":
    "Not all generated media could be downloaded. The task is incomplete; check the platform page before running again.",
  // 3D Editor UI
  // 3D Editor Node
  "settings.profile": "Profile",
  "settings.profileHint":
    "Set your display name for collaboration, or sign in to your VOO Cloud account.",
  "settings.profile.useVooCloud": "Use VOO Cloud",
  "settings.profile.hideVooCloud": "Collapse",
  "settings.modelRoutes.audio-generation": "Audio generation",
  "settings.modelRoutes.none": "None",
  "settings.modelRoutes.auto": "Automatic",
  "settings.modelRoutes.inherit": "Inherit",
  "settings.modelRoutes.noConfiguredProvider": "No configured providers",
  "settings.modelRoutes.noAvailableModel": "No models available",
  "settings.modelRoutes.needProviderKey":
    "Configure a provider for this type in step 3",
  "provider.status.configured": "Configured, not verified",
  "provider.status.verified": "Verified",
  "agent.connection.modifyApi": "Edit API Key",
  "agent.reasoning.label": "Reasoning effort",
  "agent.reasoning.default": "Default",
  "agent.reasoning.saving": "Saving…",
  "agent.reasoning.none": "None",
  "agent.reasoning.minimal": "Minimal",
  "agent.reasoning.low": "Low",
  "agent.reasoning.medium": "Medium",
  "agent.reasoning.high": "High",
  "agent.reasoning.xhigh": "Extra high",
  "agent.reasoning.max": "Max",
  "agent.reasoning.ultra": "Ultra",
  "agent.reasoning.hint":
    "How much the model reasons before responding. Higher effort can take longer. Available levels depend on the model.",
  "agent.reasoning.unavailable":
    "Connect Codex to choose a supported reasoning effort. The model default is used until then.",
  "agent.reasoning.saveFailed": "Could not save reasoning effort. Try again.",
  "cli.unsupportedVersion":
    "This adapter supports OpenCode 2.0.20. Select a verified CLI installation.",
  "cli.invalidModelCatalog":
    "The CLI returned an invalid model catalog. Refresh the connection.",
  "cli.invalidAuthStatus":
    "Could not verify the CLI login status. Refresh the connection.",
  "cli.invalidOutput":
    "The CLI returned an invalid response. The task was stopped.",
  "cli.incompleteOutput": "The CLI stopped before completing its response.",
  "cli.unsupportedContent":
    "This CLI adapter accepts text for the initial message.",
  "cli.toolUnavailable":
    "The requested canvas tool is not available in this session.",
  "cli.invalidReasoningEffort":
    "This model does not support the selected reasoning effort. Choose an available level.",
  "cli.modelCapabilitiesUnavailable":
    "Could not load this model’s reasoning levels. Refresh the Codex connection to retry.",
  "codex.workbench.title": "Codex workbench",
  "codex.workbench.connecting": "Connecting",
  "codex.workbench.connected": "Connected",
  "codex.workbench.running": "Working",
  "codex.workbench.approval": "Approval needed",
  "codex.workbench.error": "Connection error",
  "codex.workbench.failed": "Operation failed",
  "codex.workbench.failureDetail": "Operation failed: {code}",
  "codex.workbench.errorDetail": "Connection failed: {code}",
  "codex.workbench.operation": "Allow {tool}?",
  "codex.workbench.details": "Operation details",
  "codex.workbench.approve": "Approve",
  "codex.workbench.deny": "Deny",
  "agent.tool.runWorkflow.callFull": "Run workflow…",
  "agent.tool.runWorkflow.callSelected": "Run selected nodes…",
  "agent.tool.runWorkflow.callStale": "Run updates…",
  "agent.tool.runWorkflow.upToDate": "All results are current",
  "agent.tool.runWorkflow.pending": "Confirm the run on the canvas",
  "agent.tool.runWorkflow.cancelled": "Workflow cancelled",
  "agent.tool.runWorkflow.inProgress": "Workflow is still running",
  "agent.tool.runWorkflow.failed": "Workflow failed",
  "agent.tool.runWorkflow.partial":
    "Run incomplete: {succeeded}/{count} succeeded",
  "agent.tool.runWorkflow.completed":
    "Workflow completed: {succeeded}/{count} succeeded",
  "agent.tool.runWorkflow.notCompleted": "The node run did not complete.",
  "agent.tool.runWorkflow.notStarted": "The node run was not started.",
  "agent.tool.buildWorkflow.call": "Build workflow ({count} nodes)…",
  "agent.tool.buildWorkflow.result":
    "Built workflow ({count} nodes, {edges} connections)",
  "agent.connection.model": "Model",
  "agent.connection.cliDefaultModel": "CLI default",
  "agent.claudeModel.default": "Claude default",
  "agent.claudeModel.best": "Best available",
  "agent.claudeModel.fable": "Fable (latest)",
  "agent.claudeModel.opus55": "Opus 5.5",
  "agent.claudeModel.opus": "Opus (latest)",
  "agent.claudeModel.sonnet": "Sonnet (latest)",
  "agent.claudeModel.haiku": "Haiku (latest)",
  "settings.organize.models": "Models",
  "settings.organize.advanced": "Advanced",
  "settings.organize.websites": "Creative websites",
  "settings.organize.websitesSummary": "{count} platforms",
  "settings.organize.websitesHint":
    "Enable websites in generation pickers. Sign in through their website tabs in VOO. Enabled describes availability in VOO, not login status.",
  "settings.organize.apiHint":
    "Optional connections using API keys. Your agent subscription and website logins are managed separately.",
  "settings.organize.diagnostics": "Diagnostics & website adapters",
  "settings.desktopApp.title": "Desktop app",
  "settings.desktopApp.hint":
    "Run this web editor on the VOO app on this computer, so it uses the provider keys and CLI setup you configured there instead of asking for them again. Your browser will ask once for permission to reach apps on this device.",
  "settings.desktopApp.enable": "Use the desktop app",
  "settings.desktopApp.disable": "Stop using the desktop app",
  "settings.desktopApp.probing": "Checking...",
  "settings.desktopApp.stateOff": "Not in use",
  "settings.desktopApp.stateConnected": "Running on the desktop app",
  "settings.desktopApp.stateNotRunning": "Desktop app not running",
  "settings.organize.loadFailed":
    "Could not load settings. Reopen this section to retry.",
  "settings.organize.saveFailed": "Could not save changes. Try again.",
  "settings.storageCategory": "Storage",
  "settings.storageHint":
    "How much generated media VOO keeps in the browser asset library before trimming the oldest.",
  "settings.organize.enabled": "Enabled",
  "settings.organize.hidden": "Hidden",
  "settings.organize.requiresExtension": "Chrome extension needed",
  "agent.connection.title": "Main agent",
  "agent.connection.hint":
    "Use your existing Codex subscription or configure an AI provider. Codex connects automatically and uses VOO tools through MCP.",
  "agent.connection.agent": "Agent",
  "agent.connection.category": "Agent route",
  "onboarding.agentRoute.backToProviders": "Back to providers",
  "agent.connection.localCliAgents": "Local CLI Agents",
  "agent.connection.api": "API",
  "agent.connection.vooAccount": "VOO Account",
  "settings.localCapability.qwen": "Qwen",
  "settings.localCapability.wan": "Wan 2.1 Video",
  "settings.localCapability.ltx": "Lightricks",
  "settings.localCapability.minimax": "MiniMax",
  "settings.localCapability.repair": "Detail repair",
  "settings.localCapability.unavailable": "Unavailable",
  "settings.localCapability.notInstalled": "Not installed",
  "settings.localCapability.installed": "Downloaded",
  "settings.localCapability.failed": "Failed",
  "settings.localBrand.all": "All",
  "settings.localBrand.qwen": "Qwen",
  "settings.localBrand.qwenDesc":
    "Alibaba Qwen family of vision and multimodal generative models.",
  "settings.localBrand.lightricks": "Lightricks",
  "settings.localBrand.lightricksDesc":
    "High-speed open generative video models from Lightricks.",
  "settings.localBrand.minimax": "MiniMax",
  "settings.localBrand.minimaxDesc":
    "Multimodal audio and video models from MiniMax.",
  "settings.localBrand.custom": "Custom Models",
  "settings.localCapability.qwenImageDesc":
    "Text-to-image and inpainting/editing.",
  "settings.localCapability.wanDesc": "Wan 2.1 text & image to video.",
  "settings.localCapability.ltxDesc": "LTX-Video fast video generation.",
  "settings.localCapability.minimaxDesc": "MiniMax H3 video with audio sync.",
  "settings.localEngine.webNotice":
    "Local engine runs natively in VOO Desktop app. Below is the curated catalog of open-weights models.",
  "settings.localEngine.size": "Size",
  "settings.localEngine.viewHf": "HuggingFace",
  "settings.localCapability.ltxHint":
    "Lightricks LTX-Video open-weights video model",
  "settings.localCapability.minimaxHint": "MiniMax H3 audio & video model",
  "api.localResolution": "Up to {size}px",
  "api.localResolutionEngine": "Engine size",
  "onboarding.localModels.downloadAll": "Download all",
  "onboarding.localModels.downloading": "Downloading…",
  "onboarding.localModels.partialFailure":
    "Some models could not be downloaded. Retry the failed items.",
  "onboarding.localModels.downloadHint":
    "Downloads Qwen Image 2.1 (about 11 GB), matting and repair. Video models install from their own entry; installed models are skipped.",
  "settings.browserStorage.usage": "Used in this browser",
  "settings.browserStorage.clearModels": "Clear model files",
  "settings.browserStorage.clearModelsHint":
    "Removes the matting, repair and upscale models. They download again the next time you use them.",
  "settings.browserStorage.clearImages": "Clear image cache",
  "settings.browserStorage.clearImagesHint":
    "Deletes generated images that no canvas uses. Images on a canvas and your workflows stay.",
  "settings.browserStorage.confirmTitle": "Clear the image cache?",
  "settings.browserStorage.confirmBody":
    "Generated images that no canvas uses will be deleted from this browser. This cannot be undone.",
  "settings.browserStorage.clearing": "Clearing…",
  "settings.browserStorage.modelsCleared": "Model files cleared",
  "settings.browserStorage.imagesCleared":
    "Deleted {count} images, freed {size}",
  "settings.browserStorage.nothingToClear": "Nothing to clear",
  "settings.browserStorage.failed": "Could not clear. Try again.",
  "onboarding.localModels.downloadHintWeb":
    "Downloads the matting and repair models into this browser. Installed models are skipped.",
  "settings.localCapability.hint":
    "Choose a provider to view its setup. Local tools run on this device and stay separate from the Agent model route.",
  "agent.connection.codex": "Codex",
  "agent.connection.claude": "Claude Code",
  "agent.connection.antigravity": "Antigravity",
  "agent.connection.opencode": "OpenCode",
  "agent.connection.antigravityDisable": "Turn off Antigravity CLI",
  "agent.connection.configureApi": "Configure provider",
  "agent.connection.checking": "Connecting…",
  "agent.connection.connected": "Connected",
  "agent.connection.notConnected": "Not connected",
  "agent.connection.notInstalled": "CLI not installed",
  "agent.connection.loginRequired": "Sign in to connect",
  "agent.connection.statusUnavailable": "CLI status unavailable",
  // Kept short: this is a status line inside a ~182px route card, and the long
  // sentence it replaced overflowed and was truncated to an ellipsis (see
  // scripts/verify-i18n-overflow.mjs).
  "agent.connection.desktopOnly": "Use the VOO desktop app",
  "agent.connection.linkReadsOnly":
    "Not available in the web editor linked to the app. Use the desktop app, or choose an API provider",
  "agent.connection.failed": "Connection failed. Retry.",
  "agent.connection.unsupported":
    "In-app execution is not available for this agent yet",
  "agent.connection.experimentalBadge": "Experimental",
  "settings.agent.experimentalAntigravity":
    "Enable Antigravity CLI (experimental)",
  "settings.agent.experimentalAntigravityHint":
    "Runs Google DeepMind's Antigravity CLI in sandboxed mode.",
  "settings.agent.experimentalAntigravityWarning":
    "The Antigravity CLI can run commands and modify files inside the project folder. This behavior cannot be switched off. Enable anyway?",
  "settings.agent.experimentalAntigravityConfirm": "Enable",
  "settings.agent.experimentalAntigravityCancel": "Cancel",
  "agent.message.copy": "Copy message",
  "agent.message.copied": "Copied",
  "agent.message.copyFailed": "Could not copy",
  "agent.plan.progress": "{completed}/{count} complete",
  "agent.plan.blockedBy": "Blocked by {steps}",
  "agent.plan.failed": "Failed",
  "agent.plan.review.title": "Review plan before running",
  "agent.plan.review.hint":
    "Inspect or edit the steps, then approve to start execution.",
  "agent.plan.review.estimatedCost": "Est. ${cost}",
  "agent.plan.review.stepLabel": "Plan step {index}",
  "agent.plan.review.removeStep": "Remove step {index}",
  "agent.plan.review.addStep": "Add step",
  "agent.plan.review.invalid": "Invalid plan",
  "agent.plan.review.approve": "Approve",
  "agent.plan.review.editAndRun": "Edit & run",
  "agent.plan.review.cancel": "Cancel",
  "agent.plan.review.cancelled": "Plan review cancelled",
  "agent.plan.review.toggle": "Review plan before running",
  "agent.plan.review.toggleShort": "Plan review",
  "node.batch.identityDrift": "{count} off-brand",
  "run.identityDrift": "{count} image(s) drift from the brand guidelines.",
  "agent.system.executionIncomplete":
    "The agent stopped before the planned canvas work was executed.",
  "agent.system.quotaExceeded":
    "Storage quota exceeded. This run could not be saved.",
  "agent.system.storageError": "Could not save the run record.",
  "agent.history.close": "Close",
  "agent.tool.autoFixDesign.call": "Auto-fix design issues",
  "agent.tool.autoFixDesign.result": "Fixed {count} design issue(s)",
  "agent.tool.iterateDesign.call": "Iterate design",
  "agent.tool.iterateDesign.result":
    "Design iteration completed ({rounds} round(s))",
  "inspector.video.durationAuto": "Auto",
  "inspector.video.durationCustom": "Custom",
  "inspector.video.durationCustomPlaceholder": "Seconds",
  "error.videoDurationInvalid":
    "Invalid video duration: {duration}s. Supported: {allowed}.",
  "error.videoDurationUnsupported":
    "Video duration is not supported for this provider or model.",
  "node.video.duration": "Duration: {seconds}s",
  "node.api3d.title": "Gen 3D",
  "node.api3d.empty": "No 3D model yet",
  "node.api3d.output": "3D model",
  "node.api3d.promptPlaceholder": "Describe the 3D model you want to create…",
  "node.api3d.textureQuality": "Texture quality",
  "node.api3d.textureQuality.geometry": "Geometry only",
  "node.api3d.textureQuality.standard": "Standard",
  "node.api3d.textureQuality.detailed": "Detailed",
  "node.api3d.meshMode": "Mesh mode",
  "node.api3d.meshMode.page": "Page default",
  "node.api3d.meshMode.smart": "Smart mesh",
  "node.api3d.meshMode.precise": "High precision",
  "node.api3d.topology": "Topology",
  "node.api3d.topology.triangle": "Triangles",
  "node.api3d.topology.quad": "Quads",
  "node.api3d.topology.page": "Page default",
  "node.api3d.geometry": "Geometry",
  "node.api3d.texture": "Texture",
  "node.api3d.aiModel": "AI model",
  "node.api3d.aiModel.page": "Page default",
  "node.api3d.aiModel.p2": "P2.0 - Preview",
  "node.api3d.aiModel.p1": "P1.0 - Fast",
  "node.api3d.faceLimit": "Face limit",
  "node.api3d.faceLimit.auto": "Auto",
  "settings.tripoWeb.checking": "Checking Tripo Studio…",
  "settings.tripoWeb.connected": "Signed in and ready",
  "settings.tripoWeb.needsLogin": "Open Tripo Studio and sign in",
  "settings.tripoWeb.closed": "Tripo Studio is not open",
  "settings.tripoWeb.error": "Connection check failed",
  "settings.tripoWeb.open": "Open Tripo Studio",
  "settings.tripoWeb.check": "Check connection",
  "provider.tripoWeb.label": "Tripo Web",
  "provider.chatgptWeb.label": "ChatGPT Web",
  "provider.geminiWeb.label": "Gemini Web",
  "settings.modelRoutes.model3d-generation": "3D generation",
  "port.model3d": "3D model",
  "error.tripoModeMissing":
    "Tripo's image/text input mode could not be selected. Open the Studio generation workspace and try again.",
  "error.tripoMeshModeMissing":
    "The requested mesh mode could not be found in Tripo Studio.",
  "error.tripoTopologyMissing":
    "The requested topology could not be selected in Tripo Studio.",
  "error.tripoAiModelMissing":
    "The requested AI model could not be selected in Tripo Studio.",
  "error.tripoUploadMissing":
    "Tripo's reference-image upload field did not become available. The request was not sent.",
  "error.tripoComposerMissing":
    "Tripo's text prompt field did not become available. The request was not sent.",
  "error.tripoSubmitMissing":
    "Tripo's Generate button could not be found. The request was not sent.",
  ...coreEn,
  ...extendedEn,
  ...uxEn,
  ...storyboardEn,
  ...gameAssetsEn,
  ...designAssetsEn,
  ...feedbackEn,
  "node.continueWithAgent": "Agent",
  "agent.continueFromStagePrompt": "Continue from the selected stage: ",
  "agent.connection.requiresDesktopApp": "Requires the VOO desktop app",
  "agent.connection.downloadDesktopApp": "Download desktop app",
  "agent.switchToApi": "Switch to API",
  "settings.tabAgent": "Agent",
  "settings.agent.connectionTitle": "Agent Model & Connection",
  "settings.agent.connectionHint":
    "Configure which AI model and provider powers your assistant.",
  "settings.agent.behaviorsTitle": "Agent Behaviors",
  "settings.agent.behaviorsHint":
    "Tune how the assistant plans, reviews, and executes actions.",
  "settings.agent.configured": "Configured",
  "settings.agent.unconfigured": "Not configured",
  "settings.agent.connectMoreModels": "Connect more models",
  "settings.agent.noModelsConnected": "No models connected",
  "agent.moreMenu.agentModel": "Agent Model",
  "agent.moreMenu.agentModelHint":
    "Used for Agent reasoning and generation. Changes take effect on the next message.",
  "agent.moreMenu.modelDisabledWhileRunning":
    "Cannot switch models while Agent is running.",
  "agent.llm.vision": "Vision",
  "settings.agent.namesThemeTitle": "Agent Names & Themes",
  "settings.agent.namesThemeHint":
    "Assign name libraries and identity color dots to collaborating agents.",
  "settings.agent.personaTitle": "Agent Personas",
  "settings.agent.personaHint":
    "Auto chooses a working style for each request. Selecting a role keeps that style until you change it.",
  "agent.theme.default": "Default",
  "agent.theme.artists": "Artists",
  "agent.theme.philosophers": "Philosophers",
  "agent.theme.inventors": "Inventors",
  "agent.theme.custom": "Custom",
  "agent.theme.customPlaceholder":
    "Enter custom names, separated by commas (e.g. Alice, Bob)",
  "agent.theme.saveCustomNames": "Save Names",
  "agent.theme.selectDefaultName": "Set as default Agent name",
  "agent.persona.general.name": "Auto",
  "agent.persona.general.desc":
    "Chooses the best role for each request, including your custom roles.",
  "agent.persona.designer.name": "Visual Designer",
  "agent.persona.designer.desc":
    "Focuses on visual hierarchy, typographic contrast, and whitespace pacing.",
  "agent.persona.art_director.name": "Art Director",
  "agent.persona.art_director.desc":
    "Oversees visual tone, color palettes, and artistic cohesion across the canvas.",
  "agent.persona.video_director.name": "Video Director",
  "agent.persona.video_director.desc":
    "Thinks in cinematic camera movement, focal lengths, and coherent storyboards.",
  "agent.persona.copywriter.name": "Copywriter",
  "agent.persona.copywriter.desc":
    "Specializes in punchy headlines and insightful copy, avoiding clichés.",
  "agent.persona.prompt_engineer.name": "Prompt Engineer",
  "agent.persona.prompt_engineer.desc":
    "Master of structured image and video prompts, precisely directing subject and lighting.",
  "agent.persona.photographer.name": "Product Photographer",
  "agent.persona.photographer.desc":
    "Focuses on commercial still life with authentic lighting and depth of field.",
  "agent.persona.motion_designer.name": "Motion Designer",
  "agent.persona.motion_designer.desc":
    "Focuses on kinetic rhythm, easing curves, and organic visual transitions.",
  "agent.persona.addCustom": "New Custom Persona",
  "agent.persona.nameInput": "Persona Name",
  "agent.persona.descInput": "Short Description",
  "agent.persona.instructionsInput":
    "Instructions (2-4 sentences injected into system prompt)",
  "agent.persona.nameRequired": "Persona name is required",
  "agent.persona.instructionsRequired": "Instructions are required",
  "agent.persona.deleteConfirm": "Delete this persona?",
  "agent.persona.confirmDelete": "Confirm Delete",
  "agent.persona.edit": "Edit",
  "agent.persona.delete": "Delete",
  "agent.persona.customBadge": "Custom",
  "agent.theme.customNamesLimitHint":
    "Up to 12 names, max 24 chars each. Excess entries or characters were ignored.",
  "nodeStore.preset.frontendDesign.name": "Frontend Design",
  "nodeStore.preset.frontendDesign.description":
    "Original interface design guidance from Anthropic.",
  "nodeStore.preset.emilDesignEng.name": "Design Engineering",
  "nodeStore.preset.emilDesignEng.description":
    "Interface polish, components, and motion guidance by Emil Kowalski.",
  "nodeStore.preset.redesignExistingProjects.name":
    "Redesign Existing Projects",
  "nodeStore.preset.redesignExistingProjects.description":
    "Audit and improve an existing interface while preserving its behavior.",
  "nodeStore.preset.seedancePrompt.name": "Seedance Video Prompts",
  "nodeStore.preset.seedancePrompt.description":
    "Multimodal AI video camera movement and timing prompts.",
  "nodeStore.preset.designFirstUiPrompting.name": "Design-first UI Prompting",
  "nodeStore.preset.designFirstUiPrompting.description":
    "Turn a product goal into a clear UI design brief and generation prompt.",
  "nodeStore.preset.betterWriting.name": "Better Writing",
  "nodeStore.preset.betterWriting.description":
    "Improve interface labels, errors, empty states, and product voice.",
  "nodeStore.preset.source": "View source",
  "node.html.title": "HTML",
  "node.slides.title": "Slides",
  "node.slides.noPreview": "No page preview",
  "node.slides.pageCount": "{count} slides",
  "node.slides.loadingPptx": "Loading presentation…",
  "node.slides.pptxRenderError": "Failed to render presentation",
  "node.slides.downloadFallback": "Download original file",
  "node.preview.zoomIn": "Zoom in",
  "node.preview.zoomOut": "Zoom out",
  "node.preview.resetZoom": "Reset zoom",
  "node.preview.prevSlide": "Previous slide",
  "node.preview.nextSlide": "Next slide",
  "node.preview.lightboxTitle": "Media preview",
  "node.preview.close": "Close preview",
  "port.html": "HTML",
  "port.slides": "Slides",
  "port.markdown": "Markdown",
  "port.mindmap": "Mind map",
  "onboarding.media.notConfigured": "Not configured",
  "settings.models.groupApi": "API",
  "settings.models.localModels": "Local models",
  "editor.menu.copyHtmlCss": "Copy as HTML + CSS",
  "editor.menu.copyHtmlFailed": "Could not copy HTML + CSS",
  "editor.autoLayout.title": "Auto layout",
  "editor.autoLayout.enable": "Add auto layout",
  "editor.autoLayout.disable": "Remove auto layout",
  "editor.autoLayout.vertical": "Vertical",
  "editor.autoLayout.horizontal": "Horizontal",
  "editor.autoLayout.gap": "Gap",
  "editor.autoLayout.paddingTop": "Top padding",
  "editor.autoLayout.paddingRight": "Right padding",
  "editor.autoLayout.paddingBottom": "Bottom padding",
  "editor.autoLayout.paddingLeft": "Left padding",
  "editor.autoLayout.align": "Align",
  "editor.autoLayout.justify": "Distribute",
  "editor.autoLayout.start": "Start",
  "editor.autoLayout.center": "Center",
  "editor.autoLayout.end": "End",
  "editor.autoLayout.space-between": "Space between",
  "editor.autoLayout.widthMode": "Width",
  "editor.autoLayout.heightMode": "Height",
  "editor.autoLayout.fixed": "Fixed",
  "editor.autoLayout.hug": "Hug content",
  "editor.autoLayout.childTitle": "Layout child",
  "editor.autoLayout.position": "Position",
  "editor.autoLayout.flow": "In flow",
  "editor.autoLayout.absolute": "Absolute",
  "editor.autoLayout.layoutWidth": "Width",
  "editor.autoLayout.layoutHeight": "Height",
  "editor.autoLayout.fill": "Fill container",
  "editor.variables.title": "Color variables",
  "editor.variables.binding": "Color variable",
  "editor.variables.unlinked": "Unlinked",
  "editor.variables.name": "Variable name",
  "editor.variables.value": "Variable value",
  "editor.variables.create": "Save fill as variable",
  "editor.variables.delete": "Delete variable",
  "editor.variables.defaultName": "Color {index}",
  "editor.variables.token.paper": "Canvas",
  "editor.variables.token.white": "Surface",
  "editor.variables.token.soft": "Muted surface",
  "editor.variables.token.ink": "Primary text",
  "editor.variables.token.secondary": "Secondary text",
  "editor.variables.token.brand": "Brand",
  "editor.variables.token.brandHover": "Brand hover",
  "editor.variables.token.brandInk": "Brand text",
  "editor.variables.token.line": "Divider",
  "onboarding.extension.checkConnection": "Check connection",
  "onboarding.extension.checking": "Checking…",
  "onboarding.extension.reloadPage": "Reload page",
  "onboarding.extension.reloadHint":
    "If you loaded the extension, reload the page to finish connecting.",
  "editor.pages.confirmDeleteDirty":
    "This canvas has unsaved changes. Delete anyway?",
  "editor.canvasType.design": "Design",
  "editor.canvasType.motion": "Motion",
  "editor.canvasType.threeD": "3D",
  "editor.canvasType.presentation": "Presentation",
  "editor.canvas.defaultLabel": "Canvas",
  "editor.canvas.copySuffix": " (Copy)",
  "editor.canvas.expand": "Expand canvas",
  "editor.canvas.collapse": "Collapse canvas",
  "editor.linearArray.title": "Linear array",
  "editor.linearArray.add": "Add linear array",
  "editor.linearArray.count": "Count",
  "editor.linearArray.stepX": "Step X",
  "editor.linearArray.stepY": "Step Y",
  "editor.linearArray.stepZ": "Step Z",
  "editor.linearArray.remove": "Remove array",
  "editor.gridArray.title": "Grid array",
  "editor.gridArray.add": "Add grid array",
  "editor.gridArray.rows": "Rows",
  "editor.gridArray.cols": "Columns",
  "editor.gridArray.layers": "Layers",
  "editor.gridArray.stepX": "Step X",
  "editor.gridArray.stepY": "Step Y",
  "editor.gridArray.stepZ": "Step Z",
  "editor.gridArray.remove": "Remove grid array",
  "editor.circularArray.title": "Circular array",
  "editor.circularArray.add": "Add circular array",
  "editor.circularArray.count": "Count",
  "editor.circularArray.radius": "Radius",
  "editor.circularArray.startAngle": "Start angle",
  "editor.circularArray.arcSpan": "Arc span",
  "editor.circularArray.remove": "Remove circular array",
};
