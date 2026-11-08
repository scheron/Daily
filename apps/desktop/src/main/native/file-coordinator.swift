import Foundation

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: file-coordinator <read|write|download> <path>\n", stderr)
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
default:
    fputs("Unknown subcommand: \(subcommand)\n", stderr)
    exit(1)
}

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

func requestDownload(url: URL) {
    do {
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
    } catch {
        fputs("Download request error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}
