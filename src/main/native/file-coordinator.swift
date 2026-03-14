import Foundation

// MARK: - NSFileCoordinator CLI Tool
// Provides coordinated file access for iCloud Drive files.
// Usage: file-coordinator <subcommand> <path>
// Subcommands: read, write, download, is-stub

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: file-coordinator <read|write|download|is-stub> <path>\n", stderr)
    exit(1)
}

let subcommand = CommandLine.arguments[1]
let filePath = CommandLine.arguments[2]
let fileURL = URL(fileURLWithPath: filePath)

switch subcommand {
case "read":
    coordinatedRead(url: fileURL)
case "write":
    coordinatedWrite(url: fileURL)
case "download":
    requestDownload(url: fileURL)
case "is-stub":
    checkStub(path: filePath)
default:
    fputs("Unknown subcommand: \(subcommand)\n", stderr)
    exit(1)
}

// MARK: - Coordinated Read

func coordinatedRead(url: URL) {
    var error: NSError?
    var readError: NSError?

    let coordinator = NSFileCoordinator()
    coordinator.coordinate(readingItemAt: url, options: [], error: &error) { coordinatedURL in
        do {
            let data = try Data(contentsOf: coordinatedURL)
            FileHandle.standardOutput.write(data)
        } catch let err as NSError {
            readError = err
        }
    }

    if let error = error {
        fputs("Coordination error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
    if let readError = readError {
        fputs("Read error: \(readError.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Coordinated Write

func coordinatedWrite(url: URL) {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    let tmpURL = url.appendingPathExtension("tmp")

    var error: NSError?
    var writeError: NSError?

    let coordinator = NSFileCoordinator()
    coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &error) { coordinatedURL in
        do {
            try data.write(to: tmpURL, options: .atomic)
            if FileManager.default.fileExists(atPath: coordinatedURL.path) {
                try FileManager.default.removeItem(at: coordinatedURL)
            }
            try FileManager.default.moveItem(at: tmpURL, to: coordinatedURL)
        } catch let err as NSError {
            writeError = err
        }
    }

    // Cleanup tmp on failure
    if writeError != nil || error != nil {
        try? FileManager.default.removeItem(at: tmpURL)
    }

    if let error = error {
        fputs("Coordination error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
    if let writeError = writeError {
        fputs("Write error: \(writeError.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Request Download

func requestDownload(url: URL) {
    do {
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
    } catch {
        fputs("Download request error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Check iCloud Stub

func checkStub(path: String) {
    let filename = (path as NSString).lastPathComponent
    let isStub = filename.hasPrefix(".") && filename.hasSuffix(".icloud")
    print(isStub ? "true" : "false")
}
