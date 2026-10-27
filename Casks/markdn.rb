cask "markdn" do
  version "0.2.0"

  # Placeholder checksums. The release workflow's cask job rewrites version, both
  # sha256 stanzas and both URL architecture segments once the DMGs are published;
  # verify-cask.sh treats all-zeros as "no release yet" and skips it.
  on_arm do
    sha256 "5b7108406a50d5990e1c670cb76680345d16c1d30ec9be7c992aeff4bca8936d"

    url "https://github.com/filipecabaco/markdn/releases/download/v#{version}/MarkDN_#{version}_aarch64.dmg",
        verified: "github.com/filipecabaco/markdn/"
  end
  on_intel do
    sha256 "bec50b982cf2d1b85cc00cdd3c1ddea5ac8eab110812fb60e22b8c90fed5e56e"

    url "https://github.com/filipecabaco/markdn/releases/download/v#{version}/MarkDN_#{version}_x64.dmg",
        verified: "github.com/filipecabaco/markdn/"
  end

  name "MarkDN"
  desc "Markdown and MDX viewer and editor with a built-in MCP server"
  homepage "https://github.com/filipecabaco/markdn"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "MarkDN.app"

  # MarkDN ships unsigned (no Apple Developer ID yet). Homebrew quarantines
  # downloaded artifacts and Gatekeeper then refuses to open an unsigned,
  # un-notarized app ("MarkDN is damaged and can't be opened"). Strip the
  # quarantine attribute on install so it launches. Remove this block once the DMG
  # is signed and notarized in CI.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/MarkDN.app"],
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
    MarkDN serves its UI and an MCP server on 127.0.0.1:43118 while the app is
    running. To let an agent read and write the documents you have open, point an
    MCP client at:

      http://localhost:43118/mcp

    By default it can only touch markdown under your home directory. Narrow that
    by launching with MARKDN_ROOT set to the directory you want it confined to.
  EOS
end
