// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    address public projectManager;
    uint constant VOTE_COST = 0.01 ether;
    uint constant MAX_VOTES = 5;
    bool public votingClosed;
    event VoteCast(address indexed voter, uint256 proposalIndex);

    struct Proposal {
        string name;
        uint voteCount;
    }

    struct VotingRound {
        uint256 roundNumber;
        string winnerName;
        uint256 winningVoteCount;
    }

    Proposal[] public proposals;
    VotingRound[] public votingRounds;
    mapping(address => uint) public votesPerVoter;
    address[] public voters;

    modifier onlyProjectManager() {
        require(msg.sender == projectManager, "Only the project manager can call this function.");
        _;
    }

    modifier validVote() {
        require(!votingClosed, "Voting is closed.");
        require(msg.value == VOTE_COST, "Incorrect ether value sent.");
        require(msg.sender != projectManager, "Project manager cannot vote.");
        _;
    }

    constructor() {
        projectManager = msg.sender;
        proposals.push(Proposal("Elon", 0));
        proposals.push(Proposal("Mark", 0));
        proposals.push(Proposal("Sam", 0));
        votingClosed = false;
    }

    function vote(uint proposalIndex) public payable validVote {
        require(proposalIndex < proposals.length, "Invalid proposal index.");
        require(votesPerVoter[msg.sender] < MAX_VOTES, "Exceeds maximum votes per voter.");

        proposals[proposalIndex].voteCount += 1;
        votesPerVoter[msg.sender] += 1;
        voters.push(msg.sender);

        emit VoteCast(msg.sender, proposalIndex);
    }

    function getUserVotes(address user) public view returns (uint) {
        return MAX_VOTES - votesPerVoter[user];
    }

    function declareWinner() public onlyProjectManager returns (string memory winnerName) {
        require(votingOpen(), "Voting is already closed.");
        uint winningVoteCount = 0;
        uint winningProposalIndex;
        bool tie = false;

        for (uint i = 0; i < proposals.length; i++) {
            if (proposals[i].voteCount > winningVoteCount) {
                winningVoteCount = proposals[i].voteCount;
                winningProposalIndex = i;
                tie = false;
            } else if (proposals[i].voteCount == winningVoteCount) {
                tie = true;
            }
        }

        if (tie) {
            winningProposalIndex = drawTie();
        }

        winnerName = proposals[winningProposalIndex].name;

        votingRounds.push(VotingRound(votingRounds.length + 1, winnerName, winningVoteCount));

        votingClosed = true;
    }

    function getVoteCount(uint proposalIndex) public view returns(uint){
        return proposals[proposalIndex].voteCount;
    }

    function votingOpen() public view returns (bool) {
        return !votingClosed;
    }

    function drawTie() internal view returns (uint) {
        uint[] memory tiedProposals = new uint[](proposals.length);
        uint count = 0;
        uint winningVoteCount = proposals[0].voteCount;

        for (uint i = 0; i < proposals.length; i++) {
            if (proposals[i].voteCount == winningVoteCount) {
                tiedProposals[count] = i;
                count++;
            }
        }

        uint randomIndex = uint(blockhash(block.number - 1)) % count;
        return tiedProposals[randomIndex];
    }

    function getRecentResults() public view returns (uint256[] memory, string[] memory, uint256[] memory) {
        uint256[] memory roundNumbers = new uint256[](votingRounds.length);
        string[] memory winningProposalNames = new string[](votingRounds.length);
        uint256[] memory winningVoteCounts = new uint256[](votingRounds.length);

        for (uint256 i = 0; i < votingRounds.length; i++) {
            roundNumbers[i] = votingRounds[i].roundNumber;
            winningProposalNames[i] = votingRounds[i].winnerName;
            winningVoteCounts[i] = votingRounds[i].winningVoteCount;
        }

        return (roundNumbers, winningProposalNames, winningVoteCounts);
    }

    function resetVote() external {
        require(msg.sender == projectManager, "Only the contract owner can reset the vote.");
        require(votingClosed, "Voting process is still open.");

        for (uint i = 0; i < proposals.length; i++) {
            proposals[i].voteCount = 0;
        }

        for (uint i = 0; i < voters.length; i++) {
            votesPerVoter[voters[i]] = 0;
        }

        votingClosed = false;
    }
}
