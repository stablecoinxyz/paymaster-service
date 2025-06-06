import { HardhatRuntimeEnvironment } from "hardhat/types";
import { 
  createPublicClient, 
  http, 
  getAddress, 
  Address, 
  Hex,
  encodeFunctionData,
  encodeAbiParameters,
  concat,
  getCreate2Address,
  keccak256,
} from 'viem';
import { config as dotenvConfig } from 'dotenv';
import { getChain, getDeployerWalletClient, getRPCUrl } from "../../src/helpers/utils";

dotenvConfig();

let version = '000000';

const ENTRY_POINT_V07_ADDRESS = process.env.ENTRY_POINT_V07_ADDRESS as Address;
if (!ENTRY_POINT_V07_ADDRESS || !isValidAddress(ENTRY_POINT_V07_ADDRESS)) {
  throw new Error('ENTRY_POINT_V07_ADDRESS is required in environment variables');
}

// CREATE2 Factory address - same on all chains
const CREATE2_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const;

// Create a unique salt based on the contract name and version
const createSaltWithVersion = (contractType: 'implementation' | 'proxy', version: string) => keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
    ['SignatureVerifyingPaymasterV07', contractType, version]
  )
);

/**
 * Deploy the UUPS paymaster and proxy
 */
export async function main(hre: HardhatRuntimeEnvironment): Promise<void> {
  const chain = hre.network.name;

  console.log('Deploying SignatureVerifyingPaymasterV07 with UUPS Proxy...');
  
  const TRUSTED_SIGNER = process.env.TRUSTED_SIGNER as Address;
  if (!TRUSTED_SIGNER || !isValidAddress(TRUSTED_SIGNER)) {
    throw new Error('TRUSTED_SIGNER is required in environment variables');
  }

  // Setup viem clients
  const publicClient = createPublicClient({
    chain: getChain(chain),
    transport: http(getRPCUrl(chain)),
  });

  // Get the deployer account
  const deployer = getDeployerWalletClient(chain);
  const deployerAddress = deployer.account.address;

  console.log(`Deploying with account: ${deployerAddress}`);
  console.log(`EntryPoint address: ${ENTRY_POINT_V07_ADDRESS}`);
  console.log(`Trusted signer: ${TRUSTED_SIGNER}`);

  // Get contract artifacts directly
  const paymasterArtifact = await hre.artifacts.readArtifact('contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07');
  const proxyArtifact = await hre.artifacts.readArtifact('@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy');
  
  // Deploy the implementation contract first
  console.log("Preparing deterministic implementation deployment...");
  
  

  let SALT = createSaltWithVersion('implementation', version);
  
  // Construct the constructor args first
  const constructorArgs = encodeAbiParameters(
    [{ type: 'address' }],
    [ENTRY_POINT_V07_ADDRESS]
  );

  // Log the components for validation
  console.log('\nValidating deployment data:');
  console.log(`Bytecode length: ${(paymasterArtifact.bytecode as string).length}`);
  console.log(`Constructor args: ${constructorArgs}`);
  
  // Construct the full initialization code
  let initCode = concat([
    paymasterArtifact.bytecode as Hex,
    constructorArgs
  ]);

  let computedAddress = getCreate2Address({
    from: CREATE2_FACTORY,
    salt: SALT,
    bytecode: initCode
  });

  console.log(`\nComputed address: ${computedAddress}`);
  
  // Check if there's already code at the computed address
  const existingCode = await publicClient.getBytecode({ address: computedAddress });
  if (existingCode) {
    console.log(`Contract already deployed at computed address ${computedAddress}`);
    console.log("Trying next version...");
    
    // Try versions until we find an unused address
    let versionNum = 2;
    while (versionNum <= 10) {
      version = versionNum.toString();
      SALT = createSaltWithVersion('implementation', version);
      computedAddress = getCreate2Address({
        from: CREATE2_FACTORY,
        salt: SALT,
        bytecode: initCode
      });
      
      const code = await publicClient.getBytecode({ address: computedAddress });
      if (!code) {
        console.log(`Found unused address with version ${version}`);
        break;
      }
      console.log(`Version ${version} already used, trying next...`);
      versionNum++;
    }
    
    if (versionNum > 10) {
      throw new Error("Could not find unused version after 10 attempts");
    }
  }
  
  console.log(`Using version ${version} for deployment`);
  console.log(`Computed deterministic implementation address: ${computedAddress}`);

  // Deploy using CREATE2 factory - using direct contract call
  console.log("\nPreparing implementation deployment...");
  
  // Format the call data for the CREATE2 factory
  const deployData = concat([
    SALT,
    initCode
  ]);

  // Declare implementation address outside try block
  let implementationAddress: Address;

  try {
    console.log('\nSending deployment transaction...');
    const implementationDeployTx = await deployer.sendTransaction({
      to: CREATE2_FACTORY,
      data: deployData,
    });

    // Wait for deployment transaction with progress logging
    console.log(`\nWaiting for implementation deployment transaction: ${implementationDeployTx}`);
    const implementationReceipt = await publicClient.waitForTransactionReceipt({
      hash: implementationDeployTx,
      timeout: 60_000, // 1 minute timeout
      onReplaced: (replacement) => {
        console.log(`Transaction replaced: ${replacement.reason}`);
        console.log(`New hash: ${replacement.transaction.hash}`);
      }
    });

    if (implementationReceipt.status === 'reverted') {
      throw new Error("Implementation deployment failed - transaction reverted");
    }

    implementationAddress = computedAddress; 
    console.log(`\nImplementation deployed successfully to: ${implementationAddress}`);

    // Sleep for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify the implementation has code
    const implCode = await publicClient.getBytecode({ address: implementationAddress });
    if (!implCode) {
      throw new Error("Implementation deployment failed - no code at deployed address");
    }
    console.log(`Implementation code size: ${implCode.length}`);

  } catch (error) {
    console.error('\nDeployment failed with error:');
    console.error(error);
    
    // If we have error.data, try to decode it
    if ((error as any).data) {
      console.error('\nError data:', (error as any).data);
    }
    
    throw error;
  }

  if (!implementationAddress) {
    throw new Error("Implementation address not set");
  }

  // Prepare initialization data
  const initializeFunction = paymasterArtifact.abi.find((item: any) => 
    item.type === 'function' && item.name === 'initialize'
  );
  
  if (!initializeFunction) {
    throw new Error('Initialize function not found in ABI');
  }
  
  const initData = encodeFunctionData({
    abi: [initializeFunction],
    functionName: 'initialize',
    args: [TRUSTED_SIGNER, deployerAddress]
  });

  // Prepare proxy deployment using CREATE2
  console.log("Preparing deterministic proxy deployment...");
  
  // Create proxy salt - different from implementation salt
  const PROXY_SALT = createSaltWithVersion('proxy', version);

  // Create proxy initialization code (bytecode + constructor args)
  const proxyInitCode = concat([
    proxyArtifact.bytecode as Hex,
    encodeAbiParameters(
      [{ type: 'address', name: 'implementation' }, { type: 'bytes', name: 'data' }],
      [implementationAddress, initData]
    )
  ]);

  // Compute the deterministic proxy address
  const computedProxyAddress = getCreate2Address({
    from: CREATE2_FACTORY,
    salt: PROXY_SALT,
    bytecode: proxyInitCode
  });
  
  console.log(`Computed deterministic proxy address: ${computedProxyAddress}`);

  // Deploy proxy using CREATE2 factory
  console.log("Deploying proxy contract...");
  
  // Format the call data for the CREATE2 factory
  const proxyDeployData = concat([
    PROXY_SALT,
    proxyInitCode
  ]);

  const proxyDeployTx = await deployer.sendTransaction({
    to: CREATE2_FACTORY,
    data: proxyDeployData,
  });

  // Wait for proxy deployment with progress logging
  console.log(`Waiting for proxy deployment transaction: ${proxyDeployTx}`);
  const proxyReceipt = await publicClient.waitForTransactionReceipt({
    hash: proxyDeployTx,
    timeout: 60_000, // 1 minute timeout
    onReplaced: (replacement) => {
      console.log(`Transaction replaced: ${replacement.reason}`);
      console.log(`New hash: ${replacement.transaction.hash}`);
    }
  });
  
  const proxyAddress = computedProxyAddress;
  console.log(`Proxy deployed to: ${proxyAddress}`);
  
  // Get the proxy contract with the paymaster ABI
  const paymaster = await hre.viem.getContractAt(
    'contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07',
    proxyAddress as Address,
  );

  // Sleep for 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Verify initialization
  console.log('\nVerifying initialization...');
  const verificationResults = await Promise.all([
    paymaster.read.owner([]),
    paymaster.read.entryPoint([]),
    paymaster.read.verifyingSigner([]),
    paymaster.read.VERSION([])
  ]);
  
  console.log(`Owner: ${verificationResults[0]}`);
  console.log(`EntryPoint: ${verificationResults[1]}`);
  console.log(`Verifying Signer: ${verificationResults[2]}`);
  console.log(`Version: ${verificationResults[3]}`);

  console.log('\nFund your paymaster by sending ETH to the proxy address');
  console.log('Then call the fund-paymaster task to transfer funds to the EntryPoint');

  console.log('\n*** Remember to update the .env file with the new PROXY_ADDRESS ***');
  console.log(`PROXY_ADDRESS=${proxyAddress}`);
}

