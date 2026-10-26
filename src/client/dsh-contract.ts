import type { ComponentType } from 'react';

/** Narrow adapter for the documented DSH 0.2.1 client registration surface. */
export interface DshClientContext {
  slots: {
    inject(name: string, setup: () => (() => void)): unknown;
    register<Props>(options: Record<string, unknown>, component: ComponentType<Props>): () => void;
  };
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
    bind(namespace: string): (key: string) => string;
  };
  effect(setup: () => (() => void), label?: string): unknown;
}
