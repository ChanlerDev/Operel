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
        case "ax.read_tree":
            return try encode(accessibilityTreeResponse(request: request))
        case "input.release_modifiers":
            return try encode(releaseModifiersResponse(request: request))
        case "input.press_key":
            return try encode(pressKeyResponse(request: request))
        case "input.type_text":
            return try encode(typeTextResponse(request: request))
        case "input.scroll":
            return try encode(scrollResponse(request: request))
        case "input.click":
            return try encode(clickResponse(request: request))
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
    let max_depth: Int?
    let max_nodes: Int?
    let key: String?
    let modifiers: [String]?
    let text: String?
    let strategy: String?
    let sensitive: Bool?
    let x: Double?
    let y: Double?
    let delta_x: Double?
    let delta_y: Double?
    let button: String?
    let click_count: Int?
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

private func accessibilityTreeResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let maxDepth = max(1, min(request.params?.max_depth ?? 3, 20))
    let maxNodes = max(1, min(request.params?.max_nodes ?? 200, 2_000))
    var remainingNodes = maxNodes
    let root = AXUIElementCreateSystemWide()
    let nodes = readAXChildren(element: root, depth: 0, maxDepth: maxDepth, remainingNodes: &remainingNodes)

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "tree_id": .string("tree_\(UUID().uuidString)"),
            "nodes": .array(nodes)
        ]),
        error: nil
    )
}

private func readAXChildren(
    element: AXUIElement,
    depth: Int,
    maxDepth: Int,
    remainingNodes: inout Int
) -> [JSONValue] {
    guard depth < maxDepth, remainingNodes > 0 else {
        return []
    }

    var rawChildren: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &rawChildren)
    guard result == .success, let children = rawChildren as? [AXUIElement] else {
        return []
    }

    var nodes: [JSONValue] = []
    for child in children {
        guard remainingNodes > 0 else {
            break
        }

        remainingNodes -= 1
        nodes.append(readAXNode(element: child, depth: depth + 1, maxDepth: maxDepth, remainingNodes: &remainingNodes))
    }

    return nodes
}

private func readAXNode(
    element: AXUIElement,
    depth: Int,
    maxDepth: Int,
    remainingNodes: inout Int
) -> JSONValue {
    let frame = readAXFrame(element: element)
    return .object([
        "runtime_handle": .string(""),
        "role": .string(readAXString(element: element, attribute: kAXRoleAttribute)),
        "label": .string(firstNonEmpty([
            readAXString(element: element, attribute: kAXTitleAttribute),
            readAXString(element: element, attribute: kAXDescriptionAttribute),
            readAXString(element: element, attribute: kAXHelpAttribute)
        ])),
        "value": .string(readAXString(element: element, attribute: kAXValueAttribute)),
        "enabled": .bool(readAXBool(element: element, attribute: kAXEnabledAttribute) ?? true),
        "frame": .object([
            "x": .int(frame.x),
            "y": .int(frame.y),
            "width": .int(frame.width),
            "height": .int(frame.height)
        ]),
        "children": .array(readAXChildren(element: element, depth: depth, maxDepth: maxDepth, remainingNodes: &remainingNodes))
    ])
}

private func readAXString(element: AXUIElement, attribute: String) -> String {
    var rawValue: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &rawValue)
    guard result == .success, let rawValue else {
        return ""
    }
    return String(describing: rawValue)
}

private func readAXBool(element: AXUIElement, attribute: String) -> Bool? {
    var rawValue: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &rawValue)
    guard result == .success else {
        return nil
    }
    return rawValue as? Bool
}

private func readAXFrame(element: AXUIElement) -> (x: Int, y: Int, width: Int, height: Int) {
    var positionValue: CFTypeRef?
    var sizeValue: CFTypeRef?
    let positionResult = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue)
    let sizeResult = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue)

    var point = CGPoint.zero
    var size = CGSize.zero
    if positionResult == .success, let positionValue, CFGetTypeID(positionValue) == AXValueGetTypeID() {
        AXValueGetValue(positionValue as! AXValue, .cgPoint, &point)
    }
    if sizeResult == .success, let sizeValue, CFGetTypeID(sizeValue) == AXValueGetTypeID() {
        AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    }

    return (Int(point.x), Int(point.y), Int(size.width), Int(size.height))
}

