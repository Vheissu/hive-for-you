declare global {
  interface Window {
    hive_keychain?: {
      requestBroadcast(
        username: string,
        operations: Array<[string, Record<string, unknown>]>,
        authority: 'Posting' | 'Active',
        callback: (response: {
          success: boolean;
          result?: {
            id?: string;
            tx_id?: string;
          };
          error?: string;
          message?: string;
        }) => void,
      ): void;
    };
  }
}

export {};
