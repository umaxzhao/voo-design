#if INTEGRATED
    import Darwin
    import Foundation

    enum WorkspaceWatcherRegression {
        static func registerTests(_ registry: TestRegistry) {
            registry.register(
                tier: 3, feature: "Workspace-Watcher",
                name: "test_BlockedOldWorkspaceOpenDoesNotBlockUIOrNewDirectoryWatching"
            ) {
                let fixture = try Fixture()
                let watcher = WorkspaceDirectoryWatcher(operations: fixture.operations)
                let manager = fixture.manager(watcher: watcher)
                defer {
                    fixture.releaseOpen.signal()
                    watcher.stop()
                }
                try TestAssertions.assertTrue(
                    fixture.openEntered.wait(timeout: .now() + 1) == .success)
                let uiTurn = DispatchSemaphore(value: 0)
                DispatchQueue.main.async { uiTurn.signal() }
                try waitUntil { uiTurn.wait(timeout: .now()) == .success }
                let changed = manager.setWorkspaceDirectory(fixture.secondRoot.path)
                try TestAssertions.assertTrue(changed.ok)
                // The old open is still blocked when the new source becomes active.
                try waitUntil { watcher.activePath == fixture.secondRoot.path }
                try TestAssertions.assertFalse(fixture.closedPaths.contains(fixture.firstRoot.path))
                fixture.releaseOpen.signal()
                try waitUntil { fixture.closedPaths.contains(fixture.firstRoot.path) }
                try TestAssertions.assertEqual(watcher.activePath, fixture.secondRoot.path)
                let drained = DispatchSemaphore(value: 0)
                DispatchQueue.main.async { drained.signal() }
                try waitUntil { drained.wait(timeout: .now()) == .success }
                let notified = DispatchSemaphore(value: 0)
                manager.onWorkspaceChanged = { notified.signal() }
                try Data("watcher".utf8).write(
                    to: fixture.secondRoot.appendingPathComponent("created.voo"))
                try waitUntil { notified.wait(timeout: .now()) == .success }
            }
            registry.register(
                tier: 3, feature: "Workspace-Watcher",
                name: "test_ReleasingWorkspaceManagerDoesNotWaitForBlockedOpenAndClosesLateFD"
            ) {
                let fixture = try Fixture()
                let watcher = WorkspaceDirectoryWatcher(operations: fixture.operations)
                var manager: WorkspaceManager? = fixture.manager(watcher: watcher)
                weak let released = manager
                defer {
                    fixture.releaseOpen.signal()
                    watcher.stop()
                }
                try TestAssertions.assertTrue(
                    fixture.openEntered.wait(timeout: .now() + 1) == .success)
                manager = nil
                try TestAssertions.assertNil(released, "Blocked open must not retain its manager")
                fixture.releaseOpen.signal()
                try waitUntil { fixture.closedPaths.contains(fixture.firstRoot.path) }
                try TestAssertions.assertNil(watcher.activePath)
                try TestAssertions.assertEqual(
                    fixture.closedPaths.filter { $0 == fixture.firstRoot.path }.count, 1)
            }
            registry.register(
                tier: 3, feature: "Workspace-Watcher",
                name: "test_WorkspaceWatchOpenFailureIsReportedWithoutBlockingInitialization"
            ) {
                let fixture = try Fixture()
                var operations = fixture.operations
                operations.open = { _ in throw POSIXError(.EACCES) }
                let watcher = WorkspaceDirectoryWatcher(operations: operations)
                let manager = fixture.manager(watcher: watcher)
                defer { watcher.stop() }
                var received: Error?
                manager.onWorkspaceWatcherError = { received = $0 }
                try waitUntil { received != nil }
                try TestAssertions.assertEqual((received as? POSIXError)?.code, .EACCES)
                try TestAssertions.assertNil(watcher.activePath)
            }
        }

        private static func waitUntil(_ condition: () -> Bool) throws {
            let deadline = Date().addingTimeInterval(2)
            while !condition() {
                guard Date() < deadline else {
                    throw TestFailure(
                        message: "Workspace watcher transition timed out", file: #file, line: #line)
                }
                RunLoop.current.run(until: Date().addingTimeInterval(0.01))
            }
        }

        private final class Fixture: @unchecked Sendable {
            let base = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("voo-watcher-" + UUID().uuidString)
            let openEntered = DispatchSemaphore(value: 0)
            let releaseOpen = DispatchSemaphore(value: 0)
            private let lock = NSLock()
            private var pathsByDescriptor: [Int32: String] = [:]
            private var closed: [String] = []
            var firstRoot: URL { base.appendingPathComponent("documents/VOO/Projects") }
            var secondRoot: URL { base.appendingPathComponent("second") }
            var closedPaths: [String] {
                lock.lock()
                defer { lock.unlock() }
                return closed
            }

            init() throws {
                for path in [base.appendingPathComponent("user"), secondRoot] {
                    try FileManager.default.createDirectory(
                        at: path, withIntermediateDirectories: true)
                }
            }

            deinit { try? FileManager.default.removeItem(at: base) }

            func manager(watcher: WorkspaceDirectoryWatcher) -> WorkspaceManager {
                WorkspaceManager(
                    watcher: watcher, userDataDirectory: base.appendingPathComponent("user").path,
                    documentsRootDirectory: base.appendingPathComponent("documents").path)
            }

            var operations: WorkspaceWatchOperations {
                WorkspaceWatchOperations(
                    open: { [self] path in
                        if path == firstRoot.path {
                            openEntered.signal()
                            releaseOpen.wait()
                        }
                        let descriptor = Darwin.open(path, O_RDONLY | O_NONBLOCK)
                        guard descriptor >= 0 else {
                            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                        }
                        lock.lock()
                        pathsByDescriptor[descriptor] = path
                        lock.unlock()
                        return descriptor
                    },
                    close: { [self] descriptor in
                        guard Darwin.close(descriptor) == 0 else {
                            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                        }
                        lock.lock()
                        if let path = pathsByDescriptor.removeValue(forKey: descriptor) {
                            closed.append(path)
                        }
                        lock.unlock()
                    })
            }
        }
    }
#endif