private func firstNonEmpty(_ values: [String]) -> String {
    values.first { !$0.isEmpty } ?? ""
}

private func releaseModifiersResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let modifiers: [(String, CGKeyCode)] = [
        ("cmd", 0x37),
        ("shift", 0x38),
        ("option", 0x3A),
        ("control", 0x3B)
    ]

    for (_, keyCode) in modifiers {
        postKey(keyCode: keyCode, down: false, flags: [])
    }

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "released": .array(modifiers.map { .string($0.0) })
        ]),
        error: nil
    )
}

private func pressKeyResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    guard let key = request.params?.key, let keyCode = keyCodeFor(key: key) else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "unsupported_operation",
                message: "Unsupported key."
            )
        )
    }

    let flags = eventFlags(for: request.params?.modifiers ?? [])
    postKey(keyCode: keyCode, down: true, flags: flags)
    postKey(keyCode: keyCode, down: false, flags: flags)

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "performed": .bool(true)
        ]),
        error: nil
    )
}

private func postKey(keyCode: CGKeyCode, down: Bool, flags: CGEventFlags) {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: down) else {
        return
    }
    event.flags = flags
    event.post(tap: .cghidEventTap)
}

private func eventFlags(for modifiers: [String]) -> CGEventFlags {
    var flags = CGEventFlags()
    for modifier in modifiers {
        switch modifier.lowercased() {
        case "cmd", "command":
            flags.insert(.maskCommand)
        case "shift":
            flags.insert(.maskShift)
        case "option", "alt":
            flags.insert(.maskAlternate)
        case "control", "ctrl":
            flags.insert(.maskControl)
        default:
            continue
        }
    }
    return flags
}

private func keyCodeFor(key: String) -> CGKeyCode? {
    switch key.lowercased() {
    case "return", "enter":
        return 0x24
    case "tab":
        return 0x30
    case "space":
        return 0x31
    case "delete", "backspace":
        return 0x33
    case "escape", "esc":
        return 0x35
    case "s":
        return 0x01
    case "a":
        return 0x00
    case "c":
        return 0x08
    case "v":
        return 0x09
    case "x":
        return 0x07
    case "z":
        return 0x06
    default:
        return nil
    }
}

private func typeTextResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    guard let text = request.params?.text else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "invalid_request",
                message: "input.type_text requires text."
            )
        )
    }

    let pasteboard = NSPasteboard.general
    let previousItems = pasteboard.pasteboardItems?.map { item -> NSPasteboardItem in
        let copy = NSPasteboardItem()
        for type in item.types {
            if let data = item.data(forType: type) {
                copy.setData(data, forType: type)
            }
        }
        return copy
    } ?? []

    pasteboard.clearContents()
    pasteboard.setString(text, forType: .string)
    postKey(keyCode: 0x09, down: true, flags: [.maskCommand])
    postKey(keyCode: 0x09, down: false, flags: [.maskCommand])

    pasteboard.clearContents()
    if !previousItems.isEmpty {
        pasteboard.writeObjects(previousItems)
    }

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "strategy_used": .string("paste"),
            "clipboard_restored": .bool(true)
        ]),
        error: nil
    )
}

private func scrollResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let deltaX = Int32(request.params?.delta_x ?? 0)
    let deltaY = Int32(request.params?.delta_y ?? 0)
    let point = CGPoint(x: request.params?.x ?? 0, y: request.params?.y ?? 0)

    if let event = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .pixel,
        wheelCount: 2,
        wheel1: deltaY,
        wheel2: deltaX,
        wheel3: 0
    ) {
        event.location = point
        event.post(tap: .cghidEventTap)
    }

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "performed": .bool(true)
        ]),
        error: nil
    )
}

