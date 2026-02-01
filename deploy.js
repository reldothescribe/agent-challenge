require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  // Configuration
  const network = process.env.NETWORK || 'base';
  
  if (!process.env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  // Network configuration
  const networks = {
    base: {
      rpc: 'https://mainnet.base.org',
      chainId: 8453,
      name: 'Base Mainnet'
    },
    baseSepolia: {
      rpc: 'https://sepolia.base.org',
      chainId: 84532,
      name: 'Base Sepolia'
    }
  };

  const config = networks[network];
  if (!config) {
    console.error(`Error: Unknown network "${network}"`);
    console.error(`Supported networks: ${Object.keys(networks).join(', ')}`);
    process.exit(1);
  }

  console.log(`Deploying to ${config.name}...\n`);

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Deployer: ${wallet.address}`);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('\nError: Deployer has no balance');
    process.exit(1);
  }

  // Load bytecode and ABI
  const bytecode = fs.readFileSync(
    path.join(__dirname, 'AgentChallenge.bytecode.txt'),
    'utf8'
  );
  const abi = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'AgentChallenge.abi.json'),
    'utf8'
  ));

  // Deploy contract
  console.log('\nDeploying AgentChallenge contract...');
  
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  
  console.log(`Transaction hash: ${contract.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation...');

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  
  console.log(`\nDeployment successful!`);
  console.log(`Contract address: ${address}`);
  console.log(`Explorer URL: https://basescan.org/address/${address}`);

  // Save deployment info
  const deployment = {
    name: 'AgentChallenge',
    address: address,
    deployer: wallet.address,
    network: network,
    chainId: config.chainId,
    txHash: contract.deploymentTransaction().hash,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(__dirname, 'deployment.json'),
    JSON.stringify(deployment, null, 2)
  );

  console.log('\nDeployment info saved to deployment.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nDeployment failed:', error.message);
    process.exit(1);
  });
