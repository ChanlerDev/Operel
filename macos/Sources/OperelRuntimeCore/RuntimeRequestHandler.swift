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
                    "input_monitoring": .string("not_requested"),
                    "binary_path": .string(currentExecutablePath()),
                    "code_signing": codeSigningDiagnostics()
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

private func currentExecutablePath() -> String {
    Bundle.main.executableURL?.path ?? CommandLine.arguments.first ?? ""
}

private func codeSigningDiagnostics() -> JSONValue {
    let path = currentExecutablePath()
    guard !path.isEmpty else {
        return .object([
            "status": .string("unknown"),
            "identity": .string("unknown"),
            "team_identifier": .string("")
        ])
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
    process.arguments = ["-dv", "--verbose=4", path]

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe

    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        return .object([
            "status": .string("unknown"),
            "identity": .string("unknown"),
            "team_identifier": .string("")
        ])
    }

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: data, encoding: .utf8) ?? ""
    let status: String
    if output.contains("Signature=adhoc") {
        status = "adhoc"
    } else if output.contains("code object is not signed") || process.terminationStatus != 0 {
        status = "unsigned"
    } else {
        status = "signed"
    }

    return .object([
        "status": .string(status),
        "identity": .string(firstCodesignValue(output: output, prefix: "Authority=") ?? (status == "adhoc" ? "adhoc" : "")),
        "team_identifier": .string(firstCodesignValue(output: output, prefix: "TeamIdentifier=") ?? "")
    ])
}

private func firstCodesignValue(output: String, prefix: String) -> String? {
    output
        .split(separator: "\n")
        .first { $0.hasPrefix(prefix) }
        .map { String($0.dropFirst(prefix.count)) }
}

private struct RuntimeRequest: Decodable {
    let jsonrpc: String
    let id: String
    let method: String
    let params: RuntimeParams?
}

private struct RuntimeParams: Decodable {
    let scope: String?
    let app: String?
    let bundle_id: String?
    let window_id: String?
    let rect: CaptureRect?
    let max_depth: Int?
    let max_nodes: Int?
    let key: String?
    let modifiers: [String]?
    let text: String?
    let strategy: String?
    let sensitive: Bool?
    let x: Double?
    let y: Double?
    let ax_role: String?
    let ax_label: String?
    let ax_value: String?
    let ax_x: Double?
    let ax_y: Double?
    let ax_width: Double?
    let ax_height: Double?
    let delta_x: Double?
    let delta_y: Double?
    let button: String?
    let click_count: Int?
}

