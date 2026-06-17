import Foundation
import OperelRuntimeCore

let handler = RuntimeRequestHandler(version: "0.1.0")

while let line = readLine() {
    do {
        print(try handler.handleLine(line))
        fflush(stdout)
    } catch {
        let escapedMessage = String(describing: error)
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        print("""
        {"jsonrpc":"2.0","id":"unknown","error":{"code":"invalid_request","message":"\(escapedMessage)"}}
        """)
        fflush(stdout)
    }
}
