# Canonical Homebrew formula template for aish.
#
# This file is the source of truth. The release workflow renders it (filling in
# the version and per-platform SHA256s) and pushes the result to
# byteink/homebrew-tap as Formula/aish.rb. The placeholders below are replaced
# by scripts/render-formula.ts; do not hand-edit them.
class Aish < Formula
  desc "AI shell assistant that turns natural language into shell commands"
  homepage "https://github.com/byteink/aish"
  version "__VERSION__"
  license "Elastic-2.0"

  on_macos do
    on_arm do
      url "https://github.com/byteink/aish/releases/download/v__VERSION__/aish_Darwin_arm64.tar.gz"
      sha256 "__SHA_DARWIN_ARM64__"
    end
    on_intel do
      url "https://github.com/byteink/aish/releases/download/v__VERSION__/aish_Darwin_x86_64.tar.gz"
      sha256 "__SHA_DARWIN_X86_64__"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/byteink/aish/releases/download/v__VERSION__/aish_Linux_x86_64.tar.gz"
      sha256 "__SHA_LINUX_X86_64__"
    end
  end

  def install
    bin.install "ai"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ai --version")
  end
end