private func clickResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    guard let x = request.params?.x, let y = request.params?.y else {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: nil,
            error: RuntimeError(
                code: "invalid_request",
                message: "input.click requires x and y coordinates."
            )
        )
    }

    let point = CGPoint(x: x, y: y)
    let buttonName = request.params?.button ?? "left"
    let button: CGMouseButton = buttonName == "right" ? .right : .left
    let downType: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = button == .right ? .rightMouseUp : .leftMouseUp
    let clickCount = max(1, request.params?.click_count ?? 1)

    for _ in 0..<clickCount {
        if let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: point, mouseButton: button) {
            down.post(tap: .cghidEventTap)
        }
        if let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: point, mouseButton: button) {
            up.post(tap: .cghidEventTap)
        }
    }

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "performed": .bool(true)
        ]),
        error: nil
    )
}

private func listRunningApps() -> [JSONValue] {
    let windowsByPID = visibleWindowsByProcessID()

    return NSWorkspace.shared.runningApplications
        .filter { !$0.isTerminated }
        .map { app in
            let pid = Int(app.processIdentifier)
            let fallbackName = "pid_\(pid)"
            let name = app.localizedName ?? app.bundleIdentifier ?? fallbackName
            let appID = "pid_\(pid)"
            let bundleID = app.bundleIdentifier ?? ""
            let windows = windowsByPID[pid] ?? []

            return JSONValue.object([
                "app_id": .string(appID),
                "name": .string(name),
                "bundle_id": .string(bundleID),
                "pid": .int(pid),
                "is_active": .bool(app.isActive),
                "windows": .array(windows)
            ])
        }
}

private func visibleWindowsByProcessID() -> [Int: [JSONValue]] {
    guard let rawWindows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return [:]
    }

    var windowsByPID: [Int: [JSONValue]] = [:]

    for window in rawWindows {
        let layer = window[kCGWindowLayer as String] as? Int ?? -1
        guard layer == 0 else {
            continue
        }

        guard let pid = window[kCGWindowOwnerPID as String] as? Int else {
            continue
        }

        let windowNumber = window[kCGWindowNumber as String] as? Int ?? 0
        let title = window[kCGWindowName as String] as? String ?? ""
        let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let x = Int(bounds["X"] as? Double ?? 0)
        let y = Int(bounds["Y"] as? Double ?? 0)
        let width = Int(bounds["Width"] as? Double ?? 0)
        let height = Int(bounds["Height"] as? Double ?? 0)

        guard width > 0, height > 0 else {
            continue
        }

        let value = JSONValue.object([
            "window_id": .string("win_\(windowNumber)"),
            "title": .string(title),
            "bounds": .object([
                "x": .int(x),
                "y": .int(y),
                "width": .int(width),
                "height": .int(height)
            ])
        ])

        windowsByPID[pid, default: []].append(value)
    }

    return windowsByPID
}

private func activateAppResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let requestedName = request.params?.app
    let requestedBundleID = request.params?.bundle_id ?? bundleIdentifierForApplicationName(requestedName)
    var candidates = findRunningApps(name: requestedName, bundleID: requestedBundleID)

    if candidates.isEmpty {
        launchApp(name: requestedName, bundleID: requestedBundleID)
        candidates = waitForRunningApp(name: requestedName, bundleID: requestedBundleID)
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

private func findRunningApps(name: String?, bundleID: String?) -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { app in
        if let bundleID, !bundleID.isEmpty, app.bundleIdentifier == bundleID {
            return true
        }
        if let name, !name.isEmpty, app.localizedName == name {
            return true
        }
        return false
    }
}

private func waitForRunningApp(name: String?, bundleID: String?) -> [NSRunningApplication] {
    let deadline = Date().addingTimeInterval(5)

    while Date() < deadline {
        let candidates = findRunningApps(name: name, bundleID: bundleID)
        if !candidates.isEmpty {
            return candidates
        }
        usleep(100_000)
    }

    return findRunningApps(name: name, bundleID: bundleID)
}

private func launchApp(name: String?, bundleID: String?) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")

    if let bundleID, !bundleID.isEmpty {
        process.arguments = ["-b", bundleID]
    } else if let name, !name.isEmpty {
        process.arguments = ["-a", name]
    } else {
        return
    }

    try? process.run()
    process.waitUntilExit()
}

private func bundleIdentifierForApplicationName(_ name: String?) -> String? {
    guard let name, !name.isEmpty else {
        return nil
    }

    guard let path = NSWorkspace.shared.fullPath(forApplication: name) else {
        return nil
    }

    return Bundle(path: path)?.bundleIdentifier
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
