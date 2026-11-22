const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

module.exports = function withXiaomiIslandAppId(config, { appId, debug }) {
  if (!appId) return config;

  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      "com.xiaomi.xms.APP_ID",
      appId,
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      "com.xiaomi.xms.BUILD_TYPE_DEBUG",
      debug ? "true" : "false",
    );
    return mod;
  });
};
