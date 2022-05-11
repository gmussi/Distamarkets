const { expect } = require("chai");

let Distamarkets, distamarkets, owner, addr1, addr2, Token, token;

// help functions
const createMarket = async () => {
    // create market
    await distamarkets.connect(addr1).createMarket("Will this first market work?", "ipfs://test/test1.png", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
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
        /*it ("Should set the right owner", async () => {
            expect(await distamarkets.owner()).to.equal(owner.address);
        });*/

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
        it ("Should fail without approval", async() => {
            // create market
            await createMarket();

            // add stake without approving first
            await expect(
                distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"))
            ).to.be.revertedWith('Approve amount is not high enough');
        });

        it ("Should allow adding multiple stakes", async () => {
            // create market
            await createMarket();

            // approve token transfers
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("50"));
            await token.connect(addr2).approve(distamarkets.address, ethers.utils.parseEther("25"));
        
            // add stake with both users
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));
            await distamarkets.connect(addr2).addStake(1, 1, ethers.utils.parseEther("25"));

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

        
        it ("Should allow removing stake", async () => {
            // create market
            await createMarket();

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("50"));
            
            // add stake
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));
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

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("1"));

            // cannot add 0 stake
            await expect(distamarkets.connect(addr1).addStake(1, 1, ethers.utils.parseEther("0")))
                .to.be.revertedWith('Cannot add 0 stake');
        });
        
        it ("Should allow increasing existing stake", async () => {
            await createMarket();

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("75"));

            // add 50 stake
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));
            // add 25 stake
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("25"));

            // stake should be 75
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("75"));
        });
        
        it ("Should prevent removing 0 stake", async () => {
            await createMarket();

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("50"));

            // add 50 stake
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));

            // retrieve stake id
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            // cannot remove 0 stake
            await expect(distamarkets.connect(addr1).removeStake(addr1StakeId, 0)).to.be.revertedWith('Cannot remove 0 stake');
        });

        it ("Should not remove more stake than previously added", async() => {
            await createMarket();

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("50"));

            // add 50 stake
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));

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

            // approve transfer
            await token.connect(addr1).approve(distamarkets.address, ethers.utils.parseEther("75"));

            // add stake to both markets
            await distamarkets.connect(addr1).addStake(1, 0, ethers.utils.parseEther("50"));
            await distamarkets.connect(addr1).addStake(2, 1, ethers.utils.parseEther("25"));

            // ensure stakes are correct
            let userStakes = await distamarkets.getUserStakes(addr1.address);
            expect(userStakes.length).to.equal(2);
        });
    });
});