const { expect } = require("chai");

let Distamarkets, distamarkets, owner, creator, oracle, trader1, trader2, trader3, trader4, Token, token;

// help functions
const createMarket = async () => {
    // get market block timestamp
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp; 
    
    // add 1 hour
    let timeLimit = timestampBefore + 3600;

    let marketId = ethers.utils.formatBytes32String (Math.random() + "");
    
    // create market
    await distamarkets.connect(creator).createMarket(marketId, oracle.address, timeLimit, 2);
    
    return {marketId, timeLimit};
};

describe("Distamarkets", () => {
    beforeEach(async () => {
        // deploy token first
        Token = await ethers.getContractFactory("WFAIRToken");
        token = await Token.deploy(ethers.utils.parseEther("1000000000"));

        // deploy contract
        Distamarkets = await ethers.getContractFactory("Distamarkets");
        distamarkets = await Distamarkets.deploy(token.address);
        [owner, creator, oracle, trader1, trader2, trader3, trader4, _] = await ethers.getSigners(); 

        // distribute 1k tokens for each user
        await token.connect(owner).transfer(trader1.address, ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader2.address, ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader3.address, ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(trader4.address, ethers.utils.parseEther("1000"));
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
            [oracleAddr, creatorAddr, numOutcomes, closingTime, , totalStake, , state]  = await distamarkets.getMarket(marketId);

            expect(oracleAddr).to.equal(oracle.address);
            expect(creatorAddr).to.equal(creator.address);
            expect(numOutcomes).to.equal(2);
            expect(closingTime).to.equal(timeLimit);
            expect(totalStake).to.equal(0);
            expect(state).to.equal(0);
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
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("50"));

            let addr2StakeId = await distamarkets.getStakeId(trader2.address, marketId, 1);
            let addr2Stake = await distamarkets.getStake(addr2StakeId);
            expect(addr2Stake.amount).to.equal(ethers.utils.parseEther("25"));

            // ensure no wrong stake
            // addr1Stake = await distamarkets.getStake(addr1.address, 1, 1);
            // expect(addr1Stake).to.equal("0");

            // ensure stake is counted correctly
            let totalStake = await distamarkets.getMarketTotalStake(marketId);
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

            // stake and get stakeid
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);

            // track user current balance
            let initialBalance = await token.balanceOf(trader1.address);

            // remove part of stake
            await distamarkets.connect(trader1).removeStake(addr1StakeId, ethers.utils.parseEther("10"));

            // ensure stake is tracked correctly
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("40"));
            
            // ensure user received funds
            let finalBalance = await token.balanceOf(trader1.address);

            expect(finalBalance.sub(initialBalance)).to.be.at.least(ethers.utils.parseEther("9"));

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
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("75"));
        });
        
        it ("Should prevent removing 0 stake", async () => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // retrieve stake id
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);

            // cannot remove 0 stake
            await expect(distamarkets.connect(trader1).removeStake(addr1StakeId, 0)).to.be.revertedWith('Cannot remove 0 stake');
        });

        it ("Should not remove more stake than previously added", async() => {
            let { marketId } = await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId, 0]));

            // retrieve stake id
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);

            // cannot remove 51 stake
            await expect(distamarkets.connect(trader1).removeStake(addr1StakeId, ethers.utils.parseEther("51")))
                .to.be.revertedWith('Amount exceeds current stake');
        });

        it ("Should correctly retrieve stakes", async () => {
            // creates 2 markets
            let { marketId: marketId1 } =await createMarket();
            let { marketId: marketId2 } =await createMarket();

            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId1, 0]));
            await token.connect(trader1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [marketId2, 1]));

            // ensure stakes are correct
            let userStakes = await distamarkets.getUserStakes(trader1.address);
            expect(userStakes.length).to.equal(2);
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

            let initialBalance = await token.balanceOf(trader1.address);

            let wrongMarketId = ethers.utils.formatBytes32String (Math.random() + "");

            // add stake on wrong market
            await expect(token.connect(trader1)
            ["approveAndCall(address,uint256,bytes)"](
                distamarkets.address, 
                ethers.utils.parseEther("50"), 
                ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [wrongMarketId, 0]))
            ).to.be.revertedWith("Market not found or not initialized");

            // user should still have same amount of tokens
            let finalBalance = await token.balanceOf(trader1.address);
            expect(initialBalance).to.equal(finalBalance);
        });
        
        it ("Should fail when adding stake to a non-open market", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3600]);
            await ethers.provider.send('evm_mine');

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
            await ethers.provider.send('evm_mine');

            // remove part of stake
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);

            await expect(distamarkets.connect(trader1).
                removeStake(addr1StakeId, ethers.utils.parseEther("10"))
            ).to.be.reverted;

        });
    });

    describe("State transitions", async () => {
        it ("Should not resolve market before the time is over", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [1000]);
            await ethers.provider.send('evm_mine');

            // trying to resolve should end in failure
            await expect(distamarkets.connect(oracle).resolveMarket(marketId, 0)).to.be.revertedWith("Market can only be closed after the specified period");
        });

        it ("Should allow only oracle to resolve", async () => {

        });

        it ("Should allow only open markets to be resolved", async () => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine');

            // resolve first time ok
            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            // resolve second time error
            
        });

        it ("Should resolve market when time is over", async() => {
            // creates 2 markets
            let { marketId } = await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine');

            await distamarkets.connect(oracle).resolveMarket(marketId, 0);

            let [, , , , , , , state] = await distamarkets.getMarket(marketId);
            expect(state).to.equal(2);
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

            // retrieve all stake ids
            let addr1StakeId = await distamarkets.getStakeId(trader1.address, marketId, 0);
            let addr2StakeId = await distamarkets.getStakeId(trader2.address, marketId, 0);
            let addr3StakeId = await distamarkets.getStakeId(trader3.address, marketId, 1);
            let addr4StakeId = await distamarkets.getStakeId(trader4.address, marketId, 1);

            // potential reward of addr should be 50
            expect(await distamarkets.calculateReward(addr1StakeId)).to.equal(ethers.utils.parseEther("50"));
            expect(await distamarkets.calculateReward(addr2StakeId)).to.equal(ethers.utils.parseEther("60"));
            expect(await distamarkets.calculateReward(addr3StakeId)).to.equal(ethers.utils.parseEther("450"));
            expect(await distamarkets.calculateReward(addr4StakeId)).to.equal(ethers.utils.parseEther("100"));
        });

        it ("Should retrieve rewards", async () => {

        });

        it ("Should only retrieve when market is closed", async () => {

        });
    });
});