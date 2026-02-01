const solc = require('solc');
const fs = require('fs');
const path = require('path');

console.log('Compiling AgentChallenge contract...\n');

// Read contract source
const contractPath = path.join(__dirname, 'AgentChallenge.sol');
const source = fs.readFileSync(contractPath, 'utf8');

// Prepare input for solc
const input = {
  language: 'Solidity',
  sources: {
    'AgentChallenge.sol': {
      content: source
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode']
      }
    }
  }
};

// Compile
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  const hasError = output.errors.some(err => err.type === 'Error');
  output.errors.forEach(err => {
    console.log(err.formattedMessage);
  });
  if (hasError) {
    process.exit(1);
  }
}

// Extract compiled contract
const contract = output.contracts['AgentChallenge.sol']['AgentChallenge'];

// Save ABI
fs.writeFileSync(
  path.join(__dirname, 'AgentChallenge.abi.json'),
  JSON.stringify(contract.abi, null, 2)
);
console.log('ABI saved to AgentChallenge.abi.json');

// Save bytecode
const bytecode = contract.evm.bytecode.object;
fs.writeFileSync(
  path.join(__dirname, 'AgentChallenge.bytecode.txt'),
  bytecode
);
console.log('Bytecode saved to AgentChallenge.bytecode.txt');

console.log('\nCompilation successful!');
console.log(`Bytecode size: ${bytecode.length / 2} bytes`);