private struct CaptureRect: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
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

    guard let displayImage = CGDisplayCreateImage(displayID) else {
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

    let displayBounds = CGDisplayBounds(displayID)
    let pixelWidth = CGDisplayPixelsWide(displayID)
    let scale = displayBounds.width > 0 ? Double(pixelWidth) / displayBounds.width : 1
    let captureRegion = requestedCaptureRegion(request: request, displayBounds: displayBounds)

    if let error = captureRegion.error {
        return RuntimeResponse(jsonrpc: "2.0", id: request.id, result: nil, error: error)
    }

    let logicalBounds = captureRegion.rect ?? displayBounds
    let image: CGImage
    if let cropRect = pixelCropRect(for: logicalBounds, displayBounds: displayBounds, scale: scale) {
        guard let cropped = displayImage.cropping(to: cropRect) else {
            return RuntimeResponse(
                jsonrpc: "2.0",
                id: request.id,
                result: nil,
                error: RuntimeError(
                    code: "action_failed",
                    message: "Unable to crop screenshot."
                )
            )
        }
        image = cropped
    } else {
        image = displayImage
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

    return RuntimeResponse(
        jsonrpc: "2.0",
        id: request.id,
        result: .object([
            "tmp_path": .string(url.path),
            "width": .int(Int(logicalBounds.width)),
            "height": .int(Int(logicalBounds.height)),
            "pixel_width": .int(image.width),
            "pixel_height": .int(image.height),
            "scale": .double(scale),
            "display_id": .int(Int(displayID)),
            "coordinate_space": .string("logical_points")
        ]),
        error: nil
    )
}

private func requestedCaptureRegion(
    request: RuntimeRequest,
    displayBounds: CGRect
) -> (rect: CGRect?, error: RuntimeError?) {
    let scope = request.params?.scope ?? "display"

    switch scope {
    case "display":
        return (nil, nil)
    case "rect":
        guard let rect = request.params?.rect else {
            return (nil, RuntimeError(code: "target_not_found", message: "screen.capture scope=rect requires rect."))
        }
        return clampedCaptureRect(
            CGRect(x: CGFloat(rect.x), y: CGFloat(rect.y), width: CGFloat(rect.width), height: CGFloat(rect.height)),
            displayBounds: displayBounds
        )
    case "window":
        guard let windowID = request.params?.window_id else {
            return (nil, RuntimeError(code: "target_not_found", message: "screen.capture scope=window requires window_id."))
        }
        guard let rect = findWindowCaptureRect(windowID: windowID, app: request.params?.app, bundleID: request.params?.bundle_id) else {
            return (nil, RuntimeError(code: "target_not_found", message: "Window was not found for screenshot capture."))
        }
        return clampedCaptureRect(rect, displayBounds: displayBounds)
    case "app":
        guard request.params?.app != nil || request.params?.bundle_id != nil else {
            return (nil, RuntimeError(code: "target_not_found", message: "screen.capture scope=app requires app or bundle_id."))
        }
        guard let rect = findAppCaptureRect(app: request.params?.app, bundleID: request.params?.bundle_id) else {
            return (nil, RuntimeError(code: "target_not_found", message: "App window was not found for screenshot capture."))
        }
        return clampedCaptureRect(rect, displayBounds: displayBounds)
    default:
        return (nil, RuntimeError(code: "invalid_request", message: "Unsupported screen.capture scope: \(scope)."))
    }
}

private func clampedCaptureRect(_ rect: CGRect, displayBounds: CGRect) -> (rect: CGRect?, error: RuntimeError?) {
    guard rect.width > 0, rect.height > 0 else {
        return (nil, RuntimeError(code: "target_not_found", message: "Screenshot capture rect is empty."))
    }

    let clamped = rect.intersection(displayBounds)
    guard !clamped.isNull, clamped.width > 0, clamped.height > 0 else {
        return (nil, RuntimeError(code: "target_not_found", message: "Screenshot capture rect is outside the main display."))
    }
    return (clamped, nil)
}

private func pixelCropRect(for logicalRect: CGRect, displayBounds: CGRect, scale: Double) -> CGRect? {
    guard logicalRect != displayBounds else {
        return nil
    }

    let cgScale = CGFloat(scale)
    return CGRect(
        x: (logicalRect.minX - displayBounds.minX) * cgScale,
        y: (logicalRect.minY - displayBounds.minY) * cgScale,
        width: logicalRect.width * cgScale,
        height: logicalRect.height * cgScale
    ).integral
}

private func findWindowCaptureRect(windowID: String, app: String?, bundleID: String?) -> CGRect? {
    guard let wantedWindowNumber = Int(windowID.replacingOccurrences(of: "win_", with: "")) else {
        return nil
    }
    let allowedPIDs = matchingApplicationPIDs(app: app, bundleID: bundleID)
    return visibleWindowSnapshots().first { window in
        if window.windowNumber != wantedWindowNumber {
            return false
        }
        if !allowedPIDs.isEmpty && !allowedPIDs.contains(window.pid) {
            return false
        }
        return true
    }?.bounds
}

private func findAppCaptureRect(app: String?, bundleID: String?) -> CGRect? {
    let allowedPIDs = matchingApplicationPIDs(app: app, bundleID: bundleID)
    guard !allowedPIDs.isEmpty else {
        return nil
    }

    let windows = visibleWindowSnapshots().filter { allowedPIDs.contains($0.pid) }
    guard let first = windows.first else {
        return nil
    }

    return windows.dropFirst().reduce(first.bounds) { partial, window in
        partial.union(window.bounds)
    }
}

private func matchingApplicationPIDs(app: String?, bundleID: String?) -> Set<Int> {
    let matches = NSWorkspace.shared.runningApplications.filter { runningApp in
        let nameMatches = app.map { runningApp.localizedName == $0 } ?? false
        let bundleMatches = bundleID.map { runningApp.bundleIdentifier == $0 } ?? false
        return nameMatches || bundleMatches
    }
    return Set(matches.map { Int($0.processIdentifier) })
}

private struct WindowSnapshot {
    let windowNumber: Int
    let pid: Int
    let bounds: CGRect
}

private func visibleWindowSnapshots() -> [WindowSnapshot] {
    guard let rawWindows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    return rawWindows.compactMap { window in
        let layer = window[kCGWindowLayer as String] as? Int ?? -1
        guard layer == 0 else {
            return nil
        }
        guard let pid = window[kCGWindowOwnerPID as String] as? Int else {
            return nil
        }

        let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let x = bounds["X"] as? Double ?? 0
        let y = bounds["Y"] as? Double ?? 0
        let width = bounds["Width"] as? Double ?? 0
        let height = bounds["Height"] as? Double ?? 0
        guard width > 0, height > 0 else {
            return nil
        }

        return WindowSnapshot(
            windowNumber: window[kCGWindowNumber as String] as? Int ?? 0,
            pid: pid,
            bounds: CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width), height: CGFloat(height))
        )
    }
}

