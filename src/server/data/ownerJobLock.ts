const activeOwnerJobs = new Set<string>();

export function tryAcquireOwnerJob(ownerUserId: string): boolean {
  if (activeOwnerJobs.has(ownerUserId)) return false;
  activeOwnerJobs.add(ownerUserId);
  return true;
}

export function releaseOwnerJob(ownerUserId: string): void {
  activeOwnerJobs.delete(ownerUserId);
}
