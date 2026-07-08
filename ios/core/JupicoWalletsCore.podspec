Pod::Spec.new do |s|
  s.name         = "JupicoWalletsCore"
  s.version      = "0.1.0"
  s.summary      = "RN-agnostic Apple Pay (PassKit) core. Usable directly from any Swift/ObjC app."
  s.homepage     = "https://github.com/jupico/react-native-wallets"
  s.license      = "MIT"
  s.authors      = { "Jupico" => "dev@jupico.team" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/jupico/react-native-wallets.git", :tag => "core-#{s.version}" }

  # ONLY the core — no React Native. This is the artifact a native-only iOS
  # team adds to their Podfile: pod 'JupicoWalletsCore'.
  s.source_files  = "*.swift"
  s.frameworks    = "PassKit"
  s.swift_version = "5.0"
end
