require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "JupicoReactNativeWallets"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/ginoscaleit/jupico-sdk"
  s.license      = package["license"]
  s.authors      = { "Jupico" => "dev@jupico.team" }

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/ginoscaleit/jupico-sdk.git", :tag => "rn-#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.frameworks   = "PassKit"
  s.swift_version = "5.0"

  install_modules_dependencies(s)
end
