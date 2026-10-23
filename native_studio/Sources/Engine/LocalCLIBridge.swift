//
//  LocalCLIBridge.swift
//  native_studio
//
//  Real local-agent CLI bridge for the VOO Design native AI panel.
//  Detects Claude Code / OpenAI Codex / Google Antigravity CLIs and streams
//  their output as structured events. Pure Foundation — no AppKit, no UI.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import Foundation

// MARK: - Supported local agents

public enum LocalCLIAgent: String, CaseIterable, Sendable, Codable {
    case claude
    case codex
    case antigravity

    /// Human readable provider name shown in the agent panel / onboarding.
    public var displayName: String {
        switch self {
        case .claude:      return "Claude Code"
        case .codex:       return "OpenAI Codex"
        case .antigravity: return "Google Antigravity CLI"
        }
    }

    /// Executable name looked up on PATH.
    public var binaryName: String {
        switch self {
        case .claude:      return "claude"
        case .codex:       return "codex"
        case .antigravity: return "agy"
        }
    }

    /// Global npm install command surfaced in onboarding / troubleshooting UI.
    public var installCommand: String {
        switch self {
        case .claude:      return "npm install -g @anthropic-ai/claude-code"
        case .codex:       return "npm install -g @openai/codex"
        case .antigravity: return "npm install -g @google/antigravity-cli"
        }
    }

    /// npm package identifier (used by the onboarding walkthrough).
    public var packageName: String {
        switch self {
        case .claude:      return "@anthropic-ai/claude-code"
        case .codex:       return "@openai/codex"
        case .antigravity: return "@google/antigravity-cli"
        }
    }

    /// Best-effort model catalogue advertised by each CLI family.
    public var modelList: [String] {
        switch self {
        case .claude:
            return ["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"]
        case .codex:
            return ["gpt-5-codex", "gpt-5", "gpt-5-mini"]
        case .antigravity:
            return ["gemini-2.5-pro", "gemini-2.5-flash", "claude-sonnet-4-5"]
        }
    }

    /// Default model string for display; the CLIs pick their own default when nil.
    public var defaultModel: String {
        return modelList.first ?? ""
    }

    /// Argument vector for a one-shot prompt invocation (no shell involved).
    ///
    /// Invocation assumptions (documented, matching each CLI's non-interactive mode):
    /// - Claude Code: `claude -p "<prompt>"` (print mode, exits when finished)
    /// - OpenAI Codex: `codex exec "<prompt>"`
    /// - Antigravity CLI (`agy`): `agy -p "<prompt>"` (same convention as Claude Code)
    ///
    /// Context, when supplied, is appended to the prompt as plain text so it stays a
    /// single argv element (no shell quoting hazards, no temp files).
    public func arguments(forPrompt prompt: String, context: String? = nil) -> [String] {
        let fullPrompt = LocalCLIBridge.composedPrompt(prompt: prompt, context: context)
        switch self {
        case .claude:
            return ["-p", fullPrompt]
        case .codex:
            return ["exec", fullPrompt]
        case .antigravity:
            return ["-p", fullPrompt]
        }
    }
}

// MARK: - Detection status

public struct LocalCLIStatus: Sendable, Equatable {
    /// Whether the executable was found in any search path.
    public var installed: Bool
    /// Whether the CLI answered its `--version` probe successfully.
    public var ready: Bool
    /// Resolved executable path (symlinks resolved), when found.
    public var binPath: String?
    /// Parsed version string from `<bin> --version`, when available.
    public var version: String?
    /// Human readable failure reason, when not ready.
    public var error: String?

    public init(
        installed: Bool,
        ready: Bool,
        binPath: String? = nil,
        version: String? = nil,
        error: String? = nil
    ) {
        self.installed = installed
        self.ready = ready
        self.binPath = binPath
        self.version = version
        self.error = error
    }

    public static func missing(_ error: String? = nil) -> LocalCLIStatus {
        return LocalCLIStatus(installed: false, ready: false, binPath: nil, version: nil, error: error)
    }

    /// Short one-line description for the onboarding / status UI.
    public var summary: String {
        if !installed {
            return error ?? "Not installed"
        }
        if ready {
            let versionText = version.map { " v\($0)" } ?? ""
            return "Ready\(versionText)"
        }
        return error ?? "Installed, version probe failed"
    }
}

// MARK: - Streaming events

