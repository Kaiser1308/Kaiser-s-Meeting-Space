import { useState, useEffect, useCallback } from 'react';
import type {
  RecoveryInbox,
  IncompleteSession,
  RecoveryAction,
  ActionResult,
} from '@kms/local-recovery';

export type RecoveryInboxState = {
  sessions: IncompleteSession[];
  loading: boolean;
  error: string | null;
};

export function useRecoveryInbox(recoveryInbox: RecoveryInbox) {
  const [state, setState] = useState<RecoveryInboxState>({
    sessions: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const sessions = await recoveryInbox.discover();
      setState({ sessions, loading: false, error: null });
    } catch (err) {
      setState({ sessions: [], loading: false, error: String(err) });
    }
  }, [recoveryInbox]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getActions = useCallback(
    (session: IncompleteSession): RecoveryAction[] => {
      return recoveryInbox.getActions(session);
    },
    [recoveryInbox],
  );

  const executeAction = useCallback(
    async (action: RecoveryAction, confirmed?: boolean): Promise<ActionResult> => {
      const result = await recoveryInbox.executeAction(action, confirmed);
      if (result.success) await refresh();
      return result;
    },
    [recoveryInbox, refresh],
  );

  return { ...state, refresh, getActions, executeAction };
}
