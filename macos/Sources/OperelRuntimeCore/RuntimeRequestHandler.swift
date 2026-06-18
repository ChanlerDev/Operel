import Foundation
import ApplicationServices
import AppKit
import CoreGraphics

public struct RuntimeRequestHandler {
    private let version: String
    private let processID: Int32

    public init(version: String, processID: Int32 = getpid()) {
        self.version = version
        self.processID = processID
    }

    public func handleLine(_ line: String) throws -> String {
        let data = Data(line.utf8)
        let request = try JSONDecoder().decode(RuntimeRequest.self, from: data)

        switch request.method {
        case "runtime.ping":
            return try encode(RuntimeResponse(
                jsonrpc: "2.0",
                id: request.id,
                result: .object([
                    "version": .string(version),
                    "platform": .string("macos"),
                    "pid": .int(Int(processID))
                ]),
                error: nil
            ))
        case "permissions.check":
            return try encode(RuntimeResponse(
                jsonrpc: "2.0",
                id: request.id,
                result: .object([
                    "screen_recording": .string(checkScreenRecordingPermission()),
                    "accessibility": .string(checkAccessibilityPermission()),
                    "automation": .string("unknown"),
                    "input_monitoring": .string("not_requested")
                ]),
                error: nil
            ))
        case "apps.list":
            return try encode(RuntimeResponse(
                jsonrpc: "2.0",
                id: request.id,
                result: .object([
                    "apps": .array(listRunningApps())
                ]),
                error: nil
            ))
        default:
            return try encode(RuntimeResponse(
                jsonrpc: "2.0",
                id: request.id,
                result: nil,
                error: RuntimeError(
                    code: "method_not_found",
                    message: "Unknown method: \(request.method)"
                )
            ))
        }
    }

    private func encode(_ response: RuntimeResponse) throws -> String {
        let data = try JSONEncoder().encode(response)
        guard let line = String(data: data, encoding: .utf8) else {
            throw RuntimeProtocolError.encodingFailed
        }
        return line
    }
}

private func checkScreenRecordingPermission() -> String {
    if #available(macOS 10.15, *) {
        return CGPreflightScreenCaptureAccess() ? "granted" : "missing"
    }
    return "unknown"
}

private func checkAccessibilityPermission() -> String {
    AXIsProcessTrusted() ? "granted" : "missing"
}

private struct RuntimeRequest: Decodable {
    let jsonrpc: String
    let id: String
    let method: String
}

private struct RuntimeResponse: Encodable {
    let jsonrpc: String
    let id: String
    let result: JSONValue?
    let error: RuntimeError?
}

private struct RuntimeError: Encodable {
    let code: String
    let message: String
}

private enum RuntimeProtocolError: Error {
    case encodingFailed
}

private enum JSONValue: Encodable {
    case string(String)
    case int(Int)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])

    func encode(to encoder: Encoder) throws {
        switch self {
        case let .string(value):
            var container = encoder.singleValueContainer()
            try container.encode(value)
        case let .int(value):
            var container = encoder.singleValueContainer()
            try container.encode(value)
        case let .bool(value):
            var container = encoder.singleValueContainer()
            try container.encode(value)
        case let .array(value):
            var container = encoder.unkeyedContainer()
            for item in value {
                try container.encode(item)
            }
        case let .object(value):
            var container = encoder.container(keyedBy: DynamicCodingKey.self)
            for (key, item) in value {
                try container.encode(item, forKey: DynamicCodingKey(stringValue: key))
            }
        }
    }
}

private func listRunningApps() -> [JSONValue] {
    NSWorkspace.shared.runningApplications
        .filter { !$0.isTerminated }
        .map { app in
            .object([
                "app_id": .string("pid_\(app.processIdentifier)"),
                "name": .string(app.localizedName ?? app.bundleIdentifier ?? "pid_\(app.processIdentifier)"),
                "bundle_id": .string(app.bundleIdentifier ?? ""),
                "pid": .int(Int(app.processIdentifier)),
                "is_active": .bool(app.isActive),
                "windows": .array([])
            ])
        }
}

private struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil

    init(stringValue: String) {
        self.stringValue = stringValue
    }

    init?(intValue: Int) {
        return nil
    }
}
