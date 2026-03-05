// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const resolveRequestWithPackageExports = (context, moduleName, platform) => {
  // Package exports in `jose` are incorrect, so we need to force the browser version
  if (moduleName === "jose") {
    const ctx = {
      ...context,
      unstable_conditionNames: ["browser"],
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  // Shim Node's `crypto` module for @polymarket/builder-signing-sdk
  // (HMAC signing happens server-side; client only needs BuilderConfig)
  if (moduleName === "crypto") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "lib", "crypto-shim.js"),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.resolveRequest = resolveRequestWithPackageExports;

// Add CSS support for NativeWind
config.resolver.sourceExts = [...config.resolver.sourceExts, "css"];

module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: 16
});