public enum LocalCLIEvent: Sendable, Equatable {
    /// Process launched successfully; payload is the PID.
    case started(Int32)
    /// A chunk / line of assistant output (stdout and stderr are merged in order).
    case text(String)
    /// A line that looks like a tool invocation (begins with "tool", best effort).
    case toolCall(String)
    /// Process exited; payload is the raw exit status (or -1 when it never launched).
    case done(Int32)
    /// A failure that should be surfaced in the panel (missing binary, launch error).
    case error(String)

    /// `done` and `error` are terminal in spirit; `error` is always followed by done.
    public var isTerminal: Bool {
        switch self {
        case .done, .error: return true
        case .started, .text, .toolCall: return false
        }
    }
}

// MARK: - Bridge

public final class LocalCLIBridge: @unchecked Sendable {
    /// Shared bridge used by the app.
    public static let shared = LocalCLIBridge()

    /// Replace the binary search paths (primarily for headless tests).
    /// When set, exactly these directories are searched (in order).
    public var searchPathsOverride: [String]?

    /// Extra / overriding environment variables handed to child processes
    /// (merged on top of the inherited process environment).
    public var environmentOverride: [String: String]?

    /// Timeout for the `<bin> --version` probe used by `detect`.
    public var versionTimeout: TimeInterval = 3.0

    /// Grace period after process exit before a stream is force-finished, in case a
    /// grandchild process keeps the stdio pipes open.
    public var streamDrainGrace: TimeInterval = 2.0

    private let lock = NSLock()
    private var runningProcesses: [UUID: Process] = [:]

    public init() {}

    // MARK: Search paths

