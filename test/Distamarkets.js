const { expect } = require("chai");

let Distamarkets, distamarkets, owner, addr1, addr2, Token, token;

// help functions
const createMarket = async () => {
    // get market block timestamp
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp; 
    
    // add 1 hour
    let timeLimit = timestampBefore + 3600;

    // create market
    await distamarkets.connect(addr1).createMarket("Will this first market work?", "ipfs://test/test1.png", timeLimit, [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
};

describe("Distamarkets contract", () => {
    beforeEach(async () => {
        // deploy token first
        Token = await ethers.getContractFactory("WFAIRToken");
        token = await Token.deploy(ethers.utils.parseEther("1000000000"));

        // deploy contract
        Distamarkets = await ethers.getContractFactory("Distamarkets");
        distamarkets = await Distamarkets.deploy(token.address);
        [owner, addr1, addr2, _] = await ethers.getSigners(); 

        // distribute 1k tokens for each user
        await token.connect(owner).transfer(addr1.address, ethers.utils.parseEther("1000"));
        await token.connect(owner).transfer(addr2.address, ethers.utils.parseEther("1000"));
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
            await createMarket();
            
            let marketId = await distamarkets.getMarketIndex();
            expect(marketId).to.equal(1);

            // create second market
            await createMarket();
            
            let newMarketId = await distamarkets.getMarketIndex();
            expect(newMarketId).to.equal(2);

            // check everything was saved correctly
            [title, image, state, stake, outcomeNames, outcomeStakes]  = await distamarkets.getMarket(1);

            expect(title).to.equal("Will this first market work?");
            expect(image).to.equal("ipfs://test/test1.png");
            expect(outcomeNames[0]).to.equal(ethers.utils.formatBytes32String ('no'));
            expect(outcomeNames[1]).to.equal(ethers.utils.formatBytes32String ('yes'));
        });
    });

    describe("Betting", () => {
        it ("Should allow adding multiple stakes", async () => {
            // create market
            await createMarket();

            // add stake with both users
            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));
            await token.connect(addr2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 1]));

            // checks stakes are counted correctly
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("50"));

            let addr2StakeId = await distamarkets.getStakeId(addr2.address, 1, 1);
            let addr2Stake = await distamarkets.getStake(addr2StakeId);
            expect(addr2Stake.amount).to.equal(ethers.utils.parseEther("25"));

            // ensure no wrong stake
            // addr1Stake = await distamarkets.getStake(addr1.address, 1, 1);
            // expect(addr1Stake).to.equal("0");

            // ensure stake is counted correctly
            let totalStake = await distamarkets.getMarketTotalStake(1);
            expect(totalStake).to.equal(ethers.utils.parseEther("75"));
        });

        it ("Should return correct amount of tokens in contract", async () => {
            // create 2 markets
            await createMarket();
            await createMarket();

            // add 75 tokens across both contracts
            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));
            await token.connect(addr2)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [2, 1]));

            // contract should have 75 tokens
            let tokenBalance = await distamarkets.tokenBalance();
            expect(tokenBalance).to.equal(ethers.utils.parseEther("75"));
        });
             
        it ("Should allow removing stake", async () => {
            // create market
            await createMarket();

            // stake and get stakeid
            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            // track user current balance
            let initialBalance = await token.balanceOf(addr1.address);

            // remove part of stake
            await distamarkets.connect(addr1).removeStake(addr1StakeId, ethers.utils.parseEther("10"));

            // ensure stake is tracked correctly
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("40"));
            
            // ensure user received funds
            let finalBalance = await token.balanceOf(addr1.address);

            expect(finalBalance.sub(initialBalance)).to.be.at.least(ethers.utils.parseEther("9"));

        });

        
        it ("Should not allow adding 0 stake", async () => {
            await createMarket();

            let tokenCall = token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("0"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));

            // cannot add 0 stake
            await expect(tokenCall)
                .to.be.revertedWith('Cannot add 0 stake');
        });
        
        it ("Should allow increasing existing stake", async () => {
            await createMarket();

            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));
            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));

            // stake should be 75
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("75"));
        });
        
        it ("Should prevent removing 0 stake", async () => {
            await createMarket();

            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));

            // retrieve stake id
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            // cannot remove 0 stake
            await expect(distamarkets.connect(addr1).removeStake(addr1StakeId, 0)).to.be.revertedWith('Cannot remove 0 stake');
        });

        it ("Should not remove more stake than previously added", async() => {
            await createMarket();

            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));

            // retrieve stake id
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            // cannot remove 51 stake
            await expect(distamarkets.connect(addr1).removeStake(addr1StakeId, ethers.utils.parseEther("51")))
                .to.be.revertedWith('Amount exceeds current stake');
        });

        it ("Should correctly retrieve stakes", async () => {
            // creates 2 markets
            await createMarket();
            await createMarket();

            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));
            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("25"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [2, 1]));

            // ensure stakes are correct
            let userStakes = await distamarkets.getUserStakes(addr1.address);
            expect(userStakes.length).to.equal(2);
        });

        it ("Should fail with invalid address callback", async () => {
            // create market
            await createMarket();

            await expect(distamarkets.onApprovalReceived(
                "0x0000000000000000000000000000000000000000", 
                ethers.utils.parseEther("25"), 
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [2, 1]))
            ).to.be.revertedWith('Invalid sender');
        }); 

        it ("Should fail with invalid market id", async () => {
            // create market
            await createMarket();

            let initialBalance = await token.balanceOf(addr1.address);

            // add stake on wrong market
            await expect(token.connect(addr1)
            ["approveAndCall(address,uint256,bytes)"](
                distamarkets.address, 
                ethers.utils.parseEther("50"), 
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [3, 0]))
            ).to.be.revertedWith("Invalid market id");

            // user should still have same amount of tokens
            let finalBalance = await token.balanceOf(addr1.address);
            expect(initialBalance).to.equal(finalBalance);
        });
        
        it ("Should fail when adding stake to a non-open market", async () => {
            // creates 2 markets
            await createMarket();

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3600]);
            await ethers.provider.send('evm_mine');

            // should fail to market being closed
            await expect(token.connect(addr1)
            ["approveAndCall(address,uint256,bytes)"](
                distamarkets.address, 
                ethers.utils.parseEther("50"), 
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]))
            ).to.be.revertedWith("Market is not open");
        });

        it ("Should fail when removing stake from a non-open market", async() => {
            // creates 2 markets
            await createMarket();

            await token.connect(addr1)["approveAndCall(address,uint256,bytes)"](distamarkets.address, ethers.utils.parseEther("50"), ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [1, 0]));

            // advance 1 hour
            await ethers.provider.send('evm_increaseTime', [3601]);
            await ethers.provider.send('evm_mine');

            // remove part of stake
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            await expect(distamarkets.connect(addr1).
                removeStake(addr1StakeId, ethers.utils.parseEther("10"))
            ).to.be.reverted;

        });
    });
});