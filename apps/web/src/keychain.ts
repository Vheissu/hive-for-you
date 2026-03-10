export function isKeychainAvailable() {
  return typeof window !== 'undefined' && Boolean(window.hive_keychain);
}

function getKeychain() {
  if (!isKeychainAvailable()) {
    throw new Error('Hive Keychain extension was not detected.');
  }

  return window.hive_keychain!;
}

export function requestVote(voter: string, author: string, permlink: string, weight: number) {
  return new Promise<{ success: boolean; error?: string; txId?: string }>((resolve) => {
    getKeychain().requestBroadcast(
      voter,
      [
        [
          'vote',
          {
            voter,
            author,
            permlink,
            weight,
          },
        ],
      ],
      'Posting',
      (response) => {
        resolve({
          success: response.success,
          txId: response.result?.id ?? response.result?.tx_id,
          error: response.error ?? response.message,
        });
      },
    );
  });
}
