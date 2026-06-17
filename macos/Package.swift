// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "OperelRuntime",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "OperelRuntime", targets: ["OperelRuntime"]),
        .library(name: "OperelRuntimeCore", targets: ["OperelRuntimeCore"])
    ],
    targets: [
        .target(name: "OperelRuntimeCore"),
        .executableTarget(
            name: "OperelRuntime",
            dependencies: ["OperelRuntimeCore"]
        )
    ]
)
