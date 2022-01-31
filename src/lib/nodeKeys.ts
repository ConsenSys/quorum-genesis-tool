
import secp256k1 from "secp256k1";
// import secp256r1 from "secp256r1";
import keccak from "keccak";
import { randomBytes } from "crypto";
import { Address, NodeKeys, PrivateKey, PublicKey, EthAccount } from "../types/nodeKeys";
import Wallet from "ethereumjs-wallet";
import rlp from "rlp";
import { Consensus } from "../types/consensus";

const VANITY_DATA = "0x0000000000000000000000000000000000000000000000000000000000000000";
const CLIQUE_PROPOSER_SIGNATURE = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export function generatePrivateKey() : PrivateKey {
  let privKey : PrivateKey;
  do {
    privKey = randomBytes(32);
  } while ( !secp256k1.privateKeyVerify(privKey) );
  return privKey;
}

export function derivePublicKey(privKey: Buffer): PublicKey {
  // slice on the end to remove the compression prefix ie. uncompressed use 04 prefix & compressed use 02 or 03
  // we generate the address, which wont work with the compression prefix
  const pubKey : Uint8Array = secp256k1.publicKeyCreate(privKey, false).slice(1);
  return Buffer.from(pubKey);
}

export function deriveAddress(pubKey: Uint8Array) : Address  {
  if(!Buffer.isBuffer(pubKey)) {
    console.log("ERROR - pubKey is not a buffer");
    process.exit();
  }
  const keyHash : Address = keccak('keccak256').update(pubKey).digest();
  return keyHash.slice(Math.max(keyHash.length - 20, 1));
}

export async function generateEthAccount(password: string) : Promise<EthAccount> {
  const wallet : Wallet = Wallet.generate();
  const v3keystore = await wallet.toV3(password);
  const ethAccount : EthAccount = {
    privateKey: wallet.getPrivateKeyString(),
    publicKey: wallet.getPublicKeyString(),
    address: wallet.getAddressString(),
    keystore: JSON.stringify(v3keystore),
    password
  };
  return ethAccount;
}

export async function generateNodeKeys(password: string) : Promise<NodeKeys> {
  const privateKey : PrivateKey = generatePrivateKey();
  const publicKey : PublicKey = derivePublicKey(privateKey);
  const address : Address = deriveAddress(publicKey);
  const ethAccount : EthAccount = await generateEthAccount(password);
  const nodeKeys : NodeKeys = {
    privateKey,
    publicKey,
    address,
    ethAccount
  };
  return nodeKeys;
}

// extraData field calculation

export function generateExtraDataString(validatorAddressList: Address[], consensus: Consensus) : string {

  let extraData : rlp.Input ;
  switch(consensus) {
    case Consensus.clique: {
      // clique just appends https://besu.hyperledger.org/en/latest/HowTo/Configure/Consensus-Protocols/Clique/
      // 65 bytes for the proposer signature. In the genesis block there is no initial proposer, so the proposer signature is all zeros.
      // [0x prefix, 32 bytes vanity, List<Validators> (20bytes each), proposer signature - 65 bytes of 0s (see comment above)]
      const signers : string[] = validatorAddressList.map(_ => _.toString('hex'));
      extraData = [VANITY_DATA, signers.join(''), CLIQUE_PROPOSER_SIGNATURE].join('');
      break;
    }
    case Consensus.raft: {
      // statements;
      extraData = VANITY_DATA;
      break;
    }
    // ibft, ibft2, qbft
    default: {
      const roundBuffer : Buffer = new Buffer(4);
      roundBuffer.writeUInt32LE(0, 0);
      // ibft, ibft2, qbft as normal ie RLP([32 bytes Vanity, List<Validators>, No Vote, Round=Int(0), 0 Seals]).
      const extraDataObject : rlp.Input = [new Uint8Array(32), validatorAddressList, null, roundBuffer, []];
      extraData = rlp.encode(extraDataObject).toString('hex');
      break;
    }
 }
 return extraData;

}