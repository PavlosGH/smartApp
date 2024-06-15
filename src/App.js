import React, { Component } from 'react';
import 'bootstrap/dist/css/bootstrap.css';
import web3 from './web3';
import lottery from './lottery';

// Η κλάση App αποτελεί απόγονο της Component 
// η οποία είναι θεμελιώδης στην react.
// Σε κάθε αλλαγή κάποιας μεταβλητή state της App,
// όλη η ιστοσελίδα (HTML) γίνεται refresh
// καλώντας αυτόματα τη render()...
// ...ΠΡΟΣΟΧΗ! ΔΕΝ γίνεται reload... ΜΟΝΟ refresh
class App extends Component {
  state = {
    projectManager: '',
    balance: '',
    value: '',
    message: '',
    currentAccount: '',
    votesRemaining: null,
    notifications: [],
    voteCounts: [],
    history: []
  };

  // Η componentDidMount() καλείται ΜΟΝΟ την πρώτη φορά
  // που φορτώνει η ιστοσελίδα (είναι σαν την onLoad())
  async componentDidMount() {
    try { // Αν υπάρχει εγκατεστημένο metamask
      // Ορισμός των state μεταβλητών
      const projectManager = await lottery.methods.projectManager().call();
      const balance = await web3.eth.getBalance(lottery.options.address);
      this.setState({ message: '', projectManager, balance });
      try { // Επικοινωνία με το metamask
        const currentAccount = (await window.ethereum.request({ method: 'eth_requestAccounts' }))[0];
        const votesRemaining = Number(await lottery.methods.getUserVotes(currentAccount).call());
        let voteCounts = [];
        for(let i = 0; i < 3; i++){
          const count = await lottery.methods.getVoteCount(i).call();
          voteCounts.push(Number(count));
        } 
        this.setState({ message: '', currentAccount, votesRemaining, voteCounts });
      } catch (error) { // Αν το metamask δεν έκανε accept το request
        this.setState({ message: 'Metamask has not connected yet' });
      }
    } catch (error) { // Αν το metamask δεν έχει εγκατασταθεί
      this.setState({ message: 'Metamask is not installed' });
    }
    // Set up event listeners only once
    // if (!this.eventListenersSet) {
      this.setupEventListeners();
      this.eventListenersSet = true;
    // }
  }

  setupEventListeners() {
    // Κάθε φορά που επιλέγεται άλλο πορτοφόλι στο metamask...
    window.ethereum.on('accountsChanged', async (accounts) => {
      // ... να γίνεται refresh η σελίδα
      const currentAccount = accounts[0];
      const votesRemaining = Number(await lottery.methods.getUserVotes(currentAccount).call());
      this.setState({ currentAccount, votesRemaining });
    });

    lottery.events.VoteCast({}).on('data', (event) => {
      const { voter, proposalIndex } = event.returnValues;

      this.addNotification(`New vote cast by ${voter} for candidate ${Number(proposalIndex)}`);
      this.updateBalanceAndVotes();
      this.updateVoteCounts();
    });
  }

  updateBalanceAndVotes = async () => {
    const balance = await web3.eth.getBalance(lottery.options.address);
    const votesRemaining = Number(await lottery.methods.getUserVotes(this.state.currentAccount).call());
    this.setState({ balance, votesRemaining });
  };

  updateVoteCounts = async () => {
    const voteCounts = [];
    for (let i = 0; i < 3; i++) {
      const count = await lottery.methods.getVoteCount(i).call();
      voteCounts.push(Number(count));
    }
    this.setState({ voteCounts });
  };

  vote = async (candidateIndex) => {
    try {
      const accounts = await web3.eth.getAccounts();
      const currentAccount = accounts[0];

      if (!this.state.currentAccount) {
        this.setState({ message: 'Please connect your wallet using Metamask' });
        return;
      }

      // Έλεγχος αν η ψηφοφορία έχει ολοκληρωθεί
      const votingOpen = await lottery.methods.votingOpen().call();
      if (!votingOpen) {
        this.setState({ message: 'Voting has already ended.' });
        return;
      }

      // Έλεγχος αν ο χρήστης είναι ο ιδιοκτήτης του συμβολαίου
      if (currentAccount === this.state.projectManager) {
        this.setState({ message: 'Contract owner cannot vote.' });
        return;
      }

      // Έλεγχος αν ο χρήστης έχει ξεπεράσει τις 5 ψήφους
      const userRemainingVotes = await lottery.methods.getUserVotes(currentAccount).call();
      if (userRemainingVotes === 5) {
        this.setState({ message: 'You have already used all 5 votes.' });
        return;
      }

      this.setState({ message: 'Waiting on transaction success...' });
    
      await lottery.methods.vote(candidateIndex).send({
        to: lottery.options.address,
        from: this.state.currentAccount,
        value: web3.utils.toWei('0.01', 'ether')
      });

      // Αφού η συναλλαγή ολοκληρωθεί με επιτυχία, ενημερώστε ξανά το balance
      const balance = await web3.eth.getBalance(lottery.options.address);
    
      this.setState({ message: 'Your vote has been cast!' , balance});

      // Μετά την επιτυχή ολοκλήρωση της συναλλαγής, ενημέρωση των ψήφων
      const updatedVotesRemaining = this.state.votesRemaining - 1;
      this.setState({ message: 'Vote successful!', votesRemaining: updatedVotesRemaining });
    } catch (error) {
      console.error('Error voting:', error);
      this.setState({ message: 'Error voting. See console for details.' });
    }
  };

