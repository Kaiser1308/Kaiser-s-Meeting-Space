import { useEffect, useState } from 'react';

export interface NetworkStatusSource {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export function useNetworkStatus(source: NetworkStatusSource): { online: boolean } {
  const [online, setOnline] = useState(source.isOnline());
  useEffect(() => source.subscribe(setOnline), [source]);
  return { online };
}
