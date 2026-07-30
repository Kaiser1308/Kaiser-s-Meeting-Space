// The Android Gradle/Expo commands may execute from the workspace root.
// Delegate to the mobile-owned config so the app root cannot drift.
module.exports = require('./apps/mobile/metro.config');
