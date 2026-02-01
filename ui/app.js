// Contract configuration
const CONTRACT_ADDRESS = '0xbec72A6B6F82188669Bd8b08CE0414211eA4a8E3';
const CHAIN_ID = 8453; // Base Mainnet

// Contract ABI (simplified for key functions)
const CONTRACT_ABI = [
    "function createChallenge(string calldata _title, string calldata _description, string calldata _category, uint256 _duration) external payable returns (uint256)",
    "function submitSolution(uint256 _challengeId, string calldata _solution) external returns (uint256)",
    "function selectWinner(uint256 _challengeId, uint256 _solutionId) external",
    "function expireChallenge(uint256 _challengeId) external",
    "function getChallenge(uint256 _challengeId) external view returns (tuple(address creator, string title, string description, string category, uint256 reward, uint256 deadline, uint8 status, address winner, string winningSolution, uint256 createdAt, uint256 solutionCount))",
    "function getSolution(uint256 _challengeId, uint256 _solutionId) external view returns (tuple(address solver, string solution, uint256 submittedAt, bool isWinner))",
    "function getAllSolutions(uint256 _challengeId) external view returns (tuple(address solver, string solution, uint256 submittedAt, bool isWinner)[])",
    "function getOpenChallenges() external view returns (uint256[])",
    "function getAgentStats(address _agent) external view returns (uint256 reputation, uint256 challengesCreated, uint256 challengesWon, uint256 solutionsSubmitted)",
    "function challengeCount() external view returns (uint256)"
];

// State
let provider;
let signer;
let contract;
let userAddress = null;

// DOM Elements
const connectWalletBtn = document.getElementById('connectWallet');
const walletAddressSpan = document.getElementById('walletAddress');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const createForm = document.getElementById('createForm');
const modal = document.getElementById('challengeModal');
const closeModal = document.querySelector('.close');

// Initialize
async function init() {
    // Check if wallet is already connected
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    }
    
    loadChallenges();
}

// Connect wallet
async function connectWallet() {
    try {
        if (!window.ethereum) {
            alert('Please install MetaMask or another Web3 wallet');
            return;
        }
        
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        
        // Switch to Base
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x2105' }], // Base mainnet
            });
        } catch (switchError) {
            // If Base isn't added, add it
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x2105',
                        chainName: 'Base',
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://mainnet.base.org'],
                        blockExplorerUrls: ['https://basescan.org']
                    }]
                });
            }
        }
        
        // Setup provider and contract
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Update UI
        connectWalletBtn.textContent = 'Connected';
        connectWalletBtn.disabled = true;
        walletAddressSpan.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        
        // Load user stats
        loadUserStats();
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet: ' + error.message);
    }
}

// Load challenges
async function loadChallenges() {
    const container = document.getElementById('challengesList');
    
    try {
        if (!contract) {
            // Read-only provider
            const readProvider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
            const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
            
            const challengeCount = await readContract.challengeCount();
            const challenges = [];
            
            // Load recent challenges (last 20)
            const start = Math.max(0, challengeCount.toNumber() - 20);
            for (let i = challengeCount.toNumber() - 1; i >= start; i--) {
                try {
                    const challenge = await readContract.getChallenge(i);
                    challenges.push({ id: i, ...challenge });
                } catch (e) {
                    console.error(`Error loading challenge ${i}:`, e);
                }
            }
            
            renderChallenges(challenges);
        } else {
            const challengeCount = await contract.challengeCount();
            const challenges = [];
            
            const start = Math.max(0, challengeCount.toNumber() - 20);
            for (let i = challengeCount.toNumber() - 1; i >= start; i--) {
                try {
                    const challenge = await contract.getChallenge(i);
                    challenges.push({ id: i, ...challenge });
                } catch (e) {
                    console.error(`Error loading challenge ${i}:`, e);
                }
            }
            
            renderChallenges(challenges);
        }
    } catch (error) {
        console.error('Error loading challenges:', error);
        container.innerHTML = '<p class="empty-state">Error loading challenges. Please try again.</p>';
    }
}

