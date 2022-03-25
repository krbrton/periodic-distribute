// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IERC20Minter.sol";
import "hardhat/console.sol";

contract RewardVault is Initializable, OwnableUpgradeable {
    event Claimed(address trader, uint256 amount);

    struct TraderInfo {
        uint256 volume;
        uint256 long;
        uint256 short;
        uint256 claimed;
        uint256 lastAccPerShare;
    }

    struct PeriodInfo {
        uint256 timestamp;
        uint256 duration;
        uint256 coefficient;
        uint256 volume;
        uint256 accPerShare;
        mapping(address => TraderInfo) traders;
    }

    // NOTE: this is constant only because this task is test, in production more general interface is required
    uint256 public constant periodCoefficient = 3870; // used to setup reward rate per second, in base points
    uint256 public constant periodDuration = 2592000; // current period

    address public token;                               // ERC20 token address to pay rewards in
    uint256 public periodId;                            // Current period id
    mapping(uint256 => PeriodInfo) public periods;      // periods history with all related info
    mapping(address => uint256) public traderLastClaim; // Last period trader claimed his reward

    function initialize(address _token) public initializer {
        __Ownable_init();

        token = _token;

        addPeriod(block.timestamp, periodDuration, periodCoefficient);
    }

    modifier checkPeriod() {
        require(periods[periodId].timestamp <= block.timestamp, "WRONG_TIMESTAMP: period not started");
        require(block.timestamp < periods[periodId].timestamp + periods[periodId].duration, "WRONG_TIMESTAMP: period already ended");
        _;
    }

    function addPeriod(uint256 _timestamp, uint256 _duration, uint256 _coefficient) public onlyOwner {
//        require(_timestamp + _duration < block.timestamp, "WRONG_TIMESTAMP: already ended");

        if (periodId > 0) {
            uint256 lastPeriodEndTimestamp = periods[periodId].timestamp + periods[periodId].duration;

            require(lastPeriodEndTimestamp <= _timestamp, "WRONG_TIMESTAMP: overlap with previous period");
        }

        periodId += 1;
        periods[periodId].timestamp = _timestamp;
        periods[periodId].duration = _duration;
        periods[periodId].coefficient = _coefficient;
    }

    function openLongPosition(uint256 amount) public checkPeriod {
        periods[periodId].volume += amount;
        periods[periodId].traders[msg.sender].volume += amount;
        periods[periodId].traders[msg.sender].long += amount;

        distribute(periodId, amount);
    }

    function openShortPosition(uint256 amount) public checkPeriod {
        periods[periodId].volume += amount;
        periods[periodId].traders[msg.sender].volume += amount;
        periods[periodId].traders[msg.sender].short += amount;

        distribute(periodId, amount);
    }

    function periodTimePassed(uint256 _periodId) public view returns (uint256) {
        uint256 duration = block.timestamp - periods[_periodId].timestamp;

        if (duration > periods[_periodId].duration) {
            return periods[_periodId].duration;
        }

        return duration;
    }

    function distribute(uint256 _periodId, uint256 amount) private {
        periods[_periodId].accPerShare += amount * periodTimePassed(_periodId) * periodCoefficient * 1e36 / periods[_periodId].volume / 1e4;
    }

    function pending(address _trader, uint256 _periodId) public view returns (uint256) {
        uint256 newAccPerShare = periods[_periodId].accPerShare - periods[_periodId].traders[_trader].lastAccPerShare;

        return newAccPerShare * periods[_periodId].traders[_trader].volume / 1e36;
    }

    function pendingAll(address _trader) public view returns (uint256) {
        uint256 total = 0;

        // NOTE: actually this is not good, BUT if period's duration is big enough(1 month is enough) - this cycle
        // should have small amount of iterations. Example: only 12 iterations per year because default period
        // size is 1 month.
        for (uint i = traderLastClaim[_trader]; i <= periodId; i++) {
            total += pending(_trader, i);
        }

        return total;
    }

    function claim(uint256 _periodId) public {
        uint pendingReward = pending(msg.sender, _periodId);
        periods[_periodId].traders[msg.sender].claimed += pendingReward;
        IERC20Minter(token).mint(msg.sender, pendingReward);
        periods[_periodId].traders[msg.sender].lastAccPerShare = periods[_periodId].accPerShare;

        emit Claimed(msg.sender, pendingReward);
    }

    function claimAll() public {
        for (uint i = traderLastClaim[msg.sender]; i <= periodId; i++) {
            claim(i);
        }

        traderLastClaim[msg.sender] = periodId;
    }

    function traderClaimed(address _trader, uint256 _periodId) public view returns (uint256) {
        return periods[_periodId].traders[_trader].claimed;
    }

    function traderVolume(address _trader, uint256 _periodId) public view returns (uint256) {
        return periods[_periodId].traders[_trader].volume;
    }
}
