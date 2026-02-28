To implement a copy trading engine where your server executes transactions for a user, you can use Privy's **signers** feature. This allows you to designate your server as a signer on a user's wallet, granting it permission to execute transactions on their behalf.

As described in the "Enabling users or servers to execute transactions" and "Delegating permissions" pages, the user remains the owner of the wallet, while your server, as a signer, can initiate transactions even when the user is offline. This is ideal for a copy trading scenario.

Here are some pages that may help:
```suggestions
(Enabling users or servers to execute transactions)[/recipes/wallets/user-and-server-signers]
(Delegating permissions)[/transaction-management/setups/delegation]
(Signers Overview)[/wallets/using-wallets/signers/overview]
```