import Foundation
import ApplicationServices
import AppKit
import CoreGraphics
import ImageIO

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
        case "app.activate":
            return try encode(activateAppResponse(request: request))
        case "screen.capture":
            return try encode(screenCaptureResponse(request: request))
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
    let params: RuntimeParams?
}

private struct RuntimeParams: Decodable {
    let app: String?
    let bundle_id: String?
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
    case double(Double)
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
        case let .double(value):
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

private func screenCaptureResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let displayID = CGMainDisplayID()

    guard CGPreflightScreenCaptureAccess() else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "permission_missing",
                message: "Screen Recording permission is missing."
            )
        )
    }

    guard let image = CGDisplayCreateImage(displayID) else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "action_failed",
                message: "Unable to capture the main display."
            )
        )
    }

    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("operel-capture-\(UUID().uuidString)")
        .appendingPathExtension("png")

    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        throw RuntimeProtocolError.encodingFailed
    }

    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "action_failed",
                message: "Unable to write screenshot PNG."
            )
        )
    }

    let bounds = CGDisplayBounds(displayID)
    let pixelWidth = CGDisplayPixelsWide(displayID)
    let pixelHeight = CGDisplayPixelsHigh(displayID)
    let scale = bounds.width > 0 ? Double(pixelWidth) / bounds.width : 1

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "tmp_path": .string(url.path),
            "width": .int(Int(bounds.width)),
            "height": .int(Int(bounds.height)),
            "pixel_width": .int(pixelWidth),
            "pixel_height": .int(pixelHeight),
            "scale": .double(scale),
            "display_id": .int(Int(displayID)),
            "coordinate_space": .string("logical_points")
        ]),
        error: nil
    )
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

private func activateAppResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let requestedName = request.params?.app
    let requestedBundleID = request.params?.bundle_id
    let candidates = NSWorkspace.shared.runningApplications.filter { app in
        if let requestedBundleID, app.bundleIdentifier == requestedBundleID {
            return true
        }
        if let requestedName, app.localizedName == requestedName {
            return true
        }
        return false
    }

    guard let app = candidates.first else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "target_not_found",
                message: "App is not running or cannot be found."
            )
        )
    }

    app.activate(options: [.activateIgnoringOtherApps])

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "active_app": .string(app.localizedName ?? app.bundleIdentifier ?? "pid_\(app.processIdentifier)"),
            "active_window_id": .string("")
        ]),
        error: nil
    )
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
