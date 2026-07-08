require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "JupicoWallets"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/jupico/react-native-wallets"
  s.license      = package["license"]
  s.authors      = { "Jupico" => "dev@jupico.team" }

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/jupico/react-native-wallets.git", :tag => "#{s.version}" }

  # Ships BOTH the RN bridge (ios/bridge) and the RN-agnostic Apple Pay core (ios/core).
  # Native-only apps can instead depend on the standalone `JupicoWalletsCore` pod (see ios/core).
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.frameworks   = "PassKit"
  s.swift_version = "5.0"

  # Pulls in React-Core, codegen, etc. and enables New Architecture support.
  install_modules_dependencies(s)
end
