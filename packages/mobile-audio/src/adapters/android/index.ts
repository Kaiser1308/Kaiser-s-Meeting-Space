// P09-T02: Android adapter re-exports
//
// These types document the JSON bridge contract between the
// Android Kotlin native module and the JS layer. They are not
// used at runtime (the native module is accessed via Expo's
// NativeModules proxy), but serve as a reference for the
// serialization format.

export type {
  AndroidConfigureRequest,
  AndroidStartRequest,
  AndroidPauseRequest,
  AndroidResumeRequest,
  AndroidStopRequest,
  AndroidStatusRequest,
  AndroidCancelRequest,
  AndroidOkResponse,
  AndroidErrorResponse,
  AndroidCommandResponse,
  AndroidStatusResponse,
  AndroidCaptureState,
  AndroidChunkEvent,
  AndroidNativeEvent,
  AndroidErrorCode,
} from './types';

export { AndroidErrorCodes } from './types';
