import {Contract} from "ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {parseUnits, formatUnits} from "ethers/lib/utils";
import hre from "hardhat";
import {rewardVaultFixture, tokenFixture} from "./fixture";

let rewardToken: Contract;

describe('RewardVault', () => {
    beforeEach(async () => {
        rewardToken = await tokenFixture("STRIPS", "Strips Reward Token", 18);
    });

    it('constructor', async () => {
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address);

        expect(await rewardVault.token()).to.eq(rewardToken.address);
    });

    it('period change', async () => {
        const [_, trader] = await ethers.getSigners();
        const rewardVault = await rewardVaultFixture(rewardToken.address);

        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(1));

        await rewardVault.onTrade(trader.address, parseUnits("10000"));
        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(1));

        await rewardVault.onTrade(trader.address, parseUnits("10000"));
        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(1));

        await hre.network.provider.request({method: "evm_increaseTime", params: [3600 * 24 * 30]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        await rewardVault.onTrade(trader.address, parseUnits("10000"));
        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(2));

        await rewardVault.onTrade(trader.address, parseUnits("10000"));
        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(2));

        await hre.network.provider.request({method: "evm_increaseTime", params: [3600 * 24 * 30]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        await rewardVault.onTrade(trader.address, parseUnits("10000"));
        expect(await rewardVault.periodId()).to.eq(ethers.BigNumber.from(3));
    });

    it('trader reward', async () => {
        const [_, trader1, trader2, trader3, trader4] = await ethers.getSigners();
        const rewardVault = await rewardVaultFixture(rewardToken.address);
        await rewardToken.transferOwnership(rewardVault.address); // For minting by vault in claimReward method

        // period 1
        await rewardVault.onTrade(trader1.address, parseUnits("100000"));
        await rewardVault.onTrade(trader2.address, parseUnits("50000"));
        await rewardVault.onTrade(trader3.address, parseUnits("100000"));
        await rewardVault.onTrade(trader2.address, parseUnits("25000"));

        await hre.network.provider.request({method: "evm_increaseTime", params: [3600 * 24 * 30]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        // period 2
        await rewardVault.onTrade(trader4.address, parseUnits("100000"));
        await rewardVault.onTrade(trader2.address, parseUnits("25000"));

        await hre.network.provider.request({method: "evm_increaseTime", params: [3600 * 24 * 30]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        // period 3-4
        await rewardVault.onTrade(trader1.address, parseUnits("100000"));

        await hre.network.provider.request({method: "evm_increaseTime", params: [2 * 3600 * 24 * 30]});
        await hre.network.provider.request({method: "evm_mine", params: []});

        // period 5
        const pendingReward1 = await rewardVault.pendingReward(trader1.address);
        const pendingReward2 = await rewardVault.pendingReward(trader2.address);
        const pendingReward3 = await rewardVault.pendingReward(trader3.address);
        const pendingReward4 = await rewardVault.pendingReward(trader4.address);

        await rewardVault.connect(trader1).claimReward();
        await rewardVault.connect(trader2).claimReward();
        await rewardVault.connect(trader3).claimReward();
        await rewardVault.connect(trader4).claimReward();

        // some checks
        const trader1Balance = await rewardToken.balanceOf(trader1.address);
        const trader2Balance = await rewardToken.balanceOf(trader2.address);
        const trader3Balance = await rewardToken.balanceOf(trader3.address);
        const trader4Balance = await rewardToken.balanceOf(trader4.address);

        expect(pendingReward1).to.eq(trader1Balance);
        expect(pendingReward2).to.eq(trader2Balance);
        expect(pendingReward3).to.eq(trader3Balance);
        expect(pendingReward4).to.eq(trader4Balance);

        expect(trader4Balance.lt(trader3Balance)).to.true;
        expect(trader2Balance.lt(trader1Balance)).to.true;
    });
});
