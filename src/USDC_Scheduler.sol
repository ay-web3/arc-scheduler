// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

contract USDCScheduler {
    IERC20 public immutable usdc;
    address public immutable executor;
    uint256 public immutable feeBps; // fee in basis points (100 = 1%)

    uint256 public paymentCount;

    struct ScheduledPayment {
        address sender;
        address recipient;
        uint256 amount;
        uint256 executeAfter;
        bool executed;
        bool cancelled;
    }

    mapping(uint256 => ScheduledPayment) public payments;

    event SentNow(address indexed sender, address indexed recipient, uint256 amount);
    event Scheduled(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 executeAfter
    );
    event Executed(uint256 indexed id, uint256 feePaid);
    event Cancelled(uint256 indexed id);

    constructor(
        address _usdc,
        address _executor,
        uint256 _feeBps
    ) {
        require(_feeBps <= 500, "Fee too high"); // max 5%
        usdc = IERC20(_usdc);
        executor = _executor;
        feeBps = _feeBps;
    }

    // SEND NOW (no fee)
    function sendNow(address recipient, uint256 amount) external {
        require(amount > 0, "Amount > 0");

        bool ok = usdc.transferFrom(msg.sender, recipient, amount);
        require(ok, "Transfer failed");

        emit SentNow(msg.sender, recipient, amount);
    }

    // SCHEDULE PAYMENT (locks full amount)
    function schedulePayment(
        address recipient,
        uint256 amount,
        uint256 executeAfter
    ) external {
        require(amount > 0, "Amount > 0");
        require(executeAfter > block.timestamp, "Future only");

        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        require(ok, "Lock failed");

        payments[paymentCount] = ScheduledPayment({
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            executeAfter: executeAfter,
            executed: false,
            cancelled: false
        });

        emit Scheduled(paymentCount, msg.sender, recipient, amount, executeAfter);
        paymentCount++;
    }

    // EXECUTE (fee paid to executor)
    function executePayment(uint256 id) external {
        ScheduledPayment storage p = payments[id];

        require(!p.executed, "Executed");
        require(!p.cancelled, "Cancelled");
        require(block.timestamp >= p.executeAfter, "Too early");

        p.executed = true;

        uint256 fee = (p.amount * feeBps) / 10_000;
        uint256 netAmount = p.amount - fee;

        require(usdc.transfer(p.recipient, netAmount), "Recipient transfer failed");

        if (fee > 0) {
            require(usdc.transfer(executor, fee), "Fee transfer failed");
        }

        emit Executed(id, fee);
    }

    function cancelPayment(uint256 id) external {
        ScheduledPayment storage p = payments[id];

        require(msg.sender == p.sender, "Not sender");
        require(!p.executed, "Executed");
        require(!p.cancelled, "Cancelled");

        p.cancelled = true;

        require(usdc.transfer(p.sender, p.amount), "Refund failed");

        emit Cancelled(id);
    }
}