    /// Standard locations scanned after the PATH entries.
    public var standardSearchPaths: [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            home + "/.local/bin",
            home + "/.npm-global/bin",
            "/usr/bin",
            home + "/.antigravity/antigravity/bin"
        ]
    }

    /// Full, de-duplicated search path list honoring `searchPathsOverride`.
    public func resolvedSearchPaths() -> [String] {
        if let override = searchPathsOverride {
            return Self.dedup(override)
        }
        var paths: [String] = []
        if let pathValue = ProcessInfo.processInfo.environment["PATH"] {
            paths.append(contentsOf: pathValue.split(separator: ":").map(String.init))
        }
        paths.append(contentsOf: standardSearchPaths)
        return Self.dedup(paths)
    }

    private static func dedup(_ paths: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for raw in paths {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let expanded = (trimmed as NSString).expandingTildeInPath
            if seen.insert(expanded).inserted {
                result.append(expanded)
            }
        }
        return result
    }

    /// Finds an executable by name, resolving symlinks. Returns the real path.
    public func findBinary(_ binaryName: String) -> String? {
        let fileManager = FileManager.default

        // Absolute/relative path supplied directly.
        if binaryName.contains("/") {
            return Self.resolvedExecutable(at: binaryName, fileManager: fileManager)
        }

        for directory in resolvedSearchPaths() {
            let candidate = (directory as NSString).appendingPathComponent(binaryName)
            if let resolved = Self.resolvedExecutable(at: candidate, fileManager: fileManager) {
                return resolved
            }
        }
        return nil
    }

    private static func resolvedExecutable(at path: String, fileManager: FileManager) -> String? {
        guard fileManager.isExecutableFile(atPath: path) else { return nil }
        let resolved = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
        if fileManager.isExecutableFile(atPath: resolved) {
            return resolved
        }
        return path
    }

    /// Convenience: resolved executable for a known agent.
    public func binaryPath(for agent: LocalCLIAgent) -> String? {
        return findBinary(agent.binaryName)
    }

    // MARK: Environment

    /// Child process environment: inherited env + explicit overrides, with the CLI
    /// search directories appended to PATH. This matters for GUI-launched apps, whose
    /// PATH is usually just /usr/bin:/bin:/usr/sbin:/sbin, while npm-installed CLIs are
    /// `#!/usr/bin/env node` scripts that need the node install dir on PATH.
    private func mergedEnvironment(augmentingPathWith extraDirectories: [String] = []) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        if let overrides = environmentOverride {
            for (key, value) in overrides {
                environment[key] = value
            }
        }
        var pathEntries = (environment["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)
            .filter { !$0.isEmpty }
        for directory in extraDirectories where !pathEntries.contains(directory) {
            pathEntries.append(directory)
        }
        environment["PATH"] = pathEntries.joined(separator: ":")
        return environment
    }

    // MARK: Detection

    /// Detects a single CLI: resolves the binary, then runs `<bin> --version`.
    public func detect(_ agent: LocalCLIAgent) async -> LocalCLIStatus {
        guard let binPath = findBinary(agent.binaryName) else {
            return LocalCLIStatus(
                installed: false,
                ready: false,
                binPath: nil,
                version: nil,
                error: "\(agent.displayName) CLI not found (`\(agent.binaryName)`). Install with: \(agent.installCommand)"
            )
        }

        let probe = await runVersionProbe(binPath: binPath, agent: agent)
        if let launchError = probe.launchError {
            return LocalCLIStatus(
                installed: false,
                ready: false,
                binPath: binPath,
                version: nil,
                error: "Found `\(agent.binaryName)` at \(binPath) but could not execute it: \(launchError)"
            )
        }

        let version = Self.parseVersion(from: probe.output)
        let ready = (probe.exitCode == 0)
        let error: String?
        if ready {
            error = nil
        } else if let code = probe.exitCode {
            error = "`\(agent.binaryName) --version` exited with status \(code)"
        } else {
            error = "`\(agent.binaryName) --version` timed out after \(String(format: "%.1f", versionTimeout))s"
        }

        return LocalCLIStatus(
            installed: true,
            ready: ready,
            binPath: binPath,
            version: version,
            error: error
        )
    }

    /// Detects every supported CLI in parallel.
    public func detectAll() async -> [LocalCLIAgent: LocalCLIStatus] {
        await withTaskGroup(of: (LocalCLIAgent, LocalCLIStatus).self) { group in
            for agent in LocalCLIAgent.allCases {
                group.addTask {
                    return (agent, await self.detect(agent))
                }
            }
            var results: [LocalCLIAgent: LocalCLIStatus] = [:]
            for await pair in group {
                results[pair.0] = pair.1
            }
            return results
        }
    }

    private struct VersionProbeResult: Sendable {
        var exitCode: Int32?
        var output: String
        var launchError: String?
    }

    private func runVersionProbe(binPath: String, agent: LocalCLIAgent) async -> VersionProbeResult {
        let environment = mergedEnvironment(augmentingPathWith: resolvedSearchPaths())
        let timeout = versionTimeout
        return await withCheckedContinuation { (continuation: CheckedContinuation<VersionProbeResult, Never>) in
            DispatchQueue.global(qos: .utility).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: binPath)
                process.arguments = ["--version"]
                process.environment = environment
                process.standardInput = FileHandle.nullDevice

                let pipe = Pipe()
                process.standardOutput = pipe
                process.standardError = pipe

                let semaphore = DispatchSemaphore(value: 0)
                process.terminationHandler = { _ in semaphore.signal() }

                do {
                    try process.run()
                } catch {
                    continuation.resume(returning: VersionProbeResult(
                        exitCode: nil,
                        output: "",
                        launchError: error.localizedDescription
                    ))
                    return
                }

                let waitResult = semaphore.wait(timeout: .now() + timeout)
                var timedOut = false
                if waitResult == .timedOut {
                    timedOut = true
                    process.terminate()
                    _ = semaphore.wait(timeout: .now() + 0.5)
                    if process.isRunning {
                        process.interrupt()
                    }
                }

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(decoding: data, as: UTF8.self)
                let code: Int32? = timedOut ? nil : process.terminationStatus
                continuation.resume(returning: VersionProbeResult(
                    exitCode: code,
                    output: output,
                    launchError: nil
                ))
            }
        }
    }

    private static func parseVersion(from output: String) -> String? {
        let lines = output
            .split(whereSeparator: { $0 == "\n" || $0 == "\r" })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard let firstLine = lines.first else { return nil }
        if let range = firstLine.range(of: #"\d+(\.\d+){1,3}"#, options: .regularExpression) {
            return String(firstLine[range])
        }
        return String(firstLine.prefix(80))
    }

    // MARK: Streaming

    /// Launches a one-shot agent invocation and streams its output.
    ///
    /// - Returns: a session identifier usable with `cancel(_:)`.
    /// - Note: `onEvent` is always called on the main queue. A terminal `.done` is
    ///   guaranteed exactly once, even for a missing binary (`.error` + `.done(-1)`).
    @discardableResult
    public func advance(
        agent: LocalCLIAgent,
        prompt: String,
        context: String? = nil,
        workingDirectory: URL? = nil,
        onEvent: @escaping @Sendable (LocalCLIEvent) -> Void
    ) -> UUID {
        let id = UUID()

        guard let binPath = findBinary(agent.binaryName) else {
            LocalCLIStreamSession.emit(.error(
                "\(agent.displayName) CLI (`\(agent.binaryName)`) is not installed. Install with: \(agent.installCommand)"
            ), to: onEvent)
            LocalCLIStreamSession.emit(.done(-1), to: onEvent)
            return id
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: binPath)
        process.arguments = agent.arguments(forPrompt: prompt, context: context)
        process.environment = mergedEnvironment(augmentingPathWith: resolvedSearchPaths())
        process.currentDirectoryURL = workingDirectory
        process.standardInput = FileHandle.nullDevice

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        let session = LocalCLIStreamSession(id: id, onEvent: onEvent)
        let grace = streamDrainGrace
        process.terminationHandler = { [weak self] finished in
            session.processExited(code: finished.terminationStatus, drainGrace: grace)
            self?.removeProcess(id)
        }

        lock.lock()
        runningProcesses[id] = process
        lock.unlock()

        do {
            try process.run()
        } catch {
            removeProcess(id)
            LocalCLIStreamSession.emit(
                .error("Failed to launch `\(agent.binaryName)`: \(error.localizedDescription)"),
                to: onEvent
            )
            LocalCLIStreamSession.emit(.done(-1), to: onEvent)
            return id
        }

        LocalCLIStreamSession.emit(.started(process.processIdentifier), to: onEvent)
        startReader(pipe: stdoutPipe, session: session, isStdout: true)
        startReader(pipe: stderrPipe, session: session, isStdout: false)
        return id
    }

    /// Terminates a running invocation. Safe to call for unknown / finished ids.
    public func cancel(_ id: UUID) {
        lock.lock()
        let process = runningProcesses[id]
        lock.unlock()
        guard let target = process, target.isRunning else { return }
        target.terminate()
        // Graceful SIGTERM first; interrupt as a second (still system-level) signal.
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.75) {
            if target.isRunning {
                target.interrupt()
            }
        }
    }

    /// Cancels every in-flight invocation.
    public func cancelAll() {
        lock.lock()
        let processes = Array(runningProcesses.values)
        lock.unlock()
        for process in processes where process.isRunning {
            process.terminate()
        }
    }

    /// Whether an invocation is still registered as running.
    public func isRunning(_ id: UUID) -> Bool {
        lock.lock()
        let process = runningProcesses[id]
        lock.unlock()
        return process?.isRunning ?? false
    }

    private func removeProcess(_ id: UUID) {
        lock.lock()
        runningProcesses.removeValue(forKey: id)
        lock.unlock()
    }

    private func startReader(pipe: Pipe, session: LocalCLIStreamSession, isStdout: Bool) {
        DispatchQueue.global(qos: .userInitiated).async {
            let handle = pipe.fileHandleForReading
            while true {
                let data = handle.availableData
                if data.isEmpty { break }
                session.handleChunk(data, isStdout: isStdout)
            }
            session.readerFinished(isStdout: isStdout)
        }
    }

    // MARK: Prompt composition

    /// Appends optional context to the prompt as plain text (single argv element).
    public static func composedPrompt(prompt: String, context: String?) -> String {
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let context = context?.trimmingCharacters(in: .whitespacesAndNewlines),
              !context.isEmpty else {
            return trimmedPrompt
        }
        if trimmedPrompt.isEmpty {
            return context
        }
        return trimmedPrompt + "\n\nContext:\n" + context
    }
}

