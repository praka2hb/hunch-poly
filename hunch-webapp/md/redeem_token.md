> ## Documentation Index
> Fetch the complete documentation index at: https://pond.dflow.net/llms.txt
> Use this file to discover all available pages before exploring further.

# Redeem Outcome Tokens

> How to redeem determined outcome tokens

<Info>
  During development, you can use the [developer endpoints](/build/endpoints)
  without an API key. For production use, you'll need an
  [API key](/build/api-key) to avoid rate limits.
</Info>

Redeem outcome tokens after a market is determined and funded for redemption by trading expired outcome tokens back into the stablecoin you opened your position with.

<Steps>
  <Step title="Check if Outcome Token is Redeemable">
    Use the [`/api/v1/market/by-mint/{mint_address}`](/metadata-api/markets/market-by-mint) endpoint to fetch market details and verify that the outcome token is redeemable. A token is redeemable when:

    * The market status is `"determined"` or `"finalized"`
    * The redemption status for the settlement mint is `"open"`
    * Either:
      * The market result (`"yes"` or `"no"`) matches the user's outcome token (the outcome mint must match the `yesMint` or `noMint` for the determined side), OR
      * The market result is empty (`""`) and `scalarOutcomePct` is defined (rare edge case - see note below)

    <Note>
      **Edge Case: Scalar Outcome Payouts**

      In rare cases, a market may have `redemptionStatus = "open"` but `result = ""` (no result defined). In this scenario, use `scalarOutcomePct` to determine the payout:

      * `scalarOutcomePct` represents the payout percentage for YES tokens in basis points (0-10000, where 10000 = 100%)
      * YES token payout = `scalarOutcomePct / 10000`
      * NO token payout = `(10000 - scalarOutcomePct) / 10000`

      Example: If `scalarOutcomePct = 5000`, then:

      * YES tokens redeem for 50% (5000/10000 = 0.5)
      * NO tokens redeem for 50% ((10000-5000)/10000 = 0.5)

      Both YES and NO tokens are redeemable in this case.
    </Note>

    <AccordionGroup>
      <Accordion title="Check Redemption Eligibility">
        ```typescript  theme={null}
        /// Base URL for the DFlow Prediction Market Metadata API
        const METADATA_API_BASE_URL = "https://dev-prediction-markets-api.dflow.net";

        /// Settlement mint constant (USDC)
        /// If you only support one settlement mint, use this constant
        const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

        /// Outcome token mint address (YES or NO token)
        const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS_HERE";

        /// Fetch market details by mint address
        const response = await fetch(
          `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${outcomeMint}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch market details");
        }

        const market = await response.json();

        /// Check if market is determined (status can be "determined" or "finalized")
        if (market.status !== "determined" && market.status !== "finalized") {
          throw new Error(`Market is not determined. Current status: ${market.status}`);
        }

        /// Check if the outcome mint matches the market result
        /// The result can be "yes", "no", or "" (empty string for scalar outcomes)
        const result = market.result; // "yes", "no", or ""
        let isDeterminedOutcome = false;
        let settlementMint;

        /// Option 1: Use a constant settlement mint (e.g., USDC)
        /// If you only support one settlement mint, use this approach
        if (market.accounts[USDC_MINT]) {
          const usdcAccount = market.accounts[USDC_MINT];

          /// Check if redemption is open
          if (usdcAccount.redemptionStatus === "open") {
            /// Case 1: Standard determined outcome (result is "yes" or "no")
            if (result === "yes" || result === "no") {
              if (
                (result === "yes" && usdcAccount.yesMint === outcomeMint) ||
                (result === "no" && usdcAccount.noMint === outcomeMint)
              ) {
                isDeterminedOutcome = true;
                settlementMint = USDC_MINT;
              }
            }
            /// Case 2: Scalar outcome (result is empty, use scalarOutcomePct)
            /// In this rare case, both YES and NO tokens are redeemable
            else if (
              result === "" &&
              usdcAccount.scalarOutcomePct !== null &&
              usdcAccount.scalarOutcomePct !== undefined
            ) {
              /// Both YES and NO tokens are redeemable when scalarOutcomePct is defined
              if (
                usdcAccount.yesMint === outcomeMint ||
                usdcAccount.noMint === outcomeMint
              ) {
                isDeterminedOutcome = true;
                settlementMint = USDC_MINT;

                /// Calculate payout percentages for display/logging
                const yesPayoutPct = usdcAccount.scalarOutcomePct / 10000;
                const noPayoutPct = (10000 - usdcAccount.scalarOutcomePct) / 10000;
                console.log(
                  `Scalar outcome detected. YES payout: ${
                    yesPayoutPct * 100
                  }%, NO payout: ${noPayoutPct * 100}%`
                );
              }
            }
          } else {
            throw new Error(`Redemption is not open for ${outcomeMint}`);
          }
        }

        /// Option 2: Find settlement mint dynamically (if you support multiple)
        /// Uncomment this if you need to support multiple settlement mints
        /*
        if (!settlementMint) {
          for (const [mint, account] of Object.entries(market.accounts)) {
            if (account.redemptionStatus === "open") {
              /// Case 1: Standard determined outcome
              if (result === "yes" || result === "no") {
                if (result === "yes" && account.yesMint === outcomeMint) {
                  isDeterminedOutcome = true;
                  settlementMint = mint;
                  break;
                } else if (result === "no" && account.noMint === outcomeMint) {
                  isDeterminedOutcome = true;
                  settlementMint = mint;
                  break;
                }
              }
              /// Case 2: Scalar outcome (both YES and NO are redeemable)
              else if (result === "" && account.scalarOutcomePct !== null && account.scalarOutcomePct !== undefined) {
                if (account.yesMint === outcomeMint || account.noMint === outcomeMint) {
                  isDeterminedOutcome = true;
                  settlementMint = mint;
                  break;
                }
              }
            } else {
              throw new Error(`Redemption is not open for ${outcomeMint}`);
            }
          }
        }
        */

        if (!isDeterminedOutcome) {
          if (result === "") {
            throw new Error(
              `Outcome token does not match any outcome mint for this market. Token: ${outcomeMint}`
            );
          } else {
            throw new Error(
              `Outcome token does not match market result. Market result: ${result}, Token: ${outcomeMint}`
            );
          }
        }

        if (!settlementMint) {
          throw new Error("No settlement mint with open redemption status found");
        }

        const settlementAccount = market.accounts[settlementMint];

        console.log("Token is redeemable!", {
          outcomeMint,
          settlementMint,
          redemptionStatus: settlementAccount.redemptionStatus,
          marketTitle: market.title,
        });
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Request Redemption Order">
    Use the Trade API [`/order`](/trading-api/order/order) endpoint to request a redemption order. The redemption is treated as a trade where you swap your outcome token for the settlement stablecoin.

    <AccordionGroup>
      <Accordion title="Request Redemption Order">
        ```typescript  theme={null}
        /// Base URL for the DFlow Trade API
        const API_BASE_URL = "https://dev-quote-api.dflow.net";

        /// Settlement mint constant (USDC)
        const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

        /// Outcome token mint (YES or NO token you hold)
        const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS_HERE";

        /// Settlement mint (use the constant or the value found in Step 1)
        const settlementMint = USDC_MINT;

        /// Amount of outcome tokens to redeem. Outcome tokens always have 6 decimals.
        const amount = 1000000; // Example: 1 outcome token (6 decimals)

        /// User's public key
        const userPublicKey = keypair.publicKey.toBase58();

        const queryParams = new URLSearchParams();
        queryParams.append("userPublicKey", userPublicKey);
        queryParams.append("inputMint", outcomeMint);
        queryParams.append("outputMint", settlementMint);
        queryParams.append("amount", amount.toString());

        const orderResponse = await fetch(
          `${API_BASE_URL}/order?${queryParams.toString()}`
        ).then((x) => x.json());

        console.log(
          `Redemption order received! ${orderResponse.inAmount} of ${orderResponse.inputMint} is redeemable for ${orderResponse.outAmount} of ${orderResponse.outputMint}`
        );
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Determine Event Outcome">
    Wait for the settlement authority to write the outcome into the
    **Market Ledger**. You cannot redeem until the outcome is determined.

    <img alt="Determine Event Outcome" className="mx-auto" noZoom src="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=ddc2eb8d8392875b56d7cab621a7116b" data-og-width="1273" width="1273" data-og-height="348" height="348" data-path="images/prediction/Determine Outcome.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=280&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=72bf2fdcc711bf74dd2562cdcae41e9c 280w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=560&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=ea87fad876cb7f177e090ec0b8a6d860 560w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=840&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=1baeb5e1ec359193741ca5e7dbd11f49 840w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=1100&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=eeedc516ec2407245a55fa32cda8c8a2 1100w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=1650&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=70d49ad4933edc1a8506f8438fc2999a 1650w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Determine%20Outcome.png?w=2500&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=4fd0d861ed2d87c6e3a9b04f48a3856f 2500w" />

    <AccordionGroup>
      <Accordion title="Check Outcome Status">
        ```typescript  theme={null}
        const METADATA_API_BASE_URL = "https://dev-prediction-markets-api.dflow.net";
        const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS";

        const market = await fetch(
          `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${outcomeMint}`
        ).then((x) => x.json());

        if (market.status === "determined" || market.status === "finalized") {
          console.log("Outcome determined");
        } else {
          console.log("Outcome not determined yet");
        }
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Fund Outcome">
    Wait for the settlement authority to fund redemption by moving
    stablecoins from the **Settlement Vault** to the **Redemption Vault**.

    <img alt="Fund Outcome" className="mx-auto" noZoom src="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=4a559ad5fc4d4519a7879a2ec2fe9483" data-og-width="1227" width="1227" data-og-height="598" height="598" data-path="images/prediction/Fund Outcome.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=280&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=889a3248cca843221e9c3e3b12bdca6d 280w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=560&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=043d135be82f35fd2b2d45e4b76c0b76 560w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=840&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=0d8c8a7c75a2412f70e9c7607dd92f03 840w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=1100&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=c16003295f2dc3108d922aab91862df4 1100w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=1650&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=4ac41cfbf25213ef5469aa34278b7da6 1650w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Fund%20Outcome.png?w=2500&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=905ebf48c496d150ddb121c77363801e 2500w" />

    <AccordionGroup>
      <Accordion title="Check Redemption Funding">
        ```typescript  theme={null}
        const settlementAccount = market.accounts?.[market.settlementMint];

        if (settlementAccount?.redemptionStatus === "open") {
          console.log("Redemption funded");
        } else {
          console.log("Redemption not funded yet");
        }
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Request Redemption Order">
    Redeem your expired outcome tokens into the settlement
    stablecoin using the Trade API.

    <img alt="Redeem Payouts" className="mx-auto" noZoom src="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=e964edcdfd3400820ff467f6e6f9bf47" data-og-width="1006" width="1006" data-og-height="596" height="596" data-path="images/prediction/Redeem.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=280&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=3801f36e7c5c21cb33cc60b4e00bad02 280w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=560&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=6c1dd08c8930a3e978de2bd778c45c52 560w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=840&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=161860eec672869a871268d19e3a033d 840w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=1100&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=055ea019918edc69db02d4e35969113d 1100w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=1650&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=716b687ff91fd0db46f907be02c20ab7 1650w, https://mintcdn.com/dflow/CxrIQMjWZhe4p262/images/prediction/Redeem.png?w=2500&fit=max&auto=format&n=CxrIQMjWZhe4p262&q=85&s=5fc7825d1ba670b3b68d2a01b9a96244 2500w" />

    <AccordionGroup>
      <Accordion title="Request Redemption Order">
        ```typescript  theme={null}
        const API_BASE_URL = "https://dev-quote-api.dflow.net";
        const API_KEY = process.env.DFLOW_API_KEY; // Optional

        const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS";
        const settlementMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
        const amount = 1_000_000; // 1 outcome token (6 decimals)

        const queryParams = new URLSearchParams();
        queryParams.append("inputMint", outcomeMint);
        queryParams.append("outputMint", settlementMint);
        queryParams.append("amount", amount.toString());
        queryParams.append("userPublicKey", keypair.publicKey.toBase58());

        const headers: HeadersInit = {};
        if (API_KEY) {
          headers["x-api-key"] = API_KEY;
        }

        const orderResponse = await fetch(
          `${API_BASE_URL}/order?${queryParams.toString()}`,
          { headers }
        ).then((x) => x.json());
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Sign and Submit the Transaction">
    Submit the redemption order transaction so the Trade API can execute the
    payout onchain.

    <AccordionGroup>
      <Accordion title="Sign and Submit the Transaction">
        ```typescript  theme={null}
        const transactionBuffer = Buffer.from(orderResponse.transaction, "base64");
        const transaction = VersionedTransaction.deserialize(transactionBuffer);

        transaction.sign([keypair]);
        const signature = await connection.sendTransaction(transaction);
        ```
      </Accordion>
    </AccordionGroup>
  </Step>

  <Step title="Monitor Order Status">
    Track the order until it closes so you can confirm the redemption was
    finalized.

    <AccordionGroup>
      <Accordion title="Monitor Order Status">
        ```typescript  theme={null}
        const statusResponse = await fetch(
          `${API_BASE_URL}/order-status?signature=${signature}`,
          { headers }
        ).then((x) => x.json());

        console.log(statusResponse.status, statusResponse.fills);
        ```
      </Accordion>
    </AccordionGroup>
  </Step>
</Steps>