/**
 * Upgrade the UUPS paymaster implementation
 */
export async function upgrade(hre: HardhatRuntimeEnvironment): Promise<void> {
  const chain = hre.network.name;

  const PROXY_ADDRESS = process.env.PROXY_ADDRESS as Address;
  if (!PROXY_ADDRESS || !isValidAddress(PROXY_ADDRESS)) {
    throw new Error('PROXY_ADDRESS is required in environment variables');
  }

  console.log('Upgrading paymaster implementation...');
  console.log(`Proxy address: ${PROXY_ADDRESS}`);
  
  // Setup viem clients
  const publicClient = createPublicClient({
    chain: getChain(chain),
    transport: http(getRPCUrl(chain)),
  });
  const deployer = getDeployerWalletClient(chain);
  
  // Get the implementation address (using storage slot for ERC1967)
  const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implAddressData = await publicClient.getStorageAt({
    address: PROXY_ADDRESS,
    slot: implementationSlot
  });
  
  const currentImpl = getAddress('0x' + (implAddressData?.slice(26) || ''));
  console.log(`Current implementation: ${currentImpl}`);
  
  // Get the deployer account information
  console.log(`Upgrading with account: ${deployer.account.address}`);
  
  // Get the contract artifact
  const paymasterArtifact = await hre.artifacts.readArtifact('contracts/SignatureVerifyingPaymasterV07.sol:SignatureVerifyingPaymasterV07');
  console.log("Preparing deterministic deployment...");
  
  // Start with version 1 for upgrades 
  let upgradeVersion = '1';
  
  // Prepare the init code (contract bytecode + constructor args)
  const constructorArgs = encodeAbiParameters(
    [{ type: 'address' }],
    [ENTRY_POINT_V07_ADDRESS]
  );
  
  const initCode = concat([
    paymasterArtifact.bytecode as Hex,
    constructorArgs
  ]);

  // Find an unused version/address
  let SALT = createSaltWithVersion('implementation', upgradeVersion);
  let computedAddress = getCreate2Address({
    from: CREATE2_FACTORY,
    salt: SALT,
    bytecode: initCode
  });
  
  console.log(`Checking for unused implementation address...`);
  
  // Check if there's already code at the computed address and find unused version
  const existingCode = await publicClient.getBytecode({ address: computedAddress });
  if (existingCode) {
    console.log(`Implementation address ${computedAddress} already used, finding next available...`);
    
    // Try versions until we find an unused address
    let versionNum = 2;
    while (versionNum <= 20) { // Allow more attempts for upgrades
      upgradeVersion = versionNum.toString();
      SALT = createSaltWithVersion('implementation', upgradeVersion);
      computedAddress = getCreate2Address({
        from: CREATE2_FACTORY,
        salt: SALT,
        bytecode: initCode
      });
      
      const code = await publicClient.getBytecode({ address: computedAddress });
      if (!code) {
        console.log(`Found unused address with version ${upgradeVersion}: ${computedAddress}`);
        break;
      }
      console.log(`Version ${upgradeVersion} already used (${computedAddress}), trying next...`);
      versionNum++;
    }
    
    if (versionNum > 20) {
      throw new Error("Could not find unused version after 20 attempts");
    }
  }
  
  console.log(`Using version ${upgradeVersion} for upgrade`);
  console.log(`Computed deterministic address: ${computedAddress}`);

  // Format the call data for the CREATE2 factory
  const deployData = concat([
    SALT,
    initCode
  ]);

  // Deploy using CREATE2 factory
  console.log("Deploying new implementation...");
  const implementationDeployTx = await deployer.sendTransaction({
    to: CREATE2_FACTORY,
    data: deployData,
  });

  // Wait for deployment transaction
  console.log(`Waiting for implementation deployment transaction: ${implementationDeployTx}`);
  const implementationReceipt = await publicClient.waitForTransactionReceipt({
    hash: implementationDeployTx,
    timeout: 60_000
  });
  
  if (implementationReceipt.status === 'reverted') {
    throw new Error("Implementation deployment failed - transaction reverted");
  }
  
  const implementationAddress = computedAddress;
  console.log(`New implementation deployed to: ${implementationAddress}`);
  
  // Sleep for 5 seconds to let the deployment settle
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verify the implementation has code
  const implCode = await publicClient.getBytecode({ address: implementationAddress });
  if (!implCode) {
    throw new Error("Implementation deployment failed - no code at deployed address");
  }
  console.log(`Implementation code size: ${implCode.length}`);
  
  // Upgrade the proxy by calling upgradeToAndCall
  console.log("Upgrading proxy implementation...");
  
  // Get the upgradeToAndCall function from the ABI
  const upgradeAbi = (await hre.artifacts.readArtifact('UUPSUpgradeable')).abi;
  const upgradeFunction = upgradeAbi.find(x => x.type === 'function' && x.name === 'upgradeToAndCall');
  
  if (!upgradeFunction) {
    throw new Error('upgradeToAndCall function not found in ABI');
  }

  // Prepare EIP712 reinitialization
  console.log("Preparing EIP712 reinitialization...");
  
  // Get the reinitializeEIP712 function from the paymaster ABI
  const reinitializeFunction = paymasterArtifact.abi.find((item: any) => 
    item.type === 'function' && item.name === 'reinitializeEIP712'
  );
  
  if (!reinitializeFunction) {
    throw new Error('reinitializeEIP712 function not found in ABI. Make sure to add it to the contract.');
  }
  
  // Encode the reinitializeEIP712 call
  const reinitData = encodeFunctionData({
    abi: [reinitializeFunction],
    functionName: 'reinitializeEIP712',
    args: [] // No arguments needed
  });

  // Encode the upgrade call with reinitialization
  const upgradeCalldata = encodeFunctionData({
    abi: [upgradeFunction],
    functionName: 'upgradeToAndCall',
    args: [implementationAddress, reinitData]
  });

  // Send the upgrade transaction
  const upgradeTx = await deployer.sendTransaction({
    to: PROXY_ADDRESS,
    data: upgradeCalldata,
  });
  
  // Wait for upgrade transaction
  console.log(`Waiting for upgrade transaction: ${upgradeTx}`);
  const upgradeReceipt = await publicClient.waitForTransactionReceipt({
    hash: upgradeTx,
    timeout: 60_000
  });

  if (upgradeReceipt.status === 'reverted') {
    throw new Error("Upgrade transaction reverted");
  }
  
  console.log("Upgrade transaction completed successfully!");
  
  // Sleep for 5 seconds to let the upgrade settle
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verify the new implementation address
  const newImplAddressData = await publicClient.getStorageAt({
    address: PROXY_ADDRESS,
    slot: implementationSlot
  });
  
  const newImpl = getAddress('0x' + (newImplAddressData?.slice(26) || ''));
  console.log(`New implementation address verified: ${newImpl}`);
  
  if (newImpl.toLowerCase() !== implementationAddress.toLowerCase()) {
    throw new Error(`Implementation address mismatch. Expected ${implementationAddress}, got ${newImpl}`);
  }

  console.log("Upgrade completed successfully!");
  console.log(`Old implementation: ${currentImpl}`);
  console.log(`New implementation: ${newImpl}`);
}

// Helper function to check if an address is valid
function isValidAddress(address: string): boolean {
  try {
    getAddress(address);
    return true;
  } catch {
    return false;
  }
} 