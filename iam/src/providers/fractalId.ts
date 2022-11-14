// ----- Types
import type { Provider, ProviderOptions } from "../types";
import type { RequestPayload, VerifiedPayload } from "@gitcoin/passport-types";

import axios from "axios";
import { utils as ethersUtils } from "ethers";

export type FractalResponse = {
  address: string;
  approvedAt: number;
  fractalId: string;
  proof: string;
  validUntil: number;
  error: string;
};

export class FractalIdProvider implements Provider {
  // Give the provider a type so that we can select it with a payload
  type = "FractalId";
  // Options can be set here and/or via the constructor
  _options: ProviderOptions = {};

  // construct the provider instance with supplied options
  constructor(options: ProviderOptions = {}) {
    this._options = { ...this._options, ...options };
  }

  async verify(payload: RequestPayload): Promise<VerifiedPayload> {
    const fractalIssuer = this._options.fractalIssuer || "0xacD08d6714ADba531beFF582e6FD5DA1AFD6bc65";
    try {
      const response = await axios.get("https://credentials.fractal.id", {
        params: new URLSearchParams({
          message: payload.proofs.fractalAuthMessage,
          signature: payload.proofs.fractalAuthSignature,
        }),
      });

      const fractalCredential = response.data as FractalResponse;

      const fractalMessage = [
        fractalCredential.address.toLowerCase(),
        fractalCredential.fractalId,
        fractalCredential.approvedAt,
        fractalCredential.validUntil,
        "level:uniqueness;citizenship_not:;residency_not:",
      ].join(";");

      if (fractalCredential.validUntil * 1e3 < Date.now()) {
        throw new Error("Expired credential");
      }

      if (fractalCredential.address.toLowerCase() !== payload.proofs.address.toLowerCase()) {
        throw new Error("Wrong credential subject");
      }

      if (ethersUtils.verifyMessage(fractalMessage, fractalCredential.proof) !== fractalIssuer) {
        throw new Error("Wrong credential issuer");
      }

      return {
        valid: true,
        record: {
          fractalUserId: fractalCredential.fractalId,
        },
      };
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const fractalError = e.response.data as FractalResponse;
        return { valid: false, error: [fractalError.error] };
      } else if (e instanceof Error) {
        return { valid: false, error: [e.message] };
      }

      return { valid: false };
    }
  }
}