  addNotification = (message) => {
    const newNotification = { id: Date.now(), message };
    this.setState((prevState) => ({
      notifications: [...prevState.notifications, newNotification]
    }));

    setTimeout(() => {
      this.removeNotification(newNotification.id);
    }, 5000); // Remove notification after 5 seconds
  };

  removeNotification = (id) => {
    this.setState((prevState) => ({
      notifications: prevState.notifications.filter(notification => notification.id !== id)
    }));
  };

  handleAction = async (action) => {
    this.setState({ message: 'Waiting on transaction success...' });

    await lottery.methods[action]().send({
      from: this.state.currentAccount
    });

    this.setState({ message: `Action ${action} executed successfully!` });
  };

  updateHistory = async () => {
    const history = [];
    const results = await lottery.methods.getRecentResults().call();
    
    const roundNumbers = results[0];
    const winningProposalNames = results[1];
    const winningVoteCounts = results[2];

    for (let i = 0; i < roundNumbers.length; i++) {
      history.push({
        roundNumber: Number(roundNumbers[i]),
        winningProposalName: winningProposalNames[i],
        winningVoteCount: Number(winningVoteCounts[i]),
      });
    }

    this.setState({ history });
  };

  handleHistoryClick = async () => {
    await this.updateHistory();
  };

  declareWinner = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    await lottery.methods['declareWinner']().send({
      from: this.state.currentAccount
    });

    await this.updateHistory();

    console.log(this.state.history);
    const winnerName = this.state.history[-1].winningProposalName;

    this.setState({ message: `${winnerName} is the voting winner!` });
  };

  resetVote = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    await lottery.methods['resetVote']().send({
      from: this.state.currentAccount
    });
  };


  // Κάθε φορά που η σελίδα γίνεται refresh
  render() {
    return (
      <div>
        <h1>Scrum Voting DApp</h1>
        {/* Εμφάνιση της τρέχουσας διεύθυνσης από το Metamask */}
        <h4>Connected wallet address: {this.state.currentAccount}</h4>

        {/* Εμφάνιση της διεύθυνσης του ιδιοκτήτη του συμβολαίου */}
        <p>Contract manager: {this.state.projectManager}</p>

        {/* Εμφάνιση του συνολικού αποθέματος του συμβολαίου σε ether */}
        <p>Total balance: {web3.utils.fromWei(this.state.balance, 'ether')} ether</p>
        {/* Το σύνολο των ψήφων που έχουν απομείνει */}
        <p>Votes Remaining: {this.state.votesRemaining}</p>
        {/* Ό,τι βρίσκεται εντός των άγκιστρων είναι κώδικας JavaScript */}
        {/* Η σελίδα HLML λειτουργεί αυτόνομα, σαν να εκτελείται σε κάποιον server */}
        <div>
          <p>Elon - Votes: {this.state.voteCounts[0]}</p>  
          <button onClick={() => this.vote(0)} disabled={this.state.votesRemaining <= 0 || this.state.currentAccount.toLowerCase() === this.state.projectManager.toLowerCase()}>Vote</button>
          <p>Mark - Votes: {this.state.voteCounts[1]} </p>
          <button onClick={() => this.vote(1)} disabled={this.state.votesRemaining <= 0 || this.state.currentAccount.toLowerCase() === this.state.projectManager.toLowerCase()}>Vote</button>
          <p>Sam - Votes: {this.state.voteCounts[2]}</p>
          <button onClick={() => this.vote(2)} disabled={this.state.votesRemaining <= 0 || this.state.currentAccount.toLowerCase() === this.state.projectManager.toLowerCase()}>Vote</button>
        </div>

        <hr /> {/*  -------------------- Οριζόντια γραμμή -------------------- */}

        
        <button onClick={this.handleHistoryClick} disabled={this.state.history.length === 0}>History</button>  

        <div>
          {this.state.history.length > 0 ? (
            <ul>
              {this.state.history.map((item, index) => (
                <li key={index}>
                  Round {item.roundNumber}: {item.winningProposalName} - Votes: {item.winningVoteCount}
                </li>
              ))}
            </ul>
          ) : (
            <p>No voting history available</p>
          )}
        </div>

        <div>
          <button onClick={() => this.declareWinner()} disabled={this.state.currentAccount.toLowerCase() !== this.state.projectManager.toLowerCase()}>Declare Winner</button>
          <button onClick={() => this.handleAction('withdraw')}>Withdraw</button>
          <button onClick={() => this.resetVote()}>Reset</button>
          <button onClick={() => this.handleAction('changeOwner')}>Change Owner</button>
          <button onClick={() => this.handleAction('destroy')}>Destroy</button>
        </div>

        <hr />

        <h1>{this.state.message}</h1>
        <div className="notification-container">
          {this.state.notifications.map((notification) => (
            <div key={notification.id} className="notification">
              {notification.message}
            </div>
          ))}
        </div>

        <style jsx="true">{`
          .notification-container {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
          }

          .notification {
            background-color: #fff;
            padding: 10px;
            margin: 5px;
            border: 1px solid #ccc;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
          }
        `}</style>
      </div>
    );
  }
}

export default App;
