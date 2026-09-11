/**
 * Contract for modules that own member data. Registration is intentionally
 * explicit: deletion is not reported complete until every hook has completed.
 */
export type DeletionHookContext = {
  memberId: string;
  requestId: string;
};

export type DeletionHook = {
  name: string;
  run: (context: DeletionHookContext) => Promise<void>;
};

const hooks: DeletionHook[] = [];

export function registerDeletionHook(hook: DeletionHook): void {
  if (hooks.some((registered) => registered.name === hook.name)) {
    throw new Error(`Deletion hook already registered: ${hook.name}`);
  }
  hooks.push(hook);
}

export function listDeletionHooks(): readonly string[] {
  return hooks.map((hook) => hook.name);
}

export async function runDeletionHooks(context: DeletionHookContext): Promise<void> {
  for (const hook of hooks) {
    await hook.run(context);
  }
}