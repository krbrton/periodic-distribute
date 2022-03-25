import {ethers, upgrades} from "hardhat";

export async function tokenFixture(symbol: string, name: string, decimals: number) {
    const ERC20Token = await ethers.getContractFactory("ERC20Token");
    const erc20Token = await upgrades.deployProxy(ERC20Token, [name, symbol, decimals]);
    await erc20Token.deployed();

    return erc20Token;
}

export async function rewardVaultFixture(rewardToken: string) {
    const RewardVault = await ethers.getContractFactory("RewardVault");
    const rewardVault = await upgrades.deployProxy(RewardVault, [rewardToken]);
    await rewardVault.deployed();

    return rewardVault;
}
