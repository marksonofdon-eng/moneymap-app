export type CapabilityAddress = {
  line1: string;
  line2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  lat: number | null;
  lng: number | null;
};

export type CapabilityAccessOption = {
  accessFamily: "NBN" | "FIVE_G" | "STARLINK";
  connectionType:
    | "FTTP"
    | "FTTN"
    | "FTTC"
    | "HFC"
    | "FIXED_WIRELESS"
    | "FIVE_G_WIRELESS"
    | null;
  available: boolean;
  maxDownMbps: number | null;
  maxUpMbps: number | null;
  typicalEveningMbps: number | null;
  confidence: number;
  notes: string | null;
};

export type CapabilityProviderResult = {
  provider: string;
  checkedAt: Date;
  rawPayload: Record<string, unknown>;
  options: CapabilityAccessOption[];
};

export interface CapabilityProvider {
  readonly key: string;
  assess(address: CapabilityAddress): Promise<CapabilityProviderResult>;
}

/**
 * Temporary E2E provider. Every valid Stage 2 address is assumed to support
 * NBN HFC. Replace this implementation behind the interface when real
 * serviceability sources are available.
 */
export class StubHfcCapabilityProvider implements CapabilityProvider {
  readonly key = "stub-hfc-v1";

  async assess(
    address: CapabilityAddress,
  ): Promise<CapabilityProviderResult> {
    return {
      provider: this.key,
      checkedAt: new Date(),
      rawPayload: {
        stub: true,
        assumption: "All captured addresses have NBN HFC available",
        postcode: address.postcode,
      },
      options: [
        {
          accessFamily: "NBN",
          connectionType: "HFC",
          available: true,
          maxDownMbps: 1000,
          maxUpMbps: 50,
          typicalEveningMbps: 100,
          confidence: 100,
          notes: "Stage 3 E2E assumption; not a live NBN serviceability result.",
        },
      ],
    };
  }
}

export const capabilityProvider: CapabilityProvider =
  new StubHfcCapabilityProvider();
