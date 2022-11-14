// --- React Methods
import React, { useContext, useState, useEffect } from "react";

// --- Datadog
import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";

// --- Identity tools
import { fetchVerifiableCredential } from "@gitcoin/passport-identity/dist/commonjs/src/credentials";

// --- pull context
import { CeramicContext } from "../../context/ceramicContext";
import { UserContext } from "../../context/userContext";

// --- Platform definitions
import { getPlatformSpec } from "../../config/platforms";
import { STAMP_PROVIDERS } from "../../config/providers";

// --- Verification step tools
import QRCode from "react-qr-code";

// --- import components
import { SideBarContent } from "../SideBarContent";
import { DoneToastContent } from "../DoneToastContent";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  useDisclosure,
  useToast,
  Spinner,
} from "@chakra-ui/react";

// ---- Types
import {
  PROVIDER_ID,
  Stamp,
  VerifiableCredential,
  VerifiableCredentialRecord,
  PLATFORM_ID,
  CredentialResponseBody,
} from "@gitcoin/passport-types";

import { useConnectWallet } from "@web3-onboard/react";

const iamUrl = process.env.NEXT_PUBLIC_PASSPORT_IAM_URL || "";

// Each provider is recognised by its ID
const platformId: PLATFORM_ID = "FractalId";

// TODO change app name and ID
const fractalAuthMessage = [
  "I authorize Defistarter (GKYNcHbtCZ6S315O8zBTgxptvMqy4LIPsnI4EEmj_8c) to get a proof from Fractal that:",
  "- I passed KYC level uniqueness",
].join("\n");

export default function FractalIdPlatform(): JSX.Element {
  const [{ wallet }, connect, disconnect] = useConnectWallet();
  const { address, signer } = useContext(UserContext);
  const { handleAddStamps, allProvidersState, userDid } = useContext(CeramicContext);
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);

  const providerIds =
    STAMP_PROVIDERS["FractalId"]?.reduce((all, stamp) => {
      return all.concat(stamp.providers?.map((provider) => provider.name as PROVIDER_ID));
    }, [] as PROVIDER_ID[]) || [];

  const [verifiedProviders, setVerifiedProviders] = useState<PROVIDER_ID[]>(
    providerIds.filter((providerId) => typeof allProvidersState[providerId]?.stamp?.credential !== "undefined")
  );
  const [selectedProviders, setSelectedProviders] = useState<PROVIDER_ID[]>([...verifiedProviders]);

  useEffect(() => {
    if (selectedProviders.length !== verifiedProviders.length) {
      setCanSubmit(true);
    }
  }, [selectedProviders, verifiedProviders]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const handleFetchCredential = async (): void => {
    setLoading(true);

    const address = wallet.accounts[0].address;

    let signatureResponse;
    try {
      signatureResponse = await wallet.provider.send(
        "personal_sign",
        [fractalAuthMessage, address],
      );
    } catch (e) {
      // TODO error handling
      console.log(e);
    }

    fetchVerifiableCredential(
      iamUrl,
      {
        type: platformId,
        types: selectedProviders,
        version: "0.0.0",
        address: address ?? "",
        proofs: {
          fractalAuthMessage,
          address: address,
          fractalAuthSignature: signatureResponse.result,
        },
      },
      signer  as { signMessage: (message: string) => Promise<string> },
    ).then(async (verified: VerifiableCredentialRecord): Promise<void> => {
      console.log(verified);

      // TODO error handling
      switch(verified.credentials[0].error) {
        case "invalid_message_schema":
          console.log("invalid_message_schema, ABORT");
          break;
        case "user_not_found":
          console.log(`user_not_found, please come to fractal with address ${address}`);
          break;
        case "user_pending":
          console.log("user_pending, please try again later");
          break;
      }

      const vcs =
        verified.credentials
          ?.map((cred: CredentialResponseBody): Stamp | undefined => {
            if (!cred.error) {
              // add each of the requested/received stamps to the passport...
              return {
                provider: cred.record?.type as PROVIDER_ID,
                credential: cred.credential as VerifiableCredential,
              };
            }
          })
          .filter((v: Stamp | undefined) => v) || [];

      await handleAddStamps(vcs as Stamp[]);

      const actualVerifiedProviders = providerIds.filter(
        (providerId) =>
          !!vcs.find((vc: Stamp | undefined) => vc?.credential?.credentialSubject?.provider === providerId)
      );

      setCanSubmit(false);
      setLoading(false);

      toast({
        duration: 5000,
        isClosable: true,
        render: (result) => <DoneToastContent platformId={platformId} result={result} />,
      });

    })
    .catch((e: any): void => {
      setSelectedProviders([]);
    })
    .finally((): void => {
      setLoading(false);
    });
  };

  return (
    <SideBarContent
      currentPlatform={getPlatformSpec(platformId)}
      currentProviders={STAMP_PROVIDERS[platformId]}
      verifiedProviders={verifiedProviders}
      selectedProviders={selectedProviders}
      setSelectedProviders={setSelectedProviders}
      isLoading={isLoading}
      verifyButton={
        <button
          disabled={!canSubmit}
          onClick={handleFetchCredential}
          data-testid="button-verify-fractalid"
          className="sidebar-verify-btn"
        >
          Verify
        </button>
      }
    />
  );
}