private func accessibilityTreeResponse(request: RuntimeRequest) throws -> RuntimeResponse {
    let maxDepth = max(1, min(request.params?.max_depth ?? 3, 20))
    let maxNodes = max(1, min(request.params?.max_nodes ?? 200, 2_000))
    var remainingNodes = maxNodes
    let nodes = readAccessibilityRoots(
        request: request,
        maxDepth: maxDepth,
        remainingNodes: &remainingNodes
    )

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

private func readAccessibilityRoots(
    request: RuntimeRequest,
    maxDepth: Int,
    remainingNodes: inout Int
) -> [JSONValue] {
    let requestedName = request.params?.app
    let requestedBundleID = request.params?.bundle_id ?? bundleIdentifierForApplicationName(requestedName)
    let targetApps = findAccessibilityTargetApps(name: requestedName, bundleID: requestedBundleID)

    if !targetApps.isEmpty {
        return targetApps.flatMap { app in
            let root = AXUIElementCreateApplication(app.processIdentifier)
            return readAXChildrenFromKnownAttributes(
                element: root,
                depth: 0,
                maxDepth: maxDepth,
                remainingNodes: &remainingNodes
            )
        }
    }

    let root = AXUIElementCreateSystemWide()
    return readAXChildren(element: root, depth: 0, maxDepth: maxDepth, remainingNodes: &remainingNodes)
}

private func findAccessibilityTargetApps(name: String?, bundleID: String?) -> [NSRunningApplication] {
    let matched = findRunningApps(name: name, bundleID: bundleID)
    if !matched.isEmpty {
        return matched
    }

    if name == nil, bundleID == nil, let frontmost = NSWorkspace.shared.frontmostApplication {
        return [frontmost]
    }

    return []
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

    return readAXChildrenFromAttributes(
        element: element,
        attributes: [kAXChildrenAttribute],
        depth: depth,
        maxDepth: maxDepth,
        remainingNodes: &remainingNodes
    )
}

private func readAXChildrenFromKnownAttributes(
    element: AXUIElement,
    depth: Int,
    maxDepth: Int,
    remainingNodes: inout Int
) -> [JSONValue] {
    readAXChildrenFromAttributes(
        element: element,
        attributes: [kAXWindowsAttribute, kAXChildrenAttribute],
        depth: depth,
        maxDepth: maxDepth,
        remainingNodes: &remainingNodes
    )
}

private func readAXChildrenFromAttributes(
    element: AXUIElement,
    attributes: [String],
    depth: Int,
    maxDepth: Int,
    remainingNodes: inout Int
) -> [JSONValue] {
    guard depth < maxDepth, remainingNodes > 0 else {
        return []
    }

    let children = attributes.flatMap { readAXElementArray(element: element, attribute: $0) }
    guard !children.isEmpty else {
        return []
    }

    var nodes: [JSONValue] = []
    var seen = Set<String>()
    for child in children {
        guard remainingNodes > 0 else {
            break
        }

        let fingerprint = String(describing: child)
        guard !seen.contains(fingerprint) else {
            continue
        }
        seen.insert(fingerprint)

        remainingNodes -= 1
        nodes.append(readAXNode(element: child, depth: depth + 1, maxDepth: maxDepth, remainingNodes: &remainingNodes))
    }

    return nodes
}

private func readAXElementArray(element: AXUIElement, attribute: String) -> [AXUIElement] {
    var rawChildren: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &rawChildren)
    guard result == .success, let children = rawChildren as? [AXUIElement] else {
        return []
    }
    return children
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
    if tryPerformAXPress(request: request) {
        return RuntimeResponse(
            jsonrpc: "2.0",
            id: request.id,
            result: .object([
                "performed": .bool(true),
                "strategy_used": .string("ax_press")
            ]),
            error: nil
        )
    }

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
            "performed": .bool(true),
            "strategy_used": .string("cg_event")
        ]),
        error: nil
    )
}

