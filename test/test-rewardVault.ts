import {Contract, BigNumber} from "ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {parseUnits, formatUnits} from "ethers/lib/utils";
import hre from "hardhat";
import {rewardVaultFixture, tokenFixture} from "./fixture";

let rewardToken: Contract;

describe('RewardVault', () => {
    beforeEach(async () => {
        rewardToken = await tokenFixture("STRIPS", "Strips Reward Token", 6);
    });

    it('constructor', async () => {
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address);

        expect(await rewardVault.token()).to.eq(rewardToken.address);
    });

    it('period volumes', async () => {
        const [_, trader1, trader2, trader3] = await ethers.getSigners();
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address);
        const periodId = await rewardVault.periodId();

        await rewardVault.connect(trader1).openLongPosition(parseUnits("100000", 18));
        await rewardVault.connect(trader2).openShortPosition(parseUnits("50000", 18));
        await rewardVault.connect(trader3).openLongPosition(parseUnits("100000", 18));
        await rewardVault.connect(trader2).openLongPosition(parseUnits("25000", 18));

        const period = await rewardVault.periods(periodId);
        const trader2Volume = await rewardVault.traderVolume(trader2.address, periodId);

        expect(period.volume.eq(parseUnits("275000", 18))).to.true;
        expect(trader2Volume.eq(parseUnits("75000", 18))).to.true;
    });

    it('period bounds', async () => {
        const [_, trader1, trader2, trader3, trader4] = await ethers.getSigners();
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address);
        const periodId = await rewardVault.periodId();
        const periodTimestamp = (await rewardVault.periods(periodId)).timestamp;

        await rewardVault.connect(trader1).openLongPosition(parseUnits("100000", 18));
        await rewardVault.connect(trader1).openShortPosition(parseUnits("50000", 18));
        await hre.network.provider.request({method: "evm_increaseTime", params: [2592000]});
        await hre.network.provider.request({method: "evm_mine", params: []});
        await expect(rewardVault.connect(trader1).openLongPosition(parseUnits("10000", 18)))
            .to.be.revertedWith("WRONG_TIMESTAMP: period already ended");

        // add new period
        await rewardVault.addPeriod(periodTimestamp.add(2592000), 2592000, 3870);
        expect(periodId.add(1)).to.eq(await rewardVault.periodId());

        await rewardVault.connect(trader4).openShortPosition(parseUnits("100000", 18));
    })

    it('period pending claim', async () => {
        const [_, trader1, trader2, trader3, trader4] = await ethers.getSigners();
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address);
        const periodId = await rewardVault.periodId();
        let periodTimestamp = (await rewardVault.periods(periodId)).timestamp;

        await rewardVault.connect(trader1).openLongPosition(100000);
        await rewardVault.connect(trader2).openShortPosition(50000);
        await rewardVault.connect(trader3).openLongPosition(100000);
        await rewardVault.connect(trader2).openLongPosition(25000);

        // add new period
        periodTimestamp = periodTimestamp.add(2592000);
        await rewardVault.addPeriod(periodTimestamp, 2592000, 3870);
        await hre.network.provider.request({method: "evm_increaseTime", params: [2592000]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        await rewardVault.connect(trader4).openShortPosition(100000);
        await rewardVault.connect(trader2).openLongPosition(25000);

        // add new period
        periodTimestamp = periodTimestamp.add(2592000);
        await rewardVault.addPeriod(periodTimestamp, 2592000, 3870);
        await hre.network.provider.request({method: "evm_increaseTime", params: [2592000]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        await rewardVault.connect(trader1).openShortPosition(100000);

        // add new period
        periodTimestamp = periodTimestamp.add(2592000);
        await rewardVault.addPeriod(periodTimestamp, 2592000, 3870);
        await hre.network.provider.request({method: "evm_increaseTime", params: [2592000]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        // check pending rewards
        const trader1Pending = await rewardVault.pendingAll(trader1.address);
        const trader2Pending = await rewardVault.pendingAll(trader2.address);
        const trader3Pending = await rewardVault.pendingAll(trader3.address);
        const trader4Pending = await rewardVault.pendingAll(trader4.address);

        expect(trader1Pending.eq(582610)).to.true;
        expect(trader2Pending.eq(229913)).to.true;
        expect(trader3Pending.eq(195610)).to.true;
        expect(trader4Pending.eq(332820)).to.true;

        // claim rewards
        await rewardVault.connect(trader1).claimAll();
        await rewardVault.connect(trader2).claimAll();
        await rewardVault.connect(trader3).claimAll();
        await rewardVault.connect(trader4).claimAll();

        // check pending rewards after claim
        const trader1PendingAfter = await rewardVault.pendingAll(trader1.address);
        const trader2PendingAfter = await rewardVault.pendingAll(trader2.address);
        const trader3PendingAfter = await rewardVault.pendingAll(trader3.address);
        const trader4PendingAfter = await rewardVault.pendingAll(trader4.address);

        expect(trader1PendingAfter.eq("0")).to.true;
        expect(trader2PendingAfter.eq("0")).to.true;
        expect(trader3PendingAfter.eq("0")).to.true;
        expect(trader4PendingAfter.eq("0")).to.true;

        const trader1Balance = await rewardToken.balanceOf(trader1.address);
        const trader2Balance = await rewardToken.balanceOf(trader2.address);
        const trader3Balance = await rewardToken.balanceOf(trader3.address);
        const trader4Balance = await rewardToken.balanceOf(trader4.address);

        expect(trader1Balance.eq(trader1Pending)).to.true;
        expect(trader2Balance.eq(trader2Pending)).to.true;
        expect(trader3Balance.eq(trader3Pending)).to.true;
        expect(trader4Balance.eq(trader4Pending)).to.true;
    });
});
