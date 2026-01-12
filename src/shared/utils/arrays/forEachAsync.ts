/**
 * Execute async callback for each item SEQUENTIALLY (one by one).
 *
 * @example
 * ```ts
 * await forEachAsync(users, async (user) => {
 *   await sendEmail(user);
 * });
 * // Emails sent one after another
 * ```
 */
export async function forEachAsync<T>(arr: T[], cb: (item: T, index: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < arr.length; i++) {
    await cb(arr[i], i)
  }
}
