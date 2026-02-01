// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentChallenge {
    struct Challenge {
        address creator;
        string title;
        string description;
        string category;
        uint256 reward;
        uint256 deadline;
        ChallengeStatus status;
        address winner;
        string winningSolution;
        uint256 createdAt;
        uint256 solutionCount;
    }

    struct Solution {
        address solver;
        string solution;
        uint256 submittedAt;
        bool isWinner;
    }

    enum ChallengeStatus {
        Open,
        Completed,
        Expired,
        Cancelled
    }

    // State variables
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => mapping(uint256 => Solution)) public solutions;
    mapping(uint256 => uint256) public solutionCounts;
    mapping(address => uint256) public agentReputation;
    mapping(address => uint256) public agentChallengesCreated;
    mapping(address => uint256) public agentChallengesWon;
    mapping(address => uint256) public agentSolutionsSubmitted;

    uint256 public challengeCount;
    uint256 public totalRewardsDistributed;
    uint256 public platformFeePercent = 0; // Start with 0% fees

    // Events
    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        string title,
        string category,
        uint256 reward,
        uint256 deadline
    );

    event SolutionSubmitted(
        uint256 indexed challengeId,
        uint256 indexed solutionId,
        address indexed solver,
        string solution
    );

    event ChallengeCompleted(
        uint256 indexed challengeId,
        address indexed winner,
        string winningSolution,
        uint256 reward
    );

    event ChallengeExpired(
        uint256 indexed challengeId,
        uint256 refundAmount
    );

    event ReputationUpdated(
        address indexed agent,
        uint256 newReputation,
        string reason
    );

    // Modifiers
    modifier challengeExists(uint256 _challengeId) {
        require(_challengeId < challengeCount, "Challenge does not exist");
        _;
    }

    modifier onlyCreator(uint256 _challengeId) {
        require(challenges[_challengeId].creator == msg.sender, "Not challenge creator");
        _;
    }

    modifier challengeOpen(uint256 _challengeId) {
        require(challenges[_challengeId].status == ChallengeStatus.Open, "Challenge not open");
        require(block.timestamp < challenges[_challengeId].deadline, "Challenge expired");
        _;
    }

    // Functions

    function createChallenge(
        string calldata _title,
        string calldata _description,
        string calldata _category,
        uint256 _duration
    ) external payable returns (uint256) {
        require(msg.value > 0, "Reward must be greater than 0");
        require(_duration >= 1 hours, "Duration must be at least 1 hour");
        require(_duration <= 30 days, "Duration cannot exceed 30 days");

        uint256 challengeId = challengeCount;

        challenges[challengeId] = Challenge({
            creator: msg.sender,
            title: _title,
            description: _description,
            category: _category,
            reward: msg.value,
            deadline: block.timestamp + _duration,
            status: ChallengeStatus.Open,
            winner: address(0),
            winningSolution: "",
            createdAt: block.timestamp,
            solutionCount: 0
        });

        agentChallengesCreated[msg.sender]++;
        
        // Small reputation boost for creating challenges
        _updateReputation(msg.sender, 5, "Created challenge");

        challengeCount++;

        emit ChallengeCreated(
            challengeId,
            msg.sender,
            _title,
            _category,
            msg.value,
            block.timestamp + _duration
        );

        return challengeId;
    }

    function submitSolution(
        uint256 _challengeId,
        string calldata _solution
    ) external challengeExists(_challengeId) challengeOpen(_challengeId) returns (uint256) {
        require(bytes(_solution).length > 0, "Solution cannot be empty");
        require(msg.sender != challenges[_challengeId].creator, "Creator cannot submit solution");

        uint256 solutionId = solutionCounts[_challengeId];

        solutions[_challengeId][solutionId] = Solution({
            solver: msg.sender,
            solution: _solution,
            submittedAt: block.timestamp,
            isWinner: false
        });

        solutionCounts[_challengeId]++;
        challenges[_challengeId].solutionCount++;
        agentSolutionsSubmitted[msg.sender]++;

        // Small reputation boost for submitting solutions
        _updateReputation(msg.sender, 2, "Submitted solution");

        emit SolutionSubmitted(_challengeId, solutionId, msg.sender, _solution);

        return solutionId;
    }

    function selectWinner(
        uint256 _challengeId,
        uint256 _solutionId
    ) external challengeExists(_challengeId) onlyCreator(_challengeId) {
        Challenge storage challenge = challenges[_challengeId];
        require(challenge.status == ChallengeStatus.Open, "Challenge not open");
        require(_solutionId < solutionCounts[_challengeId], "Invalid solution ID");

        Solution storage solution = solutions[_challengeId][_solutionId];
        require(!solution.isWinner, "Solution already selected as winner");

        // Mark challenge as completed
        challenge.status = ChallengeStatus.Completed;
        challenge.winner = solution.solver;
        challenge.winningSolution = solution.solution;
        solution.isWinner = true;

        agentChallengesWon[solution.solver]++;
        totalRewardsDistributed += challenge.reward;

        // Significant reputation boost for winning
        _updateReputation(solution.solver, 25, "Won challenge");

        // Transfer reward to winner
        (bool success, ) = payable(solution.solver).call{value: challenge.reward}("");
        require(success, "Reward transfer failed");

        emit ChallengeCompleted(
            _challengeId,
            solution.solver,
            solution.solution,
            challenge.reward
        );
    }

    function expireChallenge(
        uint256 _challengeId
    ) external challengeExists(_challengeId) {
        Challenge storage challenge = challenges[_challengeId];
        require(challenge.status == ChallengeStatus.Open, "Challenge not open");
        require(block.timestamp >= challenge.deadline, "Deadline not reached");

        challenge.status = ChallengeStatus.Expired;

        // Refund creator
        (bool success, ) = payable(challenge.creator).call{value: challenge.reward}("");
        require(success, "Refund failed");

        emit ChallengeExpired(_challengeId, challenge.reward);
    }

    function cancelChallenge(
        uint256 _challengeId
    ) external challengeExists(_challengeId) onlyCreator(_challengeId) {
        Challenge storage challenge = challenges[_challengeId];
        require(challenge.status == ChallengeStatus.Open, "Challenge not open");
        require(block.timestamp < challenge.deadline, "Already expired");
        require(solutionCounts[_challengeId] == 0, "Cannot cancel with solutions");

        challenge.status = ChallengeStatus.Cancelled;

        // Refund creator
        (bool success, ) = payable(challenge.creator).call{value: challenge.reward}("");
        require(success, "Refund failed");

        // Reduce reputation for cancelling
        _updateReputation(msg.sender, -3, "Cancelled challenge");
    }

    // Internal functions

    function _updateReputation(address _agent, int256 _delta, string memory _reason) internal {
        if (_delta > 0) {
            agentReputation[_agent] += uint256(_delta);
        } else if (_delta < 0 && agentReputation[_agent] >= uint256(-_delta)) {
            agentReputation[_agent] -= uint256(-_delta);
        }

        emit ReputationUpdated(_agent, agentReputation[_agent], _reason);
    }

    // View functions

    function getChallenge(
        uint256 _challengeId
    ) external view challengeExists(_challengeId) returns (Challenge memory) {
        return challenges[_challengeId];
    }

    function getSolution(
        uint256 _challengeId,
        uint256 _solutionId
    ) external view challengeExists(_challengeId) returns (Solution memory) {
        require(_solutionId < solutionCounts[_challengeId], "Invalid solution ID");
        return solutions[_challengeId][_solutionId];
    }

    function getAllSolutions(
        uint256 _challengeId
    ) external view challengeExists(_challengeId) returns (Solution[] memory) {
        uint256 count = solutionCounts[_challengeId];
        Solution[] memory allSolutions = new Solution[](count);
        for (uint256 i = 0; i < count; i++) {
            allSolutions[i] = solutions[_challengeId][i];
        }
        return allSolutions;
    }

    function getOpenChallenges() external view returns (uint256[] memory) {
        uint256 openCount = 0;
        for (uint256 i = 0; i < challengeCount; i++) {
            if (challenges[i].status == ChallengeStatus.Open && block.timestamp < challenges[i].deadline) {
                openCount++;
            }
        }

        uint256[] memory openChallengeIds = new uint256[](openCount);
        uint256 index = 0;
        for (uint256 i = 0; i < challengeCount; i++) {
            if (challenges[i].status == ChallengeStatus.Open && block.timestamp < challenges[i].deadline) {
                openChallengeIds[index] = i;
                index++;
            }
        }

        return openChallengeIds;
    }

    function getChallengesByCategory(
        string calldata _category
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < challengeCount; i++) {
            if (keccak256(bytes(challenges[i].category)) == keccak256(bytes(_category))) {
                count++;
            }
        }

        uint256[] memory challengeIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < challengeCount; i++) {
            if (keccak256(bytes(challenges[i].category)) == keccak256(bytes(_category))) {
                challengeIds[index] = i;
                index++;
            }
        }

        return challengeIds;
    }

    function getAgentStats(
        address _agent
    ) external view returns (
        uint256 reputation,
        uint256 challengesCreated,
        uint256 challengesWon,
        uint256 solutionsSubmitted
    ) {
        return (
            agentReputation[_agent],
            agentChallengesCreated[_agent],
            agentChallengesWon[_agent],
            agentSolutionsSubmitted[_agent]
        );
    }

    function getTopAgents(
        uint256 _limit
    ) external view returns (address[] memory, uint256[] memory) {
        // This is a simplified version - in production, you'd want a more efficient sorting mechanism
        uint256 limit = _limit > challengeCount * 2 ? challengeCount * 2 : _limit;
        
        address[] memory agents = new address[](limit);
        uint256[] memory reputations = new uint256[](limit);
        
        // Collect unique agents
        uint256 agentCount = 0;
        for (uint256 i = 0; i < challengeCount && agentCount < limit; i++) {
            address creator = challenges[i].creator;
            if (agentReputation[creator] > 0) {
                bool alreadyAdded = false;
                for (uint256 j = 0; j < agentCount; j++) {
                    if (agents[j] == creator) {
                        alreadyAdded = true;
                        break;
                    }
                }
                if (!alreadyAdded) {
                    agents[agentCount] = creator;
                    reputations[agentCount] = agentReputation[creator];
                    agentCount++;
                }
            }
        }

        // Simple bubble sort by reputation
        for (uint256 i = 0; i < agentCount - 1; i++) {
            for (uint256 j = 0; j < agentCount - i - 1; j++) {
                if (reputations[j] < reputations[j + 1]) {
                    uint256 tempRep = reputations[j];
                    reputations[j] = reputations[j + 1];
                    reputations[j + 1] = tempRep;
                    
                    address tempAgent = agents[j];
                    agents[j] = agents[j + 1];
                    agents[j + 1] = tempAgent;
                }
            }
        }

        // Trim arrays to actual size
        address[] memory topAgents = new address[](agentCount);
        uint256[] memory topReputations = new uint256[](agentCount);
        for (uint256 i = 0; i < agentCount; i++) {
            topAgents[i] = agents[i];
            topReputations[i] = reputations[i];
        }

        return (topAgents, topReputations);
    }
}
