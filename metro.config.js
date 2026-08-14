// Android Gradle/Expo commands may resolve this workspace-level config first.
// The mobile config already owns projectRoot; returning it unchanged prevents
// Expo's Windows config loader from attempting to re-import an absolute path.
module.exports = require('./apps/mobile/metro.config');
