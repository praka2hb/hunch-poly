https://dev-quote-api.dflow.net/order?userPublicKey=FuWBbL2wz93KKLbkLRheCDdq5eUzh4TBzbxuWJyK54p5&inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&outputMint=D1G7v2HEqFx5vooujgnJ2wgtpMoJu4SxLoRnLHP4a2pf

we are Hitting a Endpoint of order with amount 1000000(1 usdc)
but In response
{
  "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "inAmount": "968460",
  "outputMint": "D1G7v2HEqFx5vooujgnJ2wgtpMoJu4SxLoRnLHP4a2pf",
  "outAmount": "15000000",
  "otherAmountThreshold": "14925000",
  "minOutAmount": "14925000",
  "slippageBps": 50,
  "predictionMarketSlippageBps": 50,
  "platformFee": null,
  "priceImpactPct": "0.0776571428571428571428571429",
  "contextSlot": 389255108,
  "executionMode": "async",
  "revertMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHC9120OD1qp2bJLLOtmwrHZqZto5mi4j4+O7OZQ5QdRWWRoJ4Cn9AjCyskx1illLjsYIkhQ1L0UlvCcO61YSBthVM+BCp8Gbq2CPv3V2YIvT6h2YxSW04ac2v0eDDOSWCyPM+B3rj6PGt9gT6l4cbQjYkh+Hqd8DrsD3pXIJgObk+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpDCYpFm6FJZWj8aHwjmse2FCqMK9iOjIKtXxoPG++WgyMhuv/FuhWX8b0Pxhd1GRtfkCYg199FW1sg22jSqOe6K2K4llPaJbMSnzRjqC5LiVY7J0/M+UyXdxBYsBxdUKoxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWFnowADg6SY1klBkPcu+JChAoXP7FLDLqDBsbqInuL8bwMFAAUCMHUAAAUACQPoAwAAAAAAAAcMBwgJAgMKAQAAAAYEUEAAAAAAAAAAElE5FRPx6dZOAAAAAAAyAAzHDgAAAAAAwOHkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  "lastValidBlockHeight": 367397610,
  "prioritizationFeeLamports": 30,
  "computeUnitLimit": 30000,
  "prioritizationType": {
    "computeBudget": {
      "microLamports": 1000,
      "estimatedMicroLamports": 1000
    }
  },
  "predictionMarketInitPayerMustSign": false
}

so In response you can see the In amount changes to (0.96 usdc)
So I want that entryPrice to be Stored In DB and I dont want tokenAmount and usdcAmount only store the price I have Entered on ie Entry Price 

and For Token Amount