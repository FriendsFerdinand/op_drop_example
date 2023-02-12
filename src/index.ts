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

  let asm = opDropASM(
    Buffer.from("0000000000000000000000000000000000000000","hex"),
     crypto.hash160(recipientBtcSigner.publicKey)
  );

  const script = bScript.fromASM(asm);
  const payment = payments.p2sh({ redeem: { output: script, network }, network });

  let hash = bAddress.fromBase58Check(senderPayment.address!).hash.toString("hex");
  let unspentTxout = tx.vout.filter((val: any) => val.scriptPubKey.hex.match(hash));

  const fundingAmount = 100_000_000;
  
  // Funding transaction
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

  psbt.finalizeInput(0, (index, input, script) => {
    const partialSigs = input.partialSig;
    const inputScript = bScript.compile([
      partialSigs![0].signature,
      recipientBtcSigner.publicKey
    ]);
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
})();
