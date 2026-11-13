import BackgroundTasks
import Foundation
import os

// Xcode 26 and its iOS 26 SDK: older ones build the app without it.
#if compiler(>=6.2)
  /// A pass the user started that goes on once they leave the app, shown by
  /// the system with its progress and a way to stop it.
  @available(iOS 26.0, *)
  enum ContinuedPass {
    /// Also in BGTaskSchedulerPermittedIdentifiers, ended by `.*`.
    private static let prefix = "com.linagora.twakedrive.backup.continued"

    private enum Handoff {
      case waiting
      case handed(BGContinuedProcessingTask)
      case late
    }

    /// The task once the system started it, nil when it cannot right now.
    static func start(title: String) -> BGContinuedProcessingTask? {
      // Unique: the system kills an app that registers an identifier twice.
      let identifier = "\(prefix).\(UUID().uuidString)"
      let started = DispatchSemaphore(value: 0)
      let handoff = OSAllocatedUnfairLock<Handoff>(uncheckedState: .waiting)
      let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
        let taken = handoff.withLockUnchecked { state -> Bool in
          guard case .waiting = state, let task = task as? BGContinuedProcessingTask else { return false }
          state = .handed(task)
          return true
        }
        if taken { started.signal() } else { task.setTaskCompleted(success: false) }
      }
      guard registered else { return nil }
      let request = BGContinuedProcessingTaskRequest(identifier: identifier, title: title, subtitle: "")
      // The pass runs in the app now rather than wait in the system's queue.
      request.strategy = .fail
      do { try BGTaskScheduler.shared.submit(request) } catch { return nil }
      // The other passes wait behind this one on passQueue.
      _ = started.wait(timeout: .now() + 2)
      return handoff.withLockUnchecked { state in
        if case .handed(let task) = state { return task }
        state = .late
        return nil
      }
    }

    /// Runs `pass` in `task`: the system shows how far it is, and the user
    /// stopping it ends the pass after the media in progress.
    // shortcut: no progress until the library is scanned, which iOS may take
    // for a stalled task on a large first scan; report the scan if it does.
    static func run(
      _ task: BGContinuedProcessingTask, title: String,
      _ pass: (_ isCancelled: @escaping () -> Bool, _ report: @escaping (BackupStatus) -> Void) throws -> BackupStatus
    ) throws -> BackupStatus {
      let (complete, isOpen) = completingOnce(task)
      // Both only grow: media held back for Wi-Fi are pending again at the end.
      let counts = OSAllocatedUnfairLock(initialState: (total: Int64(0), done: Int64(0)))
      task.progress.totalUnitCount = 1
      do {
        let status = try pass({ !isOpen() }) { status in
          let left = Int64(status.counts.pending)
          let (total, done) = counts.withLock { counts in
            counts.total = max(counts.total, left)
            counts.done = max(counts.done, counts.total - left)
            return counts
          }
          task.progress.totalUnitCount = max(total, 1)
          task.progress.completedUnitCount = done
          task.updateTitle(title, subtitle: "\(done) / \(total)")
        }
        complete(true)
        return status
      } catch {
        complete(false)
        throw error
      }
    }
  }
#endif
