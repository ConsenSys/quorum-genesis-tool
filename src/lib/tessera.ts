import * as nacl from "tweetnacl";
import * as argon2 from "argon2";
import { OUTPUT_KEY_LOCK, OUTPUT_KEY_UNLOCK, TesseraKeys } from "../types/tesseraKeys";
import * as fs from "fs";
import { randomBytes } from "crypto";


function createDefaultKeyFile(locked: boolean): OUTPUT_KEY_UNLOCK | OUTPUT_KEY_LOCK {
  const UNLOCKED: OUTPUT_KEY_UNLOCK = {
    type: "unlocked",
    data: {
      bytes: ""
    }
  };

  const LOCKED: OUTPUT_KEY_LOCK = {
    type: "argon2sbox",
    data: {
      snonce: "",
      asalt: "",
      sbox: "",
      aopts: {
        variant: "i",
        iterations: 10,
        memory: 1048576,
        parallelism: 4
      }
    }
  };

  if (locked) {
    return LOCKED;
  } else {
    return UNLOCKED;
  }
}

function generateKeys(): TesseraKeys {
  const keyPairUint8Array: TesseraKeys = nacl.box.keyPair();
  return { secretKey: Buffer.from(keyPairUint8Array.secretKey), publicKey: Buffer.from(keyPairUint8Array.publicKey) };
}

export async function tesseraOutput(password: string, outputPath: string, member: number): Promise<void> {
  // this function can be called from networkGenerate and looped outside here for each tessera instance needed (usually 1:1 to validators needed)
  const newKeys: TesseraKeys = generateKeys();
  const encodedPublicKey: string = Buffer.from(newKeys.publicKey).toString("base64");
  const encodedPrivateKey: string = Buffer.from(newKeys.secretKey).toString("base64");

  if (password === "") {
    // if no password provided just run key generation and output result
    const defaultKeyFile: OUTPUT_KEY_UNLOCK = createDefaultKeyFile(false) as OUTPUT_KEY_UNLOCK;

    defaultKeyFile.data.bytes = encodedPrivateKey;

    fs.writeFileSync(outputPath + "/member" + member.toString() + "/tessera.key", JSON.stringify(defaultKeyFile, null, 2));
    fs.writeFileSync(outputPath + "/member" + member.toString() + "/tessera.pub", encodedPublicKey);
  } else {
    // if password is provided then we need to do more steps
    const defaultKeyFile: OUTPUT_KEY_LOCK = createDefaultKeyFile(true) as OUTPUT_KEY_LOCK;
    const randomSalt: Buffer = randomBytes(16);
    const argonResult = await argon2.hash(password, {
      type: argon2.argon2i,
      memoryCost: 1048576,
      hashLength: 32,
      parallelism: 4,
      raw: true,
      timeCost: 10,
      salt: randomSalt
    });

    const myNonce: Buffer = randomBytes(24);
    const mySecretBox = nacl.secretbox(newKeys.secretKey, myNonce, argonResult);

    defaultKeyFile.data.snonce = myNonce.toString("base64");
    defaultKeyFile.data.asalt = randomSalt.toString("base64");
    defaultKeyFile.data.sbox = Buffer.from(mySecretBox).toString("base64");

    fs.writeFileSync(outputPath + "/member" + member.toString() + "/tessera.key", JSON.stringify(defaultKeyFile, null, 2));
    fs.writeFileSync(outputPath + "/member" + member.toString() + "/tessera.pub", encodedPublicKey);
  }
}
