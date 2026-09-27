export interface CapabilityProvider {
  id: string;
  capabilities: string[];
  priority?: number;
  available(): Promise<boolean>;
}

export class CapabilityRegistry {
  private providers = new Map<string, CapabilityProvider>();

  register(provider: CapabilityProvider) {
    if (this.providers.has(provider.id)) throw new Error(`Capability provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  async resolve(capability: string) {
    const candidates = [...this.providers.values()]
      .filter((provider) => provider.capabilities.includes(capability))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const provider of candidates) if (await provider.available()) return provider;
    return undefined;
  }

  async discover() {
    const result: Record<string, string[]> = {};
    for (const provider of this.providers.values()) {
      if (await provider.available()) result[provider.id] = [...provider.capabilities];
    }
    return result;
  }
}
