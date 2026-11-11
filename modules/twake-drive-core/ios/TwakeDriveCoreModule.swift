import ExpoModulesCore

public class TwakeDriveCoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TwakeDriveCore")

    AsyncFunction("md5File") { (path: String) throws -> String in
      try md5File(path: path)
    }
  }
}
