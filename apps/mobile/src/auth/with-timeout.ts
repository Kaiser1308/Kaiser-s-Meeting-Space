/** Wrap a promise with a timeout; rejects if the operation does not settle in time. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'operation timed out',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