// MARK: - Stream session (line buffering + exactly-once terminal event)

private final class LocalCLIStreamSession: @unchecked Sendable {
    let id: UUID
    private let onEvent: @Sendable (LocalCLIEvent) -> Void
    private let lock = NSLock()

    private var stdoutBuffer = Data()
    private var stderrBuffer = Data()
    private var stdoutClosed = false
    private var stderrClosed = false
    private var exitCode: Int32?
    private var terminalSent = false

    init(id: UUID, onEvent: @escaping @Sendable (LocalCLIEvent) -> Void) {
        self.id = id
        self.onEvent = onEvent
    }

    /// Delivers an event to the consumer on the main queue.
    static func emit(
        _ event: LocalCLIEvent,
        to onEvent: @escaping @Sendable (LocalCLIEvent) -> Void
    ) {
        DispatchQueue.main.async {
            onEvent(event)
        }
    }

    func emit(_ event: LocalCLIEvent) {
        Self.emit(event, to: onEvent)
    }

    // MARK: Incoming data

    func handleChunk(_ data: Data, isStdout: Bool) {
        var events: [LocalCLIEvent] = []
        lock.lock()
        if isStdout {
            stdoutBuffer.append(data)
            Self.consumeCompleteLinesLocked(&stdoutBuffer, into: &events, isStdout: isStdout)
        } else {
            stderrBuffer.append(data)
            Self.consumeCompleteLinesLocked(&stderrBuffer, into: &events, isStdout: isStdout)
        }
        lock.unlock()
        events.forEach { emit($0) }
    }

