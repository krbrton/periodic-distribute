// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IERC20.sol";

contract RewardVault is Initializable, OwnableUpgradeable {
    struct PeriodInfo {
        uint256 timestamp;   // Period start timestamp
        uint256 duration;    // Period duration
        uint256 volume;      // Cumulative market volume for period
        uint256 accPerShare; // Seconds accumulator per market volume
    }

    struct TraderInfo {
        uint256 lastPeriodId;    // Period id from last trade of trader
        uint256 lastAccPerShare; // Last accumulated seconds of period reward was paid
        // TODO: create mapping PeriodTraderInfo and move trader's volume to save history of every trader in every period
        uint256 volume;          // Current period trader's volume
        uint256 debt;            // Debt from previous periods
        uint256 debtPaid;        // Paid debt from previous periods
    }

    event Reward(address trader, uint256 notional, uint256 reward);
    event PeriodChanged(uint256 id, uint256 timestamp, uint256 duration);

    uint256 constant periodDuration = 3600 * 24 * 30;
    uint256 constant rewardPerSecond = 3870;
    uint256 constant precision = 1e36;

    address public token;
    mapping(address => TraderInfo) public traders;
    uint256 public periodId;
    mapping(uint256 => PeriodInfo) private periods;
    uint256 lastTradeTimestamp;

    function initialize(address _token) public initializer syncPeriod {
        __Ownable_init();

        token = _token;
    }

    modifier syncPeriod() {
        PeriodInfo storage period = periods[periodId];
        uint256 periodEnd = period.timestamp + period.duration;
        uint256 newPeriodEnd = periodEnd + periodDuration;

        if (block.timestamp > periodEnd) {
            // If there was no trades more than `periodDuration` since last period end then extend duration
            if (block.timestamp > newPeriodEnd) {
                newPeriodEnd = block.timestamp;
            }

            uint256 _periodDuration;

            if (periodEnd == 0) {
                periodEnd = block.timestamp;
                _periodDuration = periodDuration;
            } else {
                _periodDuration = newPeriodEnd - periodEnd;
            }

            periodId += 1;
            periods[periodId] = PeriodInfo(periodEnd, _periodDuration, 0, 0);
            lastTradeTimestamp = block.timestamp;

            emit PeriodChanged(periodId, periodEnd, _periodDuration);
        }

        _;
    }

    function onTrade(address _trader, int256 _notional) public onlyOwner syncPeriod {
        PeriodInfo storage period = periods[periodId];
        TraderInfo storage trader = traders[_trader];
        uint256 notional = uint256(_notional >= 0 ? _notional : -_notional);
        uint256 rewardSeconds = block.timestamp - lastTradeTimestamp;

        // If trader's period is changed increase his debt and change his periodId
        if (trader.lastPeriodId != periodId) {
            trader.debt += pendingReward(_trader);
            trader.lastPeriodId = periodId;
            trader.volume = 0;
        }

        trader.volume += notional;
        period.volume += notional;
        period.accPerShare += rewardSeconds * precision / period.volume;
        lastTradeTimestamp = block.timestamp;
    }

    function pendingReward(address _trader) public view returns (uint256) {
        TraderInfo storage trader = traders[_trader];
        PeriodInfo storage period = periods[trader.lastPeriodId];
        uint256 newAccPerShare = period.accPerShare - trader.lastAccPerShare;
        uint8 tokenDecimals = IERC20(token).decimals();
        uint256 currentPending = newAccPerShare * rewardPerSecond * trader.volume * (1 << tokenDecimals) / precision / 1e4;
        uint256 debtPending = trader.debt - trader.debtPaid;

        return currentPending + debtPending;
    }

    function claimReward() public syncPeriod {
        TraderInfo storage trader = traders[_msgSender()];
        PeriodInfo storage period = periods[trader.lastPeriodId];

        require(trader.volume > 0, "INVALID_TRADER");
        uint256 pending = pendingReward(_msgSender());
        IERC20(token).mint(_msgSender(), pending);

        trader.lastAccPerShare = period.accPerShare;
        trader.debtPaid = trader.debt;
    }
}
