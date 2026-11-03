# The source of Casks/markdn.rb. Edit this file, not that one: the release
# workflow's cask job renders it into Casks/markdn.rb once a release's DMGs are
# published, filling in @VERSION@, both @*_SHA@ checksums and both @*_ARCH@
# segments (Tauri decides the Intel one: `x64` or `x86_64`). Until a release
# renders it, Casks/markdn.rb keeps describing the release already published.
cask "markdn" do
  version "@VERSION@"

  on_arm do
    sha256 "@ARM_SHA@"

    url "https://github.com/filipecabaco/markdn/releases/download/v#{version}/markdn_#{version}_@ARM_ARCH@.dmg",
        verified: "github.com/filipecabaco/markdn/"
  end
  on_intel do
    sha256 "@INTEL_SHA@"

    url "https://github.com/filipecabaco/markdn/releases/download/v#{version}/markdn_#{version}_@INTEL_ARCH@.dmg",
        verified: "github.com/filipecabaco/markdn/"
  end

  name "markdn"
  desc "Markdown and MDX viewer and editor with a built-in MCP server"
  homepage "https://github.com/filipecabaco/markdn"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "markdn.app"
  # `markdn notes.md` opens a document in the app, `markdn ~/notes` a folder.
  binary "#{appdir}/markdn.app/Contents/Resources/cli/markdn"

  # markdn ships unsigned (no Apple Developer ID yet). Homebrew quarantines
  # downloaded artifacts and Gatekeeper then refuses to open an unsigned,
  # un-notarized app ("markdn is damaged and can't be opened"). Strip the
  # quarantine attribute on install so it launches. Remove this block once the DMG
  # is signed and notarized in CI.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/markdn.app"],
                   sudo: false
  end

  uninstall quit: "app.markdn.desktop"

  zap trash: [
    "~/Library/Application Support/app.markdn.desktop",
    "~/Library/Caches/app.markdn.desktop",
    "~/Library/Preferences/app.markdn.desktop.plist",
    "~/Library/Saved Application State/app.markdn.desktop.savedState",
    "~/Library/WebKit/app.markdn.desktop",
  ]

  caveats <<~EOS
    Open documents from a terminal with `markdn notes.md`, or a folder with
    `markdn ~/notes`.

    markdn serves its UI and an MCP server on 127.0.0.1:43118 while the app is
    running. To let an agent read and write the documents you have open, point an
    MCP client at:

      http://localhost:43118/mcp

    By default it can only touch markdown under your home directory. Narrow that
    by launching with MARKDN_ROOT set to the directory you want it confined to.
  EOS
end
