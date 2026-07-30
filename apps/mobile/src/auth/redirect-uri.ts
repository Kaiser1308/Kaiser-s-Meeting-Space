export function createAuthRedirectUri(createURL: (path: string) => string): string {
  return createURL('oauth/callback');
}
