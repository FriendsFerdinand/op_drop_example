# Summary

The ScriptPubKey of a P2PKH looks like this:
```
OP_DUP OP_HASH160 <RecipientPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
```

However, we can turn it into a P2SH script and add data into the script itself. The Stacks node would need to be notified of the data inserted into the script
to be able to detect that this is a peg-in transaction. The script looks like this:
```
<DATA> OP_DROP OP_DUP OP_HASH160 <RecipientPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
```

The code goes through the process of sending Bitcoin to a public key address with additional data. Then, the user claims the funds sent to the owner of
the private key of the RecipientPubKey.

The user sending funds to the RecipientPubKey, only needs to be aware fo the P2SH address.
The recipient (in our case, the sBTC signers/Stacks nodes), need to be notified of the added data to verify that funds were sent to their address with
the added data.

# How to Run

Install dependencies:
```
pnpm i
```

Run script:
```
pnpm start
```