    func readerFinished(isStdout: Bool) {
        var events: [LocalCLIEvent] = []
        var terminal: LocalCLIEvent?
        lock.lock()
        if isStdout {
            stdoutClosed = true
            Self.flushRemainderLocked(&stdoutBuffer, into: &events)
        } else {
            stderrClosed = true
            Self.flushRemainderLocked(&stderrBuffer, into: &events)
        }
        terminal = terminalEventIfReadyLocked()
        lock.unlock()
        events.forEach { emit($0) }
        if let terminal = terminal { emit(terminal) }
    }

    func processExited(code: Int32, drainGrace: TimeInterval) {
        var terminal: LocalCLIEvent?
        lock.lock()
        exitCode = code
        // If both pipes already reported EOF the terminal event can go out now.
        terminal = terminalEventIfReadyLocked()
        lock.unlock()
        if let terminal = terminal {
            emit(terminal)
            return
        }

        // Safety net: a grandchild process can keep the pipes open after our child
        // exits. Force-close the session after a short grace period so the consumer
        // always receives exactly one terminal event.
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + drainGrace) { [weak self] in
            guard let self = self else { return }
            var lateEvents: [LocalCLIEvent] = []
            var lateTerminal: LocalCLIEvent?
            self.lock.lock()
            if !self.terminalSent {
                self.stdoutClosed = true
                self.stderrClosed = true
                Self.flushRemainderLocked(&self.stdoutBuffer, into: &lateEvents)
                Self.flushRemainderLocked(&self.stderrBuffer, into: &lateEvents)
                lateTerminal = self.terminalEventIfReadyLocked()
            }
            self.lock.unlock()
            lateEvents.forEach { self.emit($0) }
            if let lateTerminal = lateTerminal { self.emit(lateTerminal) }
        }
    }

    // MARK: Locked helpers

    private func terminalEventIfReadyLocked() -> LocalCLIEvent? {
        guard !terminalSent, let code = exitCode, stdoutClosed, stderrClosed else {
            return nil
        }
        terminalSent = true
        return .done(code)
    }

    private static func consumeCompleteLinesLocked(
        _ buffer: inout Data,
        into events: inout [LocalCLIEvent],
        isStdout: Bool
    ) {
        while let newlineIndex = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer.subdata(in: buffer.startIndex..<newlineIndex)
            buffer.removeSubrange(buffer.startIndex...newlineIndex)
            let line = String(decoding: lineData, as: UTF8.self)
            Self.appendLineEvent(line + "\n", into: &events)
        }
    }

    private static func flushRemainderLocked(_ buffer: inout Data, into events: inout [LocalCLIEvent]) {
        guard !buffer.isEmpty else { return }
        let line = String(decoding: buffer, as: UTF8.self)
        buffer.removeAll()
        guard !line.isEmpty else { return }
        Self.appendLineEvent(line, into: &events)
    }

    private static func appendLineEvent(_ line: String, into events: inout [LocalCLIEvent]) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            // Preserve blank lines for readable markdown-ish output.
            events.append(.text("\n"))
            return
        }
        if isToolCallLine(trimmed) {
            events.append(.toolCall(trimmed))
        } else {
            events.append(.text(line))
        }
    }

    /// Best-effort heuristic: tool invocations are printed on lines starting with "tool".
    private static func isToolCallLine(_ line: String) -> Bool {
        let lowered = line.lowercased()
        return lowered.hasPrefix("tool")
            || lowered.hasPrefix("[tool")
            || lowered.hasPrefix("🔧")
    }
}
