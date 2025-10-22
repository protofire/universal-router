import * as dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './utils/logger';

// Types
interface DeploymentArgs {
  rpcUrl: string;
  chainName: string;
  weth9Address: string;
  v2FactoryAddress: string;
  v3FactoryAddress: string;
  v3PositionManagerAddress: string;
  permit2Address: string;
  v4PoolManagerAddress: string;
  v4PositionManagerAddress: string;
}

interface RouterParameters {
  permit2: string;
  weth9: string;
  v2Factory: string;
  v3Factory: string;
  pairInitCodeHash: string;
  poolInitCodeHash: string;
  v4PoolManager: string;
  v3NFTPositionManager: string;
  v4PositionManager: string;
}

// Constants - Standard init code hashes consistent across chains
const V2_INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';
const V3_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';
const CANONICAL_PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

function parseArguments(): DeploymentArgs {
  const args = process.argv.slice(2);

  if (args.length < 5) {
    console.error(`
Usage: npx ts-node scripts/deploy-universal-router.ts \\
  --rpc-url <RPC_URL> \\
  --chain-name <CHAIN_NAME> \\
  --weth9 <WETH9_ADDRESS> \\
  --v3-factory <V3_FACTORY_ADDRESS> \\
  --v3-position-manager <V3_POSITION_MANAGER_ADDRESS> \\
  [--v2-factory <V2_FACTORY_ADDRESS>] \\
  [--permit2 <PERMIT2_ADDRESS>] \\
  [--v4-pool-manager <V4_POOL_MANAGER_ADDRESS>] \\
  [--v4-position-manager <V4_POSITION_MANAGER_ADDRESS>]

Required:
  --rpc-url                RPC endpoint URL
  --chain-name             Chain name for logging
  --weth9                  WETH9 contract address
  --v3-factory             Uniswap V3 factory address
  --v3-position-manager    V3 NFT position manager address

Optional:
  --v2-factory             V2 factory address (defaults to 0x0)
  --permit2                Permit2 address (defaults to canonical: ${CANONICAL_PERMIT2_ADDRESS})
  --v4-pool-manager        V4 pool manager address (defaults to 0x0)
  --v4-position-manager    V4 position manager address (defaults to 0x0)
    `);
    process.exit(1);
  }

  const config: Partial<DeploymentArgs> = {
    v2FactoryAddress: '0x0000000000000000000000000000000000000000',
    permit2Address: CANONICAL_PERMIT2_ADDRESS,
    v4PoolManagerAddress: '0x0000000000000000000000000000000000000000',
    v4PositionManagerAddress: '0x0000000000000000000000000000000000000000'
  };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    if (!value) {
      throw new Error(`Missing value for flag: ${flag}`);
    }

    switch (flag) {
      case '--rpc-url':
        config.rpcUrl = value;
        break;
      case '--chain-name':
        config.chainName = value;
        break;
      case '--weth9':
        config.weth9Address = value;
        break;
      case '--v2-factory':
        config.v2FactoryAddress = value;
        break;
      case '--v3-factory':
        config.v3FactoryAddress = value;
        break;
      case '--v3-position-manager':
        config.v3PositionManagerAddress = value;
        break;
      case '--permit2':
        config.permit2Address = value;
        break;
      case '--v4-pool-manager':
        config.v4PoolManagerAddress = value;
        break;
      case '--v4-position-manager':
        config.v4PositionManagerAddress = value;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  // Validate required parameters
  const required = ['rpcUrl', 'chainName', 'weth9Address', 'v3FactoryAddress', 'v3PositionManagerAddress'];
  for (const param of required) {
    if (!config[param as keyof DeploymentArgs]) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  }

  return config as DeploymentArgs;
}

function validateAddress(address: string, name: string): void {
  if (!ethers.utils.isAddress(address)) {
    throw new Error(`Invalid address for ${name}: ${address}`);
  }
}

function loadForgeArtifact(contractName: string) {
  const artifactPath = path.join(process.cwd(), 'out', `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object
  };
}

async function deployUnsupportedProtocol(signer: ethers.Wallet, logger: Logger): Promise<string> {
  logger.step(1, 'Deploying UnsupportedProtocol contract');

  const artifact = loadForgeArtifact('UnsupportedProtocol');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const unsupportedProtocol = await factory.deploy();
  await unsupportedProtocol.deployed();

  logger.deployment('UnsupportedProtocol', unsupportedProtocol.address, unsupportedProtocol.deployTransaction.hash);
  return unsupportedProtocol.address;
}

function mapUnsupportedAddress(address: string, unsupportedAddress: string): string {
  return address === '0x0000000000000000000000000000000000000000' ? unsupportedAddress : address;
}

async function deployUniversalRouter(args: DeploymentArgs, unsupportedAddress: string, signer: ethers.Wallet, logger: Logger): Promise<{address: string, blockNumber: number}> {
  logger.step(2, 'Deploying UniversalRouter contract');

  // Map zero addresses to UnsupportedProtocol
  const routerParameters: RouterParameters = {
    permit2: mapUnsupportedAddress(args.permit2Address, unsupportedAddress),
    weth9: mapUnsupportedAddress(args.weth9Address, unsupportedAddress),
    v2Factory: mapUnsupportedAddress(args.v2FactoryAddress, unsupportedAddress),
    v3Factory: mapUnsupportedAddress(args.v3FactoryAddress, unsupportedAddress),
    pairInitCodeHash: V2_INIT_CODE_HASH,
    poolInitCodeHash: V3_INIT_CODE_HASH,
    v4PoolManager: mapUnsupportedAddress(args.v4PoolManagerAddress, unsupportedAddress),
    v3NFTPositionManager: mapUnsupportedAddress(args.v3PositionManagerAddress, unsupportedAddress),
    v4PositionManager: mapUnsupportedAddress(args.v4PositionManagerAddress, unsupportedAddress)
  };

  // Log router parameters
  logger.info('Router Parameters:');
  logger.info(`  permit2: ${routerParameters.permit2}`);
  logger.info(`  weth9: ${routerParameters.weth9}`);
  logger.info(`  v2Factory: ${routerParameters.v2Factory}`);
  logger.info(`  v3Factory: ${routerParameters.v3Factory}`);
  logger.info(`  pairInitCodeHash: ${routerParameters.pairInitCodeHash}`);
  logger.info(`  poolInitCodeHash: ${routerParameters.poolInitCodeHash}`);
  logger.info(`  v4PoolManager: ${routerParameters.v4PoolManager}`);
  logger.info(`  v3NFTPositionManager: ${routerParameters.v3NFTPositionManager}`);
  logger.info(`  v4PositionManager: ${routerParameters.v4PositionManager}`);

  const artifact = loadForgeArtifact('UniversalRouter');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const universalRouter = await factory.deploy(routerParameters);
  await universalRouter.deployed();

  // Get the block number from the deployment transaction receipt
  const receipt = await universalRouter.deployTransaction.wait();
  const blockNumber = receipt.blockNumber;

  logger.deployment('UniversalRouter', universalRouter.address, universalRouter.deployTransaction.hash);
  logger.info(`UniversalRouter deployed in block: ${blockNumber}`);

  return { address: universalRouter.address, blockNumber };
}

async function main(): Promise<void> {
  let logger: Logger | undefined;

  try {
    // Parse and validate arguments
    const args = parseArguments();
    logger = new Logger(args.chainName);

    logger.info(`Starting Universal Router deployment on ${args.chainName}`);
    logger.info(`RPC URL: ${args.rpcUrl}`);

    // Validate addresses
    validateAddress(args.weth9Address, 'WETH9');
    validateAddress(args.v3FactoryAddress, 'V3 Factory');
    validateAddress(args.v3PositionManagerAddress, 'V3 Position Manager');
    validateAddress(args.permit2Address, 'Permit2');

    if (args.v2FactoryAddress !== '0x0000000000000000000000000000000000000000') {
      validateAddress(args.v2FactoryAddress, 'V2 Factory');
    }
    if (args.v4PoolManagerAddress !== '0x0000000000000000000000000000000000000000') {
      validateAddress(args.v4PoolManagerAddress, 'V4 Pool Manager');
    }
    if (args.v4PositionManagerAddress !== '0x0000000000000000000000000000000000000000') {
      validateAddress(args.v4PositionManagerAddress, 'V4 Position Manager');
    }

    // Check private key
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Setup provider and signer
    const provider = new ethers.providers.JsonRpcProvider(args.rpcUrl);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    logger.info(`Deploying from address: ${signer.address}`);

    // Check balance
    const balance = await signer.getBalance();
    logger.info(`Account balance: ${ethers.utils.formatEther(balance)} ETH`);

    if (balance.isZero()) {
      throw new Error('Deployer account has no balance');
    }

    // Deploy contracts
    const unsupportedAddress = await deployUnsupportedProtocol(signer, logger);
    const universalRouterResult = await deployUniversalRouter(args, unsupportedAddress, signer, logger);

    // Final summary
    logger.summary({
      'UnsupportedProtocol': unsupportedAddress,
      'UniversalRouter': `${universalRouterResult.address} (block: ${universalRouterResult.blockNumber})`
    });

  } catch (error) {
    if (logger) {
      logger.error('Deployment failed', error as Error);
    } else {
      console.error('Fatal error:', error);
    }
    process.exit(1);
  }
}

// Execute deployment
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}