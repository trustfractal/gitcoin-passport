// ---- Test subject
import { FractalIdProvider } from "../src/providers/fractalId";

import { RequestPayload } from "@gitcoin/passport-types";

// ----- Libs
import axios from "axios";
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.unmock("ethers");
const ethers = require("ethers");

const [address, fractalId, approvedAt, validUntil, credentialText] = [
  ethers.Wallet.createRandom().address.toLowerCase(),
  `0x${Math.floor(Math.random() * 1e10).toString(16)}`,
  Math.floor(Date.now() * 1e-3 - Math.random() * 60 * 60 * 24 * 365),
  Math.floor(Date.now() * 1e-3 + Math.random() * 60 * 60 * 24),
  "level:uniqueness;citizenship_not:;residency_not:",
];

const fractalMessage = [address, fractalId, approvedAt, validUntil, credentialText].join(";");

const fractalIssuerWallet = ethers.Wallet.createRandom();

let verifyRequestPayload = { proofs: { address } } as unknown as RequestPayload;

let proof: string;
let fractalIdProvider: FractalIdProvider;
let validFractalResponse: any;

beforeAll(async () => {
  proof = await fractalIssuerWallet.signMessage(fractalMessage);
});

beforeEach(async () => {
  jest.clearAllMocks();

  validFractalResponse = {
    status: 200,
    data: { address, approvedAt, fractalId, proof, validUntil },
  };

  mockedAxios.get.mockImplementation(async (url, config) => validFractalResponse);

  fractalIdProvider = new FractalIdProvider({
    fractalIssuer: fractalIssuerWallet.address,
  });
});

describe("Attempt verification", function () {
  it("valid", async () => {
    const result = await fractalIdProvider.verify(verifyRequestPayload);

    expect(result).toMatchObject({
      valid: true,
      record: {
        fractalUserId: fractalId,
      },
    });
  });

  it("invalid: wrong credential subject", async () => {
    const result = await fractalIdProvider.verify({ proofs: { address: "0x0" } } as unknown as RequestPayload);

    expect(result).toMatchObject({
      valid: false,
      error: ["Wrong credential subject"],
    });
  });

  it("invalid: wrong credential issuer", async () => {
    validFractalResponse.data.proof = await ethers.Wallet.createRandom().signMessage(fractalMessage);

    const result = await fractalIdProvider.verify(verifyRequestPayload);

    expect(result).toMatchObject({
      valid: false,
      error: ["Wrong credential issuer"],
    });
  });

  it("invalid: credential expired", async () => {
    validFractalResponse.data.validUntil = Math.floor(Date.now() * 1e-3) - 1;

    const result = await fractalIdProvider.verify(verifyRequestPayload);

    expect(result).toMatchObject({
      valid: false,
      error: ["Expired credential"],
    });
  });

  it("invalid: not found or pending (404 with variable message)", async () => {
    mockedAxios.isAxiosError.mockImplementation(() => true);
    const error = Math.random().toString();

    mockedAxios.get.mockRejectedValue({ response: { status: 404, data: { error } } });

    const result = await fractalIdProvider.verify(verifyRequestPayload);

    expect(result).toMatchObject({
      valid: false,
      error: [error],
    });
  });
});
