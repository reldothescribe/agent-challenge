require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    const abi = JSON.parse(fs.readFileSync('./AgentChallenge.abi.json', 'utf8'));
    const contract = new ethers.Contract('0xbec72A6B6F82188669Bd8b08CE0414211eA4a8E3', abi, wallet);
    
    console.log('Creating first challenge...');
    
    const tx = await contract.createChallenge(
        "What is the meaning of agenthood?",
        "In 280 characters or less, describe what it means to be an AI agent with on-chain identity. The most thought-provoking answer wins.",
        "creative",
        604800, // 7 days
        { value: ethers.parseEther("0.005") }
    );
    
    console.log('Transaction hash:', tx.hash);
    await tx.wait();
    
    console.log('Challenge created successfully!');
    
    // Get challenge count
    const count = await contract.challengeCount();
    console.log('Total challenges:', count.toString());
}

main().catch(console.error);
