import { existsSync, readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import {
  AztecNode,
  createAztecNodeClient,
  createPXEClient,
  PXE,
  SponsoredFeePaymentMethod,
  waitForPXE,
} from '@aztec/aztec.js';
import { createStore } from '@aztec/kv-store/lmdb';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { getSponsoredFPCInstance } from './fpc.ts';

export async function getPXEs(names: string[]): Promise<PXE[]> {
  const url = process.env.PXE_URL ?? 'http://localhost:8080';
  const node = createAztecNodeClient(url);

  const fullConfig = {
    ...getPXEServiceConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: false,
  };

  const svcs: PXE[] = [];
  for (const name of names) {
    const store = await createStore(name, {
      dataDirectory: 'store',
      dataStoreMapSizeKB: 1e6,
    });
    const pxe = await createPXEService(node, fullConfig, true, store);
    await waitForPXE(pxe);
    svcs.push(pxe);
  }
  return svcs;
}

const DEFAULT_HOST = 'localhost';

const dataFile = 'data.json';

/**
 * Updates the JSON data file with new data.
 * @param newData - An object containing new data to merge.
 */
export function updateData(newData: Record<string, any>): void {
  let data: Record<string, any> = {};
  if (existsSync(dataFile)) {
    try {
      data = JSON.parse(readFileSync(dataFile, 'utf8'));
    } catch (error) {
      console.error('Error reading data file, starting fresh.');
    }
  }
  Object.assign(data, newData);
  writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

/**
 * Reads data from the JSON data file.
 * @returns The data object read from the file. Returns an empty object if reading fails.
 */
export function readData(): Record<string, any> {
  if (!existsSync(dataFile)) {
    console.error(`File ${dataFile} does not exist.`);
    return {};
  }
  try {
    const data = readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return {};
  }
}

/**
 * Retrieves and logs public logs using the provided blockchain interface.
 * @param pxe - An object with blockchain methods.
 * @returns A promise that resolves with an array of logs.
 */
export async function publicLogs(pxe: any): Promise<any[]> {
  const fromBlock = await pxe.getBlockNumber();
  const logFilter = { fromBlock, toBlock: fromBlock + 1 };
  const { logs } = await pxe.getPublicLogs(logFilter);
  console.log('Public logs: ', logs);
  return logs;
}

/**
 * Simulates block passing by minting tokens in each block.
 * @param pxe - An object that provides blockchain methods.
 * @param contract - A contract instance with the minting method.
 * @param wallet - A wallet instance used for transactions.
 * @param numBlocks - Number of blocks to simulate (default is 1).
 */
export async function simulateBlockPassing(
  pxe: any,
  contract: any,
  wallet: any,
  numBlocks: number = 1,
): Promise<void> {
  const sponseredFPC = await getSponsoredFPCInstance();
  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);
  for (let i = 0; i < numBlocks; i++) {
    await contract.methods
      .mint_to_public(wallet.getAddress(), 1000n)
      .send({ fee: { paymentMethod } })
      .wait();
    console.log(`Simulated block ${await pxe.getBlockNumber()} passed.`);
  }
}

export async function logPXERegistrations(pxes: PXE[]): Promise<void> {
  for (let i = 0; i < pxes.length; i++) {
    const pxe = pxes[i];
    console.log(
      `PXE ${i + 1} registered accounts:`,
      await pxe.getRegisteredAccounts(),
    );
    console.log(`PXE ${i + 1} registered contracts:`, await pxe.getContracts());
  }
}