private func tryPerformAXPress(request: RuntimeRequest) -> Bool {
    guard hasAXTarget(request: request) else {
        return false
    }

    let requestedName = request.params?.app
    let requestedBundleID = request.params?.bundle_id ?? bundleIdentifierForApplicationName(requestedName)
    var remainingNodes = 1_000
    let roots = findAccessibilityTargetApps(name: requestedName, bundleID: requestedBundleID).map {
        AXUIElementCreateApplication($0.processIdentifier)
    }

    let searchRoots: [AXUIElement]
    if roots.isEmpty {
        searchRoots = [AXUIElementCreateSystemWide()]
    } else {
        searchRoots = roots
    }

    for root in searchRoots {
        if let match = findAXTarget(
            element: root,
            request: request,
            depth: 0,
            maxDepth: 20,
            remainingNodes: &remainingNodes
        ) {
            return AXUIElementPerformAction(match, kAXPressAction as CFString) == .success
        }
    }

    return false
}

private func hasAXTarget(request: RuntimeRequest) -> Bool {
    request.params?.ax_role != nil ||
        request.params?.ax_label != nil ||
        request.params?.ax_value != nil
}

private func findAXTarget(
    element: AXUIElement,
    request: RuntimeRequest,
    depth: Int,
    maxDepth: Int,
    remainingNodes: inout Int
) -> AXUIElement? {
    guard depth <= maxDepth, remainingNodes > 0 else {
        return nil
    }

    remainingNodes -= 1
    if axElementMatchesTarget(element: element, request: request) {
        return element
    }

    for child in readAXElementArray(element: element, attribute: kAXWindowsAttribute) +
        readAXElementArray(element: element, attribute: kAXChildrenAttribute) {
        if let match = findAXTarget(
            element: child,
            request: request,
            depth: depth + 1,
            maxDepth: maxDepth,
            remainingNodes: &remainingNodes
        ) {
            return match
        }
    }

    return nil
}

private func axElementMatchesTarget(element: AXUIElement, request: RuntimeRequest) -> Bool {
    let role = readAXString(element: element, attribute: kAXRoleAttribute)
    let label = firstNonEmpty([
        readAXString(element: element, attribute: kAXTitleAttribute),
        readAXString(element: element, attribute: kAXDescriptionAttribute),
        readAXString(element: element, attribute: kAXHelpAttribute)
    ])
    let value = readAXString(element: element, attribute: kAXValueAttribute)
    let frame = readAXFrame(element: element)

    if let targetRole = request.params?.ax_role, !targetRole.isEmpty, role != targetRole {
        return false
    }
    if let targetLabel = request.params?.ax_label, !targetLabel.isEmpty, label != targetLabel {
        return false
    }
    if let targetValue = request.params?.ax_value, !targetValue.isEmpty, value != targetValue {
        return false
    }

    return frameMatchesTarget(frame: frame, request: request)
}

private func frameMatchesTarget(
    frame: (x: Int, y: Int, width: Int, height: Int),
    request: RuntimeRequest
) -> Bool {
    guard let x = request.params?.ax_x,
          let y = request.params?.ax_y,
          let width = request.params?.ax_width,
          let height = request.params?.ax_height else {
        return true
    }

    let tolerance = 3.0
    return abs(Double(frame.x) - x) <= tolerance &&
        abs(Double(frame.y) - y) <= tolerance &&
        abs(Double(frame.width) - width) <= tolerance &&
        abs(Double(frame.height) - height) <= tolerance
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
