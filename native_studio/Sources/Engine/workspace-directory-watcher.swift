import Darwin
import Dispatch
import Foundation
import os

struct WorkspaceWatchOperations: Sendable {
    var open: @Sendable (String) throws -> Int32
    var close: @Sendable (Int32) throws -> Void

    static let live = WorkspaceWatchOperations(
        open: { path in
            let descriptor = Darwin.open(path, O_EVTONLY)
            guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
            return descriptor
        },
        close: { descriptor in
            guard Darwin.close(descriptor) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        })
}

/// Blocking filesystem opens never own the UI or the serial source-management queue.
final class WorkspaceDirectoryWatcher: @unchecked Sendable {
    var onChange: (() -> Void)?
    var onFailure: ((Error) -> Void)?
    private let operations: WorkspaceWatchOperations
    private let queue = DispatchQueue(label: "voo.workspace.watcher", qos: .utility)
    private let stateLock = NSLock()
    private var generation: UInt64 = 0
    private var stopped = false
    private var installedPath: String?
    // Only the serial management queue touches source and debounce.
    private var source: DispatchSourceFileSystemObject?
    private var debounce: DispatchWorkItem?
    private static let logger = Logger(subsystem: "run.voo.native", category: "workspace-watcher")

    init(operations: WorkspaceWatchOperations = .live) { self.operations = operations }

    deinit {
        debounce?.cancel()
        source?.cancel()
    }

    var activePath: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return installedPath
    }

    func replace(directory: String) {
        stateLock.lock()
        guard !stopped else {
            stateLock.unlock()
            return
        }
        generation &+= 1
        let token = generation
        installedPath = nil
        stateLock.unlock()
        queue.async { [self] in
            guard isCurrent(token) else { return }
            cancelSource()
            // An unresponsive old root must not prevent a newer root from opening.
            DispatchQueue.global(qos: .utility).async { [self] in
                let result = Result { try operations.open(directory) }
                queue.async { [self] in finishOpen(result, directory: directory, token: token) }
            }
        }
    }

    func stop() {
        stateLock.lock()
        stopped = true
        generation &+= 1
        installedPath = nil
        stateLock.unlock()
        // No sync/drain: destruction must not wait for a filesystem operation.
        queue.async { [self] in cancelSource() }
    }

    private func isCurrent(_ token: UInt64) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return !stopped && token == generation
    }

    private func cancelSource() {
        debounce?.cancel()
        debounce = nil
        source?.cancel()
        source = nil
    }

    private func finishOpen(_ result: Result<Int32, Error>, directory: String, token: UInt64) {
        switch result {
        case .failure(let error):
            report(error, token: token)
        case .success(let descriptor):
            guard descriptor >= 0 else {
                report(POSIXError(.EBADF), token: token)
                return
            }
            guard isCurrent(token) else {
                close(descriptor, token: token)
                return
            }
            let current = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: descriptor,
                eventMask: [.write, .delete, .extend, .attrib, .rename], queue: queue)
            current.setEventHandler { [weak self] in self?.scheduleChange(token: token) }
            let closeOperation = operations.close
            current.setCancelHandler { [weak self] in
                do { try closeOperation(descriptor) } catch {
                    Self.logger.error(
                        "Workspace watcher close failed: \(String(describing: error))")
                    self?.deliverFailure(error, token: token)
                }
            }
            source = current
            current.resume()
            stateLock.lock()
            if !stopped && generation == token { installedPath = directory }
            stateLock.unlock()
            if !isCurrent(token) { cancelSource() }
        }
    }

    private func close(_ descriptor: Int32, token: UInt64) {
        do { try operations.close(descriptor) } catch { report(error, token: token) }
    }

    private func report(_ error: Error, token: UInt64) {
        Self.logger.error("Workspace watcher failed: \(String(describing: error))")
        deliverFailure(error, token: token)
    }

    private func deliverFailure(_ error: Error, token: UInt64) {
        DispatchQueue.main.async { [weak self] in
            guard let self, isCurrent(token) else { return }
            onFailure?(error)
        }
    }

    private func scheduleChange(token: UInt64) {
        guard isCurrent(token) else { return }
        debounce?.cancel()
        let work = DispatchWorkItem { [weak self] in
            DispatchQueue.main.async { [weak self] in
                guard let self, isCurrent(token) else { return }
                onChange?()
            }
        }
        debounce = work
        queue.asyncAfter(deadline: .now() + 0.3, execute: work)
    }
}
