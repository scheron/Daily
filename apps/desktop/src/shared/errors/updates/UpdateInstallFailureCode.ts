/**
 * Reasons the installer script can record when it restores the previous bundle
 * instead of completing the swap. The script writes the code into the failure
 * marker; the renderer turns it into the sentence the person reads.
 */
export enum UpdateInstallFailureCode {
  MountFailed = "MOUNT_FAILED",
  SourceMissing = "SOURCE_MISSING",
  CopyFailed = "COPY_FAILED",
  CopyIncomplete = "COPY_INCOMPLETE",
  InstalledBundleUnusable = "INSTALLED_BUNDLE_UNUSABLE",
  Interrupted = "INTERRUPTED",
}
