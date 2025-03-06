const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
})

const withPWA = require("next-pwa")({
  dest: "public"
})

module.exports = withBundleAnalyzer(
  withPWA({
    reactStrictMode: true,
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "/gcp.json"
    },
    images: {
      remotePatterns: [
        {
          protocol: "http",
          hostname: "localhost"
        },
        {
          protocol: "http",
          hostname: "127.0.0.1"
        },
        {
          protocol: "https",
          hostname: "**"
        }
      ]
    },
    experimental: {
      serverComponentsExternalPackages: ["sharp", "onnxruntime-node"]
    },
    webpack: (config, { isServer }) => {
      if (!isServer) {
        // Polyfills for Node.js core modules used by Google Vertex AI
        config.resolve.fallback = {
          ...config.resolve.fallback,
          http: require.resolve('stream-http'),
          https: require.resolve('https-browserify'),
          zlib: require.resolve('browserify-zlib'),
          stream: require.resolve('stream-browserify'),
          util: require.resolve('util/'),
          url: require.resolve('url/'),
          fs: false,
          net: false,
          tls: false,
          crypto: require.resolve('crypto-browserify'),
          path: require.resolve('path-browserify'),
          assert: require.resolve('assert/'),
          os: require.resolve('os-browserify/browser')
        }
      }
      
      return config
    }
  })
)
