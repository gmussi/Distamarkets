import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { Distamarkets, Distamarkets__factory, WFAIRToken, WFAIRToken__factory } from "../build/types";

const MarketState = {
    OPEN: 0,
    ENDED: 1,
    RESOLVED: 2,
    DISPUTED: 3,
    CLOSED: 4,
    CANCELLED: 5
}

let distamarkets: Distamarkets, 
    owner: Signer, 
    creator: Signer, 
    oracle: Signer, 
    trader1: Signer, 
    trader2: Signer, 
    trader3: Signer, 
    trader4: Signer, 
    token: WFAIRToken;

// help functions
const createMarket = async (numOutcomes = 2) => {
    // get market block timestamp
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp; 
    
    // add 1 hour
    let timeLimit = timestampBefore + 3600;

    let marketId = ethers.utils.formatBytes32String (Math.random() + "");
    
    // create market
    await distamarkets.connect(creator).createMarket(marketId, oracle.getAddress(), timeLimit, numOutcomes);
    
    return {marketId, timeLimit};
};

describe("Distamarkets", () => {
    beforeEach(async () => {
        // load all signers
        [owner, creator, oracle, trader1, trader2, trader3, trader4] = await ethers.getSigners(); 

        // deploy token first
        token = await new WFAIRToken__factory(owner).deploy(ethers.utils.parseEther("1000000000"));

        // deploy contract
        distamarkets = await new Distamarkets__factory(owner).deploy(token.address);

        // distribute 1k tokens for each user
        await token.connect(owner).transfer(trader1.getAddress(), ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader2.getAddress(), ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader3.getAddress(), ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader4.getAddress(), ethers.utils.parseEther("1000"));
    });

    describe("Deployment", () => {
        it ("Should return the correct token address", async () => {
            let tokenAddress = await distamarkets.token();
            
            expect(tokenAddress).to.equal(token.address);
        });
    });
    
    describe("Markets", () => {
        it ("Should create markets", async () => {
            // create first market
            let {marketId, timeLimit} = await createMarket();
            
            // check everything was saved correctly
            let [oracleAddr, creatorAddr, numOutcomes, closingTime, , totalStake, , , state]  = await distamarkets.getMarket(marketId);

            expect(oracleAddr).to.equal(await oracle.getAddress());
            expect(creatorAddr).to.equal(await creator.getAddress());
            expect(numOutcomes).to.equal(2);
            expect(closingTime).to.equal(timeLimit);
            expect(totalStake).to.equal(0);
            expect(state).to.equal(MarketState.OPEN);
        });

        it ("Should prevent duplicate ids", async () => {
            let {marketId, timeLimit} = await createMarket();

            await expect(distamarkets.connect(creator).createMarket(marketId, oracle.getAddress(), timeLimit, 2))
            .to.be.revertedWith("Market already exists");
        });

        it ("Should prevent invalid oracle", async () => {
            await expect(distamarkets.connect(creator).createMarket(ethers.utils.formatBytes32String("test"), "0x0000000000000000000000000000000000000000", Date.now() + 1000, 2))
            .to.be.revertedWith("Invalid oracle address");
        });

        it ("Should prevent markets closing in the past", async () => {
            await expect(distamarkets.connect(creator).createMarket(ethers.utils.formatBytes32String("test"), oracle.getAddress(), 0, 2))
            .to.be.revertedWith("Cannot create markets that close on the past");
        });

        it ("Should require min. 2 outcomes", async() => {
            // should fail with no outcomes
            expect(distamarkets.connect(creator).createMarket(ethers.utils.formatBytes32String("test"), oracle.getAddress(), Date.now() + 1000, 0))
            .to.be.revertedWith("Market needs at least 2 outcomes");

            // should fail with just 1 outcome
            await expect(distamarkets.connect(creator).createMarket(ethers.utils.formatBytes32String("test"), oracle.getAddress(), Date.now() + 1000, 1))
            .to.be.revertedWith("Market needs at least 2 outcomes");
        });
    });

    describe("Betting", () => {
        it ("Should allow adding multiple stakes", async () => {
            // create market
            let { marketId } = await createMarket();

            // add stake with both users
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));

            // checks stakes are counted correctly
            let addr1Stake = await distamarkets.getStake(marketId, 0, trader1.getAddress());
            expect(addr1Stake).to.equal(ethers.utils.parseEther("50"));

            let addr2Stake = await distamarkets.getStake(marketId, 1, trader2.getAddress());
            expect(addr2Stake).to.equal(ethers.utils.parseEther("25"));

            // ensure stake is counted correctly
            let [, , , , , totalStake]  = await distamarkets.getMarket(marketId);
            expect(totalStake).to.equal(ethers.utils.parseEther("75"));
        });

        it ("Should return correct amount of tokens in contract", async () => {
            // create 2 markets
            let { marketId: marketId1 } = await createMarket();
            let { marketId: marketId2 } = await createMarket();

            // add 75 tokens across both contracts
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId1, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId2, 1]));

            // contract should have 75 tokens
            let tokenBalance = await distamarkets.tokenBalance();
            expect(tokenBalance).to.equal(ethers.utils.parseEther("75"));
        });
             
        it ("Should allow removing stake", async () => {
            // create market
            let { marketId } = await createMarket();

            // stake 500 and get stakeid
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("500"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // track user current balance
            let initialBalance = await token.balanceOf(trader1.getAddress());

            // remove 100 from the stake
            await distamarkets.connect(trader1).removeStake(marketId, 0, ethers.utils.parseEther("100"));

            // ensure stake is tracked correctly (considering fees)
            let addr1Stake = await distamarkets.getStake(marketId, 0, trader1.getAddress());
            expect(addr1Stake).to.equal(ethers.utils.parseEther("400"));
            
            // ensure user received funds
            let finalBalance = await token.balanceOf(trader1.getAddress());

            // Should be the amount withdrawn minus 10% fee
            expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("90"));
            
            // check tracking of fee
            let [, , , , , , , feeCollected, _] = await distamarkets.getMarket(marketId);
            expect(feeCollected).to.equal(ethers.utils.parseEther("10"));

        });
        
        it ("Should not allow adding 0 stake", async () => {
            let { marketId } = await createMarket();

            let tokenCall = token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("0"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // cannot add 0 stake
            await expect(tokenCall)
                .to.be.revertedWith('Cannot add 0 stake');
        });
        
        it ("Should allow increasing existing stake", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // stake should be 75
            let addr1Stake = await distamarkets.getStake(marketId, 0, trader1.getAddress());
            expect(addr1Stake).to.equal(ethers.utils.parseEther("75"));
        });
        
        it ("Should prevent removing 0 stake", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // cannot remove 0 stake
            await expect(distamarkets.connect(trader1).removeStake(marketId, 0, 0)).to.be.revertedWith('Cannot remove 0 stake');
        });

        it ("Should not remove more stake than previously added", async() => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // cannot remove 51 stake
            await expect(distamarkets.connect(trader1).removeStake(marketId, 0, ethers.utils.parseEther("51")))
                .to.be.revertedWith('Amount exceeds current stake');
        });

        it ("Should fail with invalid address callback", async () => {
            // create market
            let { marketId } = await createMarket();

            await expect(distamarkets.onApprovalReceived(
                "0x0000000000000000000000000000000000000000", 
                ethers.utils.parseEther("25"), 
                ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]))
            ).to.be.revertedWith('Invalid sender');
        }); 

        it ("Should fail with invalid market id", async () => {
            // create market
            await createMarket();

            let initialBalance = await token.balanceOf(trader1.getAddress());

            let wrongMarketId = ethers.utils.formatBytes32String(Math.random() + "");

            // add stake on wrong market
            await expect(token.connect(trader1)
            ["approveAndCall(address,uint256,bytes)"](
                distamarkets.address, 
                ethers.utils.parseEther("50"), 
                ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [wrongMarketId, 0]))
            ).to.be.revertedWith("Market not found or not initialized");

            // user should still have same amount of tokens
            let finalBalance = await token.balanceOf(trader1.getAddress());
            expect(initialBalance).to.equal(finalBalance);
        });
        
        it ("Should fail when adding stake to a non-open market", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3600]);
            await ethers.provider.send('evm_mine', []);

            // should fail to market being closed
            await expect(token.connect(trader1)
            ["approveAndCall(address,uint256,bytes)"](
                distamarkets.address, 
                ethers.utils.parseEther("50"), 
                ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]))
            ).to.be.revertedWith("Market is not open");
        });

        it ("Should fail when removing stake from a non-open market", async() => {
            // creates 2 markets
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // remove part of stake
            await expect(distamarkets.connect(trader1).
                removeStake(marketId, 0, ethers.utils.parseEther("10"))
            ).to.be.reverted;

        });
    });

    describe("Resolving markets", async () => {
        it ("Should not resolve market before the time is over", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance less than 1 hour
            await ethers.provider.send('evm_increaseTime', [1000]);
            await ethers.provider.send('evm_mine', []);

            // trying to resolve should end in failure
            await expect(distamarkets.connect(oracle).resolveMarket(marketId, 0)).to.be.revertedWith("Only ended markets can be resolved");
        });

        it ("Should allow only oracle to resolve", async() => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance less than 1 hour
            await ethers.provider.send('evm_increaseTime', [1000]);
            await ethers.provider.send('evm_mine', []);

            // trying to resolve should end in failure
            await expect(distamarkets.connect(trader1).resolveMarket(marketId, 0)).to.be.revertedWith("Only the oracle can resolve the market");
        });

        it ("Should allow only ended markets to be resolved", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve first time ok
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // resolve second time error
            await expect(distamarkets.connect(oracle).resolveMarket(marketId, 0))
            .to.be.revertedWith("Only ended markets can be resolved");
        });

        it ("Should resolve market when time is over", async() => {
            // creates a market
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            let [, , , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(MarketState.RESOLVED);
        });
    });

    describe("Canceling market", async() => {
        it ("Should allow oracle to cancel an open market", async () => {
            // creates a market
            let { marketId } = await createMarket();

            // attempting to cancel with non-creator and non-oracle should fail
            await expect(distamarkets.connect(trader1).cancelMarket(marketId))
                .to.be.revertedWith("Only creator OR oracle can cancel OPEN market");

            // canceling with oracle should work
            await distamarkets.connect(oracle).cancelMarket(marketId);

            let [, , , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(MarketState.CANCELLED);
        });
        it ("Should allow creator to cancel an open market", async () => {
            // creates a market
            let { marketId } = await createMarket();

            // attempting to cancel with non-creator and non-oracle should fail
            await expect(distamarkets.connect(trader1).cancelMarket(marketId))
                .to.be.revertedWith("Only creator OR oracle can cancel OPEN market");

            await distamarkets.connect(creator).cancelMarket(marketId);

            let [, , , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(MarketState.CANCELLED);
        });
        it ("Should allow oracle to cancel an ended market", async() => {
            // creates a market
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // expect failure if not oracle
            await expect(distamarkets.connect(creator).cancelMarket(marketId))
            .to.be.revertedWith("Only oracle can cancel ENDED markets");

            // with oracle it should work
            await distamarkets.connect(oracle).cancelMarket(marketId);

            let [, , , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(MarketState.CANCELLED);
        });
        it ("Cannot cancel already canceled market", async () => {
            // creates a market
            let { marketId } = await createMarket();

            await distamarkets.connect(oracle).cancelMarket(marketId);

            await expect(distamarkets.connect(oracle).cancelMarket(marketId))
                .to.be.revertedWith("Market already CANCELED");
        });
        it ("Resolved markets cannot be canceled", async () => {
            // creates a market
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            await expect(distamarkets.connect(oracle).cancelMarket(marketId))
                .to.be.revertedWith("Resolved markets cannot be canceled without dispute");
        });
        it ("Users can retrieve stake and collected fees from canceled events", async () => {
            // create market
            let { marketId } = await createMarket();

            let initialBalance = await token.balanceOf(trader1.getAddress());

            // add stakes and get ids
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("1000"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("500"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader3)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("500"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));

            // trader 3 cancels the stake
            await distamarkets.connect(trader3).removeStake(marketId, 1, ethers.utils.parseEther("500"));

            // refund should fail due to market not being canceled yet
            await expect(distamarkets.connect(trader1).refund(marketId, 0))
            .to.be.revertedWith("Market must be canceled");

            // cancel the market
            await distamarkets.connect(oracle).cancelMarket(marketId);

            // ensure user received funds
            await distamarkets.connect(trader1).refund(marketId, 0);
            let finalBalance = await token.balanceOf(trader1.getAddress());

            // Should be the amount withdrawn minus 10% fee
            expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("32"));
            
            // there should still be 18 fee left
            let [, , , , , , , feeCollected, _] = await distamarkets.getMarket(marketId);
            expect(feeCollected).to.equal(ethers.utils.parseEther("18"));
        });
        it ("Closed markets cannot be canceled", async () => {
            let { marketId } = await createMarket();

             // wait for the closing time
             await ethers.provider.send('evm_increaseTime', [3601]);
             await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // wait for the dispute period
            await ethers.provider.send('evm_increaseTime', [86401]);
            await ethers.provider.send('evm_mine', []);

            // cannot cancel anymore as market is now closed
            await expect(distamarkets.connect(oracle).cancelMarket(marketId))
                .to.be.revertedWith("CLOSED markets can't be canceled anymore");
        });
        it ("Creator can collect fees from closed contracts", async () => {
            // create market
            let { marketId } = await createMarket();

            let initialBalance = await token.balanceOf(creator.getAddress());

            // add stakes and get ids
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("1000"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("500"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader3)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("500"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));

            // trader 3 cancels the stake
            await distamarkets.connect(trader3).removeStake(marketId, 1, ethers.utils.parseEther("500"));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // should fail as market is not closed yet
            await expect(distamarkets.connect(creator).collectFees(marketId))
                .to.be.revertedWith("Market is not closed");

            // wait for dispute period
            await ethers.provider.send('evm_increaseTime', [88401]);
            await ethers.provider.send('evm_mine', []);

            // withdraw collected fees
            let [, , , , , , , feeCollected, _] = await distamarkets.getMarket(marketId);

            // should fail for non-creator
            await expect(distamarkets.connect(trader1).collectFees(marketId))
                .to.be.revertedWith("Must be market creator");

            // should work for creator
            await distamarkets.connect(creator).collectFees(marketId);
            
            // user should have correct balance
            let finalBalance = await token.balanceOf(creator.getAddress());
            expect(finalBalance.sub(initialBalance)).to.equal(feeCollected);

            // there should be no fee left in the contract
            [, , , , , , , feeCollected, _] = await distamarkets.getMarket(marketId);
            expect(feeCollected).to.equal(ethers.utils.parseEther("0"));

            // should fail as there is no fees to be collected anymore
            await expect(distamarkets.connect(creator).collectFees(marketId))
            .to.be.revertedWith("No fees to collect");
        });
    });

    describe("Withdraw rewards", async() => {
        it("Should calculate rewards correctly", async () => {
            let { marketId } = await createMarket();

            // add multiple stakes to the outcomes
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("300"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader3)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("90"),  ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));
            await token.connect(trader4)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("20"),  ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));

            // potential reward of addr should be 50
            expect(await distamarkets.calculateReward(marketId, 0, trader1.getAddress())).to.equal(ethers.utils.parseEther("50"));
            expect(await distamarkets.calculateReward(marketId, 0, trader2.getAddress())).to.equal(ethers.utils.parseEther("60"));
            expect(await distamarkets.calculateReward(marketId, 1, trader3.getAddress())).to.equal(ethers.utils.parseEther("450"));
            expect(await distamarkets.calculateReward(marketId, 1, trader4.getAddress())).to.equal(ethers.utils.parseEther("100"));
        });

        it ("Should retrieve rewards", async () => {
            let { marketId } = await createMarket();

            let initialBalance = await token.balanceOf(trader1.getAddress());

            // add multiple stakes to the outcomes
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("300"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader3)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("90"),  ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));
            await token.connect(trader4)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("20"),  ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 1]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // wait for the dispute period
            await ethers.provider.send('evm_increaseTime', [86401]);
            await ethers.provider.send('evm_mine', []);

            // get the reward
            await distamarkets.connect(trader1).withdrawReward(marketId, 0);

            // check balance is ok
            let finalBalance = await token.balanceOf(trader1.getAddress());

            expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("50"));

            // balance should be 0 now, so expect failure on second call
            await expect(distamarkets.connect(trader1).withdrawReward(marketId, 0))
            .to.be.revertedWith("Nothing to withdraw");
        });

        it ("Should only retrieve rewards when market is closed", async () => {
            let { marketId } = await createMarket();

            // add multiple stakes to the outcomes
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            await token.connect(trader2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("300"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

             // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            await expect(distamarkets.connect(trader1).withdrawReward(marketId, 0))
                .to.be.revertedWith("Market must be closed");

        });
    });

    describe("Disputes", async () => {
        it ("Allow stakers to dispute a market during dispute period", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // expect failure as user has no stake
            await expect(distamarkets.connect(trader4).disputeMarket(marketId, 0))
                .to.be.revertedWith("No stake for dispute");

            // dispute the result
            await distamarkets.connect(trader1).disputeMarket(marketId, 0);

            // check the contract returns the right state
            let [, , , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(MarketState.DISPUTED);
        });
        it ("Cannot dispute after dispute period", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // wait for the dispute period
            await ethers.provider.send('evm_increaseTime', [86401]);
            await ethers.provider.send('evm_mine', []);

            // should fail as dispute period passed
            await expect(distamarkets.connect(trader1).disputeMarket(marketId, 0))
                .to.be. revertedWith("");
        });
        it ("Can solve a dispute by canceling", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // dispute
            await distamarkets.connect(trader1).disputeMarket(marketId, 0);

            // only oracle can cancel disputed markets
            await expect(distamarkets.connect(creator).cancelMarket(marketId))
            .to.be.revertedWith("Only oracle can cancel DISPUTED markets");

            // oracle can cancel the market now
            await distamarkets.connect(oracle).cancelMarket(marketId);
        });
        it ("Can solve a dispute by closing with outcome", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("250"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // wait for the closing time
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine', []);

            // resolve the market
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // closing should fail as market not in dispute yet
            await expect(distamarkets.connect(oracle).closeMarket(marketId, 1))
            .to.be.revertedWith("Market not in dispute");

            // dispute
            await distamarkets.connect(trader1).disputeMarket(marketId, 0);

            // only oracle can close the market
            await expect(distamarkets.connect(creator).closeMarket(marketId, 1))
            .to.be.revertedWith("Sender not oracle");

            // oracle can close the market now
            distamarkets.connect(oracle).closeMarket(marketId, 1);
        });
    });
});