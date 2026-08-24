export const SERVER_BINARY = {
  version: "b9374",
  macos: {
    arm64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-arm64.tar.gz",
      sha256: "cb475c7c15d823008b9a66e13e2716b5cb57d47f7c66b1221902d390c67dc8e8",
    },
    x64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-x64.tar.gz",
      sha256: "4ec614cce05b2ca1db510c0a2ee05f92cc0263b04e71b82b2f77a8a97d99dea9",
    },
  },
} as const