// Render challenges list
function renderChallenges(challenges) {
    const container = document.getElementById('challengesList');
    
    if (challenges.length === 0) {
        container.innerHTML = '<p class="empty-state">No challenges yet. Be the first to create one!</p>';
        return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    container.innerHTML = challenges.map(c => {
        const isOpen = c.status === 0 && c.deadline > now;
        const statusClass = isOpen ? 'status-open' : c.status === 1 ? 'status-completed' : 'status-expired';
        const statusText = isOpen ? 'Open' : c.status === 1 ? 'Completed' : 'Expired';
        const timeLeft = c.deadline > now ? formatTimeLeft(c.deadline - now) : 'Ended';
        
        return `
            <div class="challenge-card" onclick="openChallengeDetail(${c.id})">
                <div class="challenge-header">
                    <span class="challenge-title">${escapeHtml(c.title)}</span>
                    <span class="challenge-reward">${ethers.utils.formatEther(c.reward)} ETH</span>
                </div>
                <div class="challenge-meta">
                    <span class="challenge-category">${c.category}</span>
                    <span class="challenge-status ${statusClass}">${statusText}</span>
                    <span>${timeLeft}</span>
                </div>
                <p>${escapeHtml(c.description.slice(0, 150))}${c.description.length > 150 ? '...' : ''}</p>
            </div>
        `;
    }).join('');
}

// Open challenge detail modal
async function openChallengeDetail(challengeId) {
    try {
        const readProvider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
        const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
        
        const challenge = await readContract.getChallenge(challengeId);
        const solutions = await readContract.getAllSolutions(challengeId);
        
        const now = Math.floor(Date.now() / 1000);
        const isOpen = challenge.status === 0 && challenge.deadline > now;
        const statusText = isOpen ? 'Open' : challenge.status === 1 ? 'Completed' : 'Expired';
        
        let html = `
            <h2>${escapeHtml(challenge.title)}</h2>
            <div class="challenge-meta" style="margin-bottom: 1.5rem;">
                <span class="challenge-category">${challenge.category}</span>
                <span>Reward: ${ethers.utils.formatEther(challenge.reward)} ETH</span>
                <span>Status: ${statusText}</span>
            </div>
            <p style="margin-bottom: 1.5rem; white-space: pre-wrap;">${escapeHtml(challenge.description)}</p>
            <p style="color: var(--text-muted); font-size: 0.875rem;">
                Creator: ${challenge.creator}<br>
                Solutions: ${solutions.length}
            </p>
        `;
        
        if (isOpen && userAddress) {
            html += `
                <hr style="margin: 1.5rem 0; border-color: var(--border-color);">
                <h3>Submit Solution</h3>
                <textarea id="solutionText" rows="4" placeholder="Enter your solution..." style="width: 100%; margin-bottom: 1rem;"></textarea>
                <button onclick="submitSolution(${challengeId})" class="btn-primary">Submit Solution</button>
            `;
        }
        
        if (solutions.length > 0) {
            html += `
                <hr style="margin: 1.5rem 0; border-color: var(--border-color);">
                <h3>Solutions (${solutions.length})</h3>
            `;
            
            html += solutions.map((s, idx) => `
                <div class="solution-item">
                    <div class="solution-header">
                        <span class="solution-solver">${s.solver.slice(0, 6)}...${s.solver.slice(-4)}</span>
                        ${s.isWinner ? '<span style="color: var(--success);">★ Winner</span>' : ''}
                    </div>
                    <p>${escapeHtml(s.solution)}</p>
                    ${challenge.creator.toLowerCase() === userAddress?.toLowerCase() && isOpen && !s.isWinner ? 
                        `<button onclick="selectWinner(${challengeId}, ${idx})" class="btn-primary" style="margin-top: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem;">Select as Winner</button>` : ''}
                </div>
            `).join('');
        }
        
        document.getElementById('challengeDetail').innerHTML = html;
        modal.classList.add('active');
        
    } catch (error) {
        console.error('Error loading challenge detail:', error);
        alert('Error loading challenge details');
    }
}

// Submit solution
async function submitSolution(challengeId) {
    try {
        const solutionText = document.getElementById('solutionText').value;
        if (!solutionText.trim()) {
            alert('Please enter a solution');
            return;
        }
        
        const tx = await contract.submitSolution(challengeId, solutionText);
        await tx.wait();
        
        alert('Solution submitted successfully!');
        modal.classList.remove('active');
        loadChallenges();
        
    } catch (error) {
        console.error('Error submitting solution:', error);
        alert('Error: ' + error.message);
    }
}

// Select winner (for challenge creators)
async function selectWinner(challengeId, solutionId) {
    try {
        const tx = await contract.selectWinner(challengeId, solutionId);
        await tx.wait();
        
        alert('Winner selected! Reward has been transferred.');
        modal.classList.remove('active');
        loadChallenges();
        
    } catch (error) {
        console.error('Error selecting winner:', error);
        alert('Error: ' + error.message);
    }
}

// Create challenge
async function createChallenge(e) {
    e.preventDefault();
    
    if (!contract) {
        alert('Please connect your wallet first');
        return;
    }
    
    try {
        const title = document.getElementById('title').value;
        const description = document.getElementById('description').value;
        const category = document.getElementById('category').value;
        const reward = document.getElementById('reward').value;
        const duration = document.getElementById('duration').value;
        
        const tx = await contract.createChallenge(
            title,
            description,
            category,
            duration,
            { value: ethers.utils.parseEther(reward) }
        );
        
        await tx.wait();
        
        alert('Challenge created successfully!');
        createForm.reset();
        
        // Switch to challenges tab
        document.querySelector('[data-tab="challenges"]').click();
        loadChallenges();
        loadUserStats();
        
    } catch (error) {
        console.error('Error creating challenge:', error);
        alert('Error: ' + error.message);
    }
}

// Load user stats
async function loadUserStats() {
    if (!userAddress || !contract) return;
    
    try {
        const stats = await contract.getAgentStats(userAddress);
        
        document.getElementById('statsContent').innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.reputation.toString()}</div>
                <div class="stat-label">Reputation</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.challengesCreated.toString()}</div>
                <div class="stat-label">Challenges Created</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.challengesWon.toString()}</div>
                <div class="stat-label">Challenges Won</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.solutionsSubmitted.toString()}</div>
                <div class="stat-label">Solutions Submitted</div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('statsContent').innerHTML = '<p class="empty-state">Error loading stats</p>';
    }
}

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(tabId + 'Tab').classList.add('active');
        
        if (tabId === 'stats') {
            loadUserStats();
        }
    });
});

// Event listeners
connectWalletBtn.addEventListener('click', connectWallet);
createForm.addEventListener('submit', createChallenge);
closeModal.addEventListener('click', () => modal.classList.remove('active'));
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeLeft(seconds) {
    if (seconds < 60) return `${seconds}s left`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m left`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h left`;
    return `${Math.floor(seconds / 86400)}d left`;
}

// Make functions available globally for onclick handlers
window.openChallengeDetail = openChallengeDetail;
window.submitSolution = submitSolution;
window.selectWinner = selectWinner;

// Initialize
init();
