import { payments, script as bScript, networks, Psbt, address as bAddress, crypto } from 'bitcoinjs-lib';
import { generateRandomBitcoinSigner } from './util.js';
import { blockchainRequest, opDropASM } from "./bitcoin.js";

(async function () {
  const network = networks.regtest;

  const pegInUser = generateRandomBitcoinSigner(network);
  const recipientBtcSigner = generateRandomBitcoinSigner(network);
  const nextAddress = generateRandomBitcoinSigner(network);

  const senderPayment = payments.p2pkh({ pubkey: pegInUser.publicKey, network });
  const nextAddressPayment = payments.p2pkh({ pubkey: nextAddress.publicKey, network });

  let blocks = await blockchainRequest("generatetoaddress", [101, senderPayment.address]);
  let block = await blockchainRequest("getblock", [blocks[0]]);
  let tx = await blockchainRequest("getrawtransaction", [block.tx[0], true]);

  const data = Buffer.from("0000000000000000000000000000000000000000","hex");

  // Generating asm of Bitcoin script
  // @params
  // hash of a Stacks address or contract
  // public key of the recipient (in case of sBTC, the shared wallet)
  // FORMAT: `<data> OP_DROP OP_DUP OP_HASH160 <recipientPublicKey> OP_EQUALVERIFY OP_CHECKSIG`
  let asm = opDropASM(data, crypto.hash160(recipientBtcSigner.publicKey));

  const script = bScript.fromASM(asm);
  const payment = payments.p2sh({ redeem: { output: script, network }, network });
  console.log(payment.address);

  let hash = bAddress.fromBase58Check(senderPayment.address!).hash.toString("hex");
  let unspentTxout = tx.vout.filter((val: any) => val.scriptPubKey.hex.match(senderPayment.hash?.toString("hex")));

  const fundingAmount = 100_000_000;
  
  // Sending to shared public key
  // Wallet only need to be aware of the address to send funds with the data attached
  let psbt = new Psbt({ network });
  psbt.addInput({
    hash: tx.txid,
    index: 0,
    nonWitnessUtxo: Buffer.from(tx.hex, "hex"),
  });
  psbt.addOutput({
    address: payment.address!,
    value: fundingAmount
  });
  psbt.addOutput({
    address: payment.address!,
    value: unspentTxout[0].value * 100_000_000 - (fundingAmount + 10_000),
  });
  psbt.signInput(0, pegInUser);
  psbt.finalizeInput(0);

  let result = await blockchainRequest('sendrawtransaction', [psbt.extractTransaction(true).toHex()]);

  // AFTER the transaction is confirmed, Stacks node needs to be notified of the data in the address.
  // Then, the address can be verifies by regenerating the redeemscript:
  // <data> OP_DROP OP_DUP OP_HASH160 <recipientPublicKey> OP_EQUALVERIFY OP_CHECKSIG`

  // START Claiming process by sBTC signers
  tx = await blockchainRequest("getrawtransaction", [result, true]);

  psbt = new Psbt({ network });
  let fee = 312 * 3;
  psbt.addInput({
    hash: tx.txid,
    index: 0,
    nonWitnessUtxo: Buffer.from(tx.hex, "hex"),
    redeemScript: payment.redeem!.output
  });

  psbt.addOutput({
    address: nextAddressPayment.address!,
    value: 100_000_000 - fee
  });

  psbt.signInput(0, recipientBtcSigner);

  // regenerate redeem script
  psbt.finalizeInput(0, (index, input, script) => {
    const partialSigs = input.partialSig;
    const inputScript = bScript.compile([
      partialSigs![0].signature,
      recipientBtcSigner.publicKey
    ]);
    // <sig> <recipientPublicKey>
    const payment = payments.p2sh({
      redeem: {
        output: script,
        input: inputScript
      },
    });
    return {
      finalScriptSig: payment.input,
      finalScriptWitness: undefined,
    }
  });

  let resultTxId = await blockchainRequest("sendrawtransaction", [psbt.extractTransaction().toHex()]);
  await blockchainRequest("generatetoaddress", [5, senderPayment.address]);
  
  tx = await blockchainRequest("getrawtransaction", [resultTxId, true]);
  console.log(tx);
  console.log("Succesfully sent funds to public key");
})